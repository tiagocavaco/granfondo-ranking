import { describe, it, expect } from "vitest";
import {
  normalizeTeam,
  teamNormalKey,
  teamKeySimilarity,
  categoryTier,
  tierConflict,
  normalizeCategory,
  normalizeName,
  fixRawTeamName,
  canonicalTeam,
  timeToSeconds,
  formatTime,
  parseEventDate,
  getYear,
  isPast,
  levenshteinDistance,
} from "./normalize.js";

// ── normalizeTeam ──────────────────────────────────────────────────────────────

describe("normalizeTeam", () => {
  it("strips accents and lowercases", () => {
    expect(normalizeTeam("Almodôvar")).toBe("almodovar");
  });

  it("collapses C.B. abbreviations", () => {
    expect(normalizeTeam("C.B. Almodôvar")).toBe("cb almodovar");
  });

  it("handles caret encoding artifact", () => {
    expect(normalizeTeam("Almodo^var")).toBe("almodovar");
  });

  it("removes leading hash", () => {
    expect(normalizeTeam("#AstantasTeam")).toBe("astantasteam");
  });

  it("merges consecutive single-letter tokens", () => {
    expect(normalizeTeam("U.F.C. Barqueiros")).toBe("ufc barqueiros");
  });

  it("replaces separators with space", () => {
    expect(normalizeTeam("Team/Alpha&Beta")).toBe("team alpha beta");
  });
});

// ── teamKeySimilarity ──────────────────────────────────────────────────────────

describe("teamKeySimilarity", () => {
  it("returns 1 for identical keys", () => {
    expect(teamKeySimilarity("vivavita", "vivavita")).toBe(1);
  });

  it("compact equality: spaced vs concatenated", () => {
    expect(teamKeySimilarity("dbl bike", "dblbike")).toBe(1);
  });

  it("compact prefix: zossvog vs zoss vog cacb", () => {
    expect(teamKeySimilarity("zoss vog", "zoss vog cacb")).toBe(1);
  });

  it("compact prefix: shorter name with ≥60% coverage", () => {
    expect(teamKeySimilarity("abcdef", "abcdefghij")).toBe(1);
  });

  it("compact prefix: coverage below 60% returns <1", () => {
    expect(teamKeySimilarity("abc", "abcdefghij")).toBeLessThan(1);
  });

  it("token containment: short name fully in long name", () => {
    expect(teamKeySimilarity("anna cycling", "anna cycling team")).toBe(1);
  });

  it("unrelated teams score near 0", () => {
    expect(teamKeySimilarity("dbl bike", "jbracing voicevelo em3")).toBeLessThan(0.3);
  });

  it("returns 0 when one side has no significant tokens (all < 3 chars)", () => {
    expect(teamKeySimilarity("ab", "vivavita")).toBe(0);
    expect(teamKeySimilarity("vivavita", "cd")).toBe(0);
  });

  it("jaccard: partial overlap", () => {
    const sim = teamKeySimilarity("abc def ghi", "abc def jkl");
    expect(sim).toBeGreaterThanOrEqual(0.5);
    expect(sim).toBeLessThan(1);
  });
});

// ── teamNormalKey / TEAM_ALIASES ───────────────────────────────────────────────

describe("teamNormalKey", () => {
  it("resolves Casa Benfica alias", () => {
    expect(teamNormalKey("Casa Benfica Almodovar")).toBe("cb almodovar banco primus swick");
  });

  it("resolves Penacova Firstbike alias to Penacova Ceg", () => {
    expect(teamNormalKey("Penacova Firstbike Reconco")).toBe("penacova ceg reconco");
    expect(teamNormalKey("Penacova  Firstbike  Reconco")).toBe("penacova ceg reconco");
  });

  it("passthrough for unknown teams", () => {
    expect(teamNormalKey("Random Team")).toBe("random team");
  });
});

// ── categoryTier ───────────────────────────────────────────────────────────────

