/**
 * pipeline.ts
 *
 * 9-pass athlete index builder.
 *
 * Pass 1 — Licence athletes only (authoritative)
 * Pass 2 — Unlicensed team results matched by name + team
 * Pass 3 — Team results (new profiles)
 * Pass 4 — Team-based athlete aliases
 * Pass 5 — Solo results grouped by (name, category, year); intra-event collision resolution
 * Pass 6 — Cross-year solo merge (valid age-group progression)
 * Pass 7 — Cross-year team-change merge
 * Pass 8 — Team ↔ solo cross-pass merge
 * Pass 9 — Manual result assignments (loaded from DB result_assignments table)
 */

import {
  normalizeName,
  teamNormalKey,
  levenshteinDistance,
  isValidLicence,
  normalizeDistance,
  DISTANCE_ALIASES,
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
  normalizeDistance,
  DISTANCE_ALIASES,
  canonicalizeCategory,
  SOLO_TEAM_KEYS,
  isSoloTeam,
  sameTeam,
} from "../normalize.js";
import { PLACEHOLDER_NAMES } from "../config.js";

// ── Solo collision percentile thresholds ─────────────────────────────────────
// Two-result baseline (≥2 clean non-collision results): looser window since the
// median is reliable.
const PERCENTILE_CLOSE_2 = 0.15;
const PERCENTILE_FAR_2   = 0.25;
// Single-result baseline (exactly 1 clean result): tighter window to compensate
// for the noisier median estimate.
const PERCENTILE_CLOSE_1 = 0.10;
const PERCENTILE_FAR_1   = 0.35;

/** Returns the team ID for a team name, or 0 for solo/unknown teams. */
function resolveTeamId(team: string, store: Map<string, number>): number {
  if (isSoloTeam(team)) return 0;
  return store.get(teamNormalKey(team)) ?? 0;
}

/** Composite key for team athletes (`name|teamId`); solo:category key for unaffiliated. */
export function athleteKey(nameLower: string, team: string, teamIdStore: Map<string, number>, category = ""): string {
  if (!isSoloTeam(team)) return `${nameLower}|${resolveTeamId(team, teamIdStore)}`;
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
  // Gender-agnostic forms (e.g. "Masters A" from normalizeCategory fallback on unknown
  // category strings) are compatible with their gendered variants. This prevents the
  // post-pass from incorrectly removing results from events that omit the gender suffix.
  const stripGender = (s: string) => s.replace(/ (?:Male|Female|F)$/, "");
  if (stripGender(a) === stripGender(b)) return true;
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
  "Masters F Male": 6,    "Masters F Female": 6,
};

// Inverse of SOLO_CAT_RANK: rank → canonical name per gender suffix.
// Derived at module load so SOLO_CAT_RANK stays the single source of truth.
const RANK_TO_CAT = (() => {
  const m = new Map<number, { male: string; female: string }>();
  for (const [name, rank] of Object.entries(SOLO_CAT_RANK)) {
    const isFemale = name.endsWith(" Female");
    const entry = m.get(rank) ?? { male: "", female: "" };
    if (isFemale) entry.female = name; else entry.male = name;
    m.set(rank, entry);
  }
  return m;
})();

/** Maximum rank an athlete in baseCat can legitimately reach after yearDiff seasons.
 *  Uses the same per-decade formula as isValidCatTransition. */
function clampRank(baseRank: number, yearDiff: number): number {
  const maxRankDiff = Math.floor((yearDiff - 1) / 10) + 1;
  return Math.min(baseRank + maxRankDiff, Math.max(...RANK_TO_CAT.keys()));
}

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
  results: Array<{ athleteId: number; bib: string; distance: string; genderPos: number; finisherCount: number }>;
}

