import {
  teamNormalKey,
  normalizeDistance,
  normalizeCategory,
  canonicalizeCategory,
  isSoloTeam,
  fixRawTeamName,
} from "../../normalize.js";
import type { AthleteEntry, AthleteResultRef } from "@granfondo/database/types";
import type { RawResult, AthleteIdStore, IdManager } from "./types.js";

// ── Solo collision percentile thresholds ─────────────────────────────────────
// Two-result baseline (≥2 clean non-collision results): looser window since the
// median is reliable.
export const PERCENTILE_CLOSE_2 = 0.15;
export const PERCENTILE_FAR_2 = 0.25;
// Single-result baseline (exactly 1 clean result): tighter window to compensate
// for the noisier median estimate.
export const PERCENTILE_CLOSE_1 = 0.1;
export const PERCENTILE_FAR_1 = 0.35;

// ── Solo category rank (for cross-year merge) ────────────────────────────────

export const SOLO_CAT_RANK: Record<string, number> = {
  "Elite Male": 0,
  "Elite Female": 0,
  "Masters A Male": 1,
  "Masters A Female": 1,
  "Masters B Male": 2,
  "Masters B Female": 2,
  "Masters C Male": 3,
  "Masters C Female": 3,
  "Masters D Male": 4,
  "Masters D Female": 4,
  "Masters E Male": 5,
  "Masters E Female": 5,
  "Masters F Male": 6,
  "Masters F Female": 6,
};

// Inverse of SOLO_CAT_RANK: rank → canonical name per gender suffix.
// Derived at module load so SOLO_CAT_RANK stays the single source of truth.
export const RANK_TO_CAT = (() => {
  const byRank = new Map<number, { male: string; female: string }>();
  for (const [name, rank] of Object.entries(SOLO_CAT_RANK)) {
    const isFemale = name.endsWith(" Female");
    const entry = byRank.get(rank) ?? { male: "", female: "" };
    if (isFemale) {
      entry.female = name;
    } else {
      entry.male = name;
    }

    byRank.set(rank, entry);
  }

  return byRank;
})();

/** Maximum rank an athlete in baseCat can legitimately reach after yearDiff seasons.
 *  Uses the same per-decade formula as isValidCatTransition. */
export function clampRank(baseRank: number, yearDiff: number): number {
  const maxRankDiff = Math.floor((yearDiff - 1) / 10) + 1;
  return Math.min(baseRank + maxRankDiff, Math.max(...RANK_TO_CAT.keys()));
}

/** Returns the team ID for a team name, or 0 for solo/unknown teams. */
export function resolveTeamId(
  team: string,
  store: Map<string, number>,
): number {
  if (isSoloTeam(team)) {
    return 0;
  }

  return store.get(teamNormalKey(team)) ?? 0;
}

/** Composite key for team athletes (`name|teamId`); solo:category key for unaffiliated. */
export function athleteKey(
  nameLower: string,
  team: string,
  teamIdStore: Map<string, number>,
  category = "",
): string {
  if (!isSoloTeam(team)) {
    return `${nameLower}|${resolveTeamId(team, teamIdStore)}`;
  }

  const catKey = category
    ? normalizeCategory(category).toLowerCase().replace(/\s+/g, "-")
    : "";
  return catKey ? `${nameLower}|solo:${catKey}` : `${nameLower}|`;
}

/**
 * Returns true if two canonical categories are compatible for the same athlete.
 * Open 19-34 is ambiguous between Elite and Masters A — compatible with both,
 * incompatible with Masters B and above.
 */
export function categoriesCompatible(catA: string, catB: string): boolean {
  if (catA === catB) {
    return true;
  }

  const OPEN_M = "Open 19-34 Male";
  const OPEN_F = "Open 19-34 Female";
  if (catA === OPEN_M) {
    return (
      catB === "Elite Male" || catB === "Masters A Male" || catB === OPEN_M
    );
  }

  if (catB === OPEN_M) {
    return (
      catA === "Elite Male" || catA === "Masters A Male" || catA === OPEN_M
    );
  }

  if (catA === OPEN_F) {
    return (
      catB === "Elite Female" || catB === "Masters A Female" || catB === OPEN_F
    );
  }

  if (catB === OPEN_F) {
    return (
      catA === "Elite Female" || catA === "Masters A Female" || catA === OPEN_F
    );
  }

  // Gender-agnostic forms (e.g. "Masters A" from normalizeCategory fallback on unknown
  // category strings) are compatible with their gendered variants. This prevents the
  // post-pass from incorrectly removing results from events that omit the gender suffix.
  const stripGender = (category: string) =>
    category.replace(/ (?:Male|Female|F)$/, "");
  if (stripGender(catA) === stripGender(catB)) {
    return true;
  }

  return false;
}

/**
 * Normalise a canonical category for solo group key building.
 * Elite, Open 19-34, and Masters A are distinct same-year populations at events
 * that carry all three categories, so no normalization is applied here.
 * Cross-year compatibility between Open 19-34 and Elite/Masters A is handled
 * in groupSoloIntraYear via categoriesCompatible().
 */
