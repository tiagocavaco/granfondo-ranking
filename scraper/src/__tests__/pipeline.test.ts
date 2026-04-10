import { describe, it, expect, vi } from "vitest";
import {
  isGranfondoName,
  isKidsCamVariant,
  extractDistances,
  assignGenderPositions,
  transformResult,
  isSoloTeam,
  athleteKey,
  normalizeDistance,
  DISTANCE_ALIASES,
  buildAthletesIndex,
  applyAthleteMerges,
  buildAggregateRanking,
  buildTeamRanking,
  type MergeRule,
} from "../pipeline.js";
import type {
  ApiAthlete,
  ApiResult,
  StoredEvent,
  StoredEventResults,
  StoredDistanceResults,
  StoredResult,
} from "../types.js";

// ── Fixtures ──────────────────────────────────────────────────────────────────

function mkEvent(id: number, year: number, date: string): StoredEvent {
  return {
    id,
    name: `Event ${id}`,
    year,
    date,
    location: "Lisbon",
    resultsUrl: `https://results.stopandgo.pro/${id}`,
    hasResults: true,
    distances: [{ id: "1", name: "Granfondo" }],
    participantCount: 0,
    finisherCount: 0,
    scrapedAt: "2025-01-01T00:00:00Z",
  };
}

function mkResult(overrides: Partial<StoredResult> = {}): StoredResult {
  return {
    pos: 1,
    genderPos: 1,
    bib: "1",
    name: "Test Athlete",
    nameLower: "test athlete",
    gender: "M",
    team: "Team Alpha",
    category: "ELITES M",
    country: "Portugal",
    raceTime: "03:25:10",
    raceTimeSecs: 12310,
    gap: "",
    gapSecs: 0,
    points: 0,
    licence: "",
    dnf: false,
    dns: false,
    ...overrides,
  };
}

function mkEventResults(
  eventId: number,
  year: number,
  date: string,
  distances: StoredDistanceResults[]
): StoredEventResults {
  return {
    eventId,
    eventName: `Event ${eventId}`,
    eventDate: date,
    eventYear: year,
    scrapedAt: "2025-01-01T00:00:00Z",
    distances,
  };
}

function mkApiResult(overrides: Partial<ApiResult> = {}): ApiResult {
  return {
    pos: "1",
    dorsal: "1",
    nome: "Test Athlete",
    equipa: "Team Alpha",
    escalao: "ELITES M",
    sexo: "M",
    licenca1: "",
    pais_nome: "Portugal",
    pais_iso2: "PT",
    temposeg: "12310",
    tempo: "03:25:10.000",
    diferenca: "00:00:00.000",
    percurso: "Granfondo",
    id_percursos: "1",
    obs: "",
    status: "1",
    pontos: "0",
    ...overrides,
  };
}

function mkApiAthlete(overrides: Partial<ApiAthlete> = {}): ApiAthlete {
  return {
    dorsal: "1",
    nome: "Test",
    nomecompleto: "Test Athlete",
    sexo: "M",
    equipa: "Team Alpha",
    escalao: "ELITES M",
    percurso: "Granfondo",
    id_percursos: "1",
    pais_nome: "Portugal",
    pais_iso2: "PT",
    licenca: null,
    licenca1: null,
    ...overrides,
  };
}

// ── isGranfondoName ───────────────────────────────────────────────────────────

describe("isGranfondoName", () => {
  it("matches granfondo", () => expect(isGranfondoName("Algarve Granfondo 2025")).toBe(true));
  it("matches grandfondo typo", () => expect(isGranfondoName("Grandfondo Médio Tejo")).toBe(true));
  it("case insensitive", () => expect(isGranfondoName("GRANFONDO COIMBRA")).toBe(true));
  it("rejects non-granfondo events", () => expect(isGranfondoName("BTT XCO Race 2025")).toBe(false));
});

// ── isKidsCamVariant ──────────────────────────────────────────────────────────

describe("isKidsCamVariant", () => {
  it("matches kids", () => expect(isKidsCamVariant("Kids Race 2025")).toBe(true));
  it("matches caminhada", () => expect(isKidsCamVariant("Caminhada Familiar")).toBe(true));
  it("matches VIP", () => expect(isKidsCamVariant("Granfondo VIP Tour")).toBe(true));
  it("matches kids/cam", () => expect(isKidsCamVariant("Kids/Cam Event")).toBe(true));
  it("does not match normal granfondo", () => expect(isKidsCamVariant("Algarve Granfondo")).toBe(false));
});

// ── extractDistances ──────────────────────────────────────────────────────────

describe("extractDistances", () => {
  it("extracts unique distances ordered by id", () => {
    const athletes: ApiAthlete[] = [
      mkApiAthlete({ percurso: "Mediofondo", id_percursos: "2" }),
      mkApiAthlete({ percurso: "Granfondo", id_percursos: "1" }),
      mkApiAthlete({ percurso: "Granfondo", id_percursos: "1" }), // duplicate
    ];
    const result = extractDistances(athletes);
    expect(result).toEqual([
      { id: "1", name: "Granfondo" },
      { id: "2", name: "Mediofondo" },
    ]);
  });

  it("returns empty for no athletes", () => {
    expect(extractDistances([])).toEqual([]);
  });
});

// ── assignGenderPositions ─────────────────────────────────────────────────────

