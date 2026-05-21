/**
 * pipeline.ts
 *
 * 6-pass athlete index builder. See ATHLETE_PIPELINE_PLAN.md for full design rationale.
 *
 * Pass 1 — Licence athletes only (authoritative)
 * Pass 2 — Unlicensed team results matched by name + team
 * Pass 3 — Solo results via explicit athlete aliases
 * Pass 5 — Remaining athletes (5a team; 5b team aliases; 5c solo same-year; 5d solo cross-year; 5f team cross-year; 5e team↔solo)
 * Pass 6 — Manual result assignments (result-assignments.json)
 */

import {
  normalizeName,
  teamNormalKey,
  teamKeySimilarity,
  levenshteinDistance,
  isValidLicence,
  normalizeDistance,
  normalizeCategory,
  fixRawTeamName,
  canonicalTeam,
  posToBasePoints,
  finisherCoefficient,
  rankToTeamBasePoints,
  teamCoefficient,
  DISTANCE_ALIASES,
  canonicalizeCategory,
  SOLO_TEAM_KEYS,
  isSoloTeam,
  teamsMatch,
} from "./normalize.js";
import type {
  StoredEvent,
  StoredEventResults,
  StoredDistanceResults,
  StoredResult,
  AthleteEntry,
  AthleteResultRef,
  AggregateAthlete,
  AggregateRanking,
  TeamRanking,
  TeamEntry,
} from "@granfondo/db/types";

export type { AthleteEntry };
export type ResultsLoader = (id: number) => StoredEventResults | null;
export type AthleteIdStore = Map<string, number>;

export {
  normalizeName as normalizeAthleteNameKey,
  isValidLicence,
  levenshteinDistance,
  DISTANCE_ALIASES,
  normalizeDistance,
  canonicalizeCategory,
  SOLO_TEAM_KEYS,
  isSoloTeam,
  teamsMatch,
} from "./normalize.js";

/** Composite key for team athletes; solo:category key for unaffiliated. */
export function athleteKey(nameLower: string, team: string, category = ""): string {
  if (!isSoloTeam(team)) return `${nameLower}|${teamNormalKey(team)}`;
  const catKey = category
    ? normalizeCategory(category).toLowerCase().replace(/\s+/g, "-")
    : "";
  return catKey ? `${nameLower}|solo:${catKey}` : `${nameLower}|`;
}

// ── Alias types ───────────────────────────────────────────────────────────────

export interface AthleteAliasRule {
  name: string;
  canonicalTeam: string;
  aliases: Array<{ name: string; team: string }>;
  note?: string;
}

export interface ResultAssignment {
  eventId: number;
  bib: string;
  athleteId: number;
  note?: string;
}

/**
 * Returns true if two canonical categories are compatible for the same athlete.
 * Open 19-34 is ambiguous between Elite and Masters A — compatible with both,
 * incompatible with Masters B and above.
 */
function categoriesCompatible(a: string, b: string): boolean {
  if (a === b) return true;
  const OPEN_M = "Open 19-34 Male";
  const OPEN_F = "Open 19-34 Female";
  if (a === OPEN_M) return b === "Elite Male" || b === "Masters A Male" || b === OPEN_M;
  if (b === OPEN_M) return a === "Elite Male" || a === "Masters A Male" || a === OPEN_M;
  if (a === OPEN_F) return b === "Elite Female" || b === "Masters A Female" || b === OPEN_F;
  if (b === OPEN_F) return a === "Elite Female" || a === "Masters A Female" || a === OPEN_F;
  return false;
}

// ── Duplicate flag ────────────────────────────────────────────────────────────

export interface DuplicateFlag {
  athleteId: number;
  athleteName: string;
  eventId: number;
  eventName: string;
  existing: { category: string; team: string };
  incoming: { category: string; team: string };
  resolution: "kept_licenced" | "kept_by_category" | "flagged_manual";
}

// ── Solo category rank (for cross-year merge) ────────────────────────────────

export const SOLO_CAT_RANK: Record<string, number> = {
  "Elite Male": 0,        "Elite Female": 0,
  "Masters A Male": 1,    "Masters A Female": 1,
  "Masters B Male": 2,    "Masters B Female": 2,
  "Masters C Male": 3,    "Masters C Female": 3,
  "Masters D Male": 4,    "Masters D Female": 4,
  "Masters E Male": 5,    "Masters E Female": 5,
};

/**
 * Normalise a canonical category for solo group key building.
 * Elite, Open 19-34, and Masters A are distinct same-year populations at events
 * that carry all three categories, so no normalization is applied here.
 * Cross-year compatibility between Open 19-34 and Elite/Masters A is handled
 * in Pass 5d via categoriesCompatible().
 */
export function soloGroupCat(canonCat: string): string {
  return canonCat;
}

export interface SoloCollisionFlag {
  groupKey: string;        // `nameLower|solo:CanonCat:year`
  eventId: number;
  eventName: string;
  resolution: "distance" | "percentile" | "flagged_manual";
  // For distance/percentile: results[0] is kept in the group, results[1] routed to bib-key.
  // For flagged_manual: all results are bib-keyed (none kept in group).
  results: Array<{ bib: string; distance: string; genderPos: number; finisherCount: number }>;
}

export interface CrossPassFlag {
  soloKey: string;
  soloName: string;
  teamCandidates: Array<{ athleteId: number; canonicalTeam: string | undefined }>;
}

// ── Profile-level helpers (reused across passes 5c, 5e, 5f) ──────────────────

/**
 * Set of canonical distance names used across a profile's results.
 * Uses normalizeDistance so that event-specific branding ("BIG DAY", "Clássica", "Etapa")
 * maps to the same tier as the standard name ("Granfondo", "Mediofondo") for comparison.
 * Display names in stored results are kept as-is.
 */
function profileDistanceSet(results: AthleteResultRef[]): Set<string> {
  return new Set(results.map(r => normalizeDistance(r.distance)));
}

/** Median genderPos/finisherCount for valid results. Returns null if < 2 valid results. */
function profileMedianPercentile(results: AthleteResultRef[]): number | null {
  const valid = results.filter(r => !r.dnf && !r.dns && r.genderPos > 0 && r.finisherCount > 0);
  if (valid.length < 2) return null;
  const sorted = valid.map(r => r.genderPos / r.finisherCount).sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)]!;
}

