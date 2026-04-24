/**
 * pipeline.ts
 *
 * 9-pass athlete index builder. See ATHLETE_PIPELINE_PLAN.md for full design rationale.
 *
 * Pass 1 — Licence athletes only (authoritative)
 * Pass 2 — Unlicensed team results matched by name + team
 * Pass 3 — Team results (new profiles)
 * Pass 4 — Team-based athlete aliases
 * Pass 5 — Solo results grouped by (name, category, year); intra-event collision resolution
 * Pass 6 — Cross-year solo merge (valid age-group progression)
 * Pass 7 — Cross-year team-change merge
 * Pass 8 — Team ↔ solo cross-pass merge
 * Pass 9 — Manual result assignments (result-assignments.json)
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
  canonicalizeCategory,
  isSoloTeam,
  sameTeam,
} from "../normalize.js";
import type {
  StoredEvent,
  StoredEventResults,
  StoredDistanceResults,
  StoredResult,
  AthleteEntry,
  AthleteResultRef,
  AthleteAliasRule,
  ResultAssignment,
} from "@granfondo/database/types";

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
  sameTeam,
} from "../normalize.js";

// ── Solo collision percentile thresholds ─────────────────────────────────────
// Two-result baseline (≥2 clean non-collision results): looser window since the
// median is reliable.
const PERCENTILE_CLOSE_2 = 0.15;
const PERCENTILE_FAR_2   = 0.25;
// Single-result baseline (exactly 1 clean result): tighter window to compensate
// for the noisier median estimate.
const PERCENTILE_CLOSE_1 = 0.10;
const PERCENTILE_FAR_1   = 0.35;

/** Composite key for team athletes; solo:category key for unaffiliated. */
export function athleteKey(nameLower: string, team: string, category = ""): string {
  if (!isSoloTeam(team)) return `${nameLower}|${teamNormalKey(team)}`;
  const catKey = category
    ? normalizeCategory(category).toLowerCase().replace(/\s+/g, "-")
    : "";
  return catKey ? `${nameLower}|solo:${catKey}` : `${nameLower}|`;
}

export type { AthleteAliasRule, ResultAssignment };

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

/** One raw result row with its event/distance context and dedup key. */
type RawResult = { event: StoredEvent; dist: StoredDistanceResults; r: StoredResult; rKey: string };

function resultDedupeKey(eventId: number, distName: string, bib: string): string {
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
  const knownCanon = (entry.categories[year] ?? []).map(canonicalizeCategory);
  const existingMatches = knownCanon.some((c) => categoriesCompatible(c, existingCat));
  const incomingMatches = knownCanon.some((c) => categoriesCompatible(c, incomingCat));

  if (existingMatches && !incomingMatches) return;
  if (incomingMatches && !existingMatches) {
    entry.results.splice(entry.results.indexOf(existing), 1, result);
    addToTeamsAndCategories(entry, result);
    return;
  }

  // Same person cannot race the same event twice — keep existing, discard incoming silently.
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

function buildNameLookup(index: Map<string, AthleteEntry>): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const [key, entry] of index) {
    if (!map.has(entry.nameLower)) map.set(entry.nameLower, []);
    map.get(entry.nameLower)!.push(key);
  }
  return map;
}

// ── Pipeline context ──────────────────────────────────────────────────────────

interface PipelineCtx {
  // Inputs (read-only after init)
  allResults: RawResult[];
  aliasRules: AthleteAliasRule[];
  assignments: ResultAssignment[];
  loader: ResultsLoader;
  // Mutable pipeline state
  index: Map<string, AthleteEntry>;
  assigned: Set<string>;
  ids: ReturnType<typeof makeIdManager>;
  soloFlags: SoloCollisionFlag[];
  crossPassFlags: CrossPassFlag[];
  deletedKeys: Set<string>;
  manualAssignments: Set<string>;
  soloGroupKeys: Set<string>;
}

// ── Pass 1: licence athletes ──────────────────────────────────────────────────

function runPass1(ctx: PipelineCtx): void {
  const { allResults, index, assigned, ids } = ctx;

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

  for (const [lic, canonName] of licenceToCanonicalName) {
    const results = licenceToResults.get(lic)!;
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
      const rk = resultDedupeKey(event.id, dist.name, r.bib);
      if (assigned.has(rk)) continue;
      assigned.add(rk);
      addResult(entry, toRef(r, event, dist), true);
    }
  }

  console.log(`  [pass1] ${index.size} licence-verified athletes built`);
}