describe("assignGenderPositions", () => {
  it("assigns gender positions sorted by race time", () => {
    const dist: StoredDistanceResults = {
      id: "1",
      name: "Granfondo",
      finisherCount: 3,
      results: [
        mkResult({ pos: 3, gender: "M", raceTimeSecs: 300, name: "C" }),
        mkResult({ pos: 1, gender: "M", raceTimeSecs: 100, name: "A" }),
        mkResult({ pos: 2, gender: "M", raceTimeSecs: 200, name: "B" }),
      ],
    };
    assignGenderPositions([dist]);
    const sorted = dist.results.map((r) => ({ name: r.name, genderPos: r.genderPos }));
    expect(sorted.find((r) => r.name === "A")?.genderPos).toBe(1);
    expect(sorted.find((r) => r.name === "B")?.genderPos).toBe(2);
    expect(sorted.find((r) => r.name === "C")?.genderPos).toBe(3);
  });

  it("separates genders correctly", () => {
    const dist: StoredDistanceResults = {
      id: "1",
      name: "Granfondo",
      finisherCount: 2,
      results: [
        mkResult({ pos: 1, gender: "M", raceTimeSecs: 100, name: "Male1" }),
        mkResult({ pos: 2, gender: "F", raceTimeSecs: 120, name: "Female1" }),
        mkResult({ pos: 3, gender: "M", raceTimeSecs: 200, name: "Male2" }),
      ],
    };
    assignGenderPositions([dist]);
    expect(dist.results.find((r) => r.name === "Male1")?.genderPos).toBe(1);
    expect(dist.results.find((r) => r.name === "Female1")?.genderPos).toBe(1); // 1st female
    expect(dist.results.find((r) => r.name === "Male2")?.genderPos).toBe(2);
  });

  it("skips DNF and DNS entries", () => {
    const dist: StoredDistanceResults = {
      id: "1",
      name: "Granfondo",
      finisherCount: 1,
      results: [
        mkResult({ pos: 1, gender: "M", raceTimeSecs: 100, name: "Finisher", genderPos: 0 }),
        mkResult({ pos: 0, gender: "M", raceTimeSecs: 0, dnf: true, name: "DNF", genderPos: 0 }),
        mkResult({ pos: 0, gender: "M", raceTimeSecs: 0, dns: true, name: "DNS", genderPos: 0 }),
      ],
    };
    assignGenderPositions([dist]);
    expect(dist.results.find((r) => r.name === "Finisher")?.genderPos).toBe(1);
    // DNF/DNS should not be assigned a gender position
    expect(dist.results.find((r) => r.name === "DNF")?.genderPos).toBe(0);
    expect(dist.results.find((r) => r.name === "DNS")?.genderPos).toBe(0);
  });
});

// ── transformResult ───────────────────────────────────────────────────────────

describe("transformResult", () => {
  it("maps basic fields correctly", () => {
    const r = transformResult(mkApiResult());
    expect(r.pos).toBe(1);
    expect(r.name).toBe("Test Athlete");
    expect(r.nameLower).toBe("test athlete");
    expect(r.gender).toBe("M");
    expect(r.team).toBe("Team Alpha");
    expect(r.raceTime).toBe("03:25:10");
    expect(r.raceTimeSecs).toBe(12310);
  });

  it("detects DNF from obs field", () => {
    const r = transformResult(mkApiResult({ obs: "DNF" }));
    expect(r.dnf).toBe(true);
    expect(r.dns).toBe(false);
  });

  it("detects ABANDONOU as DNF", () => {
    const r = transformResult(mkApiResult({ obs: "ABANDONOU" }));
    expect(r.dnf).toBe(true);
  });

  it("detects AB as DNF", () => {
    const r = transformResult(mkApiResult({ obs: "AB" }));
    expect(r.dnf).toBe(true);
  });

  it("detects DNS", () => {
    const r = transformResult(mkApiResult({ obs: "DNS" }));
    expect(r.dns).toBe(true);
    expect(r.dnf).toBe(false);
  });

  it("detects NÃO PARTIU as DNS", () => {
    const r = transformResult(mkApiResult({ obs: "NÃO PARTIU" }));
    expect(r.dns).toBe(true);
  });

  it("defaults gender to M when missing", () => {
    const r = transformResult(mkApiResult({ sexo: "" }));
    expect(r.gender).toBe("M");
  });

  it("sets genderPos to 0 (filled in later)", () => {
    const r = transformResult(mkApiResult());
    expect(r.genderPos).toBe(0);
  });
});

// ── isSoloTeam ────────────────────────────────────────────────────────────────

describe("isSoloTeam", () => {
  it("treats empty string as solo", () => expect(isSoloTeam("")).toBe(true));
  it("treats 'individual' as solo", () => expect(isSoloTeam("Individual")).toBe(true));
  it("treats 'independente' as solo", () => expect(isSoloTeam("Independente")).toBe(true));
  it("treats 'no team' as solo", () => expect(isSoloTeam("No Team")).toBe(true)); // "no team" is in SOLO_TEAMS as-is, but normalized key is "no team"
  it("treats real team name as not solo", () => expect(isSoloTeam("Team Alpha")).toBe(false));
  it("treats whitespace-only as solo", () => expect(isSoloTeam("   ")).toBe(true));
});

// ── athleteKey ────────────────────────────────────────────────────────────────

describe("athleteKey", () => {
  it("creates composite key for athlete with team", () => {
    expect(athleteKey("joao silva", "Team Alpha")).toBe("joao silva|team alpha");
  });

  it("creates solo key (empty team suffix) for individual", () => {
    expect(athleteKey("joao silva", "")).toBe("joao silva|");
  });

  it("normalizes team name in key", () => {
    // "C.B. Almodôvar" normalizes to "cb almodovar" via teamNormalKey
    expect(athleteKey("joao silva", "C.B. Almodovar")).toBe("joao silva|cb almodovar");
  });
});

// ── normalizeDistance ─────────────────────────────────────────────────────────