describe("categoryTier", () => {
  it("Elite → 'elite'", () => {
    expect(categoryTier("ELITES M")).toBe("elite");
    expect(categoryTier("Elite F")).toBe("elite");
  });

  it("Junior / Sub23 → 'elite'", () => {
    expect(categoryTier("JUNIOR M")).toBe("elite");
    expect(categoryTier("Sub23 F")).toBe("elite");
    expect(categoryTier("Cadete")).toBe("elite");
    expect(categoryTier("MJUN")).toBe("elite");
  });

  it("Masters A / MASTER 30-35 → 'masters_a'", () => {
    expect(categoryTier("MASTERS A")).toBe("masters_a");
    expect(categoryTier("Masters A Fem")).toBe("masters_a");
    expect(categoryTier("MASTER 30")).toBe("masters_a");
    expect(categoryTier("MASTER 35")).toBe("masters_a");
    expect(categoryTier("M 35-39")).toBe("masters_a");
    expect(categoryTier("F 36")).toBe("masters_a");
  });

  it("Masters B/C/D/E → 'masters_b_plus'", () => {
    expect(categoryTier("MASTERS B")).toBe("masters_b_plus");
    expect(categoryTier("Masters C Fem")).toBe("masters_b_plus");
    expect(categoryTier("MASTER 40")).toBe("masters_b_plus");
    expect(categoryTier("MASTER 55")).toBe("masters_b_plus");
    expect(categoryTier("M 40-44")).toBe("masters_b_plus");
    expect(categoryTier("F 65")).toBe("masters_b_plus");
  });

  it("M 19-34 → 'open_1934'", () => {
    expect(categoryTier("M 19-34")).toBe("open_1934");
    expect(categoryTier("F 19-34")).toBe("open_1934");
  });

  it("E-Bike / unrecognised → 'unknown'", () => {
    expect(categoryTier("E-Bike")).toBe("unknown");
    expect(categoryTier("Paracycling")).toBe("unknown");
    expect(categoryTier("Something Else")).toBe("unknown");
  });
});

// ── tierConflict ───────────────────────────────────────────────────────────────

describe("tierConflict", () => {
  it("same tier → no conflict", () => {
    expect(tierConflict("elite", "elite")).toBe(false);
    expect(tierConflict("masters_b_plus", "masters_b_plus")).toBe(false);
  });

  it("unknown → never conflicts", () => {
    expect(tierConflict("unknown", "masters_b_plus")).toBe(false);
    expect(tierConflict("elite", "unknown")).toBe(false);
  });

  it("elite vs masters_a → conflict (different age groups, same year)", () => {
    expect(tierConflict("elite", "masters_a")).toBe(true);
  });

  it("elite vs masters_b_plus → conflict", () => {
    expect(tierConflict("elite", "masters_b_plus")).toBe(true);
  });

  it("masters_a vs masters_b_plus → conflict", () => {
    expect(tierConflict("masters_a", "masters_b_plus")).toBe(true);
  });

  it("open_1934 vs elite → no conflict (M19-34 can be Elite)", () => {
    expect(tierConflict("open_1934", "elite")).toBe(false);
  });

  it("open_1934 vs masters_a → no conflict (M19-34 spans into Masters A)", () => {
    expect(tierConflict("open_1934", "masters_a")).toBe(false);
  });

  it("open_1934 vs masters_b_plus → conflict (19-34 cannot be 40+)", () => {
    expect(tierConflict("open_1934", "masters_b_plus")).toBe(true);
    expect(tierConflict("masters_b_plus", "open_1934")).toBe(true);
  });
});

// ── normalizeCategory ─────────────────────────────────────────────────────────

