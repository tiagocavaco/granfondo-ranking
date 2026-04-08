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
 * Strips accents, lowercases, collapses whitespace.
 */
export function normalizeName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // strip combining diacritics
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
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
 * - Replaces all separators (/, |, \, ^, -) with space
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
  // Replace dots and commas with spaces (turns "C.B." → "c b " and "C.B.Almodôvar" → "c b almodovar")
  s = s.replace(/[.,]/g, " ");
  // Replace all separator characters with space
  s = s.replace(/[/|\\^]/g, " ").replace(/\s*-\s*/g, " ");
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
const TEAM_ALIASES: Record<string, string> = {
  // "Casa Benfica Almodovar" is the same club as "C.B. Almodôvar / Banco Primus / Swick"
  "casa benfica almodovar": "cb almodovar banco primus swick",
  "casa benfica almodovar banco primus swick": "cb almodovar banco primus swick",
  "casa benfica almodovar bancoprimus swick": "cb almodovar banco primus swick",
  "swick casa benfica almodovar": "cb almodovar banco primus swick",
  // "Gruppetto Cycleclub" vs "Gruppetto Cycle Club"
  "gruppetto cycleclub": "gruppetto cycle club",
  // "Ufcbarqueiros" (missing space) vs "U.F.C. Barqueiros"
  "ufcbarqueiros": "ufc barqueiros",
};

/**
 * Returns the canonical normalized key for a team name, applying fuzzy
 * normalization and then any manual alias overrides.
 */
export function teamNormalKey(name: string): string {
  const key = normalizeTeam(name);
  return TEAM_ALIASES[key] ?? key;
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