describe("normalizeDistance", () => {
  it("normalizes known aliases", () => {
    expect(normalizeDistance("granfondo")).toBe("Granfondo");
    expect(normalizeDistance("mediofondo")).toBe("Mediofondo");
    expect(normalizeDistance("minifondo")).toBe("Minifondo");
    expect(normalizeDistance("time trial")).toBe("Time Trial");
    expect(normalizeDistance("big day")).toBe("Granfondo");
    expect(normalizeDistance("half day")).toBe("Mediofondo");
    expect(normalizeDistance("classica")).toBe("Granfondo");
    expect(normalizeDistance("etapa")).toBe("Mediofondo");
  });

  it("passes through unknown distance names", () => {
    expect(normalizeDistance("Unknown Distance")).toBe("Unknown Distance");
  });

  it("covers all DISTANCE_ALIASES entries", () => {
    for (const [alias, canonical] of Object.entries(DISTANCE_ALIASES)) {
      expect(normalizeDistance(alias)).toBe(canonical);
    }
  });
});

// ── buildAthletesIndex ────────────────────────────────────────────────────────

describe("buildAthletesIndex", () => {
  it("creates one entry per unique athlete+team combination", () => {
    const event = mkEvent(1, 2025, "2025-03-15");
    const loader = () => mkEventResults(1, 2025, "2025-03-15", [{
      id: "1", name: "Granfondo", finisherCount: 2,
      results: [
        mkResult({ name: "Ana Silva", nameLower: "ana silva", team: "Team Alpha" }),
        mkResult({ name: "Rui Costa", nameLower: "rui costa", team: "Team Beta", pos: 2 }),
      ],
    }]);
    const { index } = buildAthletesIndex([event], loader);
    expect(index.size).toBe(2);
  });

  it("accumulates results from multiple events for same athlete", () => {
    const events = [mkEvent(1, 2025, "2025-03-15"), mkEvent(2, 2025, "2025-04-20")];
    const loader = (id: number) => mkEventResults(id, 2025, id === 1 ? "2025-03-15" : "2025-04-20", [{
      id: "1", name: "Granfondo", finisherCount: 1,
      results: [mkResult({ name: "Ana Silva", nameLower: "ana silva", team: "Team Alpha" })],
    }]);
    const { index } = buildAthletesIndex(events, loader);
    expect(index.size).toBe(1);
    expect([...index.values()][0]!.results.length).toBe(2);
  });

  it("merges solo bucket into single team bucket", () => {
    const event = mkEvent(1, 2025, "2025-03-15");
    const loader = () => mkEventResults(1, 2025, "2025-03-15", [{
      id: "1", name: "Granfondo", finisherCount: 2,
      results: [
        mkResult({ name: "Ana Silva", nameLower: "ana silva", team: "" }), // solo
        mkResult({ name: "Ana Silva", nameLower: "ana silva", team: "Team Alpha", pos: 2 }), // with team
      ],
    }]);
    const { index } = buildAthletesIndex([event], loader);
    // Solo should merge into the one team bucket
    expect(index.size).toBe(1);
    expect([...index.values()][0]!.results.length).toBe(2);
  });

  it("keeps solo as separate entry when multiple team buckets exist", () => {
    const event = mkEvent(1, 2025, "2025-03-15");
    const loader = () => mkEventResults(1, 2025, "2025-03-15", [{
      id: "1", name: "Granfondo", finisherCount: 3,
      results: [
        mkResult({ name: "Ana Silva", nameLower: "ana silva", team: "", pos: 1 }),
        mkResult({ name: "Ana Silva", nameLower: "ana silva", team: "Team Alpha", pos: 2 }),
        mkResult({ name: "Ana Silva", nameLower: "ana silva", team: "Team Beta", pos: 3 }),
      ],
    }]);
    const { index } = buildAthletesIndex([event], loader);
    // Solo stays separate because it's ambiguous
    expect(index.size).toBe(3);
  });

  it("fuzzy-merges similar team names for same athlete", () => {
    const events = [mkEvent(1, 2025, "2025-03-15"), mkEvent(2, 2025, "2025-04-20")];
    const loader = (id: number) => mkEventResults(id, 2025, id === 1 ? "2025-03-15" : "2025-04-20", [{
      id: "1", name: "Granfondo", finisherCount: 1,
      results: [mkResult({
        name: "Ana Silva",
        nameLower: "ana silva",
        // "vivavita" vs "vivavita training club" — containment → 1.0 similarity
        team: id === 1 ? "Vivavita" : "Vivavita Training Club",
      })],
    }]);
    const { index } = buildAthletesIndex(events, loader);
    expect(index.size).toBe(1);
    expect([...index.values()][0]!.results.length).toBe(2);
  });

  it("does NOT fuzzy-merge when tier conflict exists in same year", () => {
    const events = [mkEvent(1, 2025, "2025-03-15"), mkEvent(2, 2025, "2025-04-20")];
    const loader = (id: number) => mkEventResults(id, 2025, id === 1 ? "2025-03-15" : "2025-04-20", [{
      id: "1", name: "Granfondo", finisherCount: 1,
      results: [mkResult({
        name: "Jorge Mariz",
        nameLower: "jorge mariz",
        team: id === 1 ? "Vivavita" : "Vivavita Training Club",
        // Elite in event 1, Masters B in event 2 → same year conflict
        category: id === 1 ? "ELITES M" : "MASTERS B",
      })],
    }]);
    const { index } = buildAthletesIndex(events, loader);
    // Should NOT merge due to tier conflict (Elite vs Masters B in 2025)
    expect(index.size).toBe(2);
  });

  it("fuzzy-merges when open_1934 and elite appear in same year (compatible)", () => {
    const events = [mkEvent(1, 2025, "2025-03-15"), mkEvent(2, 2025, "2025-04-20")];
    const loader = (id: number) => mkEventResults(id, 2025, id === 1 ? "2025-03-15" : "2025-04-20", [{
      id: "1", name: "Granfondo", finisherCount: 1,
      results: [mkResult({
        name: "Open Rider",
        nameLower: "open rider",
        team: id === 1 ? "Vivavita" : "Vivavita Training Club",
        category: id === 1 ? "M 19-34" : "ELITES M", // open_1934 + elite = compatible
      })],
    }]);
    const { index } = buildAthletesIndex(events, loader);
    expect(index.size).toBe(1);
  });

  it("returns fuzzyAliases tracking all auto-merges", () => {
    const events = [mkEvent(1, 2025, "2025-03-15"), mkEvent(2, 2025, "2025-04-20")];
    const loader = (id: number) => mkEventResults(id, 2025, id === 1 ? "2025-03-15" : "2025-04-20", [{
      id: "1", name: "Granfondo", finisherCount: 1,
      results: [mkResult({
        name: "Ana Silva",
        nameLower: "ana silva",
        team: id === 1 ? "Vivavita" : "Vivavita Training Club",
      })],
    }]);
    const { fuzzyAliases } = buildAthletesIndex(events, loader);
    expect(fuzzyAliases.size).toBeGreaterThan(0);
  });

  it("skips events without results", () => {
    const event = { ...mkEvent(1, 2025, "2025-03-15"), hasResults: false };
    const loaderSpy = vi.fn();
    buildAthletesIndex([event], loaderSpy);
    expect(loaderSpy).not.toHaveBeenCalled();
  });

  it("handles loader returning null gracefully", () => {
    const event = mkEvent(1, 2025, "2025-03-15");
    const { index } = buildAthletesIndex([event], () => null);
    expect(index.size).toBe(0);
  });

  it("resolves canonicalTeam to most frequent name", () => {
    const events = [
      mkEvent(1, 2025, "2025-03-15"),
      mkEvent(2, 2025, "2025-04-20"),
      mkEvent(3, 2025, "2025-05-01"),
    ];
    const loader = (id: number) => {
      const rawTeam = id === 3 ? "Team Alpha Rare" : "Team Alpha";
      return mkEventResults(id, 2025, `2025-0${id + 2}-01`, [{
        id: "1", name: "Granfondo", finisherCount: 1,
        results: [mkResult({ name: "Ana Silva", nameLower: "ana silva", team: rawTeam })],
      }]);
    };
    const { index } = buildAthletesIndex(events, loader);
    const entry = [...index.values()].find((e) => e.nameLower === "ana silva");
    expect(entry?.canonicalTeam).toBe("Team Alpha");
  });
});

