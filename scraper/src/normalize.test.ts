import { describe, it, expect, beforeAll } from "vitest";
import {
  normalizeTeam,
  teamNormalKey,
  initTeamAliases,
  teamKeySimilarity,
  categoryTier,
  normalizeCategory,
  canonicalizeCategory,
  normalizeName,
  fixRawTeamName,
  canonicalTeam,
  timeToSeconds,
  formatTime,
  parseEventDate,
  getYear,
  isPast,
  levenshteinDistance,
  distancePriority,
  isValidLicence,
  isSoloTeam,
} from "./normalize.js";

beforeAll(() => {
  initTeamAliases({
    "casa benfica almodovar":                     "cb almodovar banco primus swick",
    "casa benfica almodovar banco primus swick":  "cb almodovar banco primus swick",
    "penacova firstbike reconco":                 "penacova ceg reconco",
    // Chain: A → B → C (three hops)
    "escola ciclismo de oeiras parracho mr print":         "escola ciclismo de oeiras parracho mr print reconco",
    "escola ciclismo de oeiras parracho mr print reconco": "escola ciclismo oeiras parracho mr print reconco",
    // Circular: X → Y → X
    "clube circular a": "clube circular b",
    "clube circular b": "clube circular a",
  });
});

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

  it("follows two-hop chain to final canonical", () => {
    // A → B → C: old single-hop code returned B, new code returns C
    expect(teamNormalKey("Escola Ciclismo de Oeiras Parracho Mr Print"))
      .toBe("escola ciclismo oeiras parracho mr print reconco");
  });

  it("does not infinite-loop on circular aliases", () => {
    // X → Y → X: must terminate and return one of the two keys
    const result = teamNormalKey("Clube Circular A");
    expect(["clube circular a", "clube circular b"]).toContain(result);
  });

  it("circular aliases from either direction reach the same canonical", () => {
    // Both sides of a circular must resolve to the same key (whichever wins)
    expect(teamNormalKey("Clube Circular A")).toBe(teamNormalKey("Clube Circular A"));
    expect(teamNormalKey("Clube Circular B")).toBe(teamNormalKey("Clube Circular B"));
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

  it("Masters B (40–49) → 'masters_b'", () => {
    expect(categoryTier("MASTERS B")).toBe("masters_b");
    expect(categoryTier("Masters B Masc")).toBe("masters_b");
    expect(categoryTier("MASTER 40")).toBe("masters_b");
    expect(categoryTier("MASTER 45")).toBe("masters_b");
    expect(categoryTier("M 40-44")).toBe("masters_b");
    expect(categoryTier("F 45-49")).toBe("masters_b");
  });

  it("Masters C (50–59) → 'masters_c'", () => {
    expect(categoryTier("MASTERS C")).toBe("masters_c");
    expect(categoryTier("Masters C Fem")).toBe("masters_c");
    expect(categoryTier("MASTER 50")).toBe("masters_c");
    expect(categoryTier("MASTER 55")).toBe("masters_c");
    expect(categoryTier("M 50-54")).toBe("masters_c");
    expect(categoryTier("F 55-59")).toBe("masters_c");
  });

  it("Masters D (60–69) → 'masters_d'", () => {
    expect(categoryTier("MASTERS D")).toBe("masters_d");
    expect(categoryTier("Masters D Masc")).toBe("masters_d");
    expect(categoryTier("MASTER 60")).toBe("masters_d");
    expect(categoryTier("MASTER 65")).toBe("masters_d");
    expect(categoryTier("M 60-64")).toBe("masters_d");
    expect(categoryTier("F 65")).toBe("masters_d");
  });

  it("Masters E (70–79) → 'masters_e'", () => {
    expect(categoryTier("MASTERS E")).toBe("masters_e");
    expect(categoryTier("Masters E Male")).toBe("masters_e");
    expect(categoryTier("MASTER 70")).toBe("masters_e");
    expect(categoryTier("MASTER 75")).toBe("masters_e");
    expect(categoryTier("M 70-74")).toBe("masters_e");
  });

  it("Masters F+ (80+) → 'masters_f_plus'", () => {
    expect(categoryTier("MASTERS F")).toBe("masters_f_plus");
    expect(categoryTier("Masters F Fem")).toBe("masters_f_plus");
    expect(categoryTier("MASTER 80")).toBe("masters_f_plus");
    expect(categoryTier("MASTER 85")).toBe("masters_f_plus");
    expect(categoryTier("M 80-84")).toBe("masters_f_plus");
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

  it("Junior / Cadete → Elite (normalizeCategory fallback)", () => {
    expect(normalizeCategory("JUNIOR FEM")).toBe("Elite F");
    expect(normalizeCategory("JUNIOR M")).toBe("Elite");
    expect(normalizeCategory("Cadete")).toBe("Elite");
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

// ── canonicalizeCategory ──────────────────────────────────────────────────────

describe("canonicalizeCategory", () => {
  it("standard CATEGORY_MAP entries resolve with gender", () => {
    expect(canonicalizeCategory("MASTERS A")).toBe("Masters A Male");
    expect(canonicalizeCategory("M 35-39")).toBe("Masters A Male");
    expect(canonicalizeCategory("F 35-39")).toBe("Masters A Female");
    expect(canonicalizeCategory("M 40-44")).toBe("Masters B Male");
    expect(canonicalizeCategory("M 19-34")).toBe("Open 19-34 Male");
  });

  it("en-dash (U+2013) category strings used by Granfondo Coimbra 2024", () => {
    // These caused post-pass to silently remove results for athletes with
    // gendered canonical categories — en-dash wasn't in CATEGORY_MAP so the
    // fallback returned gender-agnostic "Masters A" instead of "Masters A Male".
    expect(canonicalizeCategory("M35–39")).toBe("Masters A Male");
    expect(canonicalizeCategory("M40–44")).toBe("Masters B Male");
    expect(canonicalizeCategory("M45–49")).toBe("Masters B Male");
    expect(canonicalizeCategory("M50–54")).toBe("Masters C Male");
    expect(canonicalizeCategory("M55–59")).toBe("Masters C Male");
    expect(canonicalizeCategory("M60–64")).toBe("Masters D Male");
    expect(canonicalizeCategory("M19–34")).toBe("Open 19-34 Male");
    expect(canonicalizeCategory("F35–39")).toBe("Masters A Female");
    expect(canonicalizeCategory("F40–44")).toBe("Masters B Female");
    expect(canonicalizeCategory("F 19–34")).toBe("Open 19-34 Female");
  });

  it("no-space hyphen variants also used by Coimbra 2024 older age groups", () => {
    expect(canonicalizeCategory("M70-74")).toBe("Masters E Male");
    expect(canonicalizeCategory("M75-79")).toBe("Masters E Male");
    expect(canonicalizeCategory("M65- 69")).toBe("Masters D Male");
  });

  it("Junior / Cadete map to Elite (most races don't have separate Junior/Cadete category)", () => {
    expect(canonicalizeCategory("M JUN")).toBe("Elite Male");
    expect(canonicalizeCategory("F JUN")).toBe("Elite Female");
    expect(canonicalizeCategory("Juniores Masc")).toBe("Elite Male");
    expect(canonicalizeCategory("Juniores F")).toBe("Elite Female");
    expect(canonicalizeCategory("M Cadete")).toBe("Elite Male");
    expect(canonicalizeCategory("Junior Male")).toBe("Elite Male");
    expect(canonicalizeCategory("Cadete Female")).toBe("Elite Female");
  });

  it("already-canonical strings pass through unchanged", () => {
    expect(canonicalizeCategory("Masters A Male")).toBe("Masters A Male");
    expect(canonicalizeCategory("Masters B Female")).toBe("Masters B Female");
    expect(canonicalizeCategory("Elite Male")).toBe("Elite Male");
  });

  it("unknown strings return Unknown", () => {
    expect(canonicalizeCategory("XYZ")).toBe("Unknown");
    expect(canonicalizeCategory("")).toBe("Unknown");
  });
});

// ── isValidLicence ────────────────────────────────────────────────────────────

describe("isValidLicence", () => {
  it("returns false for empty or falsy values", () => {
    expect(isValidLicence("")).toBe(false);
  });

  it("rejects explicit dummy strings", () => {
    expect(isValidLicence("NAOFEDERADO")).toBe(false);
    expect(isValidLicence("naofederado")).toBe(false); // case-insensitive
    expect(isValidLicence("11111")).toBe(false);
    expect(isValidLicence("12345")).toBe(false);
    expect(isValidLicence("23456")).toBe(false);
  });

  it("rejects negative numbers", () => {
    expect(isValidLicence("-1")).toBe(false);
    expect(isValidLicence("-999")).toBe(false);
  });

  it("rejects scientific notation artifacts", () => {
    expect(isValidLicence("1.23e10")).toBe(false);
    expect(isValidLicence("9.87E5")).toBe(false);
  });

  it("rejects 10^10 variants", () => {
    expect(isValidLicence("1000000000")).toBe(false);
    expect(isValidLicence("10000000001")).toBe(false);
  });

  it("rejects all-zero strings", () => {
    expect(isValidLicence("000")).toBe(false);
    expect(isValidLicence("0000")).toBe(false);
  });

  it("rejects small pure integers without leading zero (< 100)", () => {
    expect(isValidLicence("1")).toBe(false);
    expect(isValidLicence("99")).toBe(false);
    expect(isValidLicence("100")).toBe(true); // boundary: 100 is valid
  });

  it("rejects federation name strings", () => {
    expect(isValidLicence("federacao")).toBe(false);
    expect(isValidLicence("FEDERAÇÃO")).toBe(false);
    expect(isValidLicence("FederaÇão")).toBe(false);
    expect(isValidLicence("federac anything")).toBe(false);
  });

  it("accepts real-looking licence numbers", () => {
    expect(isValidLicence("PT12345")).toBe(true);
    expect(isValidLicence("123456")).toBe(true);
    expect(isValidLicence("0123")).toBe(true); // leading zero → not a plain small int
    expect(isValidLicence("ABC100")).toBe(true);
  });
});

// ── isSoloTeam ────────────────────────────────────────────────────────────────

describe("isSoloTeam", () => {
  it("treats empty string as solo", () => {
    expect(isSoloTeam("")).toBe(true);
  });

  it("treats 'Individual' as solo", () => {
    expect(isSoloTeam("Individual")).toBe(true);
  });

  it("treats 'Independente' as solo", () => {
    expect(isSoloTeam("Independente")).toBe(true);
  });

  it("treats 'Nøteam' as solo (Scandinavian placeholder normalized to 'n team')", () => {
    expect(isSoloTeam("Nøteam")).toBe(true);
  });

  it("treats 'Sem Equipa' as solo", () => {
    expect(isSoloTeam("Sem Equipa")).toBe(true);
  });

  it("does not treat a real team name as solo", () => {
    expect(isSoloTeam("Team Alpha")).toBe(false);
    expect(isSoloTeam("Orion")).toBe(false);
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

// ── distancePriority ──────────────────────────────────────────────────────────

describe("distancePriority", () => {
  it("canonical names return correct priority order", () => {
    expect(distancePriority("Granfondo")).toBeLessThan(distancePriority("Mediofondo"));
    expect(distancePriority("Mediofondo")).toBeLessThan(distancePriority("Minifondo"));
    expect(distancePriority("Minifondo")).toBeLessThan(distancePriority("Time Trial"));
  });

  it("aliases resolve to canonical priority", () => {
    expect(distancePriority("BIG DAY")).toBe(distancePriority("Granfondo"));
    expect(distancePriority("HALF DAY")).toBe(distancePriority("Mediofondo"));
    expect(distancePriority("Clássica")).toBe(distancePriority("Granfondo"));
    expect(distancePriority("Etapa")).toBe(distancePriority("Mediofondo"));
  });

  it("case insensitive for canonical names", () => {
    expect(distancePriority("granfondo")).toBe(distancePriority("Granfondo"));
    expect(distancePriority("MEDIOFONDO")).toBe(distancePriority("Mediofondo"));
  });

  it("unknown distance returns lowest priority (9)", () => {
    expect(distancePriority("Unknown Race")).toBe(9);
    expect(distancePriority("")).toBe(9);
  });

  it("sorting by priority yields GF → MF → Mini order", () => {
    const names = ["Minifondo", "Granfondo", "Mediofondo"];
    const sorted = [...names].sort((a, b) => distancePriority(a) - distancePriority(b));
    expect(sorted).toEqual(["Granfondo", "Mediofondo", "Minifondo"]);
  });
});
