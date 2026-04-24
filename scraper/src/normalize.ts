// ── Name normalization ────────────────────────────────────────────────────────

export { normalizeName, fixRawTeamName, normalizeTeam, SOLO_TEAM_KEYS } from "@granfondo/database/normalize";
import { normalizeTeam, SOLO_TEAM_KEYS } from "@granfondo/database/normalize";

/**
 * Maps raw API distance names to canonical names used in rankings and deduplication.
 * Some events use local branding ("BIG DAY", "Clássica", "Etapa") for standard distances.
 * Display names in stored results are kept as-is; this map is used for comparison only.
 */
export const DISTANCE_ALIASES: Record<string, string> = {
  granfondo: "Granfondo", mediofondo: "Mediofondo", minifondo: "Minifondo",
  "time trial": "Time Trial",
  // Figueira Champions Classic
  "big day": "Granfondo", "half day": "Mediofondo",
  // Aveiro Spring Classic
  "clássica": "Granfondo", "classica": "Granfondo",
  // Etapa da Volta
  "etapa": "Mediofondo",
};

export function normalizeDistance(name: string): string {
  return DISTANCE_ALIASES[name.toLowerCase()] ?? name;
}

/**
 * Levenshtein edit distance between two strings.
 * Used for fuzzy name matching in licence conflict resolution.
 */
export function levenshteinDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  const dp: number[] = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = dp[0]!; // d[i-1][0] = i-1
    dp[0] = i;          // d[i][0] = i
    for (let j = 1; j <= b.length; j++) {
      const temp = dp[j]!; // save d[i-1][j] before overwrite
      dp[j] = a[i - 1] === b[j - 1]
        ? prev                                         // d[i-1][j-1] (diagonal, no cost)
        : 1 + Math.min(prev, dp[j - 1]!, dp[j]!);    // min(sub, ins, del)
      prev = temp; // prev = d[i-1][j] for next j
    }
  }
  return dp[b.length]!;
}

/**
 * Returns true if a licence string is a known dummy/placeholder value
 * and should not be used for athlete identity matching.
 */
export function isValidLicence(lic: string): boolean {
  if (!lic) return false;
  const EXPLICIT_DUMMIES = new Set(["NAOFEDERADO", "11111", "12345", "23456"]);
  const upper = lic.trim().toUpperCase();
  if (EXPLICIT_DUMMIES.has(upper)) return false;
  if (/^-\d+$/.test(lic)) return false;                    // negative numbers
  if (/^\d+\.\d+[eE]\d+$/.test(lic)) return false;         // scientific notation
  if (/^1000000000\d?$/.test(lic)) return false;            // 10^10 variants
  if (/^0+$/.test(lic)) return false;                       // all-zeros (000, 0000…)
  if (/^[1-9]\d*$/.test(lic) && parseInt(lic, 10) < 100) return false; // too small, no leading zero
  if (/^federac/i.test(lic) || /^federa[çc]/i.test(lic)) return false; // federation names
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
  for (const [k, v] of Object.entries(aliases)) {
    TEAM_ALIASES[normalizeTeam(k)] = normalizeTeam(v);
  }
}

/**
 * Returns the canonical normalized key for a team name, applying fuzzy
 * normalization and then any manual alias overrides.
 */