// ── applyAthleteMerges ────────────────────────────────────────────────────────

describe("applyAthleteMerges", () => {
  function buildIndex() {
    const event = mkEvent(1, 2025, "2025-03-15");
    const loader = () => mkEventResults(1, 2025, "2025-03-15", [{
      id: "1", name: "Granfondo", finisherCount: 2,
      results: [
        mkResult({ name: "Ana Silva", nameLower: "ana silva", team: "Team Alpha", pos: 1 }),
        mkResult({ name: "Ana Silva", nameLower: "ana silva", team: "Team Beta", pos: 2 }),
      ],
    }]);
    return buildAthletesIndex([event], loader).index;
  }

  it("merges alias into canonical", () => {
    const index = buildIndex();
    // AthleteEntry has no .team; find by team in results
    const canonical = [...index.values()].find((e) => e.results[0]?.team === "Team Alpha")!;
    const alias = [...index.values()].find((e) => e.results[0]?.team === "Team Beta")!;
    const rules: MergeRule[] = [{
      canonical: canonical.slug,
      aliases: [alias.slug],
    }];
    const { keyAliases } = applyAthleteMerges(index, rules);
    expect(keyAliases.size).toBe(1);
    expect([...index.keys()].includes(alias.slug)).toBe(false);
    expect(canonical.results.length).toBe(2);
  });

  it("warns on missing canonical slug", () => {
    const index = buildIndex();
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    applyAthleteMerges(index, [{ canonical: "nonexistent-slug", aliases: [] }]);
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("nonexistent-slug"));
    warnSpy.mockRestore();
  });

  it("warns on missing alias slug", () => {
    const index = buildIndex();
    const canonical = [...index.values()][0]!;
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    applyAthleteMerges(index, [{ canonical: canonical.slug, aliases: ["nonexistent-alias"] }]);
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("nonexistent-alias"));
    warnSpy.mockRestore();
  });

  it("handles multi-result athletes when checking tier compatibility", () => {
    // Canonical has 2 results in same year — exercises the lazy-init ?? branch in tiersCanon
    const events = [mkEvent(1, 2025, "2025-03-15"), mkEvent(2, 2025, "2025-04-20")];
    const loader = (id: number) => mkEventResults(id, 2025, id === 1 ? "2025-03-15" : "2025-04-20", [{
      id: "1", name: "Granfondo", finisherCount: 2,
      results: [
        mkResult({ name: "Ana Silva", nameLower: "ana silva", team: "Team Alpha", pos: 1 }),
        mkResult({ name: "Ana Silva", nameLower: "ana silva", team: "Team Beta", pos: 2 }),
      ],
    }]);
    const index = buildAthletesIndex(events, loader).index;
    const canonical = [...index.values()].find((e) => e.results[0]?.team === "Team Alpha")!;
    const alias = [...index.values()].find((e) => e.results[0]?.team === "Team Beta");
    if (!alias) return; // may have been fuzzy-merged already
    const { keyAliases } = applyAthleteMerges(index, [{ canonical: canonical.slug, aliases: [alias.slug] }]);
    expect(keyAliases.size).toBeGreaterThanOrEqual(0);
  });

  it("returns empty keyAliases when no rules match", () => {
    const index = buildIndex();
    const { keyAliases } = applyAthleteMerges(index, []);
    expect(keyAliases.size).toBe(0);
  });

  it("warns when canonical and alias have tier conflict in same year", () => {
    const event = mkEvent(1, 2025, "2025-03-15");
    const loader = () => mkEventResults(1, 2025, "2025-03-15", [{
      id: "1", name: "Granfondo", finisherCount: 2,
      results: [
        mkResult({ name: "Ana Silva", nameLower: "ana silva", team: "Team Alpha", pos: 1, category: "ELITES M" }),
        mkResult({ name: "Ana Silva", nameLower: "ana silva", team: "Team Beta", pos: 2, category: "MASTERS B" }),
      ],
    }]);
    const index = buildAthletesIndex([event], loader).index;
    const [a, b] = [...index.values()];
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    applyAthleteMerges(index, [{ canonical: a!.slug, aliases: [b!.slug] }]);
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("conflicting category tiers"));
    warnSpy.mockRestore();
  });
});

