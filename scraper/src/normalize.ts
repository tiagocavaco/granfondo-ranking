// ── Name normalization ────────────────────────────────────────────────────────

export {
  normalizeName,
  fixRawTeamName,
  normalizeTeam,
  SOLO_TEAM_KEYS,
  normalizeCountry,
  normalizeDistance,
  DISTANCE_ALIASES,
} from "@granfondo/database/normalize";
import {
  normalizeTeam,
  SOLO_TEAM_KEYS,
  normalizeDistance,
} from "@granfondo/database/normalize";
export {
  canonicalizeCategory,
  isFemaleCategory,
} from "@granfondo/utils/category";
import { distancePriority as canonicalDistancePriority } from "@granfondo/utils/distance";

export function distancePriority(name: string): number {
  return canonicalDistancePriority(normalizeDistance(name));
}

/**
 * Levenshtein edit distance between two strings.
 * Used for fuzzy name matching in licence conflict resolution.
 */
export function levenshteinDistance(left: string, right: string): number {
  if (left === right) {
    return 0;
  }

  if (left.length === 0) {
    return right.length;
  }

  if (right.length === 0) {
    return left.length;
  }

  const row: number[] = Array.from({ length: right.length + 1 }, (_, idx) => idx);
  for (let i = 1; i <= left.length; i++) {
    let prev = row[0]!; // d[i-1][0] = i-1
    row[0] = i; // d[i][0] = i
    for (let j = 1; j <= right.length; j++) {
      const temp = row[j]!; // save d[i-1][j] before overwrite
      row[j] =
        left[i - 1] === right[j - 1]
          ? prev // d[i-1][j-1] (diagonal, no cost)
          : 1 + Math.min(prev, row[j - 1]!, row[j]!); // min(sub, ins, del)
      prev = temp; // prev = d[i-1][j] for next j
    }
  }

  return row[right.length]!;
}

/**
 * Returns true if a licence string is a known dummy/placeholder value
 * and should not be used for athlete identity matching.
 */
export function isValidLicence(lic: string): boolean {
  if (!lic) {
    return false;
  }

  const EXPLICIT_DUMMIES = new Set(["NAOFEDERADO", "11111", "12345", "23456"]);
  const upper = lic.trim().toUpperCase();
  if (EXPLICIT_DUMMIES.has(upper)) {
    return false;
  }

  if (/^-\d+$/.test(lic)) {
    return false;
  } // negative numbers

  if (/^\d+\.\d+[eE]\d+$/.test(lic)) {
    return false;
  } // scientific notation

  if (/^1000000000\d?$/.test(lic)) {
    return false;
  } // 10^10 variants

  if (/^0+$/.test(lic)) {
    return false;
  } // all-zeros (000, 0000…)

  if (/^[1-9]\d*$/.test(lic) && parseInt(lic, 10) < 100) {
    return false;
  } // too small, no leading zero

  if (/^federac/i.test(lic) || /^federa[çc]/i.test(lic)) {
    return false;
  } // federation names

  return true;
}

/**
 * Manual aliases for team names that cannot be resolved automatically.
 * Maps a normalized team key → canonical normalized key.
 * Used when the same club registers under structurally different names
 * (e.g., abbreviated form vs. full name, or reordered sponsor names).
 * Space/concatenation variants ("dblbike" vs "dbl bike") are handled
 * automatically by the compact equality and compact-prefix checks in
 * teamKeySimilarity — no alias needed for those.
 * Loaded from the encrypted DB at startup via initTeamAliases().
 */
const TEAM_ALIASES: Record<string, string> = {};

export function initTeamAliases(aliases: Record<string, string>): void {
  for (const [aliasKey, canonicalKey] of Object.entries(aliases)) {
    TEAM_ALIASES[normalizeTeam(aliasKey)] = normalizeTeam(canonicalKey);
  }
}

