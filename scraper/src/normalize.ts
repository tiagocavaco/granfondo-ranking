// ── Team points table ─────────────────────────────────────────────────────────

const TEAM_POINTS_TABLE: Array<{ maxRank: number; points: number }> = [
  { maxRank: 1,  points: 25 },
  { maxRank: 2,  points: 20 },
  { maxRank: 3,  points: 15 },
  { maxRank: 4,  points: 12 },
  { maxRank: 5,  points: 7  },
  { maxRank: 6,  points: 5  },
  { maxRank: 7,  points: 4  },
  { maxRank: 8,  points: 3  },
  { maxRank: 9,  points: 2  },
  { maxRank: 10, points: 1  },
];

/**
 * Base points for a team finishing rank (0 if outside top 10).
 */
export function rankToTeamBasePoints(rank: number): number {
  for (const { maxRank, points } of TEAM_POINTS_TABLE) {
    if (rank <= maxRank) return points;
  }
  return 0;
}

/**
 * Coefficient based on total number of teams present in the distance
 * (including those with fewer than 3 athletes).
 * Reference is 80 teams = 1.00.
 */
const TEAM_COEFFICIENT_REFERENCE = 80;

export function teamCoefficient(totalTeams: number): number {
  const raw = Math.sqrt(Math.max(totalTeams, 1) / TEAM_COEFFICIENT_REFERENCE);
  return Math.round(raw * 100) / 100;
}

// ── Athlete points table ─────────────────────────────────────────────────────

const POINTS_TABLE: Array<{ maxPos: number; points: number }> = [
  { maxPos: 1,  points: 75 },
  { maxPos: 2,  points: 65 },
  { maxPos: 3,  points: 60 },
  { maxPos: 4,  points: 55 },
  { maxPos: 5,  points: 50 },
  { maxPos: 6,  points: 45 },
  { maxPos: 7,  points: 40 },
  { maxPos: 8,  points: 35 },
  { maxPos: 9,  points: 30 },
  { maxPos: 10, points: 25 },
  { maxPos: 11, points: 20 },
  { maxPos: 12, points: 15 },
  { maxPos: 13, points: 13 },
  { maxPos: 14, points: 11 },
  { maxPos: 15, points: 10 },
  { maxPos: 20, points: 7  },
  { maxPos: 25, points: 5  },
  { maxPos: 30, points: 3  },
  { maxPos: 40, points: 2  },
  { maxPos: 50, points: 1  },
];

/**
 * Base points for a finishing position (0 if outside top 50).
 */
export function posToBasePoints(pos: number): number {
  if (pos < 1) return 0;
  for (const { maxPos, points } of POINTS_TABLE) {
    if (pos <= maxPos) return points;
  }
  return 0;
}

/**
 * Coefficient that scales points by race size (number of finishers).
 * Reference is 300 finishers = 1.00.  sqrt gives a gentle curve:
 *  75 → 0.50,  150 → 0.71,  300 → 1.00,  600 → 1.41,  900 → 1.73
 * Rounded to 2 decimal places.
 */
const COEFFICIENT_REFERENCE = 300;

export function finisherCoefficient(finisherCount: number): number {
  const raw = Math.sqrt(Math.max(finisherCount, 1) / COEFFICIENT_REFERENCE);
  return Math.round(raw * 100) / 100;
}

// ── Name normalization ────────────────────────────────────────────────────────

/**
 * Normalize an athlete name for consistent cross-event matching.
 * Strips accents, lowercases, collapses whitespace, removes non-letter/space chars
 * (handles encoding artifacts like "gon?alves" → "goncalves").
 */
