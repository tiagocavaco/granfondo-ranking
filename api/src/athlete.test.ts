import { describe, it, expect } from "vitest";
import {
  mostRecentCountry,
  buildCountryMap,
  buildMostFrequentCountryMap,
} from "./athlete.js";

describe("mostRecentCountry", () => {
  it("returns the first non-empty country from the array", () => {
    // Callers pass results sorted by date desc — the "first non-empty" is
    // therefore the most recent. Order matters; this function does not sort.
    expect(
      mostRecentCountry([
        { country: "" },
        { country: "PRT" },
        { country: "ESP" },
      ]),
    ).toBe("PRT");
  });

  it("treats null/undefined country as empty", () => {
    expect(
      mostRecentCountry([{ country: null }, { country: "FRA" }]),
    ).toBe("FRA");
    expect(
      mostRecentCountry([{ country: undefined }, { country: "FRA" }]),
    ).toBe("FRA");
  });

  it("returns empty string when no result has a country", () => {
    expect(mostRecentCountry([])).toBe("");
    expect(mostRecentCountry([{ country: "" }, { country: null }])).toBe("");
  });
});

describe("buildCountryMap", () => {
  it("keeps the last occurrence per athleteId", () => {
    // Implementation note: a later row overwrites an earlier one. Callers
    // exploit this to pass rows sorted in the order they want the winner.
    const map = buildCountryMap([
      { athleteId: 1, country: "PRT" },
      { athleteId: 1, country: "ESP" },
      { athleteId: 2, country: "FRA" },
    ]);
    expect(map.get(1)).toBe("ESP");
    expect(map.get(2)).toBe("FRA");
  });

  it("skips empty-country rows entirely", () => {
    // An empty country row must not overwrite a previously set value.
    const map = buildCountryMap([
      { athleteId: 1, country: "PRT" },
      { athleteId: 1, country: "" },
    ]);
    expect(map.get(1)).toBe("PRT");
  });
});

describe("buildMostFrequentCountryMap", () => {
  it("picks the most-frequent country per athleteId", () => {
    const map = buildMostFrequentCountryMap([
      { athleteId: 1, country: "PRT" },
      { athleteId: 1, country: "PRT" },
      { athleteId: 1, country: "ESP" },
    ]);
    expect(map.get(1)).toBe("PRT");
  });

  it("ignores empty-country rows when counting", () => {
    // Otherwise a few empty rows could outvote a single populated one.
    const map = buildMostFrequentCountryMap([
      { athleteId: 1, country: "" },
      { athleteId: 1, country: "" },
      { athleteId: 1, country: "FRA" },
    ]);
    expect(map.get(1)).toBe("FRA");
  });

  it("omits athletes with no populated rows", () => {
    const map = buildMostFrequentCountryMap([
      { athleteId: 1, country: "" },
    ]);
    expect(map.has(1)).toBe(false);
  });

  it("handles multiple athletes independently", () => {
    const map = buildMostFrequentCountryMap([
      { athleteId: 1, country: "PRT" },
      { athleteId: 2, country: "ESP" },
      { athleteId: 2, country: "ESP" },
      { athleteId: 2, country: "FRA" },
    ]);
    expect(map.get(1)).toBe("PRT");
    expect(map.get(2)).toBe("ESP");
  });
});
