import { describe, it, expect, vi } from "vitest";
import {
  isGranfondoName,
  isKidsCamVariant,
  extractDistances,
  assignGenderPositions,
  transformResult,
  normalizeDistance,
  DISTANCE_ALIASES,
  athleteKey,
  isSoloTeam,
  SOLO_TEAM_KEYS,
  buildAthletesIndex,
  applyAthleteAliases,
  buildAggregateRanking,
  buildTeamRanking,
  type AthleteIdStore,
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
    athleteId: 0,
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

// ── athleteKey / isSoloTeam ───────────────────────────────────────────────────

describe("athleteKey", () => {
  it("returns nameLower|teamNormalKey for affiliated athletes", () => {
    expect(athleteKey("ana silva", "Team Alpha")).toBe("ana silva|team alpha");
  });

  it("returns nameLower| for solo athletes (empty team)", () => {
    expect(athleteKey("ana silva", "")).toBe("ana silva|");
  });

  it("returns nameLower| for 'Individual' team", () => {
    expect(athleteKey("ana silva", "Individual")).toBe("ana silva|");
  });

  it("normalizes team name (strips accents, merges single letters)", () => {
    // "C.B. Almodovar" → "cb almodovar" after dot→space + single-letter merge
    const key = athleteKey("test", "C.B. Almodovar");
    expect(key).toBe("test|cb almodovar");
  });
});

describe("isSoloTeam", () => {
  it("returns true for empty string", () => expect(isSoloTeam("")).toBe(true));
  it("returns true for 'Individual'", () => expect(isSoloTeam("Individual")).toBe(true));
  it("returns true for 'Independente'", () => expect(isSoloTeam("Independente")).toBe(true));
  it("returns false for a real team", () => expect(isSoloTeam("Team Alpha")).toBe(false));

  it("SOLO_TEAM_KEYS contains expected values", () => {
    expect(SOLO_TEAM_KEYS.has("individual")).toBe(true);
    expect(SOLO_TEAM_KEYS.has("independente")).toBe(true);
  });
});

// ── buildAthletesIndex ────────────────────────────────────────────────────────

describe("buildAthletesIndex", () => {
  it("creates separate entries for same name with different teams", () => {
    const events = [mkEvent(1, 2025, "2025-03-15"), mkEvent(2, 2025, "2025-04-20")];
    const loader = (id: number) => mkEventResults(id, 2025, id === 1 ? "2025-03-15" : "2025-04-20", [{
      id: "1", name: "Granfondo", finisherCount: 1,
      results: [mkResult({
        name: "Ana Silva",
        nameLower: "ana silva",
        team: id === 1 ? "Team Alpha" : "Team Beta",
      })],
    }]);
    const { index } = buildAthletesIndex(events, loader);
    // Different teams → separate profiles (prevents false merges)
    expect(index.size).toBe(2);
    expect(index.has("ana silva|team alpha")).toBe(true);
    expect(index.has("ana silva|team beta")).toBe(true);
  });

  it("merges same athlete's results when team is the same across events", () => {
    const events = [mkEvent(1, 2025, "2025-03-15"), mkEvent(2, 2025, "2025-04-20")];
    const loader = (id: number) => mkEventResults(id, 2025, id === 1 ? "2025-03-15" : "2025-04-20", [{
      id: "1", name: "Granfondo", finisherCount: 1,
      results: [mkResult({ name: "Ana Silva", nameLower: "ana silva", team: "Team Alpha" })],
    }]);
    const { index } = buildAthletesIndex(events, loader);
    expect(index.size).toBe(1);
    expect(index.get("ana silva|team alpha")!.results.length).toBe(2);
  });

  it("assigns stable integer IDs from idStore", () => {
    const event = mkEvent(1, 2025, "2025-03-15");
    const loader = () => mkEventResults(1, 2025, "2025-03-15", [{
      id: "1", name: "Granfondo", finisherCount: 1,
      results: [mkResult({ name: "Ana Silva", nameLower: "ana silva", team: "Team Alpha" })],
    }]);
    const existingStore: AthleteIdStore = new Map([["ana silva|team alpha", 42]]);
    const { index } = buildAthletesIndex([event], loader, existingStore);
    expect(index.get("ana silva|team alpha")?.id).toBe(42);
  });

  it("mints new IDs for athletes not in idStore", () => {
    const event = mkEvent(1, 2025, "2025-03-15");
    const loader = () => mkEventResults(1, 2025, "2025-03-15", [{
      id: "1", name: "Granfondo", finisherCount: 2,
      results: [
        mkResult({ name: "Ana Silva", nameLower: "ana silva", team: "Team Alpha", pos: 1 }),
        mkResult({ name: "Rui Costa", nameLower: "rui costa", team: "Team Beta", pos: 2 }),
      ],
    }]);
    const { index, updatedIdStore } = buildAthletesIndex([event], loader);
    const ids = [...index.values()].map((e) => e.id);
    expect(ids.every((id) => id > 0)).toBe(true);
    expect(new Set(ids).size).toBe(2); // unique IDs
    expect(updatedIdStore.size).toBe(2);
  });

  it("returns updatedIdStore containing all existing + new entries", () => {
    const event = mkEvent(1, 2025, "2025-03-15");
    const loader = () => mkEventResults(1, 2025, "2025-03-15", [{
      id: "1", name: "Granfondo", finisherCount: 1,
      results: [mkResult({ name: "New Athlete", nameLower: "new athlete", team: "Team Alpha" })],
    }]);
    const existingStore: AthleteIdStore = new Map([["existing|athlete", 7]]);
    const { updatedIdStore } = buildAthletesIndex([event], loader, existingStore);
    expect(updatedIdStore.has("existing|athlete")).toBe(true);
    expect(updatedIdStore.get("existing|athlete")).toBe(7);
    expect(updatedIdStore.has("new athlete|team alpha")).toBe(true);
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

  it("sets canonicalTeam to most-used team across all results", () => {
    const events = [mkEvent(1, 2025, "2025-03-15"), mkEvent(2, 2025, "2025-06-01"), mkEvent(3, 2025, "2025-09-01")];
    const loader = (id: number) => mkEventResults(id, 2025, `2025-0${id + 2}-01`, [{
      id: "1", name: "Granfondo", finisherCount: 1,
      results: [mkResult({
        name: "Ana Silva", nameLower: "ana silva",
        team: id === 3 ? "New Team" : "Old Team",
      })],
    }]);
    const { index } = buildAthletesIndex(events, loader);
    // Old Team appears in 2 events, New Team in 1 → canonical = Old Team
    const entry = index.get("ana silva|old team");
    expect(entry?.canonicalTeam).toBe("Old Team");
  });

  it("creates two unique athletes when different names in same event", () => {
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
    expect(index.has("ana silva|team alpha")).toBe(true);
    expect(index.has("rui costa|team beta")).toBe(true);
  });

  it("separates solo athletes from team athletes with same name", () => {
    const events = [mkEvent(1, 2025, "2025-03-15"), mkEvent(2, 2025, "2025-04-20")];
    const loader = (id: number) => mkEventResults(id, 2025, id === 1 ? "2025-03-15" : "2025-04-20", [{
      id: "1", name: "Granfondo", finisherCount: 1,
      results: [mkResult({
        name: "Ana Silva", nameLower: "ana silva",
        team: id === 1 ? "Individual" : "Team Alpha",
      })],
    }]);
    const { index } = buildAthletesIndex(events, loader);
    // Solo (Individual) and team athlete → separate profiles
    expect(index.has("ana silva|")).toBe(true);
    expect(index.has("ana silva|team alpha")).toBe(true);
  });
});

// ── applyAthleteAliases ───────────────────────────────────────────────────────

describe("applyAthleteAliases", () => {
  it("merges alias results into canonical entry", () => {
    const events = [mkEvent(1, 2025, "2025-03-15"), mkEvent(2, 2025, "2025-04-20")];
    const loader = (id: number) => mkEventResults(id, 2025, id === 1 ? "2025-03-15" : "2025-04-20", [{
      id: "1", name: "Granfondo", finisherCount: 1,
      results: [mkResult({
        name: "Jose Borges", nameLower: "jose borges",
        team: id === 1 ? "Team Vivavita" : "Jbracingcoach",
      })],
    }]);
    const { index, updatedIdStore } = buildAthletesIndex(events, loader);
    expect(index.size).toBe(2); // Two entries before merge

    applyAthleteAliases(index, updatedIdStore, [{
      name: "Jose Borges",
      canonicalTeam: "Team Vivavita",
      aliases: [{ name: "Jose Borges", team: "Jbracingcoach" }],
    }]);

    expect(index.size).toBe(1);
    const canonical = index.get("jose borges|team vivavita");
    expect(canonical?.results.length).toBe(2);
  });

  it("remaps alias ID to canonical ID in idStore", () => {
    const events = [mkEvent(1, 2025, "2025-03-15"), mkEvent(2, 2025, "2025-04-20")];
    const loader = (id: number) => mkEventResults(id, 2025, id === 1 ? "2025-03-15" : "2025-04-20", [{
      id: "1", name: "Granfondo", finisherCount: 1,
      results: [mkResult({
        name: "Jose Borges", nameLower: "jose borges",
        team: id === 1 ? "Team Vivavita" : "Jbracingcoach",
      })],
    }]);
    const { index, updatedIdStore } = buildAthletesIndex(events, loader);
    const aliasId = index.get("jose borges|jbracingcoach")?.id;
    const canonicalId = index.get("jose borges|team vivavita")?.id;
    expect(aliasId).not.toBe(canonicalId);

    applyAthleteAliases(index, updatedIdStore, [{
      name: "Jose Borges",
      canonicalTeam: "Team Vivavita",
      aliases: [{ name: "Jose Borges", team: "Jbracingcoach" }],
    }]);

    // Alias ID in store should now point to canonical ID
    expect(updatedIdStore.get("jose borges|jbracingcoach")).toBe(canonicalId);
  });

  it("skips alias rules where canonical entry does not exist", () => {
    const event = mkEvent(1, 2025, "2025-03-15");
    const loader = () => mkEventResults(1, 2025, "2025-03-15", [{
      id: "1", name: "Granfondo", finisherCount: 1,
      results: [mkResult({ name: "Jose Borges", nameLower: "jose borges", team: "Jbracingcoach" })],
    }]);
    const { index, updatedIdStore } = buildAthletesIndex([event], loader);
    // Canonical team doesn't exist in results
    applyAthleteAliases(index, updatedIdStore, [{
      name: "Jose Borges",
      canonicalTeam: "NonExistent Team",
      aliases: [{ name: "Jose Borges", team: "Jbracingcoach" }],
    }]);
    // Should not crash, index unchanged
    expect(index.size).toBe(1);
  });

  it("sorts merged results by date descending", () => {
    const events = [mkEvent(1, 2025, "2025-03-15"), mkEvent(2, 2025, "2025-06-01")];
    const loader = (id: number) => mkEventResults(id, 2025, id === 1 ? "2025-03-15" : "2025-06-01", [{
      id: "1", name: "Granfondo", finisherCount: 1,
      results: [mkResult({
        name: "Jose Borges", nameLower: "jose borges",
        team: id === 1 ? "Team Alpha" : "Team Beta",
      })],
    }]);
    const { index, updatedIdStore } = buildAthletesIndex(events, loader);
    applyAthleteAliases(index, updatedIdStore, [{
      name: "Jose Borges",
      canonicalTeam: "Team Alpha",
      aliases: [{ name: "Jose Borges", team: "Team Beta" }],
    }]);
    const results = index.get("jose borges|team alpha")!.results;
    expect(results[0]!.eventDate >= results[1]!.eventDate).toBe(true);
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

  it("treats same name but different teams as separate athletes in ranking", () => {
    const events = [mkEvent(1, 2025, "2025-03-15"), mkEvent(2, 2025, "2025-04-20")];
    const loader = (id: number) => mkEventResults(id, 2025, id === 1 ? "2025-03-15" : "2025-04-20", [{
      id: "1", name: "Granfondo", finisherCount: 1,
      results: [mkResult({
        pos: 1, genderPos: 1, raceTimeSecs: 100,
        name: "Ana Silva",
        nameLower: "ana silva",
        team: id === 1 ? "Team Alpha" : "Team Beta",
      })],
    }]);
    const ranking = buildAggregateRanking(events, loader);
    const athletes = ranking["2025"]!["Granfondo"]!["M"]!;
    const anaSilvaEntries = athletes.filter((a) => a.nameLower === "ana silva");
    // Different teams → two separate entries, each with 1 event scored
    expect(anaSilvaEntries.length).toBe(2);
    expect(anaSilvaEntries.every((a) => a.eventsScored === 1)).toBe(true);
  });

  it("looks up id from athleteIndex when provided", () => {
    const event = mkEvent(1, 2025, "2025-03-15");
    const loader = () => mkEventResults(1, 2025, "2025-03-15", [{
      id: "1", name: "Granfondo", finisherCount: 1,
      results: [mkResult({ name: "Ana Silva", nameLower: "ana silva", team: "Team Alpha" })],
    }]);
    // Build athleteIndex first so we have a real ID
    const { index: athleteIndex } = buildAthletesIndex([event], loader, new Map([["ana silva|team alpha", 99]]));
    const ranking = buildAggregateRanking([event], loader, athleteIndex);
    const ana = ranking["2025"]!["Granfondo"]!["M"]!.find((a) => a.nameLower === "ana silva");
    expect(ana?.id).toBe(99);
  });

  it("improves bestPos when athlete finishes higher in a later event", () => {
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
    expect(ana?.bestPos).toBe(1);
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
    expect(ana?.country).toBe("Portugal");
  });

  it("handles buildAggregateRanking loader returning null", () => {
    const event = mkEvent(1, 2025, "2025-03-15");
    const ranking = buildAggregateRanking([event], () => null);
    expect(Object.keys(ranking).length).toBe(0);
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

  it("retains correct team per entry when same athlete name races under different teams", () => {
    const events = [mkEvent(1, 2025, "2025-03-15"), mkEvent(2, 2025, "2025-04-20")];
    const loader = (id: number) => mkEventResults(id, 2025, id === 1 ? "2025-03-15" : "2025-04-20", [{
      id: "1", name: "Granfondo", finisherCount: 1,
      results: [mkResult({
        pos: 1, genderPos: 1, raceTimeSecs: 100,
        name: "Ana Silva", nameLower: "ana silva",
        team: id === 1 ? "Old Team" : "New Team",
      })],
    }]);
    const ranking = buildAggregateRanking(events, loader);
    const athletes = ranking["2025"]!["Granfondo"]!["M"]!.filter((a) => a.nameLower === "ana silva");
    // Different teams → separate entries, each showing its own team
    expect(athletes.length).toBe(2);
    expect(athletes.some((a) => a.team === "Old Team")).toBe(true);
    expect(athletes.some((a) => a.team === "New Team")).toBe(true);
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
      { name: "A1", pos: 1, team: "Team Alpha" },
      { name: "A2", pos: 2, team: "Team Alpha" },
      { name: "A3", pos: 3, team: "Team Alpha" },
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
    const athletes: Array<{ name: string; pos: number; team: string }> = [];
    athletes.push({ name: "A1", pos: 1, team: "Team Alpha" });
    athletes.push({ name: "A2", pos: 2, team: "Team Alpha" });
    athletes.push({ name: "A3", pos: 3, team: "Team Alpha" });
    // 79 more teams with only 2 athletes each (not eligible) → 80 total teams → coeff = 1.00
    for (let t = 0; t < 79; t++) {
      athletes.push({ name: `T${t}a`, pos: t * 2 + 4, team: `Other${t}` });
      athletes.push({ name: `T${t}b`, pos: t * 2 + 5, team: `Other${t}` });
    }
    const loader = () => mkTeamResults(athletes);
    const ranking = buildTeamRanking([event], loader);
    const firstTeam = ranking["2025"]!["Granfondo"]![0]!;
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

  it("includes athlete IDs in team race results when athleteIndex provided", () => {
    const event = mkEvent(1, 2025, "2025-03-15");
    const athletes = [
      { name: "A1", pos: 1, team: "Team Alpha" },
      { name: "A2", pos: 2, team: "Team Alpha" },
      { name: "A3", pos: 3, team: "Team Alpha" },
    ];
    const loader = () => mkTeamResults(athletes);
    const { index: athleteIndex } = buildAthletesIndex([event], loader, new Map([
      ["a1|team alpha", 10], ["a2|team alpha", 20], ["a3|team alpha", 30],
    ]));
    const ranking = buildTeamRanking([event], loader, athleteIndex);
    const teamResult = ranking["2025"]!["Granfondo"]![0]!.results[0]!;
    const ids = teamResult.athletes.map((a) => a.id);
    expect(ids).toEqual([10, 20, 30]);
  });
});