// ── Pass 2: unlicensed team results by name + team ────────────────────────────

function runPass2(ctx: PipelineCtx): void {
  const { allResults, index, assigned } = ctx;
  let count = 0;
  const nameLookup = buildNameLookup(index);

  for (const { event, dist, r, rKey } of allResults) {
    if (assigned.has(rKey)) continue;
    if (isSoloTeam(r.team)) continue;
    if (r.licences.some(isValidLicence)) continue;

    const nameLower = normalizeName(r.name);
    const candidates = (nameLookup.get(nameLower) ?? []).filter((key) =>
      index.get(key)!.teams.some((tk) => sameTeam(tk, r.team))
    );

    if (candidates.length === 1) {
      assigned.add(rKey);
      addResult(index.get(candidates[0]!)!, toRef(r, event, dist), false);
      count++;
    } else if (candidates.length > 1) {
      console.warn(
        `  [pass2] ambiguous: "${r.name}" / "${r.team}" @ event ${event.id} — ${candidates.length} matches — left for pass3`
      );
    }
  }

  console.log(`  [pass2] ${count} unlicensed results matched by name+team`);
}

// ── Pass 3: team results ──────────────────────────────────────────────────────

function runPass3(ctx: PipelineCtx): { teamCount: number } {
  const { allResults, index, assigned, ids } = ctx;
  let teamCount = 0;

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
      for (const [k, e] of index) {
        if (e.nameLower !== nameLower) continue;
        const kTeam = k.includes("|") ? k.slice(k.indexOf("|") + 1) : "";
        if (teamKeySimilarity(tk, kTeam) === 1) { matchKey = k; break; }
      }
    }

    assigned.add(rKey);
    if (matchKey) {
      addResult(index.get(matchKey)!, toRef(r, event, dist), false);
    } else {
      index.set(exactKey, newEntry(ids.get(exactKey), r.name, nameLower));
      addResult(index.get(exactKey)!, toRef(r, event, dist), false);
      teamCount++;
    }
  }

  return { teamCount };
}

// ── Pass 4: team-based athlete aliases ───────────────────────────────────────

function runPass4(ctx: PipelineCtx): void {
  const { index, aliasRules } = ctx;

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
      for (const result of aliasEntry.results) addResult(canonEntry, result, false);
      index.delete(aliasKey);
    }
    deriveCanonicalTeam(canonEntry);
  }
}

// ── Pass 5: solo — group by (nameLower, canonCat, year); disambiguate intra-event collisions ──