export function teamNormalKey(name: string): string {
  const key = normalizeTeam(name);
  return TEAM_ALIASES[key] ?? key;
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
export function teamKeySimilarity(a: string, b: string): number {
  if (a === b) return 1;
  const ca = a.replace(/\s+/g, "");
  const cb = b.replace(/\s+/g, "");
  // Compact equality: "dbl bike" vs "dblbike" — same chars, just spaced differently
  if (ca === cb && ca.length >= 4) return 1;
  // Compact prefix: one compacted form is a prefix of the other with ≥60% coverage.
  // Handles "zossvog" (compact "zossvog") vs "zoss vog cacb" (compact "zossvogcacb"):
  // "zossvog" is a 7/11 = 64% prefix of "zossvogcacb" → same team, just partial name.
  const [sc, lc] = ca.length <= cb.length ? [ca, cb] : [cb, ca];
  if (sc.length >= 4 && lc.startsWith(sc) && sc.length / lc.length >= 0.6) return 1;
  const sigTok = (s: string) => s.split(" ").filter((t) => t.length >= 3);
  const tokA = sigTok(a);
  const tokB = sigTok(b);
  if (tokA.length === 0 || tokB.length === 0) return 0;
  const setA = new Set(tokA);
  const setB = new Set(tokB);
  // Containment: all tokens of the shorter set appear in the longer set
  const [shorter, longer] = setA.size <= setB.size ? [setA, setB] : [setB, setA];
  if ([...shorter].every((t) => longer.has(t))) return 1;
  // Jaccard
  const intersection = [...setA].filter((t) => setB.has(t)).length;
  const union = new Set([...setA, ...setB]).size;
  return intersection / union;
}

/**
 * Given a map of (rawTeamName → count) entries (all normalizing to the same key),
 * return the best canonical display name: the most frequently used raw form,
 * with display normalization applied (collapsed spaces, clean separators).
 * Ties are broken by the longest name (more descriptive).
 */
export function canonicalTeam(
  occurrences: Map<string, number>
): string {
  let best = "";
  let bestCount = 0;
  for (const [name, count] of occurrences) {
    if (count > bestCount || (count === bestCount && name.length > best.length)) {
      best = name;
      bestCount = count;
    }
  }
  // Clean up the display form: collapse extra spaces, normalize slash separators
  return best
    .replace(/\s*\/\s*/g, " / ")  // normalize spaces around slashes
    .replace(/\s+/g, " ")          // collapse multiple spaces
    .trim();
}

/**
 * Parse "HH:MM:SS.mmm" or "HH:MM:SS" → total seconds (number).
 * Returns 0 if unparseable.
 */
export function timeToSeconds(time: string): number {
  if (!time || time === "00:00:00.000" || time === "00:00:00") return 0;
  const parts = time.split(":");
  if (parts.length !== 3) return 0;
  const [h, m, s] = parts;
  return Number(h) * 3600 + Number(m) * 60 + parseFloat(s ?? "0");
}

/**
 * Format "HH:MM:SS.mmm" → "HH:MM:SS" (drop milliseconds).
 */
export function formatTime(raw: string): string {
  if (!raw) return "";
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
 * 'elite'        — Elite, Sub23, Junior, Cadete (age < ~30)
 * 'masters_a'    — Masters A, MASTER 30/35, M 30-39 (age 30–39)
 * 'masters_b_plus' — Masters B/C/D/E, MASTER 40+ (age 40+)
 * 'open_1934'    — "M 19-34" / "F 19-34" bands that span Elite + Masters A;
 *                  compatible with both 'elite' and 'masters_a', conflicts only with 'masters_b_plus'
 * 'unknown'      — E-Bike, Para, unrecognised — no conflict raised
 */
export type CategoryTier = 'elite' | 'masters_a' | 'masters_b_plus' | 'open_1934' | 'unknown';

export function categoryTier(cat: string): CategoryTier {
  const s = cat.toLowerCase().replace(/[^a-z0-9]/g, '');

  // Masters B, C, D, E (any gender)
  if (/masters?[bcde]/.test(s)) return 'masters_b_plus';
  // MASTER 40 / 45 / 50 / … / 80
  if (/master[4-9]/.test(s)) return 'masters_b_plus';
  // Age-range bands: "M 40-44" → "m4044", "F 55-59" → "f5559"
  if (/^[mf][4-9]\d/.test(s)) return 'masters_b_plus';

  // Masters A (30–39) and MASTER 30/35
  if (/masters?a/.test(s) || /master[23]/.test(s)) return 'masters_a';
  // "M 35-39" is unambiguously Masters A range
  if (/^[mf]35/.test(s) || /^[mf]3[6-9]/.test(s)) return 'masters_a';

  // Elite / open adult
  if (/elite/.test(s)) return 'elite';
  // Sub23, Junior, Cadete
  if (/sub23|junior|juniore|cadete/.test(s)) return 'elite';
  if (/^[mf]?jun$/.test(s) || /^mjun/.test(s) || /^fjun/.test(s)) return 'elite';

  // "M 19-34" / "F 19-34" — spans Elite + Masters A
  if (/^[mf]19\d\d/.test(s) || s === 'm1934' || s === 'f1934') return 'open_1934';

  return 'unknown';
}

/**
 * Returns true if two category tiers are incompatible (cannot be the same athlete in the same year).
 * 'unknown' never conflicts. 'open_1934' only conflicts with 'masters_b_plus'.
 */
export function tierConflict(a: CategoryTier, b: CategoryTier): boolean {
  if (a === 'unknown' || b === 'unknown') return false;
  if (a === b) return false;
  if (a === 'open_1934' || b === 'open_1934') {
    const other = a === 'open_1934' ? b : a;
    return other === 'masters_b_plus';
  }
  return true;
}

/**
 * Canonical display category: normalise the many naming variations used by
 * different Portuguese event organisers into a consistent label.
 *
 * Age-band events (MASTER 40, M 40-44) are mapped to the standard letter group.
 * Gender is preserved where present (e.g. "Masters B F").
 */
export function normalizeCategory(cat: string): string {
  const s = cat.toLowerCase().replace(/[^a-z0-9]/g, '');
  const isFemale = /\bf\b|fem|fem$|^f/.test(cat.toLowerCase());
  const suffix = isFemale ? ' F' : '';

  // Juniors / Sub23
  if (/sub23/.test(s)) return `Sub 23${suffix}`;
  if (/junior|juniore|cadete/.test(s) || /^[mf]?jun$/.test(s)) return `Junior${suffix}`;

  // Elite
  if (/elite/.test(s)) return `Elite${suffix}`;
  // Age-band "19-34" spans Elite + Masters A — keep as-is, don't collapse to Elite
  if (s === 'm1934' || s === 'f1934' || /^[mf]19\d\d/.test(s)) return `Open 19-34${suffix}`;

  // Masters A (30–39) — covers MASTER 30, MASTER 35, M 35-39, Masters A
  if (/masters?a/.test(s) || /master[23]/.test(s) || /^[mf]3[0-9]/.test(s)) return `Masters A${suffix}`;

  // Masters B (40–49) — MASTER 40, MASTER 45, M 40-44, M 45-49, Masters B
  if (/masters?b/.test(s) || /master4/.test(s) || /^[mf]4/.test(s)) return `Masters B${suffix}`;

  // Masters C (50–59)
  if (/masters?c/.test(s) || /master5/.test(s) || /^[mf]5/.test(s)) return `Masters C${suffix}`;

  // Masters D (60–64)
  if (/masters?d/.test(s) || /master6/.test(s) || /^[mf]6/.test(s)) return `Masters D${suffix}`;

  // Masters E (65+)
  if (/masters?e/.test(s) || /master[78]/.test(s) || /^[mf]7/.test(s) || /^[mf]8/.test(s)) return `Masters E${suffix}`;

  // Specials
  if (/ebike|e.?bike/.test(s)) return 'E-Bike';
  if (/para/.test(s)) return 'Paracycling';

  // Fall back to trimmed original
  return cat.trim();
}

// ── Category canonicalization ─────────────────────────────────────────────────
//
// Maps raw API category strings to canonical full names used for athlete
// deduplication and pipeline logic (e.g. "MASTERS A" → "Masters A Male").
// Falls back to normalizeCategory() for unknown patterns, then "Unknown".

const CATEGORY_MAP: Record<string, string> = {
  // Elite Male
  "ELITES M": "Elite Male", "M ELITES": "Elite Male", "Elite M.": "Elite Male",
  "Elite Masc": "Elite Male", "M Elite": "Elite Male",
  "M SUB23": "Elite Male",
  "Elites M": "Elite Male", "Sub 23 M": "Elite Male",
  // Elite Female
  "ELITES F": "Elite Female", "F ELITES": "Elite Female", "Elite F.": "Elite Female",
  "Elites Fem": "Elite Female", "F Elite": "Elite Female",
  "F SUB23": "Elite Female",
  "Elites F": "Elite Female", "Sub 23 F": "Elite Female",
  // Open 19-34 — ambiguous between Elite and Masters A; rules out Masters B+
  "M 19-34": "Open 19-34 Male",
  "F 19-34": "Open 19-34 Female",
  // Junior Male
  "M JUN": "Junior Male", "M Junior": "Junior Male",
  "Junior M.": "Junior Male", "Juniores Masc": "Junior Male",
  "Juniores M": "Junior Male",
  // Junior Female
  "F JUN": "Junior Female", "Junior F.": "Junior Female",
  "Juniores F": "Junior Female",
  // Cadete Male
  "M Cadete": "Cadete Male", "Cadete Masc": "Cadete Male",
  // Masters A Male
  "MASTERS A": "Masters A Male", "M Masters A": "Masters A Male",
  "Master A": "Masters A Male", "MasterA Masc": "Masters A Male",
  "MASTER 30": "Masters A Male", "MASTER 35": "Masters A Male", "M 35-39": "Masters A Male",
  "Masters 30 M": "Masters A Male", "Masters 35 M": "Masters A Male",
  // Masters B Male
  "MASTERS B": "Masters B Male", "M Masters B": "Masters B Male",
  "Master B": "Masters B Male", "MasterB Masc": "Masters B Male",
  "MASTER 40": "Masters B Male", "M 40-44": "Masters B Male",
  "MASTER 45": "Masters B Male", "M 45-49": "Masters B Male",
  "Masters 40 M": "Masters B Male", "Masters 45 M": "Masters B Male",
  // Masters C Male
  "MASTERS C": "Masters C Male", "M Masters C": "Masters C Male",
  "Master C": "Masters C Male", "MasterC Masc": "Masters C Male",
  "MASTER 50": "Masters C Male", "M 50-54": "Masters C Male",
  "MASTER 55": "Masters C Male", "M 55-59": "Masters C Male",
  "Masters 50 M": "Masters C Male", "Masters 55 M": "Masters C Male",
  // Masters D Male
  "MASTERS D": "Masters D Male", "M Masters D": "Masters D Male",
  "Master D": "Masters D Male", "MasterDM": "Masters D Male",
  "MASTER 60": "Masters D Male", "M 60-64": "Masters D Male",
  "MASTER 65": "Masters D Male", "M 65-69": "Masters D Male",
  "Masters 60 M": "Masters D Male", "Masters 65 M": "Masters D Male",
  // Masters E Male
  "MASTERS E": "Masters E Male", "M Master E": "Masters E Male",
  "Master E": "Masters E Male", "MasterEM": "Masters E Male",
  "MASTER 70": "Masters E Male", "M 70-74": "Masters E Male", "M 75-79": "Masters E Male",
  "Masters 70 M": "Masters E Male", "Masters 75 M": "Masters E Male",
  // Masters A Female
  "MASTERS A FEM": "Masters A Female", "F MASTERS A": "Masters A Female",
  "F Masters A": "Masters A Female", "Master A Fem": "Masters A Female",
  "F MASTER 30": "Masters A Female", "F MASTER 35": "Masters A Female", "F 35-39": "Masters A Female",
  "Masters 30 F": "Masters A Female", "Masters 35 F": "Masters A Female",
  // Masters B Female
  "MASTERS B FEM": "Masters B Female", "F MASTERS B": "Masters B Female",
  "F Mastres B": "Masters B Female", "Master B Fem": "Masters B Female",
  "F MASTER 40": "Masters B Female", "F 40-44": "Masters B Female",
  "F MASTER 45": "Masters B Female", "F 45-49": "Masters B Female",
  "Masters 40 F": "Masters B Female", "Masters 45 F": "Masters B Female",
  // Masters C Female
  "MASTERS C FEM": "Masters C Female", "F MASTERS C": "Masters C Female",
  "F Masters C": "Masters C Female", "Master C Fem": "Masters C Female",
  "F MASTER 50": "Masters C Female", "F 50-54": "Masters C Female",
  "F MASTER 55": "Masters C Female", "F 55-59": "Masters C Female",
  "Masters 50 F": "Masters C Female", "Masters 55 F": "Masters C Female",
  // Masters D Female
  "MASTERS D FEM": "Masters D Female", "F MASTERS D": "Masters D Female",
  "F MASTER D": "Masters D Female", "F 60-64": "Masters D Female",
  "Masters 60 F": "Masters D Female", "Masters 65 F": "Masters D Female",
  // E-Bike
  "EBIKE": "E-Bike", "E-BIKE": "E-Bike", "E-Bikes": "E-Bike",
  // Paracycling
  "PARACICLISMO": "Paracycling", "PARACICLISTA": "Paracycling", "PARACLISMO": "Paracycling",
  // Unknown / misc
  "": "Unknown", "Sem Escalão": "Unknown",
  "MASTERS F": "Masters F Male", "MASTERS F ": "Masters F Male",
};

export function canonicalizeCategory(raw: string): string {
  if (raw in CATEGORY_MAP) return CATEGORY_MAP[raw]!;
  const fallback = normalizeCategory(raw);
  return fallback !== raw ? fallback : "Unknown";
}

// ── Solo team detection ───────────────────────────────────────────────────────

/** True if the team name represents an unaffiliated/individual entry. */
export function isSoloTeam(team: string): boolean {
  return !team.trim() || SOLO_TEAM_KEYS.has(teamNormalKey(team));
}

/** True if two team names refer to the same club (exact or fuzzy key match). */
export function sameTeam(a: string, b: string): boolean {
  const ka = teamNormalKey(a);
  const kb = teamNormalKey(b);
  return ka === kb || teamKeySimilarity(ka, kb) === 1;
}