export function normalizeName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // strip combining diacritics
    .replace(/[´`\u00b4\u02b9\u02bc\u2018\u2019''']/g, "") // strip non-combining apostrophe/accent chars
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "") // strip non-alphanumeric chars (encoding artifacts like "?", punctuation)
    .replace(/\s+/g, " ")
    .trim();
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
    let prev = i;
    for (let j = 1; j <= b.length; j++) {
      const temp = dp[j]!;
      dp[j] = a[i - 1] === b[j - 1] ? dp[j - 1]! : 1 + Math.min(dp[j - 1]!, dp[j]!, prev);
      prev = temp;
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
 * Fix known encoding artifacts in raw team names before display or comparison.
 * Handles caret-as-circumflex (e.g., "Almodo^var" → "Almodôvar").
 */
export function fixRawTeamName(name: string): string {
  return name.replace(/([aeiouAEIOU])\^/g, (_, v: string) => {
    const map: Record<string, string> = {
      a: "â", e: "ê", i: "î", o: "ô", u: "û",
      A: "Â", E: "Ê", I: "Î", O: "Ô", U: "Û",
    };
    return map[v] ?? v + "^";
  });
}

/**
 * Normalize a team name to a canonical key for fuzzy deduplication.
 * - Fixes caret encoding artifacts
 * - Strips accents, lowercases
 * - Removes dots and commas (collapses abbreviations: "C.B." → "cb", "C. B." → "cb")
 * - Replaces all separators (/, |, \, ^, -, &, +) with space
 * - Strips apostrophes/quote chars (', ´, `)
 * - Merges consecutive single-letter tokens (e.g., "c e" → "ce")
 * - Collapses whitespace
 */
export function normalizeTeam(name: string): string {
  let s = fixRawTeamName(name);
  // Strip accents + lowercase
  s = s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  // Strip apostrophes / quote chars (D'Encaixe → DEncaixe, not D-Encaixe)
  s = s.replace(/['''`´\u2018\u2019\u02bc]/g, "");
  // Strip leading # (e.g. "#Astantasteam" → "Astantasteam")
  s = s.replace(/#/g, "");
  // Replace dots and commas with spaces (turns "C.B." → "c b " and "C.B.Almodôvar" → "c b almodovar")
  s = s.replace(/[.,]/g, " ");
  // Replace all separator characters with space (& + @ treated as word separators)
  s = s.replace(/[/|\\^&+@]/g, " ").replace(/\s*-\s*/g, " ");
  // Collapse whitespace before single-char merging
  s = s.replace(/\s+/g, " ").trim();
  // Merge consecutive single-letter tokens separated by a single space
  // e.g., "c b almodovar" → "cb almodovar", "a d fafe" → "ad fafe"
  // Apply multiple times to handle chains like "a d s" → "ad s" → "ads"
  for (let i = 0; i < 6; i++) {
    s = s.replace(/(?<![a-z])([a-z]) ([a-z])(?![a-z])/g, "$1$2");
  }
  // Merge a short abbreviation prefix (1–3 chars) with a trailing single char
  // e.g., "uf c barqueiros" → "ufc barqueiros" (U.F.C. written with dots vs without)
  s = s.replace(/(?<![a-z])([a-z]{1,3}) ([a-z])(?![a-z])/g, "$1$2");
  // Final whitespace collapse
  s = s.replace(/\s+/g, " ").trim();
  return s;
}

/**
 * Manual aliases for team names that cannot be resolved automatically.
 * Maps a normalized team key → canonical normalized key.
 * Used when the same club registers under structurally different names
 * (e.g., abbreviated form vs. full name, or reordered sponsor names).
 */
/**
 * Manual aliases for team names that cannot be resolved automatically.
 * Source of truth: scraper/team-aliases.json (also published to frontend/public/data/).
 * Only needed for semantically different names that refer to the same club
 * (e.g. abbreviated form vs. full name, or reordered sponsor names).
 * Space/concatenation variants ("dblbike" vs "dbl bike") are handled
 * automatically by the compact equality and compact-prefix checks in
 * teamKeySimilarity — no alias needed for those.
 */
import TEAM_ALIASES_JSON from "../team-aliases.json" with { type: "json" };
const TEAM_ALIASES: Record<string, string> = TEAM_ALIASES_JSON;

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