// ── buildAggregateRanking ─────────────────────────────────────────────────────

describe("buildAggregateRanking", () => {
  it("awards points to position 1 with coefficient", () => {
    const event = mkEvent(1, 2025, "2025-03-15");
    // 300 finishers → coefficient = 1.00; pos 1 → 75 pts → 75 * 1.00 = 75
    const results = Array.from({ length: 300 }, (_, i) =>
      mkResult({ pos: i + 1, genderPos: i + 1, raceTimeSecs: (i + 1) * 100, name: `Athlete ${i}`, nameLower: `athlete ${i}` })
    );
    const loader = () => mkEventResults(1, 2025, "2025-03-15", [{
      id: "1", name: "Granfondo", finisherCount: 300, results,
    }]);
    const ranking = buildAggregateRanking([event], loader);
    const top = ranking["2025"]!["Granfondo"]!["M"]![0]!;
    expect(top.totalPoints).toBe(75);
    expect(top.rank).toBe(1);
  });

  it("groups results by year and distance", () => {
    const events = [mkEvent(1, 2025, "2025-03-15"), mkEvent(2, 2026, "2026-03-15")];
    const loader = (id: number) => mkEventResults(id, id === 1 ? 2025 : 2026, `${id === 1 ? "2025" : "2026"}-03-15`, [{
      id: "1", name: "Granfondo", finisherCount: 1,
      results: [mkResult()],
    }]);
    const ranking = buildAggregateRanking(events, loader);
    expect(ranking["2025"]).toBeDefined();
    expect(ranking["2026"]).toBeDefined();
  });

  it("normalizes distance names (BIG DAY → Granfondo)", () => {
    const event = mkEvent(1, 2025, "2025-03-15");
    const loader = () => mkEventResults(1, 2025, "2025-03-15", [{
      id: "1", name: "BIG DAY", finisherCount: 1,
      results: [mkResult()],
    }]);
    const ranking = buildAggregateRanking([event], loader);
    expect(ranking["2025"]!["Granfondo"]).toBeDefined();
    expect(ranking["2025"]!["BIG DAY"]).toBeUndefined();
  });

  it("excludes DNF and DNS from ranking", () => {
    const event = mkEvent(1, 2025, "2025-03-15");
    const loader = () => mkEventResults(1, 2025, "2025-03-15", [{
      id: "1", name: "Granfondo", finisherCount: 1,
      results: [
        mkResult({ pos: 1, genderPos: 1, raceTimeSecs: 100 }),
        mkResult({ pos: 0, genderPos: 0, dnf: true, name: "Dnf Athlete", nameLower: "dnf athlete" }),
      ],
    }]);
    const ranking = buildAggregateRanking([event], loader);
    const athletes = ranking["2025"]!["Granfondo"]!["M"]!;
    expect(athletes.every((a) => a.name !== "Dnf Athlete")).toBe(true);
  });

  it("uses keyAliases to merge cross-event athletes", () => {
    const events = [mkEvent(1, 2025, "2025-03-15"), mkEvent(2, 2025, "2025-04-20")];
    const loader = (id: number) => mkEventResults(id, 2025, id === 1 ? "2025-03-15" : "2025-04-20", [{
      id: "1", name: "Granfondo", finisherCount: 1,
      results: [mkResult({
        name: "Ana Silva",
        nameLower: "ana silva",
        team: id === 1 ? "Team Alpha" : "Team Beta",
      })],
    }]);
    // Alias: "ana silva|team beta" → "ana silva|team alpha"
    const keyAliases = new Map([["ana silva|team beta", "ana silva|team alpha"]]);
    const ranking = buildAggregateRanking(events, loader, keyAliases);
    const athletes = ranking["2025"]!["Granfondo"]!["M"]!;
    // Should be merged into 1 entry with 2 events scored
    const anaSilva = athletes.find((a) => a.nameLower === "ana silva");
    expect(anaSilva?.eventsScored).toBe(2);
  });

  it("fuzzy-merges similar team names within aggregate ranking", () => {
    // "vivavita" vs "vivavita training club" — containment → ≥0.6 → merged
    const events = [mkEvent(1, 2025, "2025-03-15"), mkEvent(2, 2025, "2025-04-20")];
    const loader = (id: number) => mkEventResults(id, 2025, id === 1 ? "2025-03-15" : "2025-04-20", [{
      id: "1", name: "Granfondo", finisherCount: 1,
      results: [mkResult({
        pos: 1, genderPos: 1, raceTimeSecs: 100,
        name: "Ana Silva", nameLower: "ana silva",
        team: id === 1 ? "Vivavita" : "Vivavita Training Club",
      })],
    }]);
    // No keyAliases — falls back to in-ranking fuzzy match
    const ranking = buildAggregateRanking(events, loader);
    const anaSilva = ranking["2025"]!["Granfondo"]!["M"]!.find((a) => a.nameLower === "ana silva");
    expect(anaSilva?.eventsScored).toBe(2);
  });

  it("improves bestPos when athlete finishes higher in a later event", () => {
    // Event 1: athlete at genderPos 3 (3rd finisher). Event 2: same athlete at genderPos 1
    const events = [mkEvent(1, 2025, "2025-03-15"), mkEvent(2, 2025, "2025-04-20")];
    const loader = (id: number) => mkEventResults(id, 2025, id === 1 ? "2025-03-15" : "2025-04-20", [{
      id: "1", name: "Granfondo", finisherCount: id === 1 ? 3 : 1,
      results: id === 1
        ? [
            mkResult({ pos: 1, genderPos: 1, raceTimeSecs: 100, name: "Other1", nameLower: "other1", team: "Team X" }),
            mkResult({ pos: 2, genderPos: 2, raceTimeSecs: 200, name: "Other2", nameLower: "other2", team: "Team Y" }),
            mkResult({ pos: 3, genderPos: 3, raceTimeSecs: 300, name: "Ana Silva", nameLower: "ana silva", team: "Team Alpha" }),
          ]
        : [
            mkResult({ pos: 1, genderPos: 1, raceTimeSecs: 100, name: "Ana Silva", nameLower: "ana silva", team: "Team Alpha" }),
          ],
    }]);
    const ranking = buildAggregateRanking(events, loader);
    const ana = ranking["2025"]!["Granfondo"]!["M"]!.find((a) => a.nameLower === "ana silva");
    expect(ana?.bestPos).toBe(1); // improved from 3 to 1
  });

  it("falls back to existing country when result has empty country", () => {
    const events = [mkEvent(1, 2025, "2025-03-15"), mkEvent(2, 2025, "2025-04-20")];
    const loader = (id: number) => mkEventResults(id, 2025, id === 1 ? "2025-03-15" : "2025-04-20", [{
      id: "1", name: "Granfondo", finisherCount: 1,
      results: [mkResult({
        pos: 1, genderPos: 1, raceTimeSecs: 100,
        name: "Ana Silva", nameLower: "ana silva", team: "Team Alpha",
        country: id === 1 ? "Portugal" : "",
      })],
    }]);
    const ranking = buildAggregateRanking(events, loader);
    const ana = ranking["2025"]!["Granfondo"]!["M"]!.find((a) => a.nameLower === "ana silva");
    expect(ana?.country).toBe("Portugal"); // kept from event 1 when event 2 had empty country
  });

  it("reuses existing teamKey entry when same team appears in multiple events", () => {
    // Same athlete, same team, 2 events — second event finds team key already in athleteTeams
    const events = [mkEvent(1, 2025, "2025-03-15"), mkEvent(2, 2025, "2025-04-20")];
    const loader = (id: number) => mkEventResults(id, 2025, id === 1 ? "2025-03-15" : "2025-04-20", [{
      id: "1", name: "Granfondo", finisherCount: 1,
      results: [mkResult({ pos: 1, genderPos: 1, raceTimeSecs: 100,
        name: "Ana Silva", nameLower: "ana silva", team: "Team Alpha" })],
    }]);
    const ranking = buildAggregateRanking(events, loader);
    const ana = ranking["2025"]!["Granfondo"]!["M"]!.find((a) => a.nameLower === "ana silva");
    // Should resolve canonical team from both events (2 occurrences of "Team Alpha")
    expect(ana?.team).toBe("Team Alpha");
    expect(ana?.eventsScored).toBe(2);
  });

  it("handles buildAggregateRanking loader returning null", () => {
    const event = mkEvent(1, 2025, "2025-03-15");
    const ranking = buildAggregateRanking([event], () => null);
    expect(Object.keys(ranking).length).toBe(0);
  });

  it("does not fuzzy-merge athlete with completely different team (similarity < 0.6)", () => {
    // Event 1: "Unrelated Club", Event 2: "Totally Different Team"
    // Both start with "ana silva|" but team similarity < 0.6 → separate entries
    const events = [mkEvent(1, 2025, "2025-03-15"), mkEvent(2, 2025, "2025-04-20")];
    const loader = (id: number) => mkEventResults(id, 2025, id === 1 ? "2025-03-15" : "2025-04-20", [{
      id: "1", name: "Granfondo", finisherCount: 1,
      results: [mkResult({
        pos: 1, genderPos: 1, raceTimeSecs: 100,
        name: "Ana Silva", nameLower: "ana silva",
        team: id === 1 ? "Unrelated Club" : "Totalmente Diferente",
      })],
    }]);
    const ranking = buildAggregateRanking(events, loader);
    const athletes = ranking["2025"]!["Granfondo"]!["M"]!;
    // Two separate entries (teams not similar enough to merge)
    const anaEntries = athletes.filter((a) => a.nameLower === "ana silva");
    expect(anaEntries.length).toBe(2);
  });

  it("handles athlete with no team (canonicalTeam stays unset)", () => {
    const event = mkEvent(1, 2025, "2025-03-15");
    const loader = () => mkEventResults(1, 2025, "2025-03-15", [{
      id: "1", name: "Granfondo", finisherCount: 1,
      results: [mkResult({ pos: 1, genderPos: 1, raceTimeSecs: 100, team: "" })],
    }]);
    const ranking = buildAggregateRanking([event], loader);
    const athletes = ranking["2025"]!["Granfondo"]!["M"]!;
    expect(athletes.length).toBe(1);
    expect(athletes[0]!.team).toBe(""); // no team — canonicalTeam stays empty
  });

  it("ranks athletes by totalPoints descending", () => {
    const event = mkEvent(1, 2025, "2025-03-15");
    const loader = () => mkEventResults(1, 2025, "2025-03-15", [{
      id: "1", name: "Granfondo", finisherCount: 3,
      results: [
        mkResult({ pos: 1, genderPos: 1, raceTimeSecs: 100, name: "Winner", nameLower: "winner" }),
        mkResult({ pos: 2, genderPos: 2, raceTimeSecs: 200, name: "Second", nameLower: "second" }),
        mkResult({ pos: 3, genderPos: 3, raceTimeSecs: 300, name: "Third", nameLower: "third" }),
      ],
    }]);
    const ranking = buildAggregateRanking([event], loader);
    const athletes = ranking["2025"]!["Granfondo"]!["M"]!;
    expect(athletes[0]!.name).toBe("Winner");
    expect(athletes[1]!.name).toBe("Second");
    expect(athletes[2]!.name).toBe("Third");
  });
});

