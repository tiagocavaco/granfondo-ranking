import { describe, it, expect } from "vitest";
import type { AthleteEntry, AthleteResultRef } from "@granfondo/database/types";
import {
  PERCENTILE_CLOSE_2,
  PERCENTILE_FAR_2,
  PERCENTILE_CLOSE_1,
  PERCENTILE_FAR_1,
  SOLO_CAT_RANK,
  RANK_TO_CAT,
  clampRank,
  resolveTeamId,
  athleteKey,
  categoriesCompatible,
  soloGroupCat,
  isValidCatTransition,
  entryCanonCatForYear,
  profileDistanceSet,
  profileMedianPercentile,
  profileCountry,
  setsIntersect,
  resultDedupeKey,
  newEntry,
  addToTeamsAndCategories,
  addResult,
  deriveCanonicalTeam,
  makeIdManager,
  buildNameLookup,
  licencesConflict,
  mergeLicenceSets,
} from "./helpers.js";

// ── Test fixtures ────────────────────────────────────────────────────────────

function mkResult(over: Partial<AthleteResultRef> = {}): AthleteResultRef {
  return {
    eventId: 1,
    eventName: "Test Event",
    eventDate: "2025-04-01",
    eventYear: 2025,
    distance: "Granfondo",
    pos: 10,
    genderPos: 5,
    catPos: 2,
    finisherCount: 100,
    category: "Masters A Male",
    gender: "M",
    team: "Sporting",
    country: "PRT",
    raceTime: "3:00:00",
    raceTimeSecs: 10800,
    gap: "00:05:00",
    gapSecs: 300,
    dnf: false,
    dns: false,
    bib: "100",
    ...over,
  };
}

function mkEntry(over: Partial<AthleteEntry> = {}): AthleteEntry {
  return {
    id: 1,
    name: "Test Athlete",
    nameLower: "test athlete",
    teams: [],
    categories: {},
    results: [],
    ...over,
  };
}

// ── Constants ────────────────────────────────────────────────────────────────

describe("solo collision percentile thresholds", () => {
  it("two-result baseline window is wider than single-result baseline", () => {
    // Single-result baseline must be tighter — the median is noisier with one
    // sample, so we accept fewer matches as "close".
    expect(PERCENTILE_CLOSE_2).toBeGreaterThan(PERCENTILE_CLOSE_1);
  });

  it("FAR threshold sits beyond CLOSE for both baselines", () => {
    // Invariant: a result classified "close" cannot also be classified "far".
    expect(PERCENTILE_FAR_2).toBeGreaterThan(PERCENTILE_CLOSE_2);
    expect(PERCENTILE_FAR_1).toBeGreaterThan(PERCENTILE_CLOSE_1);
  });
});

describe("SOLO_CAT_RANK / RANK_TO_CAT", () => {
  it("Elite ranks before Masters A", () => {
    expect(SOLO_CAT_RANK["Elite Male"]).toBeLessThan(SOLO_CAT_RANK["Masters A Male"]!);
  });

  it("each Masters band increments rank by one", () => {
    expect(SOLO_CAT_RANK["Masters B Male"]! - SOLO_CAT_RANK["Masters A Male"]!).toBe(1);
    expect(SOLO_CAT_RANK["Masters F Male"]! - SOLO_CAT_RANK["Masters E Male"]!).toBe(1);
  });

  it("RANK_TO_CAT is the inverse of SOLO_CAT_RANK", () => {
    // RANK_TO_CAT[r] must round-trip to SOLO_CAT_RANK[name] === r.
    for (const [name, rank] of Object.entries(SOLO_CAT_RANK)) {
      const entry = RANK_TO_CAT.get(rank)!;
      const matchingName = name.endsWith(" Female") ? entry.female : entry.male;
      expect(matchingName).toBe(name);
    }
  });
});

describe("clampRank", () => {
  it("adjacent transitions allowed within a year", () => {
    // Rank N → N+1 should be reachable in 1 year (athlete aging over a category boundary).
    expect(clampRank(0, 1)).toBeGreaterThanOrEqual(1);
  });

  it("multi-band jumps require ~10 years per band", () => {
    // Elite (0) → Masters B (2) is a 2-band jump — requires ~10 years.
    // After 1 year, the maximum reachable rank is still 1, not 2.
    expect(clampRank(0, 1)).toBe(1);
    // After 11 years, a 2-band jump becomes reachable.
    expect(clampRank(0, 11)).toBeGreaterThanOrEqual(2);
  });

  it("never returns above the highest defined rank", () => {
    const maxRank = Math.max(...RANK_TO_CAT.keys());
    expect(clampRank(0, 1000)).toBe(maxRank);
  });
});