function runPass5(ctx: PipelineCtx): { soloCount: number } {
  const { allResults, index, assigned, ids, soloFlags, soloGroupKeys } = ctx;
  let soloCount = 0;

  const routeToBibKey = (c: RawResult): void => {
    const nameLower = normalizeName(c.r.name);
    const canonCat = canonicalizeCategory(c.r.category);
    const bibKey = `${nameLower}|solo:${canonCat}:${c.event.year}:${c.r.bib}`;
    index.set(bibKey, newEntry(ids.get(bibKey), c.r.name, nameLower));
    assigned.add(c.rKey);
    addResult(index.get(bibKey)!, toRef(c.r, c.event, c.dist), false);
    soloCount++;
  };

  // Group all remaining unassigned results by (name, canonCat, year)
  const soloGroups = new Map<string, RawResult[]>();
  for (const cand of allResults) {
    if (assigned.has(cand.rKey)) continue;
    const nameLower = normalizeName(cand.r.name);
    const canonCat = soloGroupCat(canonicalizeCategory(cand.r.category));
    const groupKey = `${nameLower}|solo:${canonCat}:${cand.event.year}`;
    if (!soloGroups.has(groupKey)) soloGroups.set(groupKey, []);
    soloGroups.get(groupKey)!.push(cand);
  }

  for (const [groupKey, candidates] of soloGroups) {
    const byEvent = new Map<number, RawResult[]>();
    for (const c of candidates) {
      if (!byEvent.has(c.event.id)) byEvent.set(c.event.id, []);
      byEvent.get(c.event.id)!.push(c);
    }

    const cleanResults = candidates.filter(c => byEvent.get(c.event.id)!.length === 1);
    const mainCandidates: RawResult[] = [...cleanResults];

    for (const colliders of byEvent.values()) {
      if (colliders.length <= 1) continue;

      if (colliders.length === 2) {
        const [a, b] = colliders as [RawResult, RawResult];
        let resolved = false;

        // Distance filter: different distances at same event → unambiguously two different people.
        // If baseline exists, keep the distance matching the athlete's most common distance.
        // If no baseline (first-time athlete), keep `a` arbitrarily — both splits are equally valid.
        if (!resolved && a.dist.name !== b.dist.name) {
          let keptCandidate: RawResult, routedCandidate: RawResult;
          if (cleanResults.length >= 1) {
            const distCounts = new Map<string, number>();
            for (const c of cleanResults) distCounts.set(c.dist.name, (distCounts.get(c.dist.name) ?? 0) + 1);
            const topDist = [...distCounts.entries()].sort((x, y) => y[1] - x[1])[0]![0];
            keptCandidate = a.dist.name === topDist ? a : b;
            routedCandidate = keptCandidate === a ? b : a;
          } else {
            keptCandidate = a;
            routedCandidate = b;
          }
          mainCandidates.push(keptCandidate);
          routeToBibKey(routedCandidate);
          soloFlags.push({
            groupKey, eventId: a.event.id, eventName: a.event.name, resolution: "distance",
            results: [
              { bib: keptCandidate.r.bib, distance: keptCandidate.dist.name, genderPos: keptCandidate.r.genderPos, finisherCount: keptCandidate.dist.finisherCount },
              { bib: routedCandidate.r.bib, distance: routedCandidate.dist.name, genderPos: routedCandidate.r.genderPos, finisherCount: routedCandidate.dist.finisherCount },
            ],
          });
          resolved = true;
        }

        // Percentile filter: compare each collider's percentile against the baseline median.
        // ≥2 results → standard thresholds (within PERCENTILE_CLOSE_2/FAR_2).
        // ≥1 result  → stricter thresholds (PERCENTILE_CLOSE_1/FAR_1) since single data point is less reliable.
        if (!resolved) {
          const baseline = cleanResults.filter(c => !c.r.dnf && !c.r.dns && c.r.genderPos > 0 && c.dist.finisherCount > 0);
          if (baseline.length >= 1) {
            const pcts = baseline.map(c => c.r.genderPos / c.dist.finisherCount).sort((x, y) => x - y);
            const median = pcts[Math.floor(pcts.length / 2)]!;
            const pctA = a.r.genderPos > 0 && a.dist.finisherCount > 0 ? a.r.genderPos / a.dist.finisherCount : null;
            const pctB = b.r.genderPos > 0 && b.dist.finisherCount > 0 ? b.r.genderPos / b.dist.finisherCount : null;
            if (pctA !== null && pctB !== null) {
              const diffA = Math.abs(pctA - median);
              const diffB = Math.abs(pctB - median);
              const [closeThresh, farThresh] = baseline.length >= 2
                ? [PERCENTILE_CLOSE_2, PERCENTILE_FAR_2]
                : [PERCENTILE_CLOSE_1, PERCENTILE_FAR_1];
              if ((diffA <= closeThresh && diffB > farThresh) || (diffB <= closeThresh && diffA > farThresh)) {
                const keptCandidate = diffA < diffB ? a : b;
                const routedCandidate = diffA < diffB ? b : a;
                mainCandidates.push(keptCandidate);
                routeToBibKey(routedCandidate);
                soloFlags.push({
                  groupKey, eventId: a.event.id, eventName: a.event.name, resolution: "percentile",
                  results: [
                    { bib: keptCandidate.r.bib, distance: keptCandidate.dist.name, genderPos: keptCandidate.r.genderPos, finisherCount: keptCandidate.dist.finisherCount },
                    { bib: routedCandidate.r.bib, distance: routedCandidate.dist.name, genderPos: routedCandidate.r.genderPos, finisherCount: routedCandidate.dist.finisherCount },
                  ],
                });
                resolved = true;
              }
            }
          }
        }

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

    if (mainCandidates.length > 0) {
      const displayName = mainCandidates.reduce((best, c) => c.r.name.length > best.length ? c.r.name : best, "");
      const nameLower = normalizeName(displayName);
      index.set(groupKey, newEntry(ids.get(groupKey), displayName, nameLower));
      soloGroupKeys.add(groupKey);
      soloCount++;
      const entry = index.get(groupKey)!;
      for (const c of mainCandidates) {
        assigned.add(c.rKey);
        addResult(entry, toRef(c.r, c.event, c.dist), false);
      }
    }
  }

  return { soloCount };
}

// ── Pass 6: cross-year solo merge ────────────────────────────────────────────

function runPass6(ctx: PipelineCtx): void {
  const { index, soloGroupKeys } = ctx;

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

  let count = 0;
  for (const [, yearProfiles] of soloByName) {
    if (yearProfiles.length <= 1) continue;
    yearProfiles.sort((a, b) => a.year - b.year);

    let allValid = true;
    for (let i = 1; i < yearProfiles.length; i++) {
      const prev = yearProfiles[i - 1]!;
      const curr = yearProfiles[i]!;
      if (!isValidCatTransition(prev.canonCat, curr.canonCat, curr.year - prev.year)) {
        allValid = false; break;
      }
    }
    if (!allValid) continue;

    const canonEntry = index.get(yearProfiles[0]!.key)!;
    for (let i = 1; i < yearProfiles.length; i++) {
      const laterEntry = index.get(yearProfiles[i]!.key);
      if (!laterEntry) continue;
      for (const result of laterEntry.results) addResult(canonEntry, result, false);
      index.delete(yearProfiles[i]!.key);
      count++;
    }
  }

  if (count > 0) console.log(`  [pass9] ${count} cross-year solo profile(s) merged`);
}

// ── Pass 7: cross-year team-change merge ─────────────────────────────────────

function runPass7(ctx: PipelineCtx): void {
  const { index } = ctx;

  type TeamYearEntry = { key: string; entry: AthleteEntry; minYear: number; maxYear: number };
  const teamByName = new Map<string, TeamYearEntry[]>();

  for (const [key, entry] of index) {
    if (key.includes("|solo:")) continue;
    const years = Object.keys(entry.categories).map(Number);
    if (years.length === 0) continue;
    if (!teamByName.has(entry.nameLower)) teamByName.set(entry.nameLower, []);
    teamByName.get(entry.nameLower)!.push({ key, entry, minYear: Math.min(...years), maxYear: Math.max(...years) });
  }

  let count = 0;
  for (const [, profiles] of teamByName) {
    if (profiles.length < 2) continue;
    profiles.sort((a, b) => a.minYear - b.minYear);

    let hasOverlap = false;
    for (let i = 0; i < profiles.length - 1; i++) {
      if (profiles[i]!.maxYear >= profiles[i + 1]!.minYear) { hasOverlap = true; break; }
    }
    if (hasOverlap) continue;

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

    let distOk = true;
    for (let i = 0; i < profiles.length - 1; i++) {
      if (!setsIntersect(profileDistanceSet(profiles[i]!.entry.results), profileDistanceSet(profiles[i + 1]!.entry.results))) {
        distOk = false; break;
      }
    }
    if (!distOk) continue;

    let pctOk = true;
    for (let i = 0; i < profiles.length - 1; i++) {
      const mA = profileMedianPercentile(profiles[i]!.entry.results);
      const mB = profileMedianPercentile(profiles[i + 1]!.entry.results);
      if (mA !== null && mB !== null && Math.abs(mA - mB) > 0.25) { pctOk = false; break; }
    }
    if (!pctOk) continue;

    let countryOk = true;
    for (let i = 0; i < profiles.length - 1; i++) {
      const cA = profileCountry(profiles[i]!.entry.results);
      const cB = profileCountry(profiles[i + 1]!.entry.results);
      if (cA !== null && cB !== null && cA !== cB) { countryOk = false; break; }
    }
    if (!countryOk) continue;

    const canon = profiles[0]!;
    for (let i = 1; i < profiles.length; i++) {
      const later = profiles[i]!;
      if (!index.has(later.key)) continue;
      for (const result of later.entry.results) addResult(canon.entry, result, false);
      index.delete(later.key);
      count++;
    }
    deriveCanonicalTeam(canon.entry);
  }

  if (count > 0) console.log(`  [pass7] ${count} cross-year team profile(s) merged`);
}

// ── Pass 8: team ↔ solo cross-pass merge ─────────────────────────────────────

function runPass8(ctx: PipelineCtx): void {
  const { index, crossPassFlags } = ctx;
  let count = 0;

  const soloKeys = [...index.keys()].filter(k => k.includes("|solo:"));

  for (const soloKey of soloKeys) {
    const soloEntry = index.get(soloKey);
    if (!soloEntry) continue;

    const soloEventIds = new Set(soloEntry.results.map(r => r.eventId));

    let candidates: Array<{ key: string; entry: AthleteEntry }> = [];
    for (const [k, e] of index) {
      if (k.includes("|solo:")) continue;
      if (e.nameLower === soloEntry.nameLower) candidates.push({ key: k, entry: e });
    }
    if (candidates.length === 0) continue;

    // Golden rule — remove candidates sharing any eventId
    candidates = candidates.filter(c => !c.entry.results.some(r => soloEventIds.has(r.eventId)));
    if (candidates.length === 0) continue;

    // Distance sanity check
    const soloDists = profileDistanceSet(soloEntry.results);
    candidates = candidates.filter(c => setsIntersect(soloDists, profileDistanceSet(c.entry.results)));
    if (candidates.length === 0) continue;

    // Percentile sanity check
    const soloMedian = profileMedianPercentile(soloEntry.results);
    if (soloMedian !== null) {
      candidates = candidates.filter(c => {
        const m = profileMedianPercentile(c.entry.results);
        return m === null || Math.abs(soloMedian - m) <= 0.25;
      });
      if (candidates.length === 0) continue;
    }

    // Country sanity check
    const soloCountry = profileCountry(soloEntry.results);
    if (soloCountry !== null) {
      candidates = candidates.filter(c => {
        const cc = profileCountry(c.entry.results);
        return cc === null || cc === soloCountry;
      });
      if (candidates.length === 0) continue;
    }

    // Category compatibility check
    const soloYearCats = Object.entries(soloEntry.categories)
      .map(([yr, raws]) => ({ year: Number(yr), canon: canonicalizeCategory(raws[0] ?? "") }))
      .filter(x => x.canon);
    candidates = candidates.filter(c => {
      const combined = [
        ...soloYearCats,
        ...Object.entries(c.entry.categories)
          .map(([yr]) => ({ year: Number(yr), canon: entryCanonCatForYear(c.entry, Number(yr)) ?? "" }))
          .filter(x => x.canon),
      ].sort((a, b) => a.year - b.year);
      for (let i = 1; i < combined.length; i++) {
        const prev = combined[i - 1]!, curr = combined[i]!;
        if (prev.year === curr.year) {
          if (!categoriesCompatible(prev.canon, curr.canon)) return false;
        } else {
          if (!isValidCatTransition(prev.canon, curr.canon, curr.year - prev.year)) return false;
        }
      }
      return true;
    });
    if (candidates.length === 0) continue;

    if (candidates.length === 1) {
      for (const result of soloEntry.results) addResult(candidates[0]!.entry, result, false);
      index.delete(soloKey);
      deriveCanonicalTeam(candidates[0]!.entry);
      count++;
    } else {
      crossPassFlags.push({
        soloKey,
        soloName: soloEntry.name,
        teamCandidates: candidates.map(c => ({ athleteId: c.entry.id, canonicalTeam: c.entry.canonicalTeam })),
      });
    }
  }

  if (count > 0) console.log(`  [pass8] ${count} solo profile(s) merged into team profile(s)`);
  if (crossPassFlags.length > 0) console.log(`  [pass8] ${crossPassFlags.length} ambiguous cross-pass merge(s) flagged`);
}

// ── Pass 9: manual result assignments ────────────────────────────────────────

function runPass9(ctx: PipelineCtx): void {
  const { index, assigned, assignments, loader, deletedKeys, manualAssignments } = ctx;
  let count = 0;

  for (const assignment of assignments) {
    const target = [...index.values()].find((e) => e.id === assignment.athleteId);
    if (!target) {
      console.error(`  [pass9] ERROR: athleteId ${assignment.athleteId} not found — skipping`);
      continue;
    }

    const eventResults = loader(assignment.eventId);
    let bibNameLower: string | null = null;
    if (eventResults) {
      for (const dist of eventResults.distances) {
        const match = dist.results.find((r) => r.bib === assignment.bib);
        if (match) { bibNameLower = match.nameLower; break; }
      }
    }
    if (!bibNameLower) {
      console.warn(`  [pass9] eventId=${assignment.eventId} bib=${assignment.bib} not found in raw results`);
      continue;
    }

    let moved = false;
    outer: for (const [key, entry] of index) {
      if (entry.nameLower !== bibNameLower) continue;
      for (let i = 0; i < entry.results.length; i++) {
        const r = entry.results[i]!;
        if (r.eventId !== assignment.eventId) continue;
        if (entry === target) break outer;
        target.results.push(r);
        addToTeamsAndCategories(target, r);
        entry.results.splice(i, 1);
        if (entry.results.length === 0) { deletedKeys.add(key); index.delete(key); }
        manualAssignments.add(`${assignment.athleteId}:${assignment.eventId}`);
        count++;
        moved = true;
        break outer;
      }
    }
    if (!moved) console.warn(`  [pass9] eventId=${assignment.eventId} bib=${assignment.bib} (${bibNameLower}) not found in index`);
  }

  if (count > 0) {
    for (const entry of index.values()) {
      entry.results.sort((a, b) => new Date(b.eventDate).getTime() - new Date(a.eventDate).getTime());
    }
    console.log(`  [pass9] ${count} manual result(s) applied`);
  }

}

// ── Post-pass: year-category consistency sweep ────────────────────────────────

function runPostPass(ctx: PipelineCtx): void {
  const { index, manualAssignments } = ctx;
  let drops = 0;

  for (const entry of index.values()) {
    const yearSet = new Set(entry.results.map(r => r.eventYear));
    for (const year of yearSet) {
      const canonCat = entryCanonCatForYear(entry, year);
      if (!canonCat) continue;
      const yearResults = entry.results.filter(r => r.eventYear === year);
      const outliers = yearResults.filter(r => {
        if (!r.category) return false;
        const canon = canonicalizeCategory(r.category);
        if (canon === "Unknown") return false;
        if (manualAssignments.has(`${entry.id}:${r.eventId}`)) return false;
        return !categoriesCompatible(canon, canonCat);
      });
      const canonCount = yearResults.length - outliers.length;
      if (canonCount <= outliers.length) continue;
      for (const r of outliers) {
        entry.results.splice(entry.results.indexOf(r), 1);
        drops++;
      }
    }
    entry.categories = {};
    entry.teams = [];
    for (const r of entry.results) addToTeamsAndCategories(entry, r);
    deriveCanonicalTeam(entry);
  }

  if (drops > 0) console.log(`  [post] ${drops} result(s) removed — category inconsistent with athlete's year category`);
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
  soloFlags: SoloCollisionFlag[];
  crossPassFlags: CrossPassFlag[];
} {
  const ids = makeIdManager(idStore);

  // Preload all results
  const allResults: RawResult[] = [];
  for (const event of events.filter((e) => e.hasResults)) {
    const stored = loader(event.id);
    if (!stored) continue;
    for (const dist of stored.distances) {
      for (const r of dist.results) {
        allResults.push({ event, dist, r, rKey: resultDedupeKey(event.id, dist.name, r.bib) });
      }
    }
  }

  const ctx: PipelineCtx = {
    allResults, aliasRules, assignments, loader,
    index: new Map(),
    assigned: new Set(),
    ids,
    soloFlags: [],
    crossPassFlags: [],
    deletedKeys: new Set(),
    manualAssignments: new Set(),
    soloGroupKeys: new Set(),
  };

  runPass1(ctx);
  runPass2(ctx);
  const { teamCount } = runPass3(ctx);
  runPass4(ctx);
  const { soloCount } = runPass5(ctx);
  runPass6(ctx);
  runPass7(ctx);
  runPass8(ctx);
  console.log(`  [pass3-8] ${teamCount} new team profiles, ${soloCount} solo profiles (${ctx.soloFlags.length} collision flag(s))`);

  // Final sort + canonical teams before pass 9
  for (const entry of ctx.index.values()) {
    entry.results.sort((a, b) => new Date(b.eventDate).getTime() - new Date(a.eventDate).getTime());
    deriveCanonicalTeam(entry);
  }

  runPass9(ctx);
  runPostPass(ctx);

  // Build updated ID store
  const updatedIdStore = new Map(idStore);
  for (const [key, id] of ids.getMinted()) updatedIdStore.set(key, id);
  for (const [key, entry] of ctx.index) updatedIdStore.set(key, entry.id);
  for (const key of ctx.deletedKeys) updatedIdStore.delete(key);

  return { index: ctx.index, updatedIdStore, soloFlags: ctx.soloFlags, crossPassFlags: ctx.crossPassFlags };
}