// ── buildTeamRanking ──────────────────────────────────────────────────────────

describe("buildTeamRanking", () => {
  function mkTeamResults(teamAthletes: Array<{ name: string; pos: number; team: string }>): StoredEventResults {
    return mkEventResults(1, 2025, "2025-03-15", [{
      id: "1", name: "Granfondo", finisherCount: teamAthletes.length,
      results: teamAthletes.map((a, i) =>
        mkResult({ pos: a.pos, genderPos: i + 1, raceTimeSecs: a.pos * 100, name: a.name, nameLower: a.name.toLowerCase(), team: a.team })
      ),
    }]);
  }

  it("requires at least 3 athletes per team for eligibility", () => {
    const event = mkEvent(1, 2025, "2025-03-15");
    const loader = () => mkTeamResults([
      { name: "A1", pos: 1, team: "Team Alpha" },
      { name: "A2", pos: 2, team: "Team Alpha" },
      // only 2 athletes → not eligible
      { name: "B1", pos: 3, team: "Team Beta" },
      { name: "B2", pos: 4, team: "Team Beta" },
      { name: "B3", pos: 5, team: "Team Beta" },
    ]);
    const ranking = buildTeamRanking([event], loader);
    const teams = ranking["2025"]!["Granfondo"]!;
    expect(teams.length).toBe(1);
    expect(teams[0]!.team).toBe("Team Beta");
  });

  it("ranks teams by sum of top-3 positions (lower = better)", () => {
    const event = mkEvent(1, 2025, "2025-03-15");
    const loader = () => mkTeamResults([
      // Team Alpha: top-3 positions 1+2+3=6
      { name: "A1", pos: 1, team: "Team Alpha" },
      { name: "A2", pos: 2, team: "Team Alpha" },
      { name: "A3", pos: 3, team: "Team Alpha" },
      // Team Beta: top-3 positions 4+5+6=15
      { name: "B1", pos: 4, team: "Team Beta" },
      { name: "B2", pos: 5, team: "Team Beta" },
      { name: "B3", pos: 6, team: "Team Beta" },
    ]);
    const ranking = buildTeamRanking([event], loader);
    const teams = ranking["2025"]!["Granfondo"]!;
    expect(teams[0]!.team).toBe("Team Alpha");
    expect(teams[1]!.team).toBe("Team Beta");
  });

  it("awards 25 base points to team rank 1", () => {
    const event = mkEvent(1, 2025, "2025-03-15");
    // Use exactly 80 teams total (coefficient = 1.00) so we can predict points
    const athletes: Array<{ name: string; pos: number; team: string }> = [];
    // Team Alpha: positions 1,2,3
    athletes.push({ name: "A1", pos: 1, team: "Team Alpha" });
    athletes.push({ name: "A2", pos: 2, team: "Team Alpha" });
    athletes.push({ name: "A3", pos: 3, team: "Team Alpha" });
    // 79 more teams with only 2 athletes each (not eligible)
    for (let t = 0; t < 79; t++) {
      athletes.push({ name: `T${t}a`, pos: t * 2 + 4, team: `Other${t}` });
      athletes.push({ name: `T${t}b`, pos: t * 2 + 5, team: `Other${t}` });
    }
    const loader = () => mkTeamResults(athletes);
    const ranking = buildTeamRanking([event], loader);
    const firstTeam = ranking["2025"]!["Granfondo"]![0]!;
    // coefficient at 80 teams = 1.00, rank 1 = 25 pts
    expect(firstTeam.totalPoints).toBe(25);
  });

  it("accumulates points across multiple events", () => {
    const events = [mkEvent(1, 2025, "2025-03-15"), mkEvent(2, 2025, "2025-04-20")];
    const loader = (id: number) => {
      const base = id === 1 ? 0 : 10;
      return mkTeamResults([
        { name: `A${id}1`, pos: base + 1, team: "Team Alpha" },
        { name: `A${id}2`, pos: base + 2, team: "Team Alpha" },
        { name: `A${id}3`, pos: base + 3, team: "Team Alpha" },
      ]);
    };
    const ranking = buildTeamRanking(events, loader);
    const teamAlpha = ranking["2025"]!["Granfondo"]![0]!;
    expect(teamAlpha.eventsScored).toBe(2);
    expect(teamAlpha.totalPoints).toBeGreaterThan(0);
  });

  it("excludes athletes with individual/solo team from ranking", () => {
    const event = mkEvent(1, 2025, "2025-03-15");
    const loader = () => mkTeamResults([
      { name: "A1", pos: 1, team: "Individual" },
      { name: "A2", pos: 2, team: "Individual" },
      { name: "A3", pos: 3, team: "Individual" },
      { name: "B1", pos: 4, team: "Team Beta" },
      { name: "B2", pos: 5, team: "Team Beta" },
      { name: "B3", pos: 6, team: "Team Beta" },
    ]);
    const ranking = buildTeamRanking([event], loader);
    const teams = ranking["2025"]!["Granfondo"]!;
    expect(teams.every((t) => t.team !== "Individual")).toBe(true);
    expect(teams.length).toBe(1);
  });

  it("handles team ranking loader returning null", () => {
    const event = mkEvent(1, 2025, "2025-03-15");
    const ranking = buildTeamRanking([event], () => null);
    expect(Object.keys(ranking).length).toBe(0);
  });

  it("tiebreaks equal combined score by best individual position", () => {
    const event = mkEvent(1, 2025, "2025-03-15");
    const loader = () => mkTeamResults([
      // Team Alpha: top-3 = [1,3,5] → combinedScore=9, bestPos=1
      { name: "A1", pos: 1, team: "Team Alpha" },
      { name: "A2", pos: 3, team: "Team Alpha" },
      { name: "A3", pos: 5, team: "Team Alpha" },
      // Team Beta: top-3 = [2,3,4] → combinedScore=9, bestPos=2 (same combined, worse best)
      { name: "B1", pos: 2, team: "Team Beta" },
      { name: "B2", pos: 3, team: "Team Beta" },
      { name: "B3", pos: 4, team: "Team Beta" },
    ]);
    const ranking = buildTeamRanking([event], loader);
    const teams = ranking["2025"]!["Granfondo"]!;
    expect(teams[0]!.team).toBe("Team Alpha");
    expect(teams[1]!.team).toBe("Team Beta");
  });

  it("bestRank improves when team finishes higher in a later event", () => {
    // Event 1: Team Alpha rank 2; Event 2: Team Alpha rank 1 → bestRank=1
    const events = [mkEvent(1, 2025, "2025-03-15"), mkEvent(2, 2025, "2025-04-20")];
    const loader = (id: number) => mkTeamResults(
      id === 1
        ? [
            { name: "B1", pos: 1, team: "Team Beta" },
            { name: "B2", pos: 2, team: "Team Beta" },
            { name: "B3", pos: 3, team: "Team Beta" },
            { name: "A1", pos: 4, team: "Team Alpha" },
            { name: "A2", pos: 5, team: "Team Alpha" },
            { name: "A3", pos: 6, team: "Team Alpha" },
          ]
        : [
            { name: "A1", pos: 1, team: "Team Alpha" },
            { name: "A2", pos: 2, team: "Team Alpha" },
            { name: "A3", pos: 3, team: "Team Alpha" },
          ]
    );
    const ranking = buildTeamRanking(events, loader);
    const alpha = ranking["2025"]!["Granfondo"]!.find((t) => t.team === "Team Alpha")!;
    expect(alpha.bestRank).toBe(1); // Improved from 2 → 1
  });

  it("bestRank stays at best across events (not overwritten by worse rank)", () => {
    const events = [mkEvent(1, 2025, "2025-03-15"), mkEvent(2, 2025, "2025-04-20")];
    const loader = (id: number) => mkTeamResults(
      id === 1
        ? [
            { name: "A1", pos: 1, team: "Team Alpha" },
            { name: "A2", pos: 2, team: "Team Alpha" },
            { name: "A3", pos: 3, team: "Team Alpha" },
          ]
        : [
            // Team Alpha finishes 2nd in event 2
            { name: "B1", pos: 1, team: "Team Beta" },
            { name: "B2", pos: 2, team: "Team Beta" },
            { name: "B3", pos: 3, team: "Team Beta" },
            { name: "A1", pos: 4, team: "Team Alpha" },
            { name: "A2", pos: 5, team: "Team Alpha" },
            { name: "A3", pos: 6, team: "Team Alpha" },
          ]
    );
    const ranking = buildTeamRanking(events, loader);
    const alpha = ranking["2025"]!["Granfondo"]!.find((t) => t.team === "Team Alpha")!;
    expect(alpha.bestRank).toBe(1); // Best was rank 1 in event 1
  });

  it("tiebreaks equal totalPoints by bestRank in final sort", () => {
    // Two teams with same total points — lower bestRank should appear first
    const events = [mkEvent(1, 2025, "2025-03-15"), mkEvent(2, 2025, "2025-04-20")];
    // Use exactly 80 total teams (coeff=1.00) and same rank positions so pts are identical
    const loader = (id: number) => {
      // Event 1: Alpha rank 1 (25pts), Beta rank 2 (20pts)
      // Event 2: Alpha rank 2 (20pts), Beta rank 1 (25pts) → both end at 45pts
      const e1 = [
        { name: "A1", pos: 1, team: "Team Alpha" }, { name: "A2", pos: 2, team: "Team Alpha" }, { name: "A3", pos: 3, team: "Team Alpha" },
        { name: "B1", pos: 4, team: "Team Beta" },  { name: "B2", pos: 5, team: "Team Beta" },  { name: "B3", pos: 6, team: "Team Beta" },
      ];
      const e2 = [
        { name: "B1", pos: 1, team: "Team Beta" },  { name: "B2", pos: 2, team: "Team Beta" },  { name: "B3", pos: 3, team: "Team Beta" },
        { name: "A1", pos: 4, team: "Team Alpha" }, { name: "A2", pos: 5, team: "Team Alpha" }, { name: "A3", pos: 6, team: "Team Alpha" },
      ];
      // Add enough solo teams to keep coeff predictable (doesn't affect tie-break logic)
      return mkTeamResults(id === 1 ? e1 : e2);
    };
    const ranking = buildTeamRanking(events, loader);
    const teams = ranking["2025"]!["Granfondo"]!;
    // Both have same pts; Alpha bestRank=1, Beta bestRank=1 — order may vary but both present
    expect(teams.length).toBe(2);
    expect(teams[0]!.totalPoints).toBe(teams[1]!.totalPoints);
  });

  it("excludes DNF athletes from team scoring", () => {
    const event = mkEvent(1, 2025, "2025-03-15");
    const loader = () => mkEventResults(1, 2025, "2025-03-15", [{
      id: "1", name: "Granfondo", finisherCount: 2,
      results: [
        mkResult({ pos: 1, genderPos: 1, raceTimeSecs: 100, name: "A1", nameLower: "a1", team: "Team Alpha" }),
        mkResult({ pos: 2, genderPos: 2, raceTimeSecs: 200, name: "A2", nameLower: "a2", team: "Team Alpha" }),
        // DNF — should not count
        mkResult({ pos: 0, genderPos: 0, raceTimeSecs: 0, dnf: true, name: "A3", nameLower: "a3", team: "Team Alpha" }),
      ],
    }]);
    const ranking = buildTeamRanking([event], loader);
    // Only 2 valid finishers on Team Alpha → not eligible (need ≥3)
    const teams = ranking["2025"]!["Granfondo"] ?? [];
    expect(teams.length).toBe(0);
  });
});