// ── Key derivation ───────────────────────────────────────────────────────────

describe("resolveTeamId", () => {
  it("returns 0 for solo team names", () => {
    // Solo placeholders ("individual", "no team", etc.) must always map to 0
    // so they never collide with real team IDs.
    expect(resolveTeamId("Individual", new Map([["sporting", 1]]))).toBe(0);
    expect(resolveTeamId("", new Map())).toBe(0);
  });

  it("returns the stored team ID for known teams", () => {
    expect(resolveTeamId("Sporting", new Map([["sporting", 7]]))).toBe(7);
  });

  it("returns 0 for unknown teams", () => {
    // Unknown teams get id 0 — they'll be assigned a fresh ID by buildTeamIds later.
    expect(resolveTeamId("UnknownTeam", new Map())).toBe(0);
  });
});

describe("athleteKey", () => {
  const store = new Map<string, number>([["sporting", 7]]);

  it("for team athletes uses `name|teamId` format", () => {
    expect(athleteKey("joao silva", "Sporting", store)).toBe("joao silva|7");
  });

  it("for solo athletes encodes category in the key", () => {
    // Solo profiles are partitioned by category to avoid merging
    // distinct athletes who happen to share a name.
    const key = athleteKey("joao silva", "Individual", store, "Masters A Male");
    expect(key).toContain("joao silva|solo:");
    expect(key).toContain("masters-a");
  });

  it("for solo athletes without category falls back to a sentinel suffix", () => {
    // Empty category is still legal — the bare suffix prevents accidental
    // collisions with non-solo keys.
    expect(athleteKey("joao silva", "Individual", store)).toBe("joao silva|");
  });
});

// ── Category logic ───────────────────────────────────────────────────────────

describe("categoriesCompatible", () => {
  it("identical categories are compatible", () => {
    expect(categoriesCompatible("Elite Male", "Elite Male")).toBe(true);
  });

  it("Open 19-34 is compatible with Elite and Masters A but not B+", () => {
    // Open 19-34 spans both Elite and Masters A age brackets — must merge
    // with either, but never with Masters B (different age tier).
    expect(categoriesCompatible("Open 19-34 Male", "Elite Male")).toBe(true);
    expect(categoriesCompatible("Open 19-34 Male", "Masters A Male")).toBe(true);
    expect(categoriesCompatible("Open 19-34 Male", "Masters B Male")).toBe(false);
  });

  it("Open 19-34 Female compatibility mirrors the male side", () => {
    expect(categoriesCompatible("Open 19-34 Female", "Elite Female")).toBe(true);
    expect(categoriesCompatible("Open 19-34 Female", "Masters B Female")).toBe(false);
  });

  it("gendered and gender-neutral variants of the same band are compatible", () => {
    // Some events store "Masters A" without gender suffix. We must not evict
    // those as outliers from a gendered profile.
    expect(categoriesCompatible("Masters A Male", "Masters A")).toBe(true);
    expect(categoriesCompatible("Masters B Female", "Masters B")).toBe(true);
  });

  it("different bands without a known relationship are incompatible", () => {
    expect(categoriesCompatible("Masters A Male", "Masters C Male")).toBe(false);
    expect(categoriesCompatible("Masters A Male", "Masters A Female")).toBe(true);
    // Gender-suffix stripping makes "Elite Male" and "Elite Female" share a
    // canonical form. Gender disambiguation happens outside this function
    // (athletes are partitioned by gender before category logic runs).
  });
});

describe("soloGroupCat", () => {
  it("returns the input unchanged", () => {
    // Elite, Open 19-34 and Masters A are distinct populations at events that
    // carry all three — soloGroupCat must NOT collapse them.
    expect(soloGroupCat("Elite Male")).toBe("Elite Male");
    expect(soloGroupCat("Open 19-34 Male")).toBe("Open 19-34 Male");
    expect(soloGroupCat("Masters A Male")).toBe("Masters A Male");
  });
});