/**
 * Returns the canonical normalized key for a team name, applying fuzzy
 * normalization and then any manual alias overrides.
 * Follows alias chains transitively (A→B→C returns C).
 */
export function teamNormalKey(name: string): string {
  let key = normalizeTeam(name);
  const seen = new Set<string>();
  while (TEAM_ALIASES[key] !== undefined && !seen.has(key)) {
    seen.add(key);
    key = TEAM_ALIASES[key]!;
  }

  return key;
}

/**
 * Fuzzy similarity between two normalized team keys.
 * Returns 0–1. Uses two signals:
 *   - Full containment: if all significant tokens of the shorter name appear in the longer → 1.0
 *   - Jaccard: |intersection| / |union| of significant tokens (length ≥ 3)
 * Returns the max of the two signals.
 *
 * Examples (threshold ≥ 0.6 is a good merge criterion):
 *   "vivavita" vs "vivavita training and social club" → 1.0 (containment)
 *   "anna cycling" vs "anna cycling team"            → 1.0 (containment)
 *   "dbl bike" vs "jbracingcoach voicevelo em3"      → 0.0 (no shared tokens)
 */
const SIGNIFICANT_TOKEN_MIN_LENGTH = 3;
const COMPACT_PREFIX_MIN_LENGTH = 4;
const COMPACT_PREFIX_MIN_COVERAGE = 0.6;

function stripSpaces(value: string): string {
  return value.replace(/\s+/g, "");
}

function significantTokens(value: string): string[] {
  return value
    .split(" ")
    .filter((token) => token.length >= SIGNIFICANT_TOKEN_MIN_LENGTH);
}

function compactPrefixCovers(shorter: string, longer: string): boolean {
  return (
    shorter.length >= COMPACT_PREFIX_MIN_LENGTH &&
    longer.startsWith(shorter) &&
    shorter.length / longer.length >= COMPACT_PREFIX_MIN_COVERAGE
  );
}

function smallerThenLarger<T extends { length: number }>(left: T, right: T): [T, T] {
  return left.length <= right.length ? [left, right] : [right, left];
}

function smallerThenLargerSet<T>(left: Set<T>, right: Set<T>): [Set<T>, Set<T>] {
  return left.size <= right.size ? [left, right] : [right, left];
}

export function teamKeySimilarity(keyA: string, keyB: string): number {
  if (keyA === keyB) {
    return 1;
  }

  const compactA = stripSpaces(keyA);
  const compactB = stripSpaces(keyB);
  // Compact equality: "dbl bike" vs "dblbike" — same chars, just spaced differently.
  if (compactA === compactB && compactA.length >= COMPACT_PREFIX_MIN_LENGTH) {
    return 1;
  }

  // Compact prefix: one compacted form is a prefix of the other with ≥60% coverage.
  // Handles "zossvog" (compact "zossvog") vs "zoss vog cacb" (compact "zossvogcacb"):
  // "zossvog" is a 7/11 = 64% prefix of "zossvogcacb" → same team, partial name.
  const [shorterCompact, longerCompact] = smallerThenLarger(compactA, compactB);
  if (compactPrefixCovers(shorterCompact, longerCompact)) {
    return 1;
  }

  const tokensA = significantTokens(keyA);
  const tokensB = significantTokens(keyB);
  if (tokensA.length === 0 || tokensB.length === 0) {
    return 0;
  }

  const tokenSetA = new Set(tokensA);
  const tokenSetB = new Set(tokensB);
  // Containment: all tokens of the shorter set appear in the longer set.
  const [smallerSet, largerSet] = smallerThenLargerSet(tokenSetA, tokenSetB);
  if ([...smallerSet].every((token) => largerSet.has(token))) {
    return 1;
  }

  // Jaccard similarity = |intersection| / |union|.
  const intersectionSize = [...tokenSetA].filter((token) =>
    tokenSetB.has(token),
  ).length;
  const unionSize = new Set([...tokenSetA, ...tokenSetB]).size;
  return intersectionSize / unionSize;
}