export interface CrossPassFlag {
  soloKey: string;
  soloAthleteId: number;
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
  if (valid.length < 1) return null;
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
export function isValidCatTransition(prevCat: string, currCat: string, yearDiff: number): boolean {
  if (prevCat === currCat) return true;
  if (prevCat.startsWith("Open 19-34") || currCat.startsWith("Open 19-34")) {
    return categoriesCompatible(prevCat, currCat);
  }
  const prevRank = SOLO_CAT_RANK[prevCat];
  const currRank = SOLO_CAT_RANK[currCat];
  if (prevRank === undefined || currRank === undefined) return false;
  if (currRank < prevRank) return false;
  const rankDiff = currRank - prevRank;
  // Each category spans ~10 years. Adjacent transition (rank diff 1) needs just 1 year
  // (athlete aging over a boundary), but skipping a category requires nearly a full decade
  // per skipped band. E.g. Elite→Masters B needs at least 11 years (29→40), not 2.
  const minYears = (rankDiff - 1) * 10 + 1;
  if (yearDiff < minYears) return false;
  return true;
}

/** Most common canonical category for a given year in an entry, or null.
 *  Counts per result (not per unique raw string) so that 3×Masters B beats 1×Masters C. */
function entryCanonCatForYear(entry: AthleteEntry, year: number): string | null {
  const counts = new Map<string, number>();
  for (const r of entry.results) {
    if (r.eventYear !== year) continue;
    const c = canonicalizeCategory(r.category);
    if (c === 'Unknown') continue;
    counts.set(c, (counts.get(c) ?? 0) + 1);
  }
  if (!counts.size) return null;
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
    distance: normalizeDistance(dist.name),
    pos: r.pos,
    genderPos: r.genderPos,
    catPos: r.catPos,
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
  teamIdStore: Map<string, number>;
  // Mutable pipeline state
  index: Map<string, AthleteEntry>;
  assigned: Set<string>;
  ids: ReturnType<typeof makeIdManager>;
  soloFlags: SoloCollisionFlag[];
  crossPassFlags: CrossPassFlag[];
  deletedKeys: Set<string>;
  manualAssignments: Set<string>;
  soloGroupKeys: Set<string>;
  // Licence tracking: index key → set of licence numbers from Pass 1.
  // Used by later passes to prevent merging athletes with conflicting licences.
  entryLicences: Map<string, Set<string>>;
}

/**
 * Returns true if both entries have at least one known licence and their
 * licence sets are completely disjoint — i.e. they are definitively different
 * people. Either entry having no licences means we can't rule out the merge.
 */
function licencesConflict(keyA: string, keyB: string, entryLicences: Map<string, Set<string>>): boolean {
  const la = entryLicences.get(keyA);
  const lb = entryLicences.get(keyB);
  if (!la?.size || !lb?.size) return false;
  for (const l of la) if (lb.has(l)) return false;
  return true; // both licenced, no overlap → different people
}

/** After a merge where `absorbedKey` is folded into `survivingKey`, union their licence sets. */
function mergeLicenceSets(survivingKey: string, absorbedKey: string, entryLicences: Map<string, Set<string>>): void {
  const lb = entryLicences.get(absorbedKey);
  if (!lb?.size) return;
  const la = entryLicences.get(survivingKey);
  if (!la) entryLicences.set(survivingKey, new Set(lb));
  else for (const l of lb) la.add(l);
  entryLicences.delete(absorbedKey);
}

// ── Pass 1: licence athletes ──────────────────────────────────────────────────

function runPass1(ctx: PipelineCtx): void {
  const { allResults, index, assigned, ids } = ctx;

  const licenceToResults = new Map<string, Array<{ event: StoredEvent; dist: StoredDistanceResults; r: StoredResult }>>();
  const licenceToNames = new Map<string, Set<string>>();
  // Which other licences each licence has appeared alongside in the same result row.
  // Co-occurrence is definitive proof that two licences belong to the same person.
  const licenceCooc = new Map<string, Set<string>>();

  for (const { event, dist, r } of allResults) {
    const validLicences = r.licences.filter(isValidLicence);
    if (validLicences.length === 0) continue;
    const nameLower = normalizeName(r.name);
    for (const lic of validLicences) {
      if (!licenceToNames.has(lic)) licenceToNames.set(lic, new Set());
      if (!licenceToResults.has(lic)) licenceToResults.set(lic, []);
      licenceToNames.get(lic)!.add(nameLower);
      licenceToResults.get(lic)!.push({ event, dist, r });
      if (!licenceCooc.has(lic)) licenceCooc.set(lic, new Set());
    }
    // Record pairwise co-occurrence for all licences on this result
    if (validLicences.length > 1) {
      for (const lic of validLicences) {
        for (const other of validLicences) {
          if (other !== lic) licenceCooc.get(lic)!.add(other);
        }
      }
    }
  }

  const licenceToCanonicalName = new Map<string, string>();
  // When outlier results are filtered out, store the pruned array here
  const licenceToFilteredResults = new Map<string, Array<{ event: StoredEvent; dist: StoredDistanceResults; r: StoredResult }>>();

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
        // Majority-vote: if one name has ≥3 results AND ≥3× all others combined,
        // it's a data-entry outlier — proceed with the dominant name only.
        const allRes = licenceToResults.get(lic)!;
        const nameCounts = new Map<string, number>();
        for (const { r } of allRes) {
          const nl = normalizeName(r.name);
          nameCounts.set(nl, (nameCounts.get(nl) ?? 0) + 1);
        }
        const sorted = [...nameCounts.entries()].sort((a, b) => b[1] - a[1]);
        const topName = sorted[0]![0];
        const topCount = sorted[0]![1];
        const otherCount = sorted.slice(1).reduce((s, [, c]) => s + c, 0);
        if (topCount >= 3 && topCount >= 3 * otherCount) {
          licenceToCanonicalName.set(lic, topName);
          licenceToFilteredResults.set(lic, allRes.filter(({ r }) => normalizeName(r.name) === topName));
          const outliers = sorted.slice(1).map(([n, c]) => `${n}(${c})`).join(", ");
          console.log(`  [pass1] licence ${lic}: dominant name "${topName}" (${topCount}/${topCount + otherCount}), outlier(s) excluded: ${outliers}`);
        } else {
          console.warn(`  [pass1] licence ${lic}: SKIPPED — distinct names: ${arr.join(", ")}`);
        }
      }
    }
  }

  // Pre-scan: find name|0 keys claimed by more than one licence.
  // Two different licences with the same name and no team result are different people —
  // they must not share a key, so we disambiguate with the licence number.
  const soloKeyLicences = new Map<string, string[]>();
  for (const [lic, canonName] of licenceToCanonicalName) {
    const results = licenceToResults.get(lic)!;
    const hasTeam = results.some((x) => !isSoloTeam(x.r.team));
    if (!hasTeam) {
      const k = `${canonName}|0`;
      if (!soloKeyLicences.has(k)) soloKeyLicences.set(k, []);
      soloKeyLicences.get(k)!.push(lic);
    }
  }
  const soloKeyCollisions = new Set(
    [...soloKeyLicences.entries()].filter(([, lics]) => lics.length > 1).map(([k]) => k)
  );
  if (soloKeyCollisions.size > 0) {
    for (const k of soloKeyCollisions) {
      const lics = soloKeyLicences.get(k)!;
      console.warn(`  [pass1] solo key collision on "${k}" — licences: ${lics.join(", ")} — keeping separate`);
    }
  }

  for (const [lic, canonName] of licenceToCanonicalName) {
    const results = licenceToFilteredResults.get(lic) ?? licenceToResults.get(lic)!;
    const teamResult = results
      .filter((x) => !isSoloTeam(x.r.team))
      .sort((a, b) => new Date(b.event.date).getTime() - new Date(a.event.date).getTime())[0];
    const teamId = teamResult ? resolveTeamId(teamResult.r.team, ctx.teamIdStore) : 0;
    const baseKey = `${canonName}|${teamId}`;
    // If multiple licences would collide on name|0, disambiguate by licence number
    const key = soloKeyCollisions.has(baseKey) ? `${baseKey}:${lic}` : baseKey;

    if (!index.has(key)) {
      const displayName = results.reduce(
        (best, x) => (x.r.name.length > best.length ? x.r.name : best), ""
      );
      index.set(key, newEntry(ids.get(key), displayName, canonName));
    }
    const entry = index.get(key)!;

    // Register this licence against the entry key so later passes can detect conflicts
    if (!ctx.entryLicences.has(key)) ctx.entryLicences.set(key, new Set());
    ctx.entryLicences.get(key)!.add(lic);

    for (const { event, dist, r } of results) {
      const rk = resultDedupeKey(event.id, dist.name, r.bib);
      if (assigned.has(rk)) continue;
      assigned.add(rk);
      addResult(entry, toRef(r, event, dist), true);
    }
  }

  // Within-Pass-1 merge: same canonical name → same person with multiple licences.
  // Team is irrelevant as an identity signal here — licences are the authority.
  // Conflict check: same event+distance with a DIFFERENT bib = two athletes competing
  // simultaneously = different people. Same bib = co-occurring licences on one result = same person.
  const byName = new Map<string, string[]>();
  for (const key of index.keys()) {
    const nameLower = index.get(key)!.nameLower;
    if (!byName.has(nameLower)) byName.set(nameLower, []);
    byName.get(nameLower)!.push(key);
  }
  let mergedCount = 0;
  for (const [, keys] of byName) {
    if (keys.length < 2) continue;
    // Canonicalise to the entry with the most results so the surviving key is stable
    keys.sort((a, b) => (index.get(b)?.results.length ?? 0) - (index.get(a)?.results.length ?? 0));
    for (let i = 0; i < keys.length; i++) {
      const canonKey = keys[i]!;
      const canon = index.get(canonKey);
      if (!canon) continue;
      // Map event+distance → bib so we can distinguish co-occurrence from collision
      const canonBibBySlot = new Map(canon.results.map((r) => [`${r.eventId}|${r.distance}`, r.bib]));
      for (let j = i + 1; j < keys.length; j++) {
        const laterKey = keys[j]!;
        if (!index.has(laterKey)) continue;
        const later = index.get(laterKey)!;
        // Require licence co-occurrence as proof of identity: at least one licence from each
        // entry must have appeared together in the same result row. Without this, same-name
        // is not sufficient — two different licenced athletes with the same name would merge.
        const canonLics = ctx.entryLicences.get(canonKey) ?? new Set<string>();
        const laterLics = ctx.entryLicences.get(laterKey) ?? new Set<string>();
        const hasCooc = [...canonLics].some((cl) => [...laterLics].some((ll) => licenceCooc.get(cl)?.has(ll)));
        if (!hasCooc) continue;
        // Different bib at the same slot → two people competing simultaneously → different athletes
        const hasCollision = later.results.some((r) => {
          const slot = `${r.eventId}|${r.distance}`;
          const canonBib = canonBibBySlot.get(slot);
          return canonBib !== undefined && canonBib !== r.bib;
        });
        if (hasCollision) continue;
        for (const result of later.results) {
          addResult(canon, result, true);
          canonBibBySlot.set(`${result.eventId}|${result.distance}`, result.bib);
        }
        mergeLicenceSets(canonKey, laterKey, ctx.entryLicences);
        index.delete(laterKey);
        ctx.deletedKeys.add(laterKey);
        mergedCount++;
      }
    }
  }

  console.log(`  [pass1] ${index.size} licence-verified athletes built${mergedCount > 0 ? ` (${mergedCount} same-name multi-licence merge(s))` : ""}`);
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
    const exactKey = `${nameLower}|${resolveTeamId(r.team, ctx.teamIdStore)}`;

    const matchKey: string | undefined = index.has(exactKey) ? exactKey : undefined;

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