describe("isValidCatTransition", () => {
  it("same category is always valid", () => {
    expect(isValidCatTransition("Masters A Male", "Masters A Male", 1)).toBe(true);
    expect(isValidCatTransition("Masters A Male", "Masters A Male", 50)).toBe(true);
  });

  it("Open 19-34 transitions defer to categoriesCompatible", () => {
    // Open 19-34 ↔ Elite/Masters A is valid regardless of yearDiff.
    expect(isValidCatTransition("Open 19-34 Male", "Elite Male", 1)).toBe(true);
    expect(isValidCatTransition("Open 19-34 Male", "Masters B Male", 1)).toBe(false);
  });

  it("athletes cannot move backwards through categories", () => {
    // A Masters C athlete becoming Masters A next year is impossible.
    expect(isValidCatTransition("Masters C Male", "Masters A Male", 5)).toBe(false);
  });

  it("adjacent forward transitions are allowed within 1 year", () => {
    // Masters A → Masters B in 1 year is realistic (athlete aging over the boundary).
    expect(isValidCatTransition("Masters A Male", "Masters B Male", 1)).toBe(true);
  });

  it("skipping bands requires ~10 years per skipped band", () => {
    // Elite → Masters B (skipping Masters A) requires at least 11 years.
    expect(isValidCatTransition("Elite Male", "Masters B Male", 5)).toBe(false);
    expect(isValidCatTransition("Elite Male", "Masters B Male", 11)).toBe(true);
  });

  it("unknown categories produce false", () => {
    expect(isValidCatTransition("Nonsense", "Elite Male", 1)).toBe(false);
  });
});

describe("entryCanonCatForYear", () => {
  it("returns the most-frequent category for the year", () => {
    // 2 × Masters B + 1 × Masters C → Masters B wins.
    const entry = mkEntry({
      results: [
        mkResult({ category: "Masters B Male" }),
        mkResult({ category: "Masters B Male", eventId: 2 }),
        mkResult({ category: "Masters C Male", eventId: 3 }),
      ],
    });
    expect(entryCanonCatForYear(entry, 2025)).toBe("Masters B Male");
  });

  it("ignores Unknown categorisations when picking the mode", () => {
    // "Unknown" is the canonicalisation fallback — never use it as the
    // representative category for a year.
    const entry = mkEntry({
      results: [
        mkResult({ category: "garbage_unrecognised_string", eventId: 1 }),
        mkResult({ category: "garbage_unrecognised_string", eventId: 2 }),
        mkResult({ category: "Masters B Male", eventId: 3 }),
      ],
    });
    expect(entryCanonCatForYear(entry, 2025)).toBe("Masters B Male");
  });

  it("returns null when no results match the year", () => {
    expect(entryCanonCatForYear(mkEntry(), 2025)).toBeNull();
  });
});

// ── Profile-level helpers ────────────────────────────────────────────────────

describe("profileDistanceSet", () => {
  it("collapses variant names to their canonical distance", () => {
    // "BIG DAY" maps to Granfondo via normalizeDistance — both belong to
    // the same set, not two separate entries.
    const set = profileDistanceSet([
      mkResult({ distance: "Granfondo" }),
      mkResult({ distance: "BIG DAY", eventId: 2 }),
      mkResult({ distance: "Mediofondo", eventId: 3 }),
    ]);
    expect(set.size).toBe(2);
    expect(set.has("Granfondo")).toBe(true);
    expect(set.has("Mediofondo")).toBe(true);
  });
});

describe("profileMedianPercentile", () => {
  it("returns the median genderPos/finisherCount across valid results", () => {
    // 3 results with percentiles 0.05, 0.10, 0.20 → median 0.10.
    const median = profileMedianPercentile([
      mkResult({ genderPos: 5, finisherCount: 100 }), // 0.05
      mkResult({ genderPos: 10, finisherCount: 100, eventId: 2 }), // 0.10
      mkResult({ genderPos: 20, finisherCount: 100, eventId: 3 }), // 0.20
    ]);
    expect(median).toBeCloseTo(0.1, 5);
  });

  it("excludes DNF/DNS and missing position data", () => {
    // Only valid result contributes — should equal exactly 0.10.
    const median = profileMedianPercentile([
      mkResult({ dnf: true, genderPos: 5, finisherCount: 100 }),
      mkResult({ dns: true, genderPos: 5, finisherCount: 100, eventId: 2 }),
      mkResult({ genderPos: 0, finisherCount: 100, eventId: 3 }),
      mkResult({ genderPos: 10, finisherCount: 100, eventId: 4 }),
    ]);
    expect(median).toBeCloseTo(0.1, 5);
  });

  it("returns null when no valid results remain", () => {
    expect(profileMedianPercentile([mkResult({ dnf: true })])).toBeNull();
  });
});