/**
 * Given a map of (rawTeamName → count) entries (all normalizing to the same key),
 * return the best canonical display name: the most frequently used raw form,
 * with display normalization applied (collapsed spaces, clean separators).
 * Ties are broken by the longest name (more descriptive).
 */
export function canonicalTeam(occurrences: Map<string, number>): string {
  let best = "";
  let bestCount = 0;
  for (const [name, count] of occurrences) {
    if (
      count > bestCount ||
      (count === bestCount && name.length > best.length)
    ) {
      best = name;
      bestCount = count;
    }
  }

  // Clean up the display form: collapse extra spaces, normalize slash separators
  return best
    .replace(/\s*\/\s*/g, " / ") // normalize spaces around slashes
    .replace(/\s+/g, " ") // collapse multiple spaces
    .trim();
}

/**
 * Parse "HH:MM:SS.mmm" or "HH:MM:SS" → total seconds (number).
 * Returns 0 if unparseable.
 */
export function timeToSeconds(time: string): number {
  if (!time || time === "00:00:00.000" || time === "00:00:00") {
    return 0;
  }

  const parts = time.split(":");
  if (parts.length !== 3) {
    return 0;
  }

  const [hours, minutes, seconds] = parts;
  return (
    Number(hours) * 3600 + Number(minutes) * 60 + parseFloat(seconds ?? "0")
  );
}

/**
 * Format seconds → "HH:MM:SS" (used for gap display; rounds to whole seconds).
 */