describe("normalizeCategory", () => {
  it("ELITES M → Elite", () => {
    expect(normalizeCategory("ELITES M")).toBe("Elite");
  });

  it("Masters B Fem", () => {
    expect(normalizeCategory("MASTERS B FEM")).toBe("Masters B F");
  });

  it("MASTER 40 → Masters B", () => {
    expect(normalizeCategory("MASTER 40")).toBe("Masters B");
  });

  it("MASTER 55 → Masters C", () => {
    expect(normalizeCategory("MASTER 55")).toBe("Masters C");
  });

  it("M 19-34 → Open 19-34", () => {
    expect(normalizeCategory("M 19-34")).toBe("Open 19-34");
  });

  it("Masters A Fem → Masters A F", () => {
    expect(normalizeCategory("Masters A Fem")).toBe("Masters A F");
  });

  it("MASTER 35 → Masters A", () => {
    expect(normalizeCategory("MASTER 35")).toBe("Masters A");
  });

  it("Masters D (60–64)", () => {
    expect(normalizeCategory("MASTERS D")).toBe("Masters D");
    expect(normalizeCategory("MASTER 60")).toBe("Masters D");
    expect(normalizeCategory("Masters D Fem")).toBe("Masters D F");
  });

  it("Masters E (65+)", () => {
    expect(normalizeCategory("MASTERS E")).toBe("Masters E");
    expect(normalizeCategory("MASTER 70")).toBe("Masters E");
    expect(normalizeCategory("Masters E Fem")).toBe("Masters E F");
  });

  it("Sub 23 female", () => {
    expect(normalizeCategory("Sub23 Fem")).toBe("Sub 23 F");
  });

  it("Junior female", () => {
    expect(normalizeCategory("JUNIOR FEM")).toBe("Junior F");
  });

  it("E-Bike → E-Bike", () => {
    expect(normalizeCategory("E-Bike")).toBe("E-Bike");
    expect(normalizeCategory("Ebike")).toBe("E-Bike");
  });

  it("Paracycling → Paracycling", () => {
    expect(normalizeCategory("Paracycling")).toBe("Paracycling");
    expect(normalizeCategory("Para")).toBe("Paracycling");
  });

  it("unknown category falls back to trimmed original", () => {
    expect(normalizeCategory("  Custom Cat  ")).toBe("Custom Cat");
  });
});

// ── normalizeName ─────────────────────────────────────────────────────────────

describe("normalizeName", () => {
  it("strips diacritics and lowercases", () => {
    expect(normalizeName("João Viégas")).toBe("joao viegas");
  });

  it("collapses whitespace", () => {
    expect(normalizeName("  Ana   Silva  ")).toBe("ana silva");
  });

  it("removes non-combining apostrophes", () => {
    expect(normalizeName("D'Encaixe")).toBe("dencaixe");
  });
});

// ── fixRawTeamName ────────────────────────────────────────────────────────────

describe("fixRawTeamName", () => {
  it("converts caret-circumflex encoding", () => {
    expect(fixRawTeamName("Almodo^var")).toBe("Almodôvar");
    expect(fixRawTeamName("a^")).toBe("â");
  });

  it("does not convert non-vowel before caret", () => {
    expect(fixRawTeamName("Enc^aixe")).toBe("Enc^aixe");
  });

  it("leaves normal names unchanged", () => {
    expect(fixRawTeamName("Team Alpha")).toBe("Team Alpha");
  });
});

// ── canonicalTeam ─────────────────────────────────────────────────────────────

describe("canonicalTeam", () => {
  it("picks the most frequent name", () => {
    const occ = new Map([["Team A", 3], ["Team B", 1]]);
    expect(canonicalTeam(occ)).toBe("Team A");
  });

  it("tie-breaks by longest name", () => {
    const occ = new Map([["Team", 2], ["Team Alpha", 2]]);
    expect(canonicalTeam(occ)).toBe("Team Alpha");
  });

  it("normalizes slashes and spaces", () => {
    const occ = new Map([["Team/Alpha  Beta", 1]]);
    expect(canonicalTeam(occ)).toBe("Team / Alpha Beta");
  });
});

// ── timeToSeconds ─────────────────────────────────────────────────────────────