export function soloGroupCat(canonCat: string): string {
  return canonCat;
}

/** Validate a single year-to-year category transition (same logic as groupSoloIntraYear). */
export function isValidCatTransition(
  prevCat: string,
  currCat: string,
  yearDiff: number,
): boolean {
  if (prevCat === currCat) {
    return true;
  }

  if (prevCat.startsWith("Open 19-34") || currCat.startsWith("Open 19-34")) {
    return categoriesCompatible(prevCat, currCat);
  }

  const prevRank = SOLO_CAT_RANK[prevCat];
  const currRank = SOLO_CAT_RANK[currCat];
  if (prevRank === undefined || currRank === undefined) {
    return false;
  }

  if (currRank < prevRank) {
    return false;
  }

  const rankDiff = currRank - prevRank;
  // Each category spans ~10 years. Adjacent transition (rank diff 1) needs just 1 year
  // (athlete aging over a boundary), but skipping a category requires nearly a full decade
  // per skipped band. E.g. Elite→Masters B needs at least 11 years (29→40), not 2.
  const minYears = (rankDiff - 1) * 10 + 1;
  if (yearDiff < minYears) {
    return false;
  }

  return true;
}

/** Most common canonical category for a given year in an entry, or null.
 *  Counts per result (not per unique raw string) so that 3×Masters B beats 1×Masters C. */
export function entryCanonCatForYear(
  entry: AthleteEntry,
  year: number,
): string | null {
  const categoryCounts = new Map<string, number>();
  for (const result of entry.results) {
    if (result.eventYear !== year) {
      continue;
    }

    const canonical = canonicalizeCategory(result.category);
    if (canonical === "Unknown") {
      continue;
    }

    categoryCounts.set(canonical, (categoryCounts.get(canonical) ?? 0) + 1);
  }

  if (!categoryCounts.size) {
    return null;
  }

  return [...categoryCounts.entries()].sort(
    ([, countA], [, countB]) => countB - countA,
  )[0]![0];
}

// ── Profile-level helpers (reused across passes 5c, 5e, 5f) ──────────────────

/**
 * Set of canonical distance names used across a profile's results.
 * Uses normalizeDistance so that event-specific branding ("BIG DAY", "Clássica", "Etapa")
 * maps to the same tier as the standard name ("Granfondo", "Mediofondo") for comparison.
 * Display names in stored results are kept as-is.
 */
export function profileDistanceSet(results: AthleteResultRef[]): Set<string> {
  return new Set(results.map((result) => normalizeDistance(result.distance)));
}

/** Median genderPos/finisherCount for valid results. Returns null if < 2 valid results. */
export function profileMedianPercentile(
  results: AthleteResultRef[],
): number | null {
  const validResults = results.filter(
    (result) =>
      !result.dnf &&
      !result.dns &&
      result.genderPos > 0 &&
      result.finisherCount > 0,
  );
  if (validResults.length < 1) {
    return null;
  }

  const sortedPercentiles = validResults
    .map((result) => result.genderPos / result.finisherCount)
    .sort((percentileA, percentileB) => percentileA - percentileB);
  return sortedPercentiles[Math.floor(sortedPercentiles.length / 2)]!;
}

/** Most frequent non-empty country across results, or null. */
export function profileCountry(results: AthleteResultRef[]): string | null {
  const countryCounts = new Map<string, number>();
  for (const result of results) {
    if (result.country) {
      countryCounts.set(
        result.country,
        (countryCounts.get(result.country) ?? 0) + 1,
      );
    }
  }

  if (!countryCounts.size) {
    return null;
  }

  return [...countryCounts.entries()].sort(
    ([, countA], [, countB]) => countB - countA,
  )[0]![0];
}

/** Returns true if the two distance sets share at least one element. */
export function setsIntersect<T>(setA: Set<T>, setB: Set<T>): boolean {
  for (const value of setA) {
    if (setB.has(value)) {
      return true;
    }
  }

  return false;
}

// ── Entry mutation helpers ────────────────────────────────────────────────────

export function resultDedupeKey(
  eventId: number,
  distName: string,
  bib: string,
): string {
  return `${eventId}|${distName}|${bib}`;
}

export function newEntry(
  id: number,
  name: string,
  nameLower: string,
): AthleteEntry {
  return { id, name, nameLower, teams: [], categories: {}, results: [] };
}

export function addToTeamsAndCategories(
  entry: AthleteEntry,
  result: AthleteResultRef,
): void {
  const teamKey = teamNormalKey(result.team);
  if (teamKey && !isSoloTeam(result.team) && !entry.teams.includes(teamKey)) {
    entry.teams.push(teamKey);
  }

  // Store original raw category string — canonical map is used only for dedup internally.
  const rawCategory = result.category;
  const year = String(result.eventYear);
  if (!entry.categories[year]) {
    entry.categories[year] = [];
  }

  if (rawCategory && !entry.categories[year]!.includes(rawCategory)) {
    entry.categories[year]!.push(rawCategory);
  }
}