// ── Pass 3b: merge full-legal-name entries into short-name entries (same team) ─
//
// Some events register athletes under their full legal name (e.g. "Elio Fernando
// Oliveira Silva") while all other events use a short form ("Elio Silva").  Pass 3
// creates two separate entries for the same person.  This pass merges them when:
//   1. Both entries share the same numeric team ID (same canonical club).
//   2. The long name's first token == the short name's first token AND the long
//      name's last token == the short name's last token (primary rule).
//      — OR, for exactly 3-token long names [A B C], also check [A B] as an
//        alternative short form: Spanish convention uses the father's surname (B)
//        as the everyday identifier, not the mother's (C).  If an [A B] entry
//        exists, it is preferred over [A C].  If both exist, the match is
//        ambiguous and the long entry is left unmerged.
//   3. The match is unambiguous — exactly one short candidate and exactly one
//      long candidate per short target.

function runPass3b(ctx: PipelineCtx): void {
  const { index } = ctx;

  type MemberInfo = { key: string; entry: AthleteEntry; tokens: string[] };
  const byTeamId = new Map<string, MemberInfo[]>();

  for (const [key, entry] of index) {
    if (key.includes("|solo:")) continue;
    const teamIdStr = key.slice(key.lastIndexOf("|") + 1);
    if (teamIdStr === "0") continue;
    const tokens = entry.nameLower.split(" ").filter(Boolean);
    if (!byTeamId.has(teamIdStr)) byTeamId.set(teamIdStr, []);
    byTeamId.get(teamIdStr)!.push({ key, entry, tokens });
  }

  /** Returns candidates in the same team whose name is a "short form" of `long`. */
  function findShortCandidates(long: MemberInfo, members: MemberInfo[]): MemberInfo[] {
    const longFirst  = long.tokens[0]!;
    const longLast   = long.tokens[long.tokens.length - 1]!;
    const longSecond = long.tokens.length === 3 ? long.tokens[1]! : null;

    // Primary: [first + last token] match (Portuguese / general convention)
    const lastTokenMatches = members.filter(m =>
      m.key !== long.key &&
      index.has(m.key) &&
      m.tokens.length < long.tokens.length &&
      m.tokens[0] === longFirst &&
      m.tokens[m.tokens.length - 1] === longLast
    );

    // Alternative (3-token only): [first + second token] match (Spanish convention —
    // father's surname is the everyday last name, not the mother's).
    const secondTokenMatches = longSecond !== null ? members.filter(m =>
      m.key !== long.key &&
      index.has(m.key) &&
      m.tokens.length < long.tokens.length &&
      m.tokens[0] === longFirst &&
      m.tokens[m.tokens.length - 1] === longSecond
    ) : [];

    // If the Spanish-convention match exists, prefer it and treat any last-token
    // match as a distinct person → ambiguous, return nothing.
    if (secondTokenMatches.length > 0 && lastTokenMatches.length > 0) return [];
    if (secondTokenMatches.length > 0) return secondTokenMatches;
    return lastTokenMatches;
  }

  let count = 0;
  for (const members of byTeamId.values()) {
    if (members.length < 2) continue;

    for (const long of [...members]) {
      if (!index.has(long.key)) continue;
      if (long.tokens.length < 3) continue;

      const shortCandidates = findShortCandidates(long, members);
      if (shortCandidates.length !== 1) continue;

      const short = shortCandidates[0]!;
      const siblingsForShort = members.filter(m =>
        m.key !== short.key &&
        index.has(m.key) &&
        m.tokens.length > short.tokens.length &&
        m.tokens[0] === short.tokens[0] &&
        m.tokens[m.tokens.length - 1] === short.tokens[short.tokens.length - 1]
      );
      if (siblingsForShort.length !== 1) continue;

      if (licencesConflict(long.key, short.key, ctx.entryLicences)) continue;
      for (const result of long.entry.results) addResult(short.entry, result, false);
      mergeLicenceSets(short.key, long.key, ctx.entryLicences);
      ctx.deletedKeys.add(long.key);
      index.delete(long.key);
      deriveCanonicalTeam(short.entry);
      count++;
      console.log(`  [pass3b] "${long.entry.nameLower}" → "${short.entry.nameLower}" (team ${short.key.slice(short.key.lastIndexOf("|") + 1)})`);
    }
  }

  if (count > 0) console.log(`  [pass3b] ${count} full-name profile(s) merged into short-name entries`);
}