describe("profileCountry", () => {
  it("returns the most-frequent non-empty country", () => {
    expect(
      profileCountry([
        mkResult({ country: "PRT" }),
        mkResult({ country: "PRT", eventId: 2 }),
        mkResult({ country: "ESP", eventId: 3 }),
      ]),
    ).toBe("PRT");
  });

  it("ignores empty country strings", () => {
    expect(
      profileCountry([
        mkResult({ country: "" }),
        mkResult({ country: "FRA", eventId: 2 }),
      ]),
    ).toBe("FRA");
  });

  it("returns null when all results have empty country", () => {
    expect(profileCountry([mkResult({ country: "" })])).toBeNull();
  });
});

describe("setsIntersect", () => {
  it("returns true when sets share at least one element", () => {
    expect(setsIntersect(new Set([1, 2]), new Set([2, 3]))).toBe(true);
  });

  it("returns false for disjoint sets", () => {
    expect(setsIntersect(new Set([1, 2]), new Set([3, 4]))).toBe(false);
  });

  it("returns false when either set is empty", () => {
    expect(setsIntersect(new Set(), new Set([1, 2]))).toBe(false);
  });
});

// ── Entry mutation ───────────────────────────────────────────────────────────

describe("resultDedupeKey", () => {
  it("composes a unique-per-result string", () => {
    expect(resultDedupeKey(10, "Granfondo", "B123")).toBe("10|Granfondo|B123");
  });
});

describe("newEntry", () => {
  it("creates an empty entry with the given id/name", () => {
    const entry = newEntry(42, "Pedro", "pedro");
    expect(entry).toEqual({
      id: 42,
      name: "Pedro",
      nameLower: "pedro",
      teams: [],
      categories: {},
      results: [],
    });
  });
});

describe("addToTeamsAndCategories", () => {
  it("records the team key once", () => {
    const entry = mkEntry();
    addToTeamsAndCategories(entry, mkResult({ team: "Sporting" }));
    addToTeamsAndCategories(entry, mkResult({ team: "Sporting", eventId: 2 }));
    // Dedup invariant: a team that appears in N results still occupies one
    // slot in entry.teams — otherwise later passes double-count team affiliations.
    expect(entry.teams.length).toBe(1);
  });

  it("does not record solo team placeholders", () => {
    const entry = mkEntry();
    addToTeamsAndCategories(entry, mkResult({ team: "Individual" }));
    expect(entry.teams).toEqual([]);
  });

  it("records raw category strings per year", () => {
    const entry = mkEntry();
    addToTeamsAndCategories(entry, mkResult({ category: "Masters A Male", eventYear: 2024 }));
    addToTeamsAndCategories(
      entry,
      mkResult({ category: "Masters B Male", eventYear: 2025, eventId: 2 }),
    );
    expect(entry.categories["2024"]).toEqual(["Masters A Male"]);
    expect(entry.categories["2025"]).toEqual(["Masters B Male"]);
  });
});

describe("addResult", () => {
  it("appends a result that doesn't conflict with existing results", () => {
    const entry = mkEntry();
    addResult(entry, mkResult({ eventId: 1 }), false);
    addResult(entry, mkResult({ eventId: 2 }), false);
    expect(entry.results).toHaveLength(2);
  });

  it("when same event + compatible category, licenced result wins", () => {
    // Licenced results are authoritative — they must replace any earlier
    // unlicenced entry for the same event.
    const entry = mkEntry();
    addResult(entry, mkResult({ eventId: 1, category: "Masters A Male", team: "Old" }), false);
    addResult(entry, mkResult({ eventId: 1, category: "Masters A Male", team: "New" }), true);
    expect(entry.results).toHaveLength(1);
    expect(entry.results[0]!.team).toBe("New");
  });

  it("when same event + incompatible category, drops the incoming silently", () => {
    // Same athlete cannot race the same event twice in two different categories.
    // When neither is known for the year, keep the first one.
    const entry = mkEntry();
    addResult(entry, mkResult({ eventId: 1, category: "Masters A Male" }), false);
    addResult(entry, mkResult({ eventId: 1, category: "Masters C Male" }), false);
    expect(entry.results).toHaveLength(1);
    expect(entry.results[0]!.category).toBe("Masters A Male");
  });
});

describe("deriveCanonicalTeam", () => {
  it("sets canonicalTeam to the team of the most recent non-solo result", () => {
    // "Most recent" is determined by eventDate. Solo entries are skipped so
    // a recent solo race doesn't displace a real team affiliation.
    const entry = mkEntry({
      results: [
        mkResult({ team: "Sporting", eventDate: "2024-01-01" }),
        mkResult({ team: "Benfica", eventDate: "2025-05-01", eventId: 2 }),
        mkResult({ team: "Individual", eventDate: "2025-06-01", eventId: 3 }),
      ],
    });
    deriveCanonicalTeam(entry);
    expect(entry.canonicalTeam).toBe("Benfica");
  });

  it("leaves canonicalTeam unset when the profile has only solo results", () => {
    const entry = mkEntry({
      results: [mkResult({ team: "Individual" })],
    });
    deriveCanonicalTeam(entry);
    expect(entry.canonicalTeam).toBeUndefined();
  });
});