describe("timeToSeconds", () => {
  it("parses HH:MM:SS.mmm", () => {
    expect(timeToSeconds("01:02:03.456")).toBeCloseTo(3723.456, 2);
  });

  it("parses HH:MM:SS without millis", () => {
    expect(timeToSeconds("03:25:10")).toBe(12310);
  });

  it("returns 0 for zero time", () => {
    expect(timeToSeconds("00:00:00.000")).toBe(0);
    expect(timeToSeconds("00:00:00")).toBe(0);
  });

  it("returns 0 for empty string", () => {
    expect(timeToSeconds("")).toBe(0);
  });

  it("returns 0 for malformed string (not HH:MM:SS)", () => {
    expect(timeToSeconds("01:30")).toBe(0);
    expect(timeToSeconds("invalid")).toBe(0);
  });
});

// ── formatTime ────────────────────────────────────────────────────────────────

describe("formatTime", () => {
  it("strips milliseconds", () => {
    expect(formatTime("03:25:10.123")).toBe("03:25:10");
  });

  it("passes through HH:MM:SS unchanged", () => {
    expect(formatTime("03:25:10")).toBe("03:25:10");
  });

  it("returns empty string for empty input", () => {
    expect(formatTime("")).toBe("");
  });
});

// ── parseEventDate ────────────────────────────────────────────────────────────

describe("parseEventDate", () => {
  it("converts YYYY/MM/DD to YYYY-MM-DD", () => {
    expect(parseEventDate("2025/03/15")).toBe("2025-03-15");
  });

  it("takes first date from multi-day range", () => {
    expect(parseEventDate("2025/06/07 - 2025/06/08")).toBe("2025-06-07");
  });
});

// ── getYear ───────────────────────────────────────────────────────────────────

describe("getYear", () => {
  it("extracts year from ISO date", () => {
    expect(getYear("2025-03-15")).toBe(2025);
    expect(getYear("2026-01-01")).toBe(2026);
  });
});

// ── isPast ────────────────────────────────────────────────────────────────────

describe("isPast", () => {
  it("returns true for a past date", () => {
    expect(isPast("2020-01-01")).toBe(true);
  });

  it("returns false for a future date", () => {
    expect(isPast("2099-01-01")).toBe(false);
  });
});

// ── levenshteinDistance ───────────────────────────────────────────────────────

describe("levenshteinDistance", () => {
  it("returns 0 for identical strings", () => {
    expect(levenshteinDistance("antonio", "antonio")).toBe(0);
    expect(levenshteinDistance("", "")).toBe(0);
  });

  it("returns string length when other string is empty", () => {
    expect(levenshteinDistance("abc", "")).toBe(3);
    expect(levenshteinDistance("", "abc")).toBe(3);
  });

  it("single substitution", () => {
    expect(levenshteinDistance("abc", "xbc")).toBe(1);
    expect(levenshteinDistance("antonio pereira", "antsnio pereira")).toBe(1);
    expect(levenshteinDistance("antonio henriques", "antsnio henriques")).toBe(1);
    expect(levenshteinDistance("line ostergaard", "line stergaard")).toBe(1);
  });

  it("single insertion / deletion", () => {
    expect(levenshteinDistance("abc", "ab")).toBe(1);
    expect(levenshteinDistance("ab", "abc")).toBe(1);
    expect(levenshteinDistance("vasco botelhho", "vasco botelho")).toBe(1);
    expect(levenshteinDistance("joao guerrreiro", "joao guerreiro")).toBe(1);
    expect(levenshteinDistance("francissco cesar", "francisco cesar")).toBe(1);
    expect(levenshteinDistance("eurico goncalves", "eurico gonalves")).toBe(1);
  });

  it("distance 2 — real-world transposition / two-char diff", () => {
    expect(levenshteinDistance("nuno coast", "nuno costa")).toBe(2);
    expect(levenshteinDistance("pedro dasilva", "pedro silva")).toBe(2);
  });

  it("clearly different names have distance > 2", () => {
    expect(levenshteinDistance("manuel salvado", "luis madureira")).toBeGreaterThan(2);
    expect(levenshteinDistance("pedro marques", "pedro purito")).toBeGreaterThan(2);
    expect(levenshteinDistance("jose faria", "ze luis")).toBeGreaterThan(2);
  });
});