// ── Pass 4: team-based athlete aliases ───────────────────────────────────────

function runPass4(ctx: PipelineCtx): void {
  const { index, aliasRules } = ctx;

  for (const rule of aliasRules) {
    const canonNameLower = normalizeName(rule.name);
    const canonKey = `${canonNameLower}|${resolveTeamId(rule.canonicalTeam, ctx.teamIdStore)}`;
    const canonEntry = index.get(canonKey);
    if (!canonEntry) continue;

    for (const alias of rule.aliases) {
      if (alias.team === "") continue;
      const aliasKey = `${normalizeName(alias.name)}|${resolveTeamId(alias.team, ctx.teamIdStore)}`;
      if (aliasKey === canonKey) continue;
      const aliasEntry = index.get(aliasKey);
      if (!aliasEntry) continue;
      for (const result of aliasEntry.results) addResult(canonEntry, result, false);
      mergeLicenceSets(canonKey, aliasKey, ctx.entryLicences); // alias override — merge regardless of conflict
      index.delete(aliasKey);
      ctx.deletedKeys.add(aliasKey);
    }
    deriveCanonicalTeam(canonEntry);
  }
}

// ── Pass 5: solo — group by (nameLower, canonCat, year); disambiguate intra-event collisions ──

function runPass5(ctx: PipelineCtx): { soloCount: number } {
  const { allResults, index, assigned, ids, soloFlags, soloGroupKeys } = ctx;
  let soloCount = 0;

  const routeToBibKey = (c: RawResult): number => {
    const nameLower = normalizeName(c.r.name);
    const canonCat = canonicalizeCategory(c.r.category);
    const bibKey = `${nameLower}|solo:${canonCat}:${c.event.year}:${c.r.bib}`;
    const id = ids.get(bibKey);
    index.set(bibKey, newEntry(id, c.r.name, nameLower));
    assigned.add(c.rKey);
    addResult(index.get(bibKey)!, toRef(c.r, c.event, c.dist), false);
    soloCount++;
    return id;
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
          const routedId = routeToBibKey(routedCandidate);
          soloFlags.push({
            groupKey, eventId: a.event.id, eventName: a.event.name, resolution: "distance",
            results: [
              { athleteId: 0, bib: keptCandidate.r.bib, distance: keptCandidate.dist.name, genderPos: keptCandidate.r.genderPos, finisherCount: keptCandidate.dist.finisherCount },
              { athleteId: routedId, bib: routedCandidate.r.bib, distance: routedCandidate.dist.name, genderPos: routedCandidate.r.genderPos, finisherCount: routedCandidate.dist.finisherCount },
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
                const routedIdPct = routeToBibKey(routedCandidate);
                soloFlags.push({
                  groupKey, eventId: a.event.id, eventName: a.event.name, resolution: "percentile",
                  results: [
                    { athleteId: 0, bib: keptCandidate.r.bib, distance: keptCandidate.dist.name, genderPos: keptCandidate.r.genderPos, finisherCount: keptCandidate.dist.finisherCount },
                    { athleteId: routedIdPct, bib: routedCandidate.r.bib, distance: routedCandidate.dist.name, genderPos: routedCandidate.r.genderPos, finisherCount: routedCandidate.dist.finisherCount },
                  ],
                });
                resolved = true;
              }
            }
          }
        }

        if (!resolved) {
          const idA = routeToBibKey(a);
          const idB = routeToBibKey(b);
          soloFlags.push({
            groupKey, eventId: a.event.id, eventName: a.event.name, resolution: "flagged_manual",
            results: [
              { athleteId: idA, bib: a.r.bib, distance: a.dist.name, genderPos: a.r.genderPos, finisherCount: a.dist.finisherCount },
              { athleteId: idB, bib: b.r.bib, distance: b.dist.name, genderPos: b.r.genderPos, finisherCount: b.dist.finisherCount },
            ],
          });
        }
      } else {
        // 3+ collision results for the same event — flag all
        const colliderIds = colliders.map(c => routeToBibKey(c));
        soloFlags.push({
          groupKey, eventId: colliders[0]!.event.id, eventName: colliders[0]!.event.name,
          resolution: "flagged_manual",
          results: colliders.map((c, i) => ({ athleteId: colliderIds[i]!, bib: c.r.bib, distance: c.dist.name, genderPos: c.r.genderPos, finisherCount: c.dist.finisherCount })),
        });
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

    const canonKey = yearProfiles[0]!.key;
    const canonEntry = index.get(canonKey)!;
    for (let i = 1; i < yearProfiles.length; i++) {
      const laterKey = yearProfiles[i]!.key;
      const laterEntry = index.get(laterKey);
      if (!laterEntry) continue;
      if (licencesConflict(canonKey, laterKey, ctx.entryLicences)) continue;
      for (const result of laterEntry.results) addResult(canonEntry, result, false);
      mergeLicenceSets(canonKey, laterKey, ctx.entryLicences);
      ctx.deletedKeys.add(laterKey);
      index.delete(laterKey);
      count++;
    }
  }

  if (count > 0) console.log(`  [pass6] ${count} cross-year solo profile(s) merged`);
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

    // Pairwise evaluation: try to merge each profile into any earlier profile that
    // passes all checks. This avoids blocking valid merges when other same-name profiles
    // from genuinely different people overlap in years.
    for (let i = 0; i < profiles.length - 1; i++) {
      const canon = profiles[i]!;
      if (!index.has(canon.key)) continue;

      for (let j = i + 1; j < profiles.length; j++) {
        const later = profiles[j]!;
        if (!index.has(later.key)) continue;

        // If entries share a valid licence they are the same person — bypass all soft
        // checks (year overlap, category transition, distance, percentile, country).
        // The only hard guard is same-event + same-distance + different-bib, which
        // would mean two physically different bibs competing simultaneously.
        const canonLics = ctx.entryLicences.get(canon.key);
        const laterLics = ctx.entryLicences.get(later.key);
        const shareLicence = !!(canonLics?.size && laterLics?.size &&
          [...canonLics].some((l) => laterLics!.has(l)));

        if (shareLicence) {
          const canonBibBySlot = new Map(canon.entry.results.map((r) => [`${r.eventId}|${r.distance}`, r.bib]));
          const hasCollision = later.entry.results.some((r) => {
            const cb = canonBibBySlot.get(`${r.eventId}|${r.distance}`);
            return cb !== undefined && cb !== r.bib;
          });
          if (hasCollision) continue;
          // Shared licence bypasses soft checks, but flag a warning if categories are
          // incompatible — this likely means the licence was scraped onto the wrong result
          // at one event rather than genuinely being the same person.
          const canonCatSL = entryCanonCatForYear(canon.entry, canon.maxYear);
          const laterCatSL = entryCanonCatForYear(later.entry, later.minYear);
          if (canonCatSL && laterCatSL && !isValidCatTransition(canonCatSL, laterCatSL, later.minYear - canon.maxYear)) {
            const sharedLics = [...(ctx.entryLicences.get(canon.key) ?? new Set())].filter(l => ctx.entryLicences.get(later.key)?.has(l));
            console.warn(`  [pass7] WARNING: shared licence (${sharedLics.join(", ")}) but incompatible categories "${canonCatSL}" → "${laterCatSL}" for "${canon.entry.name}" — merging anyway, but likely a scraped licence error`);
          }
        } else {
          if (canon.maxYear >= later.minYear) continue; // year overlap → different people

          // Don't merge a licence-only individual (teamId=0, all solo teams) into a team
          // athlete. These are frequently different people who share a name. They should
          // be handled by Pass 8 (team ↔ solo) or left separate.
          const laterTeamId = parseInt(later.key.slice(later.key.lastIndexOf("|") + 1), 10);
          if (laterTeamId === 0 && later.entry.results.every(r => isSoloTeam(r.team))) continue;

          const prevCat = entryCanonCatForYear(canon.entry, canon.maxYear);
          const currCat = entryCanonCatForYear(later.entry, later.minYear);
          if (!prevCat || !currCat || !isValidCatTransition(prevCat, currCat, later.minYear - canon.maxYear)) continue;

          if (!setsIntersect(profileDistanceSet(canon.entry.results), profileDistanceSet(later.entry.results))) continue;

          const mA = profileMedianPercentile(canon.entry.results);
          const mB = profileMedianPercentile(later.entry.results);
          if (mA !== null && mB !== null && Math.abs(mA - mB) > 0.25) continue;

          const cA = profileCountry(canon.entry.results);
          const cB = profileCountry(later.entry.results);
          if (cA !== null && cB !== null && cA !== cB) continue;
        }

        if (licencesConflict(canon.key, later.key, ctx.entryLicences)) continue;
        for (const result of later.entry.results) addResult(canon.entry, result, false);
        mergeLicenceSets(canon.key, later.key, ctx.entryLicences);
        ctx.deletedKeys.add(later.key);
        index.delete(later.key);
        canon.maxYear = Math.max(canon.maxYear, later.maxYear);
        deriveCanonicalTeam(canon.entry);
        count++;
      }
    }
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

    // Filter out team candidates whose licences conflict with the solo entry
    candidates = candidates.filter(c => !licencesConflict(soloKey, c.key, ctx.entryLicences));
    if (candidates.length === 0) continue;

    if (candidates.length === 1) {
      for (const result of soloEntry.results) addResult(candidates[0]!.entry, result, false);
      mergeLicenceSets(candidates[0]!.key, soloKey, ctx.entryLicences);
      ctx.deletedKeys.add(soloKey);
      index.delete(soloKey);
      deriveCanonicalTeam(candidates[0]!.entry);
      count++;
    } else {
      crossPassFlags.push({
        soloKey,
        soloAthleteId: soloEntry.id,
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
  const { index, assigned, assignments, loader, deletedKeys, manualAssignments, ids, teamIdStore } = ctx;
  let count = 0;

  for (const assignment of assignments) {
    const target = [...index.values()].find((e) => e.id === assignment.athleteId);
    if (!target) {
      console.error(`  [pass9] ERROR: athleteId ${assignment.athleteId} not found — skipping`);
      continue;
    }

    const eventResults = loader(assignment.eventId);
    let bibNameLower: string | null = null;
    let bibPos: number | null = null;
    let bibDistNorm: string | null = null;
    if (eventResults) {
      for (const dist of eventResults.distances) {
        const match = dist.results.find((r) => r.bib === assignment.bib);
        if (match) {
          bibNameLower = normalizeName(match.name);
          bibPos = match.pos;
          bibDistNorm = normalizeDistance(dist.name);
          break;
        }
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
        // When bib pos is known, ensure we're acting on the correct result ref
        // (same-name athletes at the same event can have multiple result refs).
        if (bibPos !== null && bibDistNorm !== null && (r.pos !== bibPos || r.distance !== bibDistNorm)) continue;
        if (entry === target) {
          // Already on target — protect from post-pass eviction without moving anything.
          manualAssignments.add(`${assignment.athleteId}:${assignment.eventId}`);
          moved = true;
          break outer;
        }
        // Evict any result already on target for the same (eventId, distance) —
        // the manually-assigned result takes priority over an earlier pipeline match.
        const conflictIdx = target.results.findIndex(
          (x) => x.eventId === r.eventId && x.distance === r.distance,
        );
        if (conflictIdx >= 0) {
          const evicted = target.results[conflictIdx]!;
          target.results.splice(conflictIdx, 1);
          // Re-home the evicted result rather than discarding it.
          // Recover the original name from raw event data (AthleteResultRef has no name field).
          let evictedName = target.name;
          let evictedNameLower = target.nameLower;
          if (eventResults) {
            evictNameSearch: for (const d of eventResults.distances) {
              if (normalizeDistance(d.name) !== evicted.distance) continue;
              for (const raw of d.results) {
                if (raw.pos === evicted.pos && raw.team === evicted.team && raw.category === evicted.category) {
                  evictedName = raw.name;
                  evictedNameLower = normalizeName(raw.name);
                  break evictNameSearch;
                }
              }
            }
          }
          const evictedKey = athleteKey(evictedNameLower, evicted.team, teamIdStore, evicted.category);
          let evictedEntry = index.get(evictedKey);
          if (!evictedEntry) {
            const freshId = ids.get(evictedKey);
            evictedEntry = newEntry(freshId, evictedName, evictedNameLower);
            index.set(evictedKey, evictedEntry);
            console.log(`  [pass9] evicted ${evictedName} (${evicted.category}) ev=${evicted.eventId} → new athlete id=${freshId}`);
          } else {
            console.log(`  [pass9] evicted ${evictedName} (${evicted.category}) ev=${evicted.eventId} → merged into existing id=${evictedEntry.id}`);
          }
          evictedEntry.results.push(evicted);
          addToTeamsAndCategories(evictedEntry, evicted);
        }
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
  const { index, manualAssignments, ids, teamIdStore, loader } = ctx;
  let drops = 0;
  let rehomed = 0;

  for (const entry of index.values()) {
    const yearSet = new Set(entry.results.map(r => r.eventYear));

    // Phase 1: compute canonCat per year, then enforce forward-only progression.
    // An athlete cannot get younger: rank must be non-decreasing over time.
    // A year whose majority-vote category has a higher rank than the next year's
    // was polluted by wrong-athlete merges — override it with the next year's canon.
    const yearCatMap = new Map<number, string>();
    for (const year of yearSet) {
      const cc = entryCanonCatForYear(entry, year);
      if (cc) yearCatMap.set(year, cc);
    }
    const overriddenYears = new Set<number>();
    const sortedYears = [...yearCatMap.keys()].sort((a, b) => a - b);

    // Adjacent pass (right to left): fix backward transitions and adjacent
    // forward-too-fast skips (e.g. A→C in 1 year).  Uses isValidCatTransition
    // which already encodes both rules.
    for (let i = sortedYears.length - 2; i >= 0; i--) {
      const y     = sortedYears[i]!;
      const yNext = sortedYears[i + 1]!;
      const catY    = yearCatMap.get(y)!;
      const catNext = yearCatMap.get(yNext)!;
      if (isValidCatTransition(catY, catNext, yNext - y)) continue;
      const rankY    = SOLO_CAT_RANK[catY]    ?? -1;
      const rankNext = SOLO_CAT_RANK[catNext] ?? -1;
      const suffix = (rankY > rankNext ? catNext : catY).endsWith(" Female") ? " Female" : " Male";
      if (rankY > rankNext && rankNext >= 0) {
        yearCatMap.set(y, catNext);
      } else if (rankY < rankNext) {
        const clamped = RANK_TO_CAT.get(clampRank(rankY, yNext - y));
        if (clamped) yearCatMap.set(yNext, suffix === " Female" ? clamped.female : clamped.male);
      }
      overriddenYears.add(rankY > rankNext ? y : yNext);
    }

    // Non-adjacent pass (left to right): catch multi-step forward-too-fast spans
    // (e.g. A 2024 → B 2025 → C 2026 — each adjacent step looks valid but
    // isValidCatTransition(A, C, 2) is false).
    for (let i = 0; i < sortedYears.length; i++) {
      for (let j = i + 2; j < sortedYears.length; j++) {
        const y1 = sortedYears[i]!;
        const y2 = sortedYears[j]!;
        const cat1 = yearCatMap.get(y1)!;
        const cat2 = yearCatMap.get(y2)!;
        const rank1 = SOLO_CAT_RANK[cat1] ?? -1;
        const rank2 = SOLO_CAT_RANK[cat2] ?? -1;
        if (rank1 >= rank2 || rank1 < 0) continue;
        if (isValidCatTransition(cat1, cat2, y2 - y1)) continue;
        const suffix = cat1.endsWith(" Female") ? " Female" : " Male";
        const clamped = RANK_TO_CAT.get(clampRank(rank1, y2 - y1));
        if (clamped) { yearCatMap.set(y2, suffix === " Female" ? clamped.female : clamped.male); overriddenYears.add(y2); }
      }
    }

    // Phase 2: evict outliers using the (possibly adjusted) canonCats.
    // A result is only evictable if its athleteKey routes to a DIFFERENT entry —
    // if it would map back to this same entry, eviction would be a no-op (the
    // result is inseparable without a manual assignment).
    const evicted: AthleteResultRef[] = [];
    for (const year of yearSet) {
      const yearResults = entry.results.filter(r => r.eventYear === year);
      const canonCat = yearCatMap.get(year);
      if (!canonCat) continue;
      const outliers = yearResults.filter(r => {
        if (!r.category) return false;
        const canon = canonicalizeCategory(r.category);
        if (canon === "Unknown") return false;
        if (manualAssignments.has(`${entry.id}:${r.eventId}`)) return false;
        if (categoriesCompatible(canon, canonCat)) return false;
        // Skip if eviction would re-home back to this same entry (inseparable
        // without a manual assignment — don't evict, leave mixed).
        const rehomeKey = athleteKey(entry.nameLower, r.team, teamIdStore, r.category);
        if (index.get(rehomeKey) === entry) return false;
        return true;
      });
      const canonCount = yearResults.length - outliers.length;
      // When canonCat was overridden by cross-year evidence (impossible backward
      // transition), bypass the minority guard — the override is justified by
      // external data, not the current year's vote count.
      if (!overriddenYears.has(year) && canonCount <= outliers.length) continue;
      for (const r of outliers) {
        entry.results.splice(entry.results.indexOf(r), 1);
        drops++;
        evicted.push(r);
      }
    }

    // Re-home all evicted results. Results with the same athleteKey (same name +
    // team/category) land in the same entry automatically — so evicted results that
    // belong to the same other athlete stay together rather than being dropped.
    for (const r of evicted) {
      const eventData = loader(r.eventId);
      let rehomeName = entry.name;
      let rehomeNameLower = entry.nameLower;
      if (eventData) {
        outer: for (const d of eventData.distances) {
          if (normalizeDistance(d.name) !== r.distance) continue;
          for (const raw of d.results) {
            if (raw.pos === r.pos && raw.team === r.team && raw.category === r.category) {
              rehomeName = raw.name;
              rehomeNameLower = normalizeName(raw.name);
              break outer;
            }
          }
        }
      }
      const key = athleteKey(rehomeNameLower, r.team, teamIdStore, r.category);
      let dest = index.get(key);
      const isNew = !dest;
      if (!dest) {
        dest = newEntry(ids.get(key), rehomeName, rehomeNameLower);
        index.set(key, dest);
      }
      dest.results.push(r);
      addToTeamsAndCategories(dest, r);
      rehomed++;
      console.log(`  [post] re-homed ev=${r.eventId} "${rehomeName}" (${r.category}) from id=${entry.id} → ${isNew ? "new" : "existing"} id=${dest.id}`);
    }

    entry.categories = {};
    entry.teams = [];
    for (const r of entry.results) addToTeamsAndCategories(entry, r);
    deriveCanonicalTeam(entry);
  }

  if (drops > 0) console.log(`  [post] ${drops} result(s) re-homed — category inconsistent with athlete's year category`);
}

// ── ID store helpers ──────────────────────────────────────────────────────────

/** Build a fresh ID store from only the live athletes in the final index. */
export function buildUpdatedIdStore(index: Map<string, AthleteEntry>): AthleteIdStore {
  const store = new Map<string, number>();
  for (const [key, entry] of index) store.set(key, entry.id);
  return store;
}

// ── Main builder ──────────────────────────────────────────────────────────────

export function buildAthletesIndex(
  events: StoredEvent[],
  loader: ResultsLoader,
  aliasRules: AthleteAliasRule[],
  assignments: ResultAssignment[],
  idStore: AthleteIdStore = new Map(),
  teamIdStore: Map<string, number> = new Map()
): {
  index: Map<string, AthleteEntry>;
  updatedIdStore: AthleteIdStore;
  soloFlags: SoloCollisionFlag[];
  crossPassFlags: CrossPassFlag[];
} {
  const ids = makeIdManager(idStore);

  // Preload all results — skip known placeholder names used by organizers
  const allResults: RawResult[] = [];
  for (const event of events.filter((e) => e.hasResults)) {
    const stored = loader(event.id);
    if (!stored) continue;
    for (const dist of stored.distances) {
      for (const r of dist.results) {
        if (PLACEHOLDER_NAMES.has(normalizeName(r.name))) continue;
        allResults.push({ event, dist, r, rKey: resultDedupeKey(event.id, dist.name, r.bib) });
      }
    }
  }

  const ctx: PipelineCtx = {
    allResults, aliasRules, assignments, loader, teamIdStore,
    index: new Map(),
    assigned: new Set(),
    ids,
    soloFlags: [],
    crossPassFlags: [],
    deletedKeys: new Set(),
    manualAssignments: new Set(),
    soloGroupKeys: new Set(),
    entryLicences: new Map(),
  };

  runPass1(ctx);
  runPass2(ctx);
  const { teamCount } = runPass3(ctx);
  runPass3b(ctx);
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

  // Build updated ID store from ONLY the live athletes in the final index.
  // Intentionally do NOT inherit stale keys from idStore — merged/evicted athletes
  // inflate Math.max(idStore.values()) and cause the next scrape to mint
  // unnecessarily high IDs, creating gaps.
  const updatedIdStore = buildUpdatedIdStore(ctx.index);

  return { index: ctx.index, updatedIdStore, soloFlags: ctx.soloFlags, crossPassFlags: ctx.crossPassFlags };
}