// ── ID manager ───────────────────────────────────────────────────────────────

describe("makeIdManager", () => {
  it("returns existing IDs unchanged", () => {
    const ids = makeIdManager(new Map([["joao|1", 42]]));
    expect(ids.get("joao|1")).toBe(42);
  });

  it("mints fresh IDs starting one past the max existing", () => {
    const ids = makeIdManager(new Map([["a|1", 10], ["b|1", 20]]));
    expect(ids.get("new|1")).toBe(21);
  });

  it("returns the same minted ID for repeated calls with the same key", () => {
    // ID stability: a key minted once must never get a new ID on re-query
    // within the same pipeline run.
    const ids = makeIdManager(new Map());
    const first = ids.get("new|1");
    const second = ids.get("new|1");
    expect(first).toBe(second);
  });

  it("getMinted exposes only newly minted entries, not seeded ones", () => {
    const ids = makeIdManager(new Map([["seeded|1", 5]]));
    ids.get("seeded|1");
    ids.get("fresh|1");
    expect(ids.getMinted().has("seeded|1")).toBe(false);
    expect(ids.getMinted().has("fresh|1")).toBe(true);
  });
});

describe("buildNameLookup", () => {
  it("groups keys by nameLower", () => {
    const index = new Map<string, AthleteEntry>([
      ["joao|1", mkEntry({ id: 1, nameLower: "joao" })],
      ["joao|2", mkEntry({ id: 2, nameLower: "joao" })],
      ["maria|1", mkEntry({ id: 3, nameLower: "maria" })],
    ]);
    const lookup = buildNameLookup(index);
    expect(lookup.get("joao")).toEqual(["joao|1", "joao|2"]);
    expect(lookup.get("maria")).toEqual(["maria|1"]);
  });
});

// ── Licence conflict ─────────────────────────────────────────────────────────

describe("licencesConflict", () => {
  const licences = new Map<string, Set<string>>();
  licences.set("a|1", new Set(["L1", "L2"]));
  licences.set("b|1", new Set(["L3"]));
  licences.set("c|1", new Set(["L1"]));
  licences.set("d|1", new Set());

  it("returns true when both have licences and they are disjoint", () => {
    // Disjoint licence sets = definitively different people. Pipeline passes
    // must NOT merge these.
    expect(licencesConflict("a|1", "b|1", licences)).toBe(true);
  });

  it("returns false when licence sets share at least one entry", () => {
    expect(licencesConflict("a|1", "c|1", licences)).toBe(false);
  });

  it("returns false when either entry has no licences", () => {
    // Missing licence info means we cannot rule out the merge.
    expect(licencesConflict("a|1", "d|1", licences)).toBe(false);
    expect(licencesConflict("d|1", "a|1", licences)).toBe(false);
  });

  it("returns false when neither entry is tracked", () => {
    expect(licencesConflict("unknown1|1", "unknown2|1", licences)).toBe(false);
  });
});

describe("mergeLicenceSets", () => {
  it("unions absorbed licences into the surviving key and deletes absorbed entry", () => {
    const licences = new Map<string, Set<string>>();
    licences.set("survivor", new Set(["L1"]));
    licences.set("absorbed", new Set(["L2"]));
    mergeLicenceSets("survivor", "absorbed", licences);
    expect(licences.get("survivor")).toEqual(new Set(["L1", "L2"]));
    expect(licences.has("absorbed")).toBe(false);
  });

  it("creates the surviving entry when only the absorbed has licences", () => {
    const licences = new Map<string, Set<string>>();
    licences.set("absorbed", new Set(["L1"]));
    mergeLicenceSets("survivor", "absorbed", licences);
    expect(licences.get("survivor")).toEqual(new Set(["L1"]));
  });

  it("no-op when absorbed has no licences", () => {
    const licences = new Map<string, Set<string>>();
    licences.set("survivor", new Set(["L1"]));
    licences.set("absorbed", new Set());
    mergeLicenceSets("survivor", "absorbed", licences);
    expect(licences.get("survivor")).toEqual(new Set(["L1"]));
    // Empty absorbed set is left in place — it carries no information to merge.
    expect(licences.has("absorbed")).toBe(true);
  });
});
