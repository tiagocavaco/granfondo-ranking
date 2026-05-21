import { describe, it, expect } from "vitest";
import {
  isGranfondoName,
  isKidsCamVariant,
  extractDistances,
  assignGenderPositions,
  transformResult,
} from "../transform.js";
import {
  normalizeDistance,
  DISTANCE_ALIASES,
  athleteKey,
  isSoloTeam,
  SOLO_TEAM_KEYS,
  buildAggregateRanking,
  buildTeamRanking,
  buildAthletesIndex,
  type AthleteAliasRule,
  type ResultAssignment,
  type AthleteIdStore,
  type SoloCollisionFlag,
  type DuplicateFlag,
} from "../pipeline.js";
import type { ApiResult } from "../types.js";
import type {
  StoredParticipant,
  StoredEvent,
  StoredEventResults,
  StoredDistanceResults,
  StoredResult,
  AthleteEntry,
} from "@granfondo/db/types";

// ── Fixtures ──────────────────────────────────────────────────────────────────

function mkEvent(id: number, year: number, date: string): StoredEvent {
  return {
    id,
    name: `Event ${id}`,
    year,
    date,
    location: "Lisbon",
    resultsUrl: `https://results.stopandgo.pro/${id}`,
    officialUrl: null,
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
    licences: [],
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

function mkParticipant(overrides: Partial<StoredParticipant> = {}): StoredParticipant {
  return {
    bib:        "1",
    name:       "Test",
    fullName:   "Test Athlete",
    gender:     "M",
    team:       "Team Alpha",
    category:   "ELITES M",
    distance:   "Granfondo",
    distanceId: "1",
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
    const athletes: StoredParticipant[] = [
      mkParticipant({ distance: "Mediofondo", distanceId: "2" }),
      mkParticipant({ distance: "Granfondo",  distanceId: "1" }),
      mkParticipant({ distance: "Granfondo",  distanceId: "1" }), // duplicate
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

  it("returns nameLower| for solo athletes (empty team, no category)", () => {
    expect(athleteKey("ana silva", "")).toBe("ana silva|");
  });

  it("returns nameLower|solo:category for 'Individual' team with category", () => {
    expect(athleteKey("ana silva", "Individual", "MASTERS B")).toBe("ana silva|solo:masters-b");
  });

  it("returns nameLower|solo:category for 'Indivídual' (accented) with category", () => {
    expect(athleteKey("ana silva", "Indivídual", "MASTERS A")).toBe("ana silva|solo:masters-a");
  });

  it("returns nameLower| for 'Individual' team with no category", () => {
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
    const athleteIndex = new Map([["ana silva|team alpha", { id: 99, name: "Ana Silva", nameLower: "ana silva", teams: [], categories: {}, results: [] }]]);
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
    // 79 more teams with 3 athletes each (eligible) → 80 eligible teams → coeff = 1.00
    for (let t = 0; t < 79; t++) {
      athletes.push({ name: `T${t}a`, pos: t * 3 + 4, team: `Other${t}` });
      athletes.push({ name: `T${t}b`, pos: t * 3 + 5, team: `Other${t}` });
      athletes.push({ name: `T${t}c`, pos: t * 3 + 6, team: `Other${t}` });
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
    const mkEntry = (name: string, id: number) => ({ id, name, nameLower: name.toLowerCase(), teams: [], categories: {}, results: [] });
    const athleteIndex = new Map([["a1|team alpha", mkEntry("A1", 10)], ["a2|team alpha", mkEntry("A2", 20)], ["a3|team alpha", mkEntry("A3", 30)]]);
    const ranking = buildTeamRanking([event], loader, athleteIndex);
    const teamResult = ranking["2025"]!["Granfondo"]![0]!.results[0]!;
    const ids = teamResult.athletes.map((a) => a.id);
    expect(ids).toEqual([10, 20, 30]);
  });
});

// ── buildAggregateRanking — athleteId consolidation ───────────────────────────

// Build a minimal AthleteEntry for the index
function mkAthleteEntry(id: number, nameLower: string, teams: string[] = []): AthleteEntry {
  return {
    id,
    name: nameLower.replace(/\b\w/g, (c) => c.toUpperCase()),
    nameLower,
    teams,
    categories: {},
    results: [],
  };
}

describe("buildAggregateRanking — athleteId consolidation", () => {
  it("consolidates results for same athlete racing under different teams when athleteId is set", () => {
    const events = [mkEvent(1, 2026, "2026-02-15"), mkEvent(2, 2026, "2026-03-22")];
    const athleteIndex = new Map<string, AthleteEntry>([
      ["jose borges|team alpha", mkAthleteEntry(1, "jose borges", ["team alpha"])],
    ]);
    const loader = (id: number) => mkEventResults(id, 2026, id === 1 ? "2026-02-15" : "2026-03-22", [{
      id: "1", name: "Granfondo", finisherCount: 300,
      results: [
        ...(id === 1 ? [mkResult({ pos: 1, genderPos: 1, raceTimeSecs: 100, athleteId: 1, name: "Jose Borges", nameLower: "jose borges", team: "Team Alpha" })] : []),
        ...(id === 2 ? [mkResult({ pos: 1, genderPos: 1, raceTimeSecs: 100, athleteId: 1, name: "Jose Borges", nameLower: "jose borges", team: "Guest Team" })] : []),
        ...Array.from({ length: 299 }, (_, i) =>
          mkResult({ pos: i + 2, genderPos: i + 2, raceTimeSecs: (i + 2) * 100, athleteId: 0, name: `Filler ${i}`, nameLower: `filler ${i}`, team: "Filler Team" })
        ),
      ],
    }]);
    const ranking = buildAggregateRanking(events, loader, athleteIndex);
    const joseEntries = ranking["2026"]!["Granfondo"]!["M"]!.filter((a) => a.nameLower === "jose borges");
    expect(joseEntries.length).toBe(1);
    expect(joseEntries[0]!.id).toBe(1);
    expect(joseEntries[0]!.eventsScored).toBe(2);
    expect(joseEntries[0]!.results.length).toBe(2);
  });

  it("without athleteId, different teams produce separate entries (baseline)", () => {
    const events = [mkEvent(1, 2026, "2026-02-15"), mkEvent(2, 2026, "2026-03-22")];
    const loader = (id: number) => mkEventResults(id, 2026, id === 1 ? "2026-02-15" : "2026-03-22", [{
      id: "1", name: "Granfondo", finisherCount: 1,
      results: [mkResult({ pos: 1, genderPos: 1, raceTimeSecs: 100, athleteId: 0, name: "Jose Borges", nameLower: "jose borges", team: id === 1 ? "Team Alpha" : "Guest Team" })],
    }]);
    const ranking = buildAggregateRanking(events, loader);
    expect(ranking["2026"]!["Granfondo"]!["M"]!.filter((a) => a.nameLower === "jose borges").length).toBe(2);
  });

  it("uses athleteId to resolve id even when name+team key is not in athleteIndex", () => {
    const events = [mkEvent(1, 2026, "2026-02-15")];
    const athleteIndex = new Map<string, AthleteEntry>([
      ["jose borges|canonical team", mkAthleteEntry(42, "jose borges", ["canonical team"])],
    ]);
    const loader = () => mkEventResults(1, 2026, "2026-02-15", [{
      id: "1", name: "Granfondo", finisherCount: 1,
      results: [mkResult({ pos: 1, genderPos: 1, raceTimeSecs: 100, athleteId: 42, name: "Jose Borges", nameLower: "jose borges", team: "Totally Different Team" })],
    }]);
    const ranking = buildAggregateRanking(events, loader, athleteIndex);
    expect(ranking["2026"]!["Granfondo"]!["M"]![0]!.id).toBe(42);
  });

  it("normalizes distance aliases before grouping (BIG DAY and Clássica → Granfondo)", () => {
    const events = [mkEvent(1, 2026, "2026-02-15"), mkEvent(2, 2026, "2026-03-22")];
    const athleteIndex = new Map<string, AthleteEntry>([
      ["jose borges|team alpha", mkAthleteEntry(1, "jose borges", ["team alpha"])],
    ]);
    const loader = (id: number) => mkEventResults(id, 2026, id === 1 ? "2026-02-15" : "2026-03-22", [{
      id: "1", name: id === 1 ? "BIG DAY" : "Clássica", finisherCount: 300,
      results: [
        mkResult({ pos: 1, genderPos: 1, raceTimeSecs: 100, athleteId: 1, name: "Jose Borges", nameLower: "jose borges", team: "Team Alpha" }),
        ...Array.from({ length: 299 }, (_, i) =>
          mkResult({ pos: i + 2, genderPos: i + 2, raceTimeSecs: (i + 2) * 100, athleteId: 0, name: `Filler ${i}`, nameLower: `filler ${i}`, team: "Filler" })
        ),
      ],
    }]);
    const ranking = buildAggregateRanking(events, loader, athleteIndex);
    expect(ranking["2026"]!["Granfondo"]).toBeDefined();
    expect(ranking["2026"]!["BIG DAY"]).toBeUndefined();
    expect(ranking["2026"]!["Clássica"]).toBeUndefined();
    const jose = ranking["2026"]!["Granfondo"]!["M"]!.find((a) => a.id === 1);
    expect(jose?.eventsScored).toBe(2);
  });
});

// ── buildAggregateRanking — points cutoff ─────────────────────────────────────

describe("buildAggregateRanking — points cutoff", () => {
  it("gives 0 points to finishers outside top 50 — they don't appear in ranking", () => {
    const event = mkEvent(1, 2026, "2026-02-15");
    const results = Array.from({ length: 60 }, (_, i) =>
      mkResult({ pos: i + 1, genderPos: i + 1, raceTimeSecs: (i + 1) * 100, name: `Athlete ${i + 1}`, nameLower: `athlete ${i + 1}` })
    );
    const loader = () => mkEventResults(1, 2026, "2026-02-15", [{ id: "1", name: "Granfondo", finisherCount: 60, results }]);
    const ranking = buildAggregateRanking([event], loader);
    const gf_m = ranking["2026"]!["Granfondo"]!["M"]!;
    expect(gf_m.length).toBe(50);
    expect(gf_m.every((a) => a.bestPos <= 50)).toBe(true);
  });

  it("position 50 scores 1 base point, position 51 scores nothing", () => {
    const event = mkEvent(1, 2026, "2026-02-15");
    const results = Array.from({ length: 300 }, (_, i) =>
      mkResult({ pos: i + 1, genderPos: i + 1, raceTimeSecs: (i + 1) * 100, name: `Athlete ${i + 1}`, nameLower: `athlete ${i + 1}` })
    );
    const loader = () => mkEventResults(1, 2026, "2026-02-15", [{ id: "1", name: "Granfondo", finisherCount: 300, results }]);
    const ranking = buildAggregateRanking([event], loader);
    const gf_m = ranking["2026"]!["Granfondo"]!["M"]!;
    expect(gf_m.find((a) => a.bestPos === 50)?.totalPoints).toBe(1);
    expect(gf_m.find((a) => a.bestPos === 51)).toBeUndefined();
  });

  it("athlete finishing outside top 50 in all events does not appear in ranking", () => {
    const event = mkEvent(1, 2026, "2026-02-21");
    const results = Array.from({ length: 200 }, (_, i) =>
      mkResult({ pos: i + 1, genderPos: i + 1, raceTimeSecs: (i + 1) * 100, name: i === 140 ? "Tiago Cavaco" : `Athlete ${i + 1}`, nameLower: i === 140 ? "tiago cavaco" : `athlete ${i + 1}`, athleteId: i === 140 ? 999 : 0 })
    );
    const loader = () => mkEventResults(1, 2026, "2026-02-21", [{ id: "1", name: "Mediofondo", finisherCount: 200, results }]);
    const ranking = buildAggregateRanking([event], loader);
    expect(ranking["2026"]!["Mediofondo"]!["M"]!.find((a) => a.nameLower === "tiago cavaco")).toBeUndefined();
  });
});

// ── buildAthletesIndex — pipeline passes ────────────────────────────────────

function runPipeline(
  events: StoredEvent[],
  loader: (id: number) => StoredEventResults | null
) {
  return buildAthletesIndex(events, loader, [], [], new Map());
}

// ── buildAthletesIndex — duplicate event safeguard ─────────────────────────

describe("buildAthletesIndex — duplicate event safeguard", () => {
  it("same licence, same event, different categories → one result kept, no duplicate", () => {
    const event = mkEvent(1, 2025, "2025-04-27");
    const loader = () => mkEventResults(1, 2025, "2025-04-27", [{
      id: "1", name: "Mediofondo", finisherCount: 100,
      results: [
        mkResult({ bib: "10", name: "Hugo Dias", nameLower: "hugo dias", licences: ["12345678"], team: "Individual", category: "MASTERS C", genderPos: 19, athleteId: 0, pos: 19 }),
        mkResult({ bib: "11", name: "Hugo Dias", nameLower: "hugo dias", licences: ["12345678"], team: "Individual", category: "MASTERS B", genderPos: 231, athleteId: 0, pos: 231 }),
      ],
    }]);
    const { index, flags } = runPipeline([event], loader);
    const entries = [...index.values()].filter(e => e.nameLower === "hugo dias");
    expect(entries.length).toBe(1);
    expect(entries[0]!.results.length).toBe(1);
    expect(entries[0]!.results[0]!.category).toBe("MASTERS C");
    expect(flags.length).toBe(0);
  });

  it("same licence, same event, ambiguous categories → one result kept, flag emitted", () => {
    const events = [mkEvent(1, 2025, "2025-02-01"), mkEvent(2, 2025, "2025-04-27")];
    const loader = (id: number) => mkEventResults(id, 2025, id === 1 ? "2025-02-01" : "2025-04-27", [{
      id: "1", name: "Granfondo", finisherCount: 100,
      results: id === 1
        ? [mkResult({ bib: "1", name: "Hugo Dias", nameLower: "hugo dias", licences: ["12345678"], team: "CC Lagos", category: "MASTERS B", genderPos: 20, athleteId: 0 })]
        : [
            mkResult({ bib: "10", name: "Hugo Dias", nameLower: "hugo dias", licences: ["12345678"], team: "Individual", category: "MASTERS C", genderPos: 19, athleteId: 0, pos: 19 }),
            mkResult({ bib: "11", name: "Hugo Dias", nameLower: "hugo dias", licences: ["12345678"], team: "Individual", category: "MASTERS B", genderPos: 231, athleteId: 0, pos: 231 }),
          ],
    }]);
    const { index, flags } = runPipeline(events, loader);
    const entries = [...index.values()].filter(e => e.nameLower === "hugo dias");
    expect(entries.length).toBe(1);
    expect(entries[0]!.results.length).toBe(2);
    expect(flags.length).toBe(1);
    expect(flags[0]!.athleteName).toBe("Hugo Dias");
    expect(flags[0]!.resolution).toBe("flagged_manual");
  });

  it("same licence, two different events → two results kept (no flag)", () => {
    const events = [mkEvent(1, 2025, "2025-03-01"), mkEvent(2, 2025, "2025-04-01")];
    const loader = (id: number) => mkEventResults(id, 2025, `2025-0${id}-01`, [{
      id: "1", name: "Granfondo", finisherCount: 100,
      results: [mkResult({ bib: "10", name: "Hugo Dias", nameLower: "hugo dias", licences: ["12345678"], team: "CC Lisboa", category: "MASTERS C", genderPos: 10, athleteId: 0 })],
    }]);
    const { index, flags } = runPipeline(events, loader);
    const entries = [...index.values()].filter(e => e.nameLower === "hugo dias");
    expect(entries.length).toBe(1);
    expect(entries[0]!.results.length).toBe(2);
    expect(flags.length).toBe(0);
  });
});

// ── buildAthletesIndex — year-category consistency sweep ───────────────────

describe("buildAthletesIndex — year-category consistency sweep", () => {
  it("5× MASTERS C + 1× MASTERS B in same year → MASTERS B result removed and flagged", () => {
    const events = [1, 2, 3, 4, 5, 6].map(id => mkEvent(id, 2025, `2025-0${id}-01`));
    const loader = (id: number) => mkEventResults(id, 2025, `2025-0${id}-01`, [{
      id: "1", name: "Granfondo", finisherCount: 100,
      results: [mkResult({ bib: String(id), name: "Hugo Dias", nameLower: "hugo dias", licences: ["12345678"], team: "CC Lagos", category: id === 5 ? "MASTERS B" : "MASTERS C", genderPos: 10, athleteId: 0 })],
    }]);
    const { index, flags } = runPipeline(events, loader);
    const entries = [...index.values()].filter(e => e.nameLower === "hugo dias");
    expect(entries.length).toBe(1);
    expect(entries[0]!.results.length).toBe(5);
    expect(entries[0]!.results.every(r => r.category === "MASTERS C")).toBe(true);
    const yearFlags = flags.filter(f => f.athleteName === "Hugo Dias");
    expect(yearFlags.length).toBe(1);
    expect(yearFlags[0]!.incoming.category).toBe("MASTERS B");
    expect(yearFlags[0]!.resolution).toBe("flagged_manual");
  });

  it("equal counts of two incompatible categories (1 vs 1) → no removal (ambiguous)", () => {
    const events = [mkEvent(1, 2025, "2025-03-01"), mkEvent(2, 2025, "2025-06-01")];
    const loader = (id: number) => mkEventResults(id, 2025, `2025-0${id}-01`, [{
      id: "1", name: "Granfondo", finisherCount: 100,
      results: [mkResult({ bib: String(id), name: "Hugo Dias", nameLower: "hugo dias", licences: ["12345678"], team: "CC Lagos", category: id === 1 ? "MASTERS B" : "MASTERS C", genderPos: 10, athleteId: 0 })],
    }]);
    const { index, flags } = runPipeline(events, loader);
    const entries = [...index.values()].filter(e => e.nameLower === "hugo dias");
    expect(entries.length).toBe(1);
    expect(entries[0]!.results.length).toBe(2);
    expect(flags.filter(f => f.athleteName === "Hugo Dias").length).toBe(0);
  });
});

// ── buildAthletesIndex — Pass 5c: same-year solo grouping ──────────────────

describe("buildAthletesIndex — Pass 5c: same-year solo grouping", () => {
  it("same name + category + year across different events → single profile", () => {
    const events = [mkEvent(1, 2026, "2026-02-15"), mkEvent(2, 2026, "2026-03-22")];
    const loader = (id: number) => mkEventResults(id, 2026, id === 1 ? "2026-02-15" : "2026-03-22", [{
      id: "1", name: "Granfondo", finisherCount: 100,
      results: [mkResult({ bib: id === 1 ? "10" : "20", name: "Joao Silva", nameLower: "joao silva", team: "", category: "MASTERS A", genderPos: 5, athleteId: 0 })],
    }]);
    const { index, soloFlags } = runPipeline(events, loader);
    const soloEntries = [...index.values()].filter(e => e.nameLower === "joao silva");
    expect(soloEntries.length).toBe(1);
    expect(soloEntries[0]!.results.length).toBe(2);
    expect(soloFlags.length).toBe(0);
  });

  it("same name + different category → two separate profiles", () => {
    const events = [mkEvent(1, 2026, "2026-02-15"), mkEvent(2, 2026, "2026-03-22")];
    const loader = (id: number) => mkEventResults(id, 2026, id === 1 ? "2026-02-15" : "2026-03-22", [{
      id: "1", name: "Granfondo", finisherCount: 100,
      results: [mkResult({ bib: String(id), name: "Joao Silva", nameLower: "joao silva", team: "", category: id === 1 ? "MASTERS A" : "MASTERS B", genderPos: 5, athleteId: 0 })],
    }]);
    const { index } = runPipeline(events, loader);
    expect([...index.values()].filter(e => e.nameLower === "joao silva").length).toBe(2);
  });

  it("collision same event + same distance, divergent percentiles → resolved by percentile", () => {
    const events = [mkEvent(1, 2026, "2026-02-15"), mkEvent(2, 2026, "2026-03-22"), mkEvent(3, 2026, "2026-04-12")];
    const loader = (id: number) => mkEventResults(id, 2026, id === 1 ? "2026-02-15" : id === 2 ? "2026-03-22" : "2026-04-12", [{
      id: "1", name: "Granfondo", finisherCount: 100,
      results: id === 1
        ? [mkResult({ bib: "10", name: "Joao Silva", nameLower: "joao silva", team: "", category: "MASTERS A", genderPos: 10, athleteId: 0 })]
        : id === 2
        ? [mkResult({ bib: "20", name: "Joao Silva", nameLower: "joao silva", team: "", category: "MASTERS A", genderPos: 12, athleteId: 0 })]
        : [
            mkResult({ bib: "A", name: "Joao Silva", nameLower: "joao silva", team: "", category: "MASTERS A", genderPos: 11, athleteId: 0 }),
            mkResult({ bib: "B", name: "Joao Silva", nameLower: "joao silva", team: "", category: "MASTERS A", genderPos: 80, athleteId: 0, pos: 80 }),
          ],
    }]);
    const { index, soloFlags } = runPipeline(events, loader);
    const soloEntries = [...index.values()].filter(e => e.nameLower === "joao silva");
    expect(soloEntries.length).toBe(2);
    expect(soloEntries.find(e => e.results.length === 3)).toBeDefined();
    expect(soloFlags.length).toBe(1);
    expect(soloFlags[0]!.resolution).toBe("percentile");
  });

  it("collision same event + different distances → resolved by distance", () => {
    const events = [mkEvent(1, 2026, "2026-02-15"), mkEvent(2, 2026, "2026-03-22")];
    const loader = (id: number) => {
      if (id === 1) return mkEventResults(1, 2026, "2026-02-15", [{
        id: "1", name: "Granfondo", finisherCount: 100,
        results: [mkResult({ bib: "10", name: "Ana Costa", nameLower: "ana costa", team: "", category: "MASTERS A FEM", genderPos: 5, athleteId: 0, gender: "F" })],
      }]);
      return mkEventResults(2, 2026, "2026-03-22", [
        { id: "1", name: "Granfondo", finisherCount: 100, results: [mkResult({ bib: "A", name: "Ana Costa", nameLower: "ana costa", team: "", category: "MASTERS A FEM", genderPos: 5, athleteId: 0, gender: "F" })] },
        { id: "2", name: "Mediofondo", finisherCount: 80, results: [mkResult({ bib: "B", name: "Ana Costa", nameLower: "ana costa", team: "", category: "MASTERS A FEM", genderPos: 3, athleteId: 0, gender: "F" })] },
      ]);
    };
    const { index, soloFlags } = runPipeline(events, loader);
    expect([...index.values()].filter(e => e.nameLower === "ana costa").length).toBe(2);
    expect(soloFlags.length).toBe(1);
    expect(soloFlags[0]!.resolution).toBe("distance");
  });

  it("unresolvable collision (no baseline) → both bib-keyed + flagged_manual", () => {
    const events = [mkEvent(1, 2026, "2026-02-15")];
    const loader = () => mkEventResults(1, 2026, "2026-02-15", [{
      id: "1", name: "Granfondo", finisherCount: 100,
      results: [
        mkResult({ bib: "X", name: "Pedro Nunes", nameLower: "pedro nunes", team: "", category: "MASTERS B", genderPos: 10, athleteId: 0 }),
        mkResult({ bib: "Y", name: "Pedro Nunes", nameLower: "pedro nunes", team: "", category: "MASTERS B", genderPos: 50, athleteId: 0, pos: 50 }),
      ],
    }]);
    const { index, soloFlags } = runPipeline(events, loader);
    expect([...index.values()].filter(e => e.nameLower === "pedro nunes").length).toBe(2);
    expect(soloFlags.length).toBe(1);
    expect(soloFlags[0]!.resolution).toBe("flagged_manual");
  });

  it("Elite + Masters A same name + same year → two separate profiles (different groups)", () => {
    const events = [mkEvent(1, 2026, "2026-02-15"), mkEvent(2, 2026, "2026-03-22")];
    const loader = (id: number) => mkEventResults(id, 2026, id === 1 ? "2026-02-15" : "2026-03-22", [{
      id: "1", name: "Granfondo", finisherCount: 100,
      results: [mkResult({ bib: String(id), name: "Joao Silva", nameLower: "joao silva", team: "", category: id === 1 ? "M Elite" : "MASTERS A", genderPos: 5, athleteId: 0 })],
    }]);
    const { index } = runPipeline(events, loader);
    expect([...index.values()].filter(e => e.nameLower === "joao silva").length).toBe(2);
  });
});

// ── buildAthletesIndex — Pass 5d: cross-year solo merge ────────────────────

describe("buildAthletesIndex — Pass 5d: cross-year solo merge", () => {
  it("Masters A in 2025 + Masters B in 2026 → merged (valid step-up)", () => {
    const events = [mkEvent(1, 2025, "2025-03-15"), mkEvent(2, 2026, "2026-03-22")];
    const loader = (id: number) => mkEventResults(id, id === 1 ? 2025 : 2026, id === 1 ? "2025-03-15" : "2026-03-22", [{
      id: "1", name: "Granfondo", finisherCount: 100,
      results: [mkResult({ bib: String(id), name: "Rui Ferreira", nameLower: "rui ferreira", team: "", category: id === 1 ? "MASTERS A" : "MASTERS B", genderPos: 5, athleteId: 0 })],
    }]);
    const { index } = runPipeline(events, loader);
    const entries = [...index.values()].filter(e => e.nameLower === "rui ferreira");
    expect(entries.length).toBe(1);
    expect(entries[0]!.results.length).toBe(2);
  });

  it("Masters B in 2025 + Masters A in 2026 → NOT merged (de-aging)", () => {
    const events = [mkEvent(1, 2025, "2025-03-15"), mkEvent(2, 2026, "2026-03-22")];
    const loader = (id: number) => mkEventResults(id, id === 1 ? 2025 : 2026, id === 1 ? "2025-03-15" : "2026-03-22", [{
      id: "1", name: "Granfondo", finisherCount: 100,
      results: [mkResult({ bib: String(id), name: "Rui Ferreira", nameLower: "rui ferreira", team: "", category: id === 1 ? "MASTERS B" : "MASTERS A", genderPos: 5, athleteId: 0 })],
    }]);
    const { index } = runPipeline(events, loader);
    expect([...index.values()].filter(e => e.nameLower === "rui ferreira").length).toBe(2);
  });

  it("Masters A in 2025 + Masters C in 2026 → NOT merged (skipped a level)", () => {
    const events = [mkEvent(1, 2025, "2025-03-15"), mkEvent(2, 2026, "2026-03-22")];
    const loader = (id: number) => mkEventResults(id, id === 1 ? 2025 : 2026, id === 1 ? "2025-03-15" : "2026-03-22", [{
      id: "1", name: "Granfondo", finisherCount: 100,
      results: [mkResult({ bib: String(id), name: "Rui Ferreira", nameLower: "rui ferreira", team: "", category: id === 1 ? "MASTERS A" : "MASTERS C", genderPos: 5, athleteId: 0 })],
    }]);
    const { index } = runPipeline(events, loader);
    expect([...index.values()].filter(e => e.nameLower === "rui ferreira").length).toBe(2);
  });

  it("Elite in 2025 + Open 19-34 in 2026 → merged (bridge category)", () => {
    const events = [mkEvent(1, 2025, "2025-03-15"), mkEvent(2, 2026, "2026-03-22")];
    const loader = (id: number) => mkEventResults(id, id === 1 ? 2025 : 2026, id === 1 ? "2025-03-15" : "2026-03-22", [{
      id: "1", name: "Granfondo", finisherCount: 100,
      results: [mkResult({ bib: String(id), name: "Ana Costa", nameLower: "ana costa", team: "", category: id === 1 ? "F Elite" : "F 19-34", genderPos: 5, athleteId: 0 })],
    }]);
    const { index } = runPipeline(events, loader);
    const entries = [...index.values()].filter(e => e.nameLower === "ana costa");
    expect(entries.length).toBe(1);
    expect(entries[0]!.results.length).toBe(2);
  });

  it("Open 19-34 in 2025 + Masters A in 2026 → merged (bridge category, natural aging)", () => {
    const events = [mkEvent(1, 2025, "2025-03-15"), mkEvent(2, 2026, "2026-03-22")];
    const loader = (id: number) => mkEventResults(id, id === 1 ? 2025 : 2026, id === 1 ? "2025-03-15" : "2026-03-22", [{
      id: "1", name: "Granfondo", finisherCount: 100,
      results: [mkResult({ bib: String(id), name: "Carlos Matos", nameLower: "carlos matos", team: "", category: id === 1 ? "M 19-34" : "MASTERS A", genderPos: 5, athleteId: 0 })],
    }]);
    const { index } = runPipeline(events, loader);
    const entries = [...index.values()].filter(e => e.nameLower === "carlos matos");
    expect(entries.length).toBe(1);
    expect(entries[0]!.results.length).toBe(2);
  });

  it("Masters A in 2025 + Open 19-34 in 2026 → merged (bridge category, bidirectional)", () => {
    const events = [mkEvent(1, 2025, "2025-03-15"), mkEvent(2, 2026, "2026-03-22")];
    const loader = (id: number) => mkEventResults(id, id === 1 ? 2025 : 2026, id === 1 ? "2025-03-15" : "2026-03-22", [{
      id: "1", name: "Granfondo", finisherCount: 100,
      results: [mkResult({ bib: String(id), name: "Carlos Matos", nameLower: "carlos matos", team: "", category: id === 1 ? "MASTERS A" : "M 19-34", genderPos: 5, athleteId: 0 })],
    }]);
    const { index } = runPipeline(events, loader);
    const entries = [...index.values()].filter(e => e.nameLower === "carlos matos");
    expect(entries.length).toBe(1);
    expect(entries[0]!.results.length).toBe(2);
  });

  it("Open 19-34 in 2025 + Masters B in 2026 → NOT merged (bridge incompatible with Masters B+)", () => {
    const events = [mkEvent(1, 2025, "2025-03-15"), mkEvent(2, 2026, "2026-03-22")];
    const loader = (id: number) => mkEventResults(id, id === 1 ? 2025 : 2026, id === 1 ? "2025-03-15" : "2026-03-22", [{
      id: "1", name: "Granfondo", finisherCount: 100,
      results: [mkResult({ bib: String(id), name: "Carlos Matos", nameLower: "carlos matos", team: "", category: id === 1 ? "M 19-34" : "MASTERS B", genderPos: 5, athleteId: 0 })],
    }]);
    const { index } = runPipeline(events, loader);
    expect([...index.values()].filter(e => e.nameLower === "carlos matos").length).toBe(2);
  });
});

// ── Pass 5f and 5e helpers ────────────────────────────────────────────────────

function mkTeamEvent(eventId: number, year: number, date: string, name: string, team: string, category: string, genderPos: number, distance = "Granfondo", country = "Portugal") {
  const event = mkEvent(eventId, year, date);
  const loader = () => mkEventResults(eventId, year, date, [{
    id: "1", name: distance, finisherCount: 100,
    results: [mkResult({ bib: String(eventId), name, nameLower: name.toLowerCase(), team, category, genderPos, country, athleteId: 0 })],
  }]);
  return { event, loader };
}

function mkSoloEvent(eventId: number, year: number, date: string, name: string, category: string, genderPos: number, distance = "Granfondo", country = "Portugal") {
  return mkTeamEvent(eventId, year, date, name, "", category, genderPos, distance, country);
}

function runMulti(fixtures: Array<{ event: StoredEvent; loader: (id: number) => StoredEventResults | null }>) {
  const events = fixtures.map(f => f.event);
  const loaderMap = new Map(fixtures.map(f => [f.event.id, f.loader]));
  return runPipeline(events, id => loaderMap.get(id)?.(id) ?? null);
}

// ── buildAthletesIndex — Pass 5f: cross-year team-change merge ──────────────

describe("buildAthletesIndex — Pass 5f: cross-year team-change merge", () => {
  it("same name, 2 team profiles non-overlapping years, compatible category → merged", () => {
    const { event: e1, loader: l1 } = mkTeamEvent(1, 2025, "2025-03-15", "Abel Carmona", "Agila Xtrem", "MASTERS B", 5);
    const { event: e2, loader: l2 } = mkTeamEvent(2, 2026, "2026-03-22", "Abel Carmona", "Agila Extrem", "MASTERS B", 5);
    const { index } = runMulti([{ event: e1, loader: l1 }, { event: e2, loader: l2 }]);
    const entries = [...index.values()].filter(e => e.nameLower === "abel carmona");
    expect(entries.length).toBe(1);
    expect(entries[0]!.results.length).toBe(2);
  });

  it("same name, 2 team profiles overlapping years → NOT merged (likely different people)", () => {
    const { event: e1, loader: l1 } = mkTeamEvent(1, 2025, "2025-03-15", "Abel Carmona", "Velocistar Cycling", "MASTERS B", 5);
    const { event: e2, loader: l2 } = mkTeamEvent(2, 2025, "2025-06-15", "Abel Carmona", "Pedalistas Porto", "MASTERS B", 5);
    const { index } = runMulti([{ event: e1, loader: l1 }, { event: e2, loader: l2 }]);
    expect([...index.values()].filter(e => e.nameLower === "abel carmona").length).toBe(2);
  });

  it("same name, non-overlapping years, de-aging category → NOT merged", () => {
    const { event: e1, loader: l1 } = mkTeamEvent(1, 2025, "2025-03-15", "Abel Carmona", "Velocistar Cycling", "MASTERS B", 5);
    const { event: e2, loader: l2 } = mkTeamEvent(2, 2026, "2026-03-22", "Abel Carmona", "Pedalistas Porto", "MASTERS A", 5);
    const { index } = runMulti([{ event: e1, loader: l1 }, { event: e2, loader: l2 }]);
    expect([...index.values()].filter(e => e.nameLower === "abel carmona").length).toBe(2);
  });

  it("same name, non-overlapping years, disjoint distances → NOT merged", () => {
    const { event: e1, loader: l1 } = mkTeamEvent(1, 2025, "2025-03-15", "Abel Carmona", "Velocistar Cycling", "MASTERS B", 5, "Granfondo");
    const { event: e2, loader: l2 } = mkTeamEvent(2, 2026, "2026-03-22", "Abel Carmona", "Pedalistas Porto", "MASTERS B", 5, "Minifondo");
    const { index } = runMulti([{ event: e1, loader: l1 }, { event: e2, loader: l2 }]);
    expect([...index.values()].filter(e => e.nameLower === "abel carmona").length).toBe(2);
  });

  it("same name, non-overlapping years, country mismatch → NOT merged", () => {
    const { event: e1, loader: l1 } = mkTeamEvent(1, 2025, "2025-03-15", "Abel Carmona", "Velocistar Cycling", "MASTERS B", 5, "Granfondo", "ES");
    const { event: e2, loader: l2 } = mkTeamEvent(2, 2026, "2026-03-22", "Abel Carmona", "Pedalistas Porto", "MASTERS B", 5, "Granfondo", "PT");
    const { index } = runMulti([{ event: e1, loader: l1 }, { event: e2, loader: l2 }]);
    expect([...index.values()].filter(e => e.nameLower === "abel carmona").length).toBe(2);
  });
});

// ── buildAthletesIndex — Pass 5e: team ↔ solo cross-pass merge ─────────────

describe("buildAthletesIndex — Pass 5e: team ↔ solo cross-pass merge", () => {
  it("solo result + team profile, no shared event, compatible → merged", () => {
    const { event: e1, loader: l1 } = mkTeamEvent(1, 2025, "2025-03-15", "Maria Sousa", "CC Faro", "MASTERS A", 5);
    const { event: e2, loader: l2 } = mkSoloEvent(2, 2025, "2025-06-15", "Maria Sousa", "MASTERS A", 6);
    const { index } = runMulti([{ event: e1, loader: l1 }, { event: e2, loader: l2 }]);
    const entries = [...index.values()].filter(e => e.nameLower === "maria sousa");
    expect(entries.length).toBe(1);
    expect(entries[0]!.results.length).toBe(2);
  });

  it("solo + team sharing same eventId → NOT merged (golden rule)", () => {
    const { event: e1 } = mkTeamEvent(1, 2025, "2025-03-15", "Maria Sousa", "CC Faro", "MASTERS A", 5);
    const loader = (id: number) => mkEventResults(id, 2025, "2025-03-15", [{
      id: "1", name: "Granfondo", finisherCount: 100,
      results: [
        mkResult({ bib: "10", name: "Maria Sousa", nameLower: "maria sousa", team: "CC Faro", category: "MASTERS A", genderPos: 5, athleteId: 0 }),
        mkResult({ bib: "20", name: "Maria Sousa", nameLower: "maria sousa", team: "", category: "MASTERS A", genderPos: 6, athleteId: 0 }),
      ],
    }]);
    const { index } = runPipeline([e1], loader);
    expect([...index.values()].filter(e => e.nameLower === "maria sousa").length).toBe(2);
  });

  it("solo Granfondo-only + team Minifondo-only → NOT merged (distance mismatch)", () => {
    const { event: e1, loader: l1 } = mkTeamEvent(1, 2025, "2025-03-15", "Maria Sousa", "CC Faro", "MASTERS A", 5, "Minifondo");
    const { event: e2, loader: l2 } = mkSoloEvent(2, 2025, "2025-06-15", "Maria Sousa", "MASTERS A", 6, "Granfondo");
    const { index } = runMulti([{ event: e1, loader: l1 }, { event: e2, loader: l2 }]);
    expect([...index.values()].filter(e => e.nameLower === "maria sousa").length).toBe(2);
  });

  it("solo top-5% + team bottom-60% (≥2 results each) → NOT merged (percentile mismatch)", () => {
    const events = [mkEvent(1, 2025, "2025-01-15"), mkEvent(2, 2025, "2025-02-15"), mkEvent(3, 2025, "2025-04-15"), mkEvent(4, 2025, "2025-05-15")];
    const loader = (id: number) => mkEventResults(id, 2025, `2025-0${id}-15`, [{
      id: "1", name: "Granfondo", finisherCount: 100,
      results: [mkResult({ bib: String(id), name: "Maria Sousa", nameLower: "maria sousa", team: id <= 2 ? "CC Faro" : "", category: "MASTERS A", genderPos: id <= 2 ? 60 : 3, athleteId: 0 })],
    }]);
    const { index } = runPipeline(events, loader);
    expect([...index.values()].filter(e => e.nameLower === "maria sousa").length).toBe(2);
  });

  it("solo country 'ES' + team country 'PT' → NOT merged (country mismatch)", () => {
    const { event: e1, loader: l1 } = mkTeamEvent(1, 2025, "2025-03-15", "Maria Sousa", "CC Faro", "MASTERS A", 5, "Granfondo", "PT");
    const { event: e2, loader: l2 } = mkSoloEvent(2, 2025, "2025-06-15", "Maria Sousa", "MASTERS A", 6, "Granfondo", "ES");
    const { index } = runMulti([{ event: e1, loader: l1 }, { event: e2, loader: l2 }]);
    expect([...index.values()].filter(e => e.nameLower === "maria sousa").length).toBe(2);
  });

  it("2 team candidates survive all filters → flagged (no merge)", () => {
    const events = [mkEvent(1, 2025, "2025-02-01"), mkEvent(2, 2025, "2025-03-01"), mkEvent(3, 2025, "2025-04-01")];
    const loader = (id: number) => mkEventResults(id, 2025, `2025-0${id}-01`, [{
      id: "1", name: "Granfondo", finisherCount: 100,
      results: [mkResult({ bib: String(id), name: "Maria Sousa", nameLower: "maria sousa", team: id === 1 ? "CC Faro" : id === 2 ? "Bike Team X" : "", category: "MASTERS A", genderPos: 5, athleteId: 0 })],
    }]);
    const { index } = runPipeline(events, loader);
    expect([...index.values()].filter(e => e.nameLower === "maria sousa").length).toBe(3);
  });

  it("solo with 1 result (inconclusive percentile) + 1 compatible team candidate → merged", () => {
    const { event: e1, loader: l1 } = mkTeamEvent(1, 2025, "2025-03-15", "Tiago Neto", "CC Lisboa", "MASTERS B", 10);
    const { event: e2, loader: l2 } = mkSoloEvent(2, 2025, "2025-06-15", "Tiago Neto", "MASTERS B", 12);
    const { index } = runMulti([{ event: e1, loader: l1 }, { event: e2, loader: l2 }]);
    const entries = [...index.values()].filter(e => e.nameLower === "tiago neto");
    expect(entries.length).toBe(1);
    expect(entries[0]!.results.length).toBe(2);
  });
});

// ── buildAthletesIndex — athlete-aliases regression (Pass 5e/5f) ────────────

describe("buildAthletesIndex — athlete-aliases regression (Pass 5e/5f)", () => {
  it("Matteo Cigala — solo races merged into team profile by Pass 5e", () => {
    const { event: e1, loader: l1 } = mkTeamEvent(1, 2025, "2025-03-01", "Matteo Cigala", "Casa Benfica Almodovar", "MASTERS B", 8);
    const { event: e2, loader: l2 } = mkTeamEvent(2, 2025, "2025-04-01", "Matteo Cigala", "Casa Benfica Almodovar", "MASTERS B", 9);
    const { event: e3, loader: l3 } = mkSoloEvent(3, 2025, "2025-05-01", "Matteo Cigala", "MASTERS B", 7);
    const { event: e4, loader: l4 } = mkSoloEvent(4, 2025, "2025-06-01", "Matteo Cigala", "MASTERS B", 10);
    const { index } = runMulti([{ event: e1, loader: l1 }, { event: e2, loader: l2 }, { event: e3, loader: l3 }, { event: e4, loader: l4 }]);
    const entries = [...index.values()].filter(e => e.nameLower === "matteo cigala");
    expect(entries.length).toBe(1);
    expect(entries[0]!.results.length).toBe(4);
  });

  it("Gonçalo Freitas — solo race merged into team profile by Pass 5e", () => {
    const { event: e1, loader: l1 } = mkTeamEvent(1, 2026, "2026-03-01", "Goncalo Freitas", "Love Tiles", "MASTERS A", 5);
    const { event: e2, loader: l2 } = mkSoloEvent(2, 2026, "2026-05-01", "Goncalo Freitas", "MASTERS A", 6);
    const { index } = runMulti([{ event: e1, loader: l1 }, { event: e2, loader: l2 }]);
    const entries = [...index.values()].filter(e => e.nameLower === "goncalo freitas");
    expect(entries.length).toBe(1);
    expect(entries[0]!.results.length).toBe(2);
  });

  it("Helder Loureiro — solo race merged into team profile by Pass 5e", () => {
    const { event: e1, loader: l1 } = mkTeamEvent(1, 2026, "2026-02-01", "Helder Loureiro", "Crp Ribafria", "MASTERS C", 12);
    const { event: e2, loader: l2 } = mkSoloEvent(2, 2026, "2026-04-01", "Helder Loureiro", "MASTERS C", 11);
    const { index } = runMulti([{ event: e1, loader: l1 }, { event: e2, loader: l2 }]);
    const entries = [...index.values()].filter(e => e.nameLower === "helder loureiro");
    expect(entries.length).toBe(1);
    expect(entries[0]!.results.length).toBe(2);
  });

  it("Miguel García — team change across years merged by Pass 5f (Elite 2025 → Masters A 2026)", () => {
    const { event: e1, loader: l1 } = mkTeamEvent(1, 2025, "2025-04-01", "Miguel Garcia", "Love Tiles", "ELITES M", 3, "Granfondo", "ES");
    const { event: e2, loader: l2 } = mkTeamEvent(2, 2026, "2026-03-01", "Miguel Garcia", "Penacova CEG", "M Masters A", 5, "Granfondo", "ES");
    const { index } = runMulti([{ event: e1, loader: l1 }, { event: e2, loader: l2 }]);
    const entries = [...index.values()].filter(e => e.nameLower === "miguel garcia");
    expect(entries.length).toBe(1);
    expect(entries[0]!.results.length).toBe(2);
  });
});