/** Most frequent non-empty country across results, or null. */
function profileCountry(results: AthleteResultRef[]): string | null {
  const counts = new Map<string, number>();
  for (const r of results) {
    if (r.country) counts.set(r.country, (counts.get(r.country) ?? 0) + 1);
  }
  if (!counts.size) return null;
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]![0];
}

/** Returns true if the two distance sets share at least one element. */
function setsIntersect<T>(a: Set<T>, b: Set<T>): boolean {
  for (const v of a) if (b.has(v)) return true;
  return false;
}

/** Validate a single year-to-year category transition (same logic as Pass 5d). */
function isValidCatTransition(prevCat: string, currCat: string, yearDiff: number): boolean {
  if (prevCat === currCat) return true;
  if (prevCat.startsWith("Open 19-34") || currCat.startsWith("Open 19-34")) {
    return categoriesCompatible(prevCat, currCat);
  }
  const prevRank = SOLO_CAT_RANK[prevCat];
  const currRank = SOLO_CAT_RANK[currCat];
  if (prevRank === undefined || currRank === undefined) return false;
  if (currRank < prevRank) return false;
  if (currRank - prevRank > yearDiff) return false;
  return true;
}

/** Most common canonical category for a given year in an entry, or null. */
function entryCanonCatForYear(entry: AthleteEntry, year: number): string | null {
  const rawCats = entry.categories[String(year)];
  if (!rawCats || rawCats.length === 0) return null;
  const counts = new Map<string, number>();
  for (const raw of rawCats) {
    const c = canonicalizeCategory(raw);
    counts.set(c, (counts.get(c) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]![0];
}

// ── Internal helpers ──────────────────────────────────────────────────────────

function resultKey(eventId: number, distName: string, bib: string): string {
  return `${eventId}|${distName}|${bib}`;
}

function newEntry(id: number, name: string, nameLower: string): AthleteEntry {
  return { id, name, nameLower, teams: [], categories: {}, results: [] };
}

function addToTeamsAndCategories(entry: AthleteEntry, result: AthleteResultRef): void {
  const tk = teamNormalKey(result.team);
  if (tk && !isSoloTeam(result.team) && !entry.teams.includes(tk)) {
    entry.teams.push(tk);
  }
  // Store original raw category string — canonical map is used only for dedup internally
  const rawCat = result.category;
  const year = String(result.eventYear);
  if (!entry.categories[year]) entry.categories[year] = [];
  if (rawCat && !entry.categories[year]!.includes(rawCat)) {
    entry.categories[year]!.push(rawCat);
  }
}

function addResult(
  entry: AthleteEntry,
  result: AthleteResultRef,
  hasLicence: boolean,
  flags: DuplicateFlag[]
): void {
  const existing = entry.results.find((r) => r.eventId === result.eventId);
  if (!existing) {
    entry.results.push(result);
    addToTeamsAndCategories(entry, result);
    return;
  }

  const existingCat = canonicalizeCategory(existing.category);
  const incomingCat = canonicalizeCategory(result.category);

  // Same or compatible canonical category — treat as duplicate, keep licenced result
  if (categoriesCompatible(existingCat, incomingCat)) {
    if (hasLicence) {
      entry.results.splice(entry.results.indexOf(existing), 1, result);
    }
    return;
  }

  // Different categories — use athlete's known categories for this year to decide
  const year = String(result.eventYear);
  // Canonicalize stored raw categories on-the-fly for comparison
  const knownCanon = (entry.categories[year] ?? []).map(canonicalizeCategory);
  const existingMatches = knownCanon.some((c) => categoriesCompatible(c, existingCat));
  const incomingMatches = knownCanon.some((c) => categoriesCompatible(c, incomingCat));

  if (existingMatches && !incomingMatches) return;
  if (incomingMatches && !existingMatches) {
    entry.results.splice(entry.results.indexOf(existing), 1, result);
    addToTeamsAndCategories(entry, result);
    return;
  }

  // Same person cannot race the same event twice — keep existing, discard incoming, flag for review.
  flags.push({
    athleteId: entry.id,
    athleteName: entry.name,
    eventId: result.eventId,
    eventName: result.eventName,
    existing: { category: existing.category, team: existing.team },
    incoming: { category: result.category, team: result.team },
    resolution: "flagged_manual",
  });
}

function deriveCanonicalTeam(entry: AthleteEntry): void {
  const mostRecent = [...entry.results]
    .sort((a, b) => new Date(b.eventDate).getTime() - new Date(a.eventDate).getTime())
    .find((r) => !isSoloTeam(r.team));
  if (mostRecent) entry.canonicalTeam = mostRecent.team;
}

function toRef(r: StoredResult, event: StoredEvent, dist: StoredDistanceResults): AthleteResultRef {
  return {
    eventId: event.id,
    eventName: event.name,
    eventDate: event.date,
    eventYear: event.year,
    distance: dist.name,
    pos: r.pos,
    genderPos: r.genderPos,
    finisherCount: dist.finisherCount,
    category: r.category,
    gender: r.gender,
    team: r.team,
    country: r.country,
    raceTime: r.raceTime,
    raceTimeSecs: r.raceTimeSecs,
    gap: r.gap,
    gapSecs: r.gapSecs,
    dnf: r.dnf,
    dns: r.dns,
  };
}

function makeIdManager(idStore: AthleteIdStore) {
  const minted = new Map<string, number>();
  const existing = [...idStore.values()];
  let nextId = existing.length > 0 ? Math.max(...existing) + 1 : 1;
  return {
    get(key: string): number {
      if (idStore.has(key)) return idStore.get(key)!;
      if (minted.has(key)) return minted.get(key)!;
      const id = nextId++;
      minted.set(key, id);
      return id;
    },
    getMinted() { return minted; },
  };
}

// ── Main builder ──────────────────────────────────────────────────────────────

export function buildAthletesIndex(
  events: StoredEvent[],
  loader: ResultsLoader,
  aliasRules: AthleteAliasRule[],
  assignments: ResultAssignment[],
  idStore: AthleteIdStore = new Map()
): {
  index: Map<string, AthleteEntry>;
  updatedIdStore: AthleteIdStore;
  flags: DuplicateFlag[];
  soloFlags: SoloCollisionFlag[];
  crossPassFlags: CrossPassFlag[];
} {
  const flags: DuplicateFlag[] = [];
  const soloFlags: SoloCollisionFlag[] = [];
  const crossPassFlags: CrossPassFlag[] = [];
  const ids = makeIdManager(idStore);
  const index = new Map<string, AthleteEntry>();
  const assigned = new Set<string>(); // resultKey → assigned

  // Preload all results
  const allResults: Array<{
    event: StoredEvent;
    dist: StoredDistanceResults;
    r: StoredResult;
    rKey: string;
  }> = [];

  for (const event of events.filter((e) => e.hasResults)) {
    const stored = loader(event.id);
    if (!stored) continue;
    for (const dist of stored.distances) {
      for (const r of dist.results) {
        allResults.push({ event, dist, r, rKey: resultKey(event.id, dist.name, r.bib) });
      }
    }
  }

  // ── Pass 1: licence athletes ──────────────────────────────────────────────

  // Collect results per licence
  const licenceToResults = new Map<string, Array<{ event: StoredEvent; dist: StoredDistanceResults; r: StoredResult }>>();
  const licenceToNames = new Map<string, Set<string>>();

  for (const { event, dist, r } of allResults) {
    const validLicences = r.licences.filter(isValidLicence);
    if (validLicences.length === 0) continue;
    const nameLower = normalizeName(r.name);
    for (const lic of validLicences) {
      if (!licenceToNames.has(lic)) licenceToNames.set(lic, new Set());
      if (!licenceToResults.has(lic)) licenceToResults.set(lic, []);
      licenceToNames.get(lic)!.add(nameLower);
      licenceToResults.get(lic)!.push({ event, dist, r });
    }
  }

  // Resolve name conflicts per licence
  const licenceToCanonicalName = new Map<string, string>();
  for (const [lic, names] of licenceToNames) {
    const arr = [...names].sort((a, b) => b.length - a.length);
    if (arr.length === 1) {
      licenceToCanonicalName.set(lic, arr[0]!);
    } else {
      const canonical = arr[0]!;
      const allClose = arr.slice(1).every((n) => levenshteinDistance(canonical, n) <= 2);
      if (allClose) {
        licenceToCanonicalName.set(lic, canonical);
        console.log(`  [pass1] licence ${lic}: merged name variants: ${arr.join(", ")} → "${canonical}"`);
      } else {
        console.warn(`  [pass1] licence ${lic}: SKIPPED — distinct names: ${arr.join(", ")}`);
      }
    }
  }

  // Build one entry per (canonName, bestTeamKey) — no re-keying
  for (const [lic, canonName] of licenceToCanonicalName) {
    const results = licenceToResults.get(lic)!;

    // Best team: most-recent non-solo result for this licence's results
    const teamResult = results
      .filter((x) => !isSoloTeam(x.r.team))
      .sort((a, b) => new Date(b.event.date).getTime() - new Date(a.event.date).getTime())[0];
    const teamKey = teamResult ? teamNormalKey(teamResult.r.team) : "";
    const key = `${canonName}|${teamKey}`;

    if (!index.has(key)) {
      const displayName = results.reduce(
        (best, x) => (x.r.name.length > best.length ? x.r.name : best), ""
      );
      index.set(key, newEntry(ids.get(key), displayName, canonName));
    }
    const entry = index.get(key)!;

    for (const { event, dist, r } of results) {
      const rk = resultKey(event.id, dist.name, r.bib);
      if (assigned.has(rk)) continue;
      assigned.add(rk);
      addResult(entry, toRef(r, event, dist), true, flags);
    }
  }

  console.log(`  [pass1] ${index.size} licence-verified athletes built`);

  // Name lookup: nameLower → list of index keys
  function buildNameLookup(): Map<string, string[]> {
    const map = new Map<string, string[]>();
    for (const [key, entry] of index) {
      if (!map.has(entry.nameLower)) map.set(entry.nameLower, []);
      map.get(entry.nameLower)!.push(key);
    }
    return map;
  }

  // ── Pass 2: unlicensed team results by name + team ────────────────────────

  let pass2 = 0;
  const nameLookup = buildNameLookup();

  for (const { event, dist, r, rKey } of allResults) {
    if (assigned.has(rKey)) continue;
    if (isSoloTeam(r.team)) continue;
    if (r.licences.some(isValidLicence)) continue;

    const nameLower = normalizeName(r.name);
    const candidates = (nameLookup.get(nameLower) ?? []).filter((key) =>
      index.get(key)!.teams.some((tk) => teamsMatch(tk, r.team))
    );

    if (candidates.length === 1) {
      assigned.add(rKey);
      addResult(index.get(candidates[0]!)!, toRef(r, event, dist), false, flags);
      pass2++;
    } else if (candidates.length > 1) {
      console.warn(
        `  [pass2] ambiguous: "${r.name}" / "${r.team}" @ event ${event.id} — ${candidates.length} matches — left for pass5`
      );
    }
  }

  console.log(`  [pass2] ${pass2} unlicensed results matched by name+team`);

  // ── Pass 3: solo results via explicit athlete aliases ─────────────────────

  let pass3 = 0;
  const nameLookupP3 = buildNameLookup();

  for (const rule of aliasRules) {
    const canonNameLower = normalizeName(rule.name);
    const canonKey = `${canonNameLower}|${teamNormalKey(rule.canonicalTeam)}`;
    const canonEntry = index.get(canonKey);
    if (!canonEntry) continue;

    for (const alias of rule.aliases) {
      if (alias.team !== "") continue;
      const aliasNameLower = normalizeName(alias.name);

      for (const { event, dist, r, rKey } of allResults) {
        if (assigned.has(rKey)) continue;
        if (!isSoloTeam(r.team)) continue;
        if (normalizeName(r.name) !== aliasNameLower) continue;
        assigned.add(rKey);
        addResult(canonEntry, toRef(r, event, dist), false, flags);
        pass3++;
      }
    }
    deriveCanonicalTeam(canonEntry);
  }

  console.log(`  [pass3] ${pass3} solo results absorbed via athlete aliases`);

  // ── Pass 5: remaining athletes ────────────────────────────────────────────

  let pass5Team = 0;
  let pass5Solo = 0;
  const soloGroupKeys = new Set<string>(); // group keys created in 5c, used in 5d

  // 5a: team results — group by (nameLower, canonicalTeamKey) with fuzzy matching
  for (const { event, dist, r, rKey } of allResults) {
    if (assigned.has(rKey)) continue;
    if (isSoloTeam(r.team)) continue;

    const nameLower = normalizeName(r.name);
    const tk = teamNormalKey(r.team);
    const exactKey = `${nameLower}|${tk}`;

    let matchKey: string | undefined;
    if (index.has(exactKey)) {
      matchKey = exactKey;
    } else {
      // Fuzzy scan: same name, similar team
      for (const [k, e] of index) {
        if (e.nameLower !== nameLower) continue;
        const kTeam = k.includes("|") ? k.slice(k.indexOf("|") + 1) : "";
        if (teamKeySimilarity(tk, kTeam) === 1) { matchKey = k; break; }
      }
    }

    assigned.add(rKey);
    if (matchKey) {
      addResult(index.get(matchKey)!, toRef(r, event, dist), false, flags);
    } else {
      index.set(exactKey, newEntry(ids.get(exactKey), r.name, nameLower));
      addResult(index.get(exactKey)!, toRef(r, event, dist), false, flags);
      pass5Team++;
    }
  }

  // 5b: apply team-based athlete aliases to pass-5 profiles
  for (const rule of aliasRules) {
    const canonNameLower = normalizeName(rule.name);
    const canonKey = `${canonNameLower}|${teamNormalKey(rule.canonicalTeam)}`;
    const canonEntry = index.get(canonKey);
    if (!canonEntry) continue;

    for (const alias of rule.aliases) {
      if (alias.team === "") continue;
      const aliasKey = `${normalizeName(alias.name)}|${teamNormalKey(alias.team)}`;
      if (aliasKey === canonKey) continue;
      const aliasEntry = index.get(aliasKey);
      if (!aliasEntry) continue;
      for (const result of aliasEntry.results) addResult(canonEntry, result, false, flags);
      index.delete(aliasKey);
    }
    deriveCanonicalTeam(canonEntry);
  }

  // 5c: solo — group by (nameLower, canonCat, year); disambiguate intra-event collisions
  {
    type SoloCand = { event: StoredEvent; dist: StoredDistanceResults; r: StoredResult; rKey: string };

    // Step 1: group all remaining unassigned results by (name, canonCat, year)
    const soloGroups = new Map<string, SoloCand[]>();
    for (const cand of allResults) {
      if (assigned.has(cand.rKey)) continue;
      const nameLower = normalizeName(cand.r.name);
      const canonCat = soloGroupCat(canonicalizeCategory(cand.r.category));
      const groupKey = `${nameLower}|solo:${canonCat}:${cand.event.year}`;
      if (!soloGroups.has(groupKey)) soloGroups.set(groupKey, []);
      soloGroups.get(groupKey)!.push(cand);
    }

    // Helper: create a bib-keyed fallback profile for a single result
    const routeToBibKey = (c: SoloCand): void => {
      const nameLower = normalizeName(c.r.name);
      const canonCat = canonicalizeCategory(c.r.category);
      const bibKey = `${nameLower}|solo:${canonCat}:${c.event.year}:${c.r.bib}`;
      index.set(bibKey, newEntry(ids.get(bibKey), c.r.name, nameLower));
      assigned.add(c.rKey);
      addResult(index.get(bibKey)!, toRef(c.r, c.event, c.dist), false, flags);
      pass5Solo++;
    };

    // Step 2: disambiguate each group and assign to index
    for (const [groupKey, candidates] of soloGroups) {
      // Detect collisions: same eventId appearing 2+ times
      const byEvent = new Map<number, SoloCand[]>();
      for (const c of candidates) {
        if (!byEvent.has(c.event.id)) byEvent.set(c.event.id, []);
        byEvent.get(c.event.id)!.push(c);
      }

      const nonCollision = candidates.filter(c => byEvent.get(c.event.id)!.length === 1);
      const mainCandidates: SoloCand[] = [...nonCollision];

      for (const colliders of byEvent.values()) {
        if (colliders.length <= 1) continue; // no collision for this event

        if (colliders.length === 2) {
          const [a, b] = colliders as [SoloCand, SoloCand];
          let resolved = false;

          // Distance filter (requires ≥1 non-collision result and different distances)
          if (!resolved && nonCollision.length >= 1 && a.dist.name !== b.dist.name) {
            const distCounts = new Map<string, number>();
            for (const c of nonCollision) distCounts.set(c.dist.name, (distCounts.get(c.dist.name) ?? 0) + 1);
            const topDist = [...distCounts.entries()].sort((x, y) => y[1] - x[1])[0]![0];
            const keptC = a.dist.name === topDist ? a : b.dist.name === topDist ? b : null;
            const routedC = keptC === a ? b : keptC === b ? a : null;
            if (keptC && routedC) {
              mainCandidates.push(keptC);
              routeToBibKey(routedC);
              soloFlags.push({
                groupKey, eventId: a.event.id, eventName: a.event.name, resolution: "distance",
                results: [
                  { bib: keptC.r.bib, distance: keptC.dist.name, genderPos: keptC.r.genderPos, finisherCount: keptC.dist.finisherCount },
                  { bib: routedC.r.bib, distance: routedC.dist.name, genderPos: routedC.r.genderPos, finisherCount: routedC.dist.finisherCount },
                ],
              });
              resolved = true;
            }
          }

          // Percentile filter (requires ≥2 non-collision results with valid genderPos)
          if (!resolved) {
            const baseline = nonCollision.filter(c => !c.r.dnf && !c.r.dns && c.r.genderPos > 0 && c.dist.finisherCount > 0);
            if (baseline.length >= 2) {
              const pcts = baseline.map(c => c.r.genderPos / c.dist.finisherCount).sort((x, y) => x - y);
              const median = pcts[Math.floor(pcts.length / 2)]!;
              const pctA = a.r.genderPos > 0 && a.dist.finisherCount > 0 ? a.r.genderPos / a.dist.finisherCount : null;
              const pctB = b.r.genderPos > 0 && b.dist.finisherCount > 0 ? b.r.genderPos / b.dist.finisherCount : null;
              if (pctA !== null && pctB !== null) {
                const diffA = Math.abs(pctA - median);
                const diffB = Math.abs(pctB - median);
                if ((diffA <= 0.15 && diffB > 0.25) || (diffB <= 0.15 && diffA > 0.25)) {
                  const keptC = diffA < diffB ? a : b;
                  const routedC = diffA < diffB ? b : a;
                  mainCandidates.push(keptC);
                  routeToBibKey(routedC);
                  soloFlags.push({
                    groupKey, eventId: a.event.id, eventName: a.event.name, resolution: "percentile",
                    results: [
                      { bib: keptC.r.bib, distance: keptC.dist.name, genderPos: keptC.r.genderPos, finisherCount: keptC.dist.finisherCount },
                      { bib: routedC.r.bib, distance: routedC.dist.name, genderPos: routedC.r.genderPos, finisherCount: routedC.dist.finisherCount },
                    ],
                  });
                  resolved = true;
                }
              }
            }
          }

          // Unresolvable — both get bib-keyed profiles
          if (!resolved) {
            routeToBibKey(a);
            routeToBibKey(b);
            soloFlags.push({
              groupKey, eventId: a.event.id, eventName: a.event.name, resolution: "flagged_manual",
              results: [
                { bib: a.r.bib, distance: a.dist.name, genderPos: a.r.genderPos, finisherCount: a.dist.finisherCount },
                { bib: b.r.bib, distance: b.dist.name, genderPos: b.r.genderPos, finisherCount: b.dist.finisherCount },
              ],
            });
          }
        } else {
          // 3+ collision results for the same event — flag all
          soloFlags.push({
            groupKey, eventId: colliders[0]!.event.id, eventName: colliders[0]!.event.name,
            resolution: "flagged_manual",
            results: colliders.map(c => ({ bib: c.r.bib, distance: c.dist.name, genderPos: c.r.genderPos, finisherCount: c.dist.finisherCount })),
          });
          for (const c of colliders) routeToBibKey(c);
        }
      }

      // Create the main group profile from non-collision + kept-collision candidates
      if (mainCandidates.length > 0) {
        const displayName = mainCandidates.reduce((best, c) => c.r.name.length > best.length ? c.r.name : best, "");
        const nameLower = normalizeName(displayName);
        index.set(groupKey, newEntry(ids.get(groupKey), displayName, nameLower));
        soloGroupKeys.add(groupKey);
        pass5Solo++;
        const entry = index.get(groupKey)!;
        for (const c of mainCandidates) {
          assigned.add(c.rKey);
          addResult(entry, toRef(c.r, c.event, c.dist), false, flags);
        }
      }
    }
  }

  // 5d: cross-year solo merge — merge same-name profiles with valid age-group progression
  {
    type SoloYearEntry = { key: string; canonCat: string; year: number };
    const soloByName = new Map<string, SoloYearEntry[]>();

    for (const groupKey of soloGroupKeys) {
      if (!index.has(groupKey)) continue;
      const pipeIdx = groupKey.indexOf("|solo:");
      if (pipeIdx < 0) continue;
      const nameLower = groupKey.slice(0, pipeIdx);
      const rest = groupKey.slice(pipeIdx + 6); // after "|solo:"
      const lastColon = rest.lastIndexOf(":");
      if (lastColon < 0) continue;
      const yearStr = rest.slice(lastColon + 1);
      const canonCat = rest.slice(0, lastColon);
      const year = parseInt(yearStr, 10);
      if (isNaN(year)) continue;
      if (!soloByName.has(nameLower)) soloByName.set(nameLower, []);
      soloByName.get(nameLower)!.push({ key: groupKey, canonCat, year });
    }

    let pass5d = 0;
    for (const [, yearProfiles] of soloByName) {
      if (yearProfiles.length <= 1) continue;
      yearProfiles.sort((a, b) => a.year - b.year);

      // Validate all year-to-year transitions
      let allValid = true;
      for (let i = 1; i < yearProfiles.length; i++) {
        const prev = yearProfiles[i - 1]!;
        const curr = yearProfiles[i]!;
        if (!isValidCatTransition(prev.canonCat, curr.canonCat, curr.year - prev.year)) {
          allValid = false; break;
        }
      }
      if (!allValid) continue;

      // Merge all later-year profiles into the earliest one
      const canonEntry = index.get(yearProfiles[0]!.key)!;
      for (let i = 1; i < yearProfiles.length; i++) {
        const laterEntry = index.get(yearProfiles[i]!.key);
        if (!laterEntry) continue;
        for (const result of laterEntry.results) addResult(canonEntry, result, false, flags);
        index.delete(yearProfiles[i]!.key);
        pass5d++;
      }
    }

    if (pass5d > 0) console.log(`  [pass5d] ${pass5d} cross-year solo profile(s) merged`);
  }

  // 5f: cross-year team-change merge — merge unlicensed team profiles for the same athlete
  //     who changed teams between seasons (non-overlapping years, valid category progression).
  {
    type TeamYearEntry = { key: string; entry: AthleteEntry; minYear: number; maxYear: number };
    const teamByName = new Map<string, TeamYearEntry[]>();

    for (const [key, entry] of index) {
      if (key.includes("|solo:")) continue;
      const years = Object.keys(entry.categories).map(Number);
      if (years.length === 0) continue;
      if (!teamByName.has(entry.nameLower)) teamByName.set(entry.nameLower, []);
      teamByName.get(entry.nameLower)!.push({ key, entry, minYear: Math.min(...years), maxYear: Math.max(...years) });
    }

    let pass5f = 0;
    for (const [, profiles] of teamByName) {
      if (profiles.length < 2) continue;
      profiles.sort((a, b) => a.minYear - b.minYear);

      // Skip if any year ranges overlap (likely different people)
      let hasOverlap = false;
      for (let i = 0; i < profiles.length - 1; i++) {
        if (profiles[i]!.maxYear >= profiles[i + 1]!.minYear) { hasOverlap = true; break; }
      }
      if (hasOverlap) continue;

      // Category progression check
      let catOk = true;
      for (let i = 0; i < profiles.length - 1; i++) {
        const prev = profiles[i]!, curr = profiles[i + 1]!;
        const prevCat = entryCanonCatForYear(prev.entry, prev.maxYear);
        const currCat = entryCanonCatForYear(curr.entry, curr.minYear);
        if (!prevCat || !currCat || !isValidCatTransition(prevCat, currCat, curr.minYear - prev.maxYear)) {
          catOk = false; break;
        }
      }
      if (!catOk) continue;

      // Distance check (consecutive profiles must share at least one distance)
      let distOk = true;
      for (let i = 0; i < profiles.length - 1; i++) {
        if (!setsIntersect(profileDistanceSet(profiles[i]!.entry.results), profileDistanceSet(profiles[i + 1]!.entry.results))) {
          distOk = false; break;
        }
      }
      if (!distOk) continue;

      // Percentile check (consecutive profiles where both have ≥2 results)
      let pctOk = true;
      for (let i = 0; i < profiles.length - 1; i++) {
        const mA = profileMedianPercentile(profiles[i]!.entry.results);
        const mB = profileMedianPercentile(profiles[i + 1]!.entry.results);
        if (mA !== null && mB !== null && Math.abs(mA - mB) > 0.25) { pctOk = false; break; }
      }
      if (!pctOk) continue;

      // Country check (conflicting non-null countries → different people)
      let countryOk = true;
      for (let i = 0; i < profiles.length - 1; i++) {
        const cA = profileCountry(profiles[i]!.entry.results);
        const cB = profileCountry(profiles[i + 1]!.entry.results);
        if (cA !== null && cB !== null && cA !== cB) { countryOk = false; break; }
      }
      if (!countryOk) continue;

      // Merge all later profiles into the earliest
      const canon = profiles[0]!;
      for (let i = 1; i < profiles.length; i++) {
        const later = profiles[i]!;
        if (!index.has(later.key)) continue;
        for (const result of later.entry.results) addResult(canon.entry, result, false, flags);
        index.delete(later.key);
        pass5f++;
      }
      deriveCanonicalTeam(canon.entry);
    }

    if (pass5f > 0) console.log(`  [pass5f] ${pass5f} cross-year team profile(s) merged`);
  }

  // 5e: team ↔ solo cross-pass merge — merge solo profiles into matching team profiles.
  //     Filters: golden rule (no shared event), distance, percentile, country, category.
  {
    let pass5e = 0;

    const soloKeys = [...index.keys()].filter(k => k.includes("|solo:"));

    for (const soloKey of soloKeys) {
      const soloEntry = index.get(soloKey);
      if (!soloEntry) continue;

      const soloEventIds = new Set(soloEntry.results.map(r => r.eventId));

      // Step A: find all team candidates with same name
      let candidates: Array<{ key: string; entry: AthleteEntry }> = [];
      for (const [k, e] of index) {
        if (k.includes("|solo:")) continue;
        if (e.nameLower === soloEntry.nameLower) candidates.push({ key: k, entry: e });
      }
      if (candidates.length === 0) continue;

      // Step B: golden rule — remove candidates sharing any eventId
      candidates = candidates.filter(c => !c.entry.results.some(r => soloEventIds.has(r.eventId)));
      if (candidates.length === 0) continue;

      // Step C: distance sanity check — must share at least one distance
      const soloDists = profileDistanceSet(soloEntry.results);
      candidates = candidates.filter(c => setsIntersect(soloDists, profileDistanceSet(c.entry.results)));
      if (candidates.length === 0) continue;

      // Step D: percentile sanity check
      const soloMedian = profileMedianPercentile(soloEntry.results);
      if (soloMedian !== null) {
        candidates = candidates.filter(c => {
          const m = profileMedianPercentile(c.entry.results);
          return m === null || Math.abs(soloMedian - m) <= 0.25;
        });
        if (candidates.length === 0) continue;
      }

      // Step D2: country sanity check
      const soloCountry = profileCountry(soloEntry.results);
      if (soloCountry !== null) {
        candidates = candidates.filter(c => {
          const cc = profileCountry(c.entry.results);
          return cc === null || cc === soloCountry;
        });
        if (candidates.length === 0) continue;
      }

      // Step E1: category compatibility check
      const soloYearCats = Object.entries(soloEntry.categories)
        .map(([yr, raws]) => ({ year: Number(yr), canon: canonicalizeCategory(raws[0] ?? "") }))
        .filter(x => x.canon);
      candidates = candidates.filter(c => {
        const combined = [
          ...soloYearCats,
          ...Object.entries(c.entry.categories)
            .map(([yr, raws]) => ({ year: Number(yr), canon: entryCanonCatForYear(c.entry, Number(yr)) ?? "" }))
            .filter(x => x.canon),
        ].sort((a, b) => a.year - b.year);
        for (let i = 1; i < combined.length; i++) {
          const prev = combined[i - 1]!, curr = combined[i]!;
          if (prev.year === curr.year) {
            // Same year: must be compatible
            if (!categoriesCompatible(prev.canon, curr.canon)) return false;
          } else {
            if (!isValidCatTransition(prev.canon, curr.canon, curr.year - prev.year)) return false;
          }
        }
        return true;
      });
      if (candidates.length === 0) continue;

      // Step E: merge or flag
      if (candidates.length === 1) {
        for (const result of soloEntry.results) addResult(candidates[0]!.entry, result, false, flags);
        index.delete(soloKey);
        deriveCanonicalTeam(candidates[0]!.entry);
        pass5e++;
      } else {
        crossPassFlags.push({
          soloKey,
          soloName: soloEntry.name,
          teamCandidates: candidates.map(c => ({ athleteId: c.entry.id, canonicalTeam: c.entry.canonicalTeam })),
        });
      }
    }

    if (pass5e > 0) console.log(`  [pass5e] ${pass5e} solo profile(s) merged into team profile(s)`);
    if (crossPassFlags.length > 0) console.log(`  [pass5e] ${crossPassFlags.length} ambiguous cross-pass merge(s) flagged`);
  }

  console.log(`  [pass5] ${pass5Team} new team profiles, ${pass5Solo} solo profiles (${soloFlags.length} collision flag(s))`);

  // ── Final: sort results, derive canonical teams ───────────────────────────

  for (const entry of index.values()) {
    entry.results.sort(
      (a, b) => new Date(b.eventDate).getTime() - new Date(a.eventDate).getTime()
    );
    deriveCanonicalTeam(entry);
  }

  // ── Pass 6: manual result assignments ────────────────────────────────────

  // Build (eventId, bib) → { key, resultIdx } for fast lookup
  // We need to scan result files for bib numbers since AthleteResultRef doesn't store bib
  let pass6 = 0;
  for (const assignment of assignments) {
    const target = [...index.values()].find((e) => e.id === assignment.athleteId);
    if (!target) {
      console.error(`  [pass6] ERROR: athleteId ${assignment.athleteId} not found — skipping`);
      continue;
    }
    // Find result by (eventId, source bib) — search all entries
    let moved = false;
    outer: for (const [key, entry] of index) {
      for (let i = 0; i < entry.results.length; i++) {
        const r = entry.results[i]!;
        if (r.eventId !== assignment.eventId) continue;
        if (entry === target) break outer; // already on target
        target.results.push(r);
        addToTeamsAndCategories(target, r);
        entry.results.splice(i, 1);
        if (entry.results.length === 0) index.delete(key);
        pass6++;
        moved = true;
        break outer;
      }
    }
    if (!moved) console.warn(`  [pass6] eventId=${assignment.eventId} bib=${assignment.bib} not found`);
  }

  if (pass6 > 0) {
    for (const entry of index.values()) {
      entry.results.sort(
        (a, b) => new Date(b.eventDate).getTime() - new Date(a.eventDate).getTime()
      );
    }
    console.log(`  [pass6] ${pass6} manual result(s) applied`);
  }

  // ── Post-pass: year-category consistency sweep ───────────────────────────
  //
  // An athlete has exactly one canonical category per year (the most frequent one
  // across all their results for that year). Any result whose category is incompatible
  // with the year's canonical is a source-data error — flag and remove it.
  // This runs after all passes so the full picture is available before judging outliers.
  {
    let yearCatDrops = 0;
    for (const entry of index.values()) {
      const yearSet = new Set(entry.results.map(r => r.eventYear));
      for (const year of yearSet) {
        const canonCat = entryCanonCatForYear(entry, year);
        if (!canonCat) continue;
        // Only drop outliers when canonical clearly dominates (more results than all outliers combined)
        const yearResults = entry.results.filter(r => r.eventYear === year);
        const outliers = yearResults.filter(r => {
          if (!r.category) return false; // no category data — never an outlier
          const canon = canonicalizeCategory(r.category);
          if (canon === "Unknown") return false; // unrecognised category — can't contradict
          return !categoriesCompatible(canon, canonCat);
        });
        const canonCount = yearResults.length - outliers.length;
        if (canonCount <= outliers.length) continue; // no clear majority — leave for manual review
        for (const r of outliers) {
          flags.push({
            athleteId: entry.id,
            athleteName: entry.name,
            eventId: r.eventId,
            eventName: r.eventName,
            existing: { category: canonCat, team: r.team },
            incoming: { category: r.category, team: r.team },
            resolution: "flagged_manual",
          });
          entry.results.splice(entry.results.indexOf(r), 1);
          yearCatDrops++;
        }
      }
      // Rebuild categories from the cleaned results
      entry.categories = {};
      entry.teams = [];
      for (const r of entry.results) addToTeamsAndCategories(entry, r);
      deriveCanonicalTeam(entry);
    }
    if (yearCatDrops > 0) console.log(`  [post] ${yearCatDrops} result(s) removed — category inconsistent with athlete's year category`);
  }

  // ── Build updated ID store ────────────────────────────────────────────────

  const updatedIdStore = new Map(idStore);
  for (const [key, id] of ids.getMinted()) updatedIdStore.set(key, id);
  for (const [key, entry] of index) updatedIdStore.set(key, entry.id);

  return { index, updatedIdStore, flags, soloFlags, crossPassFlags };
}

// ── Aggregate ranking ─────────────────────────────────────────────────────────

export function buildAggregateRanking(
  events: StoredEvent[],
  loader: ResultsLoader,
  athleteIndex: Map<string, AthleteEntry> = new Map(),
  keyToCanonical: Map<string, string> = new Map()
): AggregateRanking {
  type AccEntry = {
    id: number; name: string; nameLower: string; gender: string;
    team: string; teamDate: string; country: string;
    totalPoints: number; eventsScored: number; bestPos: number;
    results: AggregateAthlete["results"];
  };
  // Build id → canonical key map so stored athleteId can resolve directly
  const idToCanonicalKey = new Map<number, string>();
  for (const [key, entry] of athleteIndex) idToCanonicalKey.set(entry.id, key);

  const acc: Record<string, Record<string, Record<string, Map<string, AccEntry>>>> = {};

  for (const event of events.filter((e) => e.hasResults)) {
    const stored = loader(event.id);
    if (!stored) continue;
    const yearKey = String(event.year);
    if (!acc[yearKey]) acc[yearKey] = {};

    for (const dist of stored.distances) {
      const distKey = normalizeDistance(dist.name);
      if (!acc[yearKey][distKey]) acc[yearKey][distKey] = {};

      const byGender = new Map<string, StoredResult[]>();
      for (const r of dist.results) {
        if (r.dnf || r.dns || r.pos < 1) continue;
        if (!byGender.has(r.gender)) byGender.set(r.gender, []);
        byGender.get(r.gender)!.push(r);
      }

      for (const [gender, finishers] of byGender) {
        finishers.sort((a, b) => a.raceTimeSecs - b.raceTimeSecs);
        const coeff = finisherCoefficient(finishers.length);
        if (!acc[yearKey][distKey][gender]) acc[yearKey][distKey][gender] = new Map();
        const distMap = acc[yearKey][distKey][gender];

        finishers.forEach((r, idx) => {
          const genderPos = idx + 1;
          const basePoints = posToBasePoints(genderPos);
          if (basePoints === 0) return;
          const pts = Math.round(basePoints * coeff * 10) / 10;
          const nameLower = normalizeName(r.name);
          // Prefer stored athleteId from injected result files; fall back to name+team key
          const storedId = r.athleteId ?? 0;
          const rawKey = `${nameLower}|${teamNormalKey(r.team)}`;
          const aKey = (storedId > 0 && idToCanonicalKey.has(storedId))
            ? idToCanonicalKey.get(storedId)!
            : (keyToCanonical.get(rawKey) ?? rawKey);
          const id = storedId > 0 ? storedId : (athleteIndex.get(aKey)?.id ?? 0);

          if (!distMap.has(aKey)) {
            distMap.set(aKey, {
              id, name: r.name, nameLower, gender: r.gender,
              team: r.team, teamDate: event.date, country: r.country,
              totalPoints: 0, eventsScored: 0, bestPos: genderPos, results: [],
            });
          }
          const entry = distMap.get(aKey)!;
          entry.totalPoints = Math.round((entry.totalPoints + pts) * 10) / 10;
          entry.eventsScored += 1;
          if (genderPos < entry.bestPos) entry.bestPos = genderPos;
          entry.country = r.country || entry.country;
          if (event.date >= entry.teamDate && r.team) {
            entry.team = r.team; entry.teamDate = event.date;
          }
          entry.results.push({
            eventId: event.id, eventName: event.name, eventDate: event.date,
            distanceFinishers: finishers.length, coefficient: coeff,
            pos: genderPos, basePoints, points: pts,
          });
        });
      }
    }
  }

  const ranking: AggregateRanking = {};
  for (const [year, distances] of Object.entries(acc)) {
    ranking[year] = {};
    for (const [dist, genders] of Object.entries(distances)) {
      ranking[year][dist] = {};
      for (const [gender, distMap] of Object.entries(genders)) {
        const sorted = Array.from(distMap.values())
          .sort((a, b) => b.totalPoints - a.totalPoints || a.bestPos - b.bestPos);
        ranking[year][dist][gender] = sorted.map((e, i) => ({
          rank: i + 1, id: e.id, name: e.name, nameLower: e.nameLower,
          gender: e.gender, team: e.team, country: e.country,
          totalPoints: e.totalPoints, eventsScored: e.eventsScored, bestPos: e.bestPos,
          results: e.results.sort(
            (a, b) => new Date(b.eventDate).getTime() - new Date(a.eventDate).getTime()
          ),
        }));
      }
    }
  }
  return ranking;
}

// ── Team ranking ──────────────────────────────────────────────────────────────

const INDIVIDUAL_TEAM_KEYS = new Set(["individual", "independente", ""]);

export function buildTeamRanking(
  events: StoredEvent[],
  loader: ResultsLoader,
  athleteIndex: Map<string, AthleteEntry> = new Map(),
  keyToCanonical: Map<string, string> = new Map()
): TeamRanking {
  type AccTeam = {
    teamKey: string; nameOcc: Map<string, number>;
    totalPoints: number; eventsScored: number; bestRank: number;
    results: TeamEntry["results"];
  };
  const acc: Record<string, Record<string, Map<string, AccTeam>>> = {};

  for (const event of events.filter((e) => e.hasResults)) {
    const stored = loader(event.id);
    if (!stored) continue;
    const yearKey = String(event.year);
    if (!acc[yearKey]) acc[yearKey] = {};

    for (const dist of stored.distances) {
      const distKey = normalizeDistance(dist.name);
      if (!acc[yearKey][distKey]) acc[yearKey][distKey] = new Map();
      const distMap = acc[yearKey][distKey];

      const teamAthletes = new Map<string, Array<{ name: string; pos: number; rawTeam: string }>>();
      for (const r of dist.results) {
        if (r.dnf || r.dns || r.pos < 1 || !r.team) continue;
        const tk = teamNormalKey(r.team);
        if (INDIVIDUAL_TEAM_KEYS.has(tk)) continue;
        if (!teamAthletes.has(tk)) teamAthletes.set(tk, []);
        teamAthletes.get(tk)!.push({ name: r.name, pos: r.pos, rawTeam: fixRawTeamName(r.team) });
      }

      const totalTeams = teamAthletes.size;
      type EligibleTeam = {
        tk: string; rawTeam: string; combinedScore: number; bestPos: number;
        top3: Array<{ name: string; pos: number; rawTeam: string }>;
      };
      const eligible: EligibleTeam[] = [];

      for (const [tk, athletes] of teamAthletes) {
        if (athletes.length < 3) continue;
        const sorted = [...athletes].sort((a, b) => a.pos - b.pos);
        const top3 = sorted.slice(0, 3);
        eligible.push({
          tk, rawTeam: sorted[0]!.rawTeam,
          combinedScore: top3.reduce((s, a) => s + a.pos, 0),
          bestPos: top3[0]!.pos, top3,
        });
      }

      eligible.sort((a, b) => a.combinedScore - b.combinedScore || a.bestPos - b.bestPos);
      const eligibleTeams = eligible.length;
      const coeff = teamCoefficient(eligibleTeams);

      eligible.slice(0, 10).forEach((et, i) => {
        const teamRank = i + 1;
        const basePoints = rankToTeamBasePoints(teamRank);
        const pts = Math.round(basePoints * coeff * 10) / 10;

        if (!distMap.has(et.tk)) {
          distMap.set(et.tk, {
            teamKey: et.tk, nameOcc: new Map(),
            totalPoints: 0, eventsScored: 0, bestRank: teamRank, results: [],
          });
        }
        const entry = distMap.get(et.tk)!;
        entry.totalPoints = Math.round((entry.totalPoints + pts) * 10) / 10;
        entry.eventsScored += 1;
        if (teamRank < entry.bestRank) entry.bestRank = teamRank;
        entry.nameOcc.set(et.rawTeam, (entry.nameOcc.get(et.rawTeam) ?? 0) + 1);
        entry.results.push({
          eventId: event.id, eventName: event.name, eventDate: event.date,
          totalTeams, eligibleTeams, coefficient: coeff,
          teamRank, basePoints, points: pts, combinedScore: et.combinedScore,
          athletes: et.top3.map((a) => {
            const rk = `${normalizeName(a.name)}|${teamNormalKey(a.rawTeam)}`;
            const canonRk = keyToCanonical.get(rk) ?? rk;
            return { id: athleteIndex.get(canonRk)?.id ?? 0, name: a.name, pos: a.pos };
          }),
        });
      });
    }
  }

  const ranking: TeamRanking = {};
  for (const [year, distances] of Object.entries(acc)) {
    ranking[year] = {};
    for (const [dist, distMap] of Object.entries(distances)) {
      const sorted = Array.from(distMap.values())
        .sort((a, b) => b.totalPoints - a.totalPoints || a.bestRank - b.bestRank);
      ranking[year][dist] = sorted.map((entry, i) => ({
        rank: i + 1, team: canonicalTeam(entry.nameOcc),
        totalPoints: entry.totalPoints, eventsScored: entry.eventsScored, bestRank: entry.bestRank,
        results: entry.results.sort(
          (a, b) => new Date(b.eventDate).getTime() - new Date(a.eventDate).getTime()
        ),
      }));
    }
  }
  return ranking;
}