export function addResult(
  entry: AthleteEntry,
  result: AthleteResultRef,
  hasLicence: boolean,
): void {
  const existing = entry.results.find(
    (existingResult) => existingResult.eventId === result.eventId,
  );
  if (!existing) {
    entry.results.push(result);
    addToTeamsAndCategories(entry, result);
    return;
  }

  const existingCat = canonicalizeCategory(existing.category);
  const incomingCat = canonicalizeCategory(result.category);

  // Same or compatible canonical category — treat as duplicate, keep licenced result.
  if (categoriesCompatible(existingCat, incomingCat)) {
    if (hasLicence) {
      entry.results.splice(entry.results.indexOf(existing), 1, result);
    }

    return;
  }

  // Different categories — use athlete's known categories for this year to decide.
  const year = String(result.eventYear);
  const knownCanon = (entry.categories[year] ?? []).map(canonicalizeCategory);
  const existingMatches = knownCanon.some((knownCat) =>
    categoriesCompatible(knownCat, existingCat),
  );
  const incomingMatches = knownCanon.some((knownCat) =>
    categoriesCompatible(knownCat, incomingCat),
  );

  if (existingMatches && !incomingMatches) {
    return;
  }

  if (incomingMatches && !existingMatches) {
    entry.results.splice(entry.results.indexOf(existing), 1, result);
    addToTeamsAndCategories(entry, result);
    return;
  }

  // Same person cannot race the same event twice — keep existing, discard incoming silently.
}

export function deriveCanonicalTeam(entry: AthleteEntry): void {
  const mostRecent = [...entry.results]
    .sort(
      (resultA, resultB) =>
        new Date(resultB.eventDate).getTime() -
        new Date(resultA.eventDate).getTime(),
    )
    .find((result) => !isSoloTeam(result.team));
  if (mostRecent) {
    entry.canonicalTeam = fixRawTeamName(mostRecent.team);
  }
}

export function toRef(
  r: RawResult["r"],
  event: RawResult["event"],
  dist: RawResult["dist"],
): AthleteResultRef {
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
    bib: r.bib,
  };
}

export function makeIdManager(idStore: AthleteIdStore): IdManager {
  const minted = new Map<string, number>();
  const existing = [...idStore.values()];
  let nextId = existing.length > 0 ? Math.max(...existing) + 1 : 1;
  return {
    get(key: string): number {
      if (idStore.has(key)) {
        // Two seeded keys can legitimately share the same ID — they represent
        // the same athlete under different team names (alias rule or cross-year
        // team change). Returning the same seeded ID for both is correct; the
        // pipeline will merge the resulting duplicate index entries via passes 5
        // and 8. Stale same-ID collisions from removed alias rules can no longer
        // occur because index.ts now writes only canonical + active-alias keys to
        // athlete_lookup (seedNameToId), so any shared seeded ID is intentional.
        return idStore.get(key)!;
      }

      if (minted.has(key)) {
        return minted.get(key)!;
      }

      const id = nextId++;
      minted.set(key, id);
      return id;
    },
    getMinted() {
      return minted;
    },
  };
}

export function buildNameLookup(
  index: Map<string, AthleteEntry>,
): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const [key, entry] of index) {
    if (!map.has(entry.nameLower)) {
      map.set(entry.nameLower, []);
    }

    map.get(entry.nameLower)!.push(key);
  }

  return map;
}

// ── Licence conflict helpers ──────────────────────────────────────────────────

/**
 * Returns true if both entries have at least one known licence and their
 * licence sets are completely disjoint — i.e. they are definitively different
 * people. Either entry having no licences means we can't rule out the merge.
 */
export function licencesConflict(
  keyA: string,
  keyB: string,
  entryLicences: Map<string, Set<string>>,
): boolean {
  const licencesA = entryLicences.get(keyA);
  const licencesB = entryLicences.get(keyB);
  if (!licencesA?.size || !licencesB?.size) {
    return false;
  }

  for (const licence of licencesA) {
    if (licencesB.has(licence)) {
      return false;
    }
  }

  return true; // both licenced, no overlap → different people
}

/** After a merge where `absorbedKey` is folded into `survivingKey`, union their licence sets. */
export function mergeLicenceSets(
  survivingKey: string,
  absorbedKey: string,
  entryLicences: Map<string, Set<string>>,
): void {
  const absorbedLicences = entryLicences.get(absorbedKey);
  if (!absorbedLicences?.size) {
    return;
  }

  const survivingLicences = entryLicences.get(survivingKey);
  if (!survivingLicences) {
    entryLicences.set(survivingKey, new Set(absorbedLicences));
  } else {
    for (const licence of absorbedLicences) {
      survivingLicences.add(licence);
    }
  }

  entryLicences.delete(absorbedKey);
}
