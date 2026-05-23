import { describe, it, expect } from "vitest";
import {
  normalizeName,
  fixRawTeamName,
  normalizeTeam,
  SOLO_TEAM_KEYS,
  DISTANCE_ALIASES,
  normalizeDistance,
  normalizeCountry,
  countryFlag,
} from "./normalize.js";

describe("normalizeName", () => {
  it("strips diacritics", () => {
    expect(normalizeName("João Silva")).toBe("joao silva");
    expect(normalizeName("André")).toBe("andre");
  });

  it("collapses internal whitespace and trims", () => {
    expect(normalizeName("  Pedro   Alves  ")).toBe("pedro alves");
  });

  it("removes all punctuation, leaving only alphanumeric and spaces", () => {
    // Apostrophes, periods, commas, hyphens are common in event data and
    // must not pollute the identity key.
    expect(normalizeName("D'Souza-Pereira")).toBe("dsouzapereira");
    expect(normalizeName("J. P. Silva")).toBe("j p silva");
  });

  it("handles curly apostrophe variants", () => {
    // Different sources use different apostrophe code points; output must
    // be identical across all of them.
    expect(normalizeName("O’Brien")).toBe(normalizeName("O'Brien"));
  });

  it("returns lowercase ASCII only", () => {
    // Output must be safe to use as a database key prefix.
    expect(/^[a-z0-9 ]*$/.test(normalizeName("Pedro Çardoso"))).toBe(true);
  });
});

describe("fixRawTeamName", () => {
  it("converts vowel^ patterns to circumflex accents", () => {
    // Data-entry artifact from one scraper source — "Joa^o" should become
    // "Joâo" before downstream normalisation.
    expect(fixRawTeamName("Joa^o")).toBe("Joâo");
    expect(fixRawTeamName("E^stadio")).toBe("Êstadio");
  });

  it("leaves other characters untouched", () => {
    expect(fixRawTeamName("Sporting CP")).toBe("Sporting CP");
  });
});

describe("normalizeTeam", () => {
  it("strips diacritics, lowercases, and trims", () => {
    expect(normalizeTeam("  Clube São Pedro  ")).toBe("clube sao pedro");
  });

  it("collapses short single-letter tokens into adjacent words", () => {
    // "A B C Cycling" becomes "abc cycling" — single letters separated by
    // spaces are merged because they typically represent abbreviations.
    expect(normalizeTeam("A B C Cycling")).toBe("abc cycling");
  });

  it("strips hyphens and most punctuation", () => {
    expect(normalizeTeam("Sporting - Cycling")).toBe("sporting cycling");
    expect(normalizeTeam("Team #1 / Cycling & Co.")).toBe("team 1 cycling co");
  });

  it("returns empty string for empty input", () => {
    expect(normalizeTeam("")).toBe("");
  });

  it("returns identical output across diacritic variants", () => {
    // Pipeline depends on this: "Águia" and "Aguia" must yield the same key.
    expect(normalizeTeam("Águia Cycling")).toBe(normalizeTeam("Aguia Cycling"));
  });
});

describe("SOLO_TEAM_KEYS", () => {
  it("contains the canonical placeholder names", () => {
    // Pipeline checks for solo entries by exact membership — any change to
    // this set affects how unaffiliated athletes are handled.
    expect(SOLO_TEAM_KEYS.has("individual")).toBe(true);
    expect(SOLO_TEAM_KEYS.has("independente")).toBe(true);
    expect(SOLO_TEAM_KEYS.has("no team")).toBe(true);
    expect(SOLO_TEAM_KEYS.has("sem equipa")).toBe(true);
    expect(SOLO_TEAM_KEYS.has("")).toBe(true);
  });

  it("includes 'n team' for Scandinavian Nøteam placeholder", () => {
    // ø is stripped to a space by normalizeTeam, producing "n team".
    // Without this entry, Nordic placeholders would create phantom teams.
    expect(SOLO_TEAM_KEYS.has("n team")).toBe(true);
    expect(normalizeTeam("Nøteam")).toBe("n team");
  });
});

describe("normalizeDistance", () => {
  it("maps canonical names to themselves", () => {
    expect(normalizeDistance("Granfondo")).toBe("Granfondo");
    expect(normalizeDistance("Mediofondo")).toBe("Mediofondo");
  });

  it("is case-insensitive on the alias lookup", () => {
    expect(normalizeDistance("GRANFONDO")).toBe("Granfondo");
    expect(normalizeDistance("granfondo")).toBe("Granfondo");
  });

  it("maps event-specific aliases to their canonical tier", () => {
    // Figueira Champions Day and Clássica Douro Internacional brand their
    // distances differently — must collapse to standard tiers for ranking.
    expect(normalizeDistance("BIG DAY")).toBe("Granfondo");
    expect(normalizeDistance("Half Day")).toBe("Mediofondo");
    expect(normalizeDistance("Clássica")).toBe("Granfondo");
    expect(normalizeDistance("Clássica curta")).toBe("Minifondo");
  });

  it("matches alias as a prefix when distance includes km suffix", () => {
    expect(normalizeDistance("big day 129km")).toBe("Granfondo");
  });

  it("normalises curly apostrophes before lookup", () => {
    // L'Étape uses a curly apostrophe — must work regardless.
    expect(normalizeDistance("L’Étape 125")).toBe("Granfondo");
  });

  it("returns the input unchanged when nothing matches", () => {
    expect(normalizeDistance("UnknownTierName")).toBe("UnknownTierName");
  });

  it("DISTANCE_ALIASES is non-empty and all values are canonical tiers", () => {
    // Guards against accidentally pointing an alias at a non-canonical name.
    const canonical = new Set(["Granfondo", "Mediofondo", "Minifondo", "Time Trial"]);
    for (const value of Object.values(DISTANCE_ALIASES)) {
      expect(canonical.has(value)).toBe(true);
    }
  });
});

describe("normalizeCountry", () => {
  it("returns PT for empty/null/undefined input", () => {
    // Default assumption: most events are in Portugal. Frontend relies on
    // never receiving null here so flag rendering doesn't crash.
    expect(normalizeCountry("")).toBe("PT");
    expect(normalizeCountry(null)).toBe("PT");
    expect(normalizeCountry(undefined)).toBe("PT");
  });

  it("passes through valid ISO 3166-1 alpha-2 codes (uppercased)", () => {
    expect(normalizeCountry("pt")).toBe("PT");
    expect(normalizeCountry("ES")).toBe("ES");
    expect(normalizeCountry("br")).toBe("BR");
  });

  it("maps full country names to ISO codes", () => {
    expect(normalizeCountry("Portugal")).toBe("PT");
    expect(normalizeCountry("United States")).toBe("US");
    expect(normalizeCountry("United Kingdom")).toBe("GB");
  });

  it("falls back to PT for unrecognised country names", () => {
    // Unrecognised name = data quality issue; default to PT rather than
    // surfacing an unknown ISO code that would break downstream lookups.
    expect(normalizeCountry("Atlantis")).toBe("PT");
  });
});

describe("countryFlag", () => {
  it("converts an ISO2 code to a regional-indicator emoji pair", () => {
    // 🇵🇹 = U+1F1F5 U+1F1F9
    expect(countryFlag("PT")).toBe("\u{1F1F5}\u{1F1F9}");
    expect(countryFlag("ES")).toBe("\u{1F1EA}\u{1F1F8}");
  });

  it("normalises the code before rendering", () => {
    // Empty input must still produce a valid flag (PT default).
    expect(countryFlag("")).toBe(countryFlag("PT"));
  });
});