export function formatGapSecs(secs: number): string {
  const total = Math.round(secs);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

/**
 * Format "HH:MM:SS.mmm" → "HH:MM:SS" (drop milliseconds).
 */
export function formatTime(raw: string): string {
  if (!raw) {
    return "";
  }

  return raw.split(".")[0] ?? raw;
}

/**
 * Parse event date "YYYY/MM/DD" → "YYYY-MM-DD".
 * Handles multi-day "YYYY/MM/DD - YYYY/MM/DD" by taking the first date.
 */
export function parseEventDate(raw: string): string {
  const first = raw.split(" - ")[0]!.trim();
  return first.replace(/\//g, "-");
}

export function getYear(isoDate: string): number {
  return parseInt(isoDate.slice(0, 4), 10);
}

export function isPast(isoDate: string): boolean {
  return new Date(isoDate + "T00:00:00") < new Date();
}

// ── Category normalization ─────────────────────────────────────────────────────

/**
 * Broad category tier for dedup safety.
 *
 * 'elite'          — Elite, Sub23, Junior, Cadete (age < ~30)
 * 'masters_a'      — Masters A, MASTER 30/35, M 30-39 (age 30–39)
 * 'masters_b'      — Masters B, MASTER 40/45, M 40-49 (age 40–49)
 * 'masters_c'      — Masters C, MASTER 50/55, M 50-59 (age 50–59)
 * 'masters_d'      — Masters D, MASTER 60/65, M 60-69 (age 60–69)
 * 'masters_e'      — Masters E, MASTER 70/75, M 70-79 (age 70–79)
 * 'masters_f_plus' — Masters F+, MASTER 80+, M 80+ (age 80+)
 * 'open_1934'      — "M 19-34" / "F 19-34" bands that span Elite + Masters A
 * 'unknown'        — E-Bike, Para, unrecognised
 */
export type CategoryTier =
  | "elite"
  | "masters_a"
  | "masters_b"
  | "masters_c"
  | "masters_d"
  | "masters_e"
  | "masters_f_plus"
  | "open_1934"
  | "unknown";

export function categoryTier(cat: string): CategoryTier {
  const compact = cat.toLowerCase().replace(/[^a-z0-9]/g, "");

  // Masters F+ (80+)
  if (/masters?f/.test(compact)) {
    return "masters_f_plus";
  }

  if (/master[89]/.test(compact)) {
    return "masters_f_plus";
  }

  if (/^[mf][89]\d/.test(compact)) {
    return "masters_f_plus";
  }

  // Masters E (70–79)
  if (/masters?e/.test(compact)) {
    return "masters_e";
  }

  if (/master7/.test(compact)) {
    return "masters_e";
  }

  if (/^[mf]7\d/.test(compact)) {
    return "masters_e";
  }

  // Masters D (60–69)
  if (/masters?d/.test(compact)) {
    return "masters_d";
  }

  if (/master6/.test(compact)) {
    return "masters_d";
  }

  if (/^[mf]6\d/.test(compact)) {
    return "masters_d";
  }

  // Masters C (50–59)
  if (/masters?c/.test(compact)) {
    return "masters_c";
  }

  if (/master5/.test(compact)) {
    return "masters_c";
  }

  if (/^[mf]5\d/.test(compact)) {
    return "masters_c";
  }

  // Masters B (40–49)
  if (/masters?b/.test(compact)) {
    return "masters_b";
  }

  if (/master4/.test(compact)) {
    return "masters_b";
  }

  if (/^[mf]4\d/.test(compact)) {
    return "masters_b";
  }

  // Masters A (30–39)
  if (/masters?a/.test(compact) || /master[23]/.test(compact)) {
    return "masters_a";
  }

  if (/^[mf]35/.test(compact) || /^[mf]3[6-9]/.test(compact)) {
    return "masters_a";
  }

  // Elite / open adult
  if (/elite/.test(compact)) {
    return "elite";
  }

  if (/sub23|junior|juniore|cadete/.test(compact)) {
    return "elite";
  }

  if (/^[mf]?jun$/.test(compact) || /^mjun/.test(compact) || /^fjun/.test(compact)) {
    return "elite";
  }

  // "M 19-34" / "F 19-34" — spans Elite + Masters A
  if (/^[mf]19\d\d/.test(compact) || compact === "m1934" || compact === "f1934") {
    return "open_1934";
  }

  return "unknown";
}

/**
 * Resolves an athlete's effective category tier from their full category history.
 * The age-senior tier takes precedence:
 * masters_f_plus > masters_e > masters_d > masters_c > masters_b > masters_a > elite > open_1934
 * Returns 'unknown' when no usable tier can be determined.
 */
export function athleteEffectiveTier(cats: string[]): CategoryTier {
  const tiers = new Set(
    cats
      .map(categoryTier)
      .filter((tier): tier is CategoryTier => tier !== "unknown"),
  );
  if (tiers.size === 0) {
    return "unknown";
  }

  if (tiers.has("masters_f_plus")) {
    return "masters_f_plus";
  }

  if (tiers.has("masters_e")) {
    return "masters_e";
  }

  if (tiers.has("masters_d")) {
    return "masters_d";
  }

  if (tiers.has("masters_c")) {
    return "masters_c";
  }

  if (tiers.has("masters_b")) {
    return "masters_b";
  }

  if (tiers.has("masters_a")) {
    return "masters_a";
  }

  if (tiers.has("elite")) {
    return "elite";
  }

  return "open_1934";
}

// ── Category normalization ─────────────────────────────────────────────────────
// canonicalizeCategory / isFemaleCategory live in @granfondo/utils/category.
// normalizeCategory is kept here for pipeline internal use (athleteKey slug generation).

export function normalizeCategory(cat: string): string {
  const compact = cat
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")
    .replace("mastres", "masters");

  // Masters F (80+) — must precede isFemale: the trailing 'F' is the age grade, not gender
  if (/^masters?f$/.test(compact)) {
    return "Masters F";
  }

  const isFemale = /\bf\b|fem|fem$|^f/.test(cat.toLowerCase());
  const suffix = isFemale ? " F" : "";

  if (/sub23/.test(compact)) {
    return `Sub 23${suffix}`;
  }

  if (/junior|juniore|cadete|juv/.test(compact) || /^[mf]?jun$/.test(compact)) {
    return `Elite${suffix}`;
  }

  if (/elite/.test(compact)) {
    return `Elite${suffix}`;
  }

  if (compact === "m1934" || compact === "f1934" || /^[mf]19\d\d/.test(compact)) {
    return `Open 19-34${suffix}`;
  }

  if (
    /masters?a/.test(compact) ||
    /master[23]/.test(compact) ||
    /masters[23]\d/.test(compact) ||
    /^[mf]3[0-9]/.test(compact)
  ) {
    return `Masters A${suffix}`;
  }

  if (
    /masters?b/.test(compact) ||
    /master4/.test(compact) ||
    /masters4\d/.test(compact) ||
    /^[mf]4/.test(compact)
  ) {
    return `Masters B${suffix}`;
  }

  if (
    /masters?c/.test(compact) ||
    /master5/.test(compact) ||
    /masters5\d/.test(compact) ||
    /^[mf]5/.test(compact)
  ) {
    return `Masters C${suffix}`;
  }

  if (
    /masters?d/.test(compact) ||
    /master6/.test(compact) ||
    /masters6\d/.test(compact) ||
    /^[mf]6/.test(compact)
  ) {
    return `Masters D${suffix}`;
  }

  if (
    /masters?e/.test(compact) ||
    /master[67]/.test(compact) ||
    /^[mf]7/.test(compact)
  ) {
    return `Masters E${suffix}`;
  }

  if (/masters?f/.test(compact) || /master8/.test(compact) || /^[mf]8/.test(compact)) {
    return `Masters F${suffix}`;
  }

  if (/ebike|e.?bike|electrica/.test(compact)) {
    return "E-Bike";
  }

  if (/para/.test(compact)) {
    return "Paracycling";
  }

  return cat.trim();
}

// ── Solo team detection ───────────────────────────────────────────────────────

/** True if the team name represents an unaffiliated/individual entry. */
export function isSoloTeam(team: string): boolean {
  return !team.trim() || SOLO_TEAM_KEYS.has(teamNormalKey(team));
}

/** True if two team names refer to the same club (exact or fuzzy key match). */
export function sameTeam(teamA: string, teamB: string): boolean {
  const keyA = teamNormalKey(teamA);
  const keyB = teamNormalKey(teamB);
  return keyA === keyB || teamKeySimilarity(keyA, keyB) === 1;
}

/**
 * Portuguese convention: short name = first + last token of the long name.
 * Example: "João Ferreira" as short form of "João Da Silva Ferreira".
 */
export function isPortugueseNameAbbrev(
  shortTokens: string[],
  longTokens: string[],
): boolean {
  return (
    shortTokens.length < longTokens.length &&
    shortTokens[0] === longTokens[0] &&
    shortTokens[shortTokens.length - 1] === longTokens[longTokens.length - 1]
  );
}

/**
 * Spanish convention: short name = first + second token of a 3-token long name.
 * Father's surname is the everyday identifier, not the mother's:
 * "Luis Garcia" as short form of "Luis Garcia Fernandez".
 */
export function isSpanishNameAbbrev(
  shortTokens: string[],
  longTokens: string[],
): boolean {
  return (
    longTokens.length === 3 &&
    shortTokens.length < longTokens.length &&
    shortTokens[0] === longTokens[0] &&
    shortTokens[shortTokens.length - 1] === longTokens[1]
  );
}

/**
 * True if `shortTokens` is a recognised abbreviated form of `longTokens`
 * under either the Portuguese (first+last) or Spanish (first+second) convention.
 */
export function nameIsShortFormOf(
  shortTokens: string[],
  longTokens: string[],
): boolean {
  return (
    isPortugueseNameAbbrev(shortTokens, longTokens) ||
    isSpanishNameAbbrev(shortTokens, longTokens)
  );
}
