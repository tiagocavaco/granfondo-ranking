import { describe, it, expect } from "vitest";
import { buildAggregateRanking, buildTeamRanking } from "./ranking.js";
import type {
  StoredEvent,
  StoredEventResults,
  StoredDistanceResults,
  StoredResult,
  AthleteEntry,
} from "@granfondo/database/types";

// ── Fixtures ──────────────────────────────────────────────────────────────────

function mkEvent(id: number, year: number, date: string): StoredEvent {
  return {
    id, name: `Event ${id}`, year, date, location: "Lisbon",
    resultsUrl: `https://results.stopandgo.pro/${id}`, officialUrl: null,
    hasResults: true, distances: [{ id: "1", name: "Granfondo" }],
    participantCount: 0, finisherCount: 0, scrapedAt: "2025-01-01T00:00:00Z",
  };
}

function mkResult(overrides: Partial<StoredResult> = {}): StoredResult {
  return {
    pos: 1, genderPos: 1, catPos: 0, athleteId: 0, bib: "1",
    name: "Test Athlete",
    gender: "M", team: "Team Alpha", category: "ELITES M", country: "Portugal",
    raceTime: "03:25:10", raceTimeSecs: 12310,
    gap: "", gapSecs: 0, points: 0, licences: [], dnf: false, dns: false,
    ...overrides,
  };
}

function mkEventResults(
  eventId: number, year: number, date: string,
  distances: StoredDistanceResults[]
): StoredEventResults {
  return { eventId, eventName: `Event ${eventId}`, eventDate: date, eventYear: year, scrapedAt: "2025-01-01T00:00:00Z", distances };
}

function mkAthleteEntry(id: number, nameLower: string, teams: string[] = []): AthleteEntry {
  return {
    id,
    name: nameLower.replace(/\b\w/g, (c) => c.toUpperCase()),
    nameLower, teams, categories: {}, results: [],
  };
}

// ── buildAggregateRanking ─────────────────────────────────────────────────────

describe("buildAggregateRanking", () => {
  it("awards points to position 1 with coefficient", () => {
    const event = mkEvent(1, 2025, "2025-03-15");
    const results = Array.from({ length: 300 }, (_, i) =>
      mkResult({ pos: i + 1, genderPos: i + 1, raceTimeSecs: (i + 1) * 100, name: `Athlete ${i}` })
    );
    const loader = () => mkEventResults(1, 2025, "2025-03-15", [{ id: "1", name: "Granfondo", finisherCount: 300, results }]);
    const ranking = buildAggregateRanking([event], loader);
    const top = ranking["2025"]!["Granfondo"]!["M"]![0]!;
    expect(top.totalPoints).toBe(75);
    expect(top.rank).toBe(1);
  });

  it("groups results by year and distance", () => {
    const events = [mkEvent(1, 2025, "2025-03-15"), mkEvent(2, 2026, "2026-03-15")];
    const loader = (id: number) => mkEventResults(id, id === 1 ? 2025 : 2026, `${id === 1 ? "2025" : "2026"}-03-15`, [{
      id: "1", name: "Granfondo", finisherCount: 1, results: [mkResult()],
    }]);
    const ranking = buildAggregateRanking(events, loader);
    expect(ranking["2025"]).toBeDefined();
    expect(ranking["2026"]).toBeDefined();
  });

  it("normalizes distance names (BIG DAY → Granfondo)", () => {
    const event = mkEvent(1, 2025, "2025-03-15");
    const loader = () => mkEventResults(1, 2025, "2025-03-15", [{ id: "1", name: "BIG DAY", finisherCount: 1, results: [mkResult()] }]);
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
        mkResult({ pos: 0, genderPos: 0, dnf: true, name: "Dnf Athlete" }),
      ],
    }]);
    const ranking = buildAggregateRanking([event], loader);
    expect(ranking["2025"]!["Granfondo"]!["M"]!.every((a) => a.name !== "Dnf Athlete")).toBe(true);
  });

  it("treats same name but different teams as separate athletes in ranking", () => {
    const events = [mkEvent(1, 2025, "2025-03-15"), mkEvent(2, 2025, "2025-04-20")];
    const loader = (id: number) => mkEventResults(id, 2025, id === 1 ? "2025-03-15" : "2025-04-20", [{
      id: "1", name: "Granfondo", finisherCount: 1,
      results: [mkResult({ pos: 1, genderPos: 1, raceTimeSecs: 100, name: "Ana Silva", team: id === 1 ? "Team Alpha" : "Team Beta" })],
    }]);
    const teamIdStore = new Map([["team alpha", 1], ["team beta", 2]]);
    const ranking = buildAggregateRanking(events, loader, new Map(), new Map(), teamIdStore);
    const anaSilvaEntries = ranking["2025"]!["Granfondo"]!["M"]!.filter((a) => a.name.toLowerCase() === "ana silva");
    expect(anaSilvaEntries.length).toBe(2);
    expect(anaSilvaEntries.every((a) => a.eventsScored === 1)).toBe(true);
  });

  it("looks up id from athleteIndex when provided", () => {
    const event = mkEvent(1, 2025, "2025-03-15");
    const loader = () => mkEventResults(1, 2025, "2025-03-15", [{
      id: "1", name: "Granfondo", finisherCount: 1,
      results: [mkResult({ name: "Ana Silva", team: "Team Alpha" })],
    }]);
    const teamIdStore = new Map([["team alpha", 1]]);
    const athleteIndex = new Map([["ana silva|1", mkAthleteEntry(99, "ana silva")]]);
    const ranking = buildAggregateRanking([event], loader, athleteIndex, new Map(), teamIdStore);
    expect(ranking["2025"]!["Granfondo"]!["M"]!.find((a) => a.name.toLowerCase() === "ana silva")?.id).toBe(99);
  });

  it("improves bestPos when athlete finishes higher in a later event", () => {
    const events = [mkEvent(1, 2025, "2025-03-15"), mkEvent(2, 2025, "2025-04-20")];
    const loader = (id: number) => mkEventResults(id, 2025, id === 1 ? "2025-03-15" : "2025-04-20", [{
      id: "1", name: "Granfondo", finisherCount: id === 1 ? 3 : 1,
      results: id === 1
        ? [
            mkResult({ pos: 1, genderPos: 1, raceTimeSecs: 100, name: "Other1", team: "Team X" }),
            mkResult({ pos: 2, genderPos: 2, raceTimeSecs: 200, name: "Other2", team: "Team Y" }),
            mkResult({ pos: 3, genderPos: 3, raceTimeSecs: 300, name: "Ana Silva", team: "Team Alpha" }),
          ]
        : [mkResult({ pos: 1, genderPos: 1, raceTimeSecs: 100, name: "Ana Silva", team: "Team Alpha" })],
    }]);
    const ranking = buildAggregateRanking(events, loader);
    expect(ranking["2025"]!["Granfondo"]!["M"]!.find((a) => a.name.toLowerCase() === "ana silva")?.bestPos).toBe(1);
  });

  it("falls back to existing country when result has empty country", () => {
    const events = [mkEvent(1, 2025, "2025-03-15"), mkEvent(2, 2025, "2025-04-20")];
    const loader = (id: number) => mkEventResults(id, 2025, id === 1 ? "2025-03-15" : "2025-04-20", [{
      id: "1", name: "Granfondo", finisherCount: 1,
      results: [mkResult({ pos: 1, genderPos: 1, raceTimeSecs: 100, name: "Ana Silva", team: "Team Alpha", country: id === 1 ? "Portugal" : "" })],
    }]);
    const ranking = buildAggregateRanking(events, loader);
    expect(ranking["2025"]!["Granfondo"]!["M"]!.find((a) => a.name.toLowerCase() === "ana silva")?.country).toBe("Portugal");
  });

  it("handles loader returning null", () => {
    const ranking = buildAggregateRanking([mkEvent(1, 2025, "2025-03-15")], () => null);
    expect(Object.keys(ranking).length).toBe(0);
  });

  it("ranks athletes by totalPoints descending", () => {
    const event = mkEvent(1, 2025, "2025-03-15");
    const loader = () => mkEventResults(1, 2025, "2025-03-15", [{
      id: "1", name: "Granfondo", finisherCount: 3,
      results: [
        mkResult({ pos: 1, genderPos: 1, raceTimeSecs: 100, name: "Winner" }),
        mkResult({ pos: 2, genderPos: 2, raceTimeSecs: 200, name: "Second" }),
        mkResult({ pos: 3, genderPos: 3, raceTimeSecs: 300, name: "Third" }),
      ],
    }]);
    const athletes = buildAggregateRanking([event], loader)["2025"]!["Granfondo"]!["M"]!;
    expect(athletes[0]!.name).toBe("Winner");
    expect(athletes[1]!.name).toBe("Second");
    expect(athletes[2]!.name).toBe("Third");
  });
});

// ── buildAggregateRanking — athleteId consolidation ───────────────────────────

describe("buildAggregateRanking — athleteId consolidation", () => {
  it("consolidates results for same athlete racing under different teams when athleteId is set", () => {
    const events = [mkEvent(1, 2026, "2026-02-15"), mkEvent(2, 2026, "2026-03-22")];
    const athleteIndex = new Map([["jose borges|team alpha", mkAthleteEntry(1, "jose borges", ["team alpha"])]]);
    const loader = (id: number) => mkEventResults(id, 2026, id === 1 ? "2026-02-15" : "2026-03-22", [{
      id: "1", name: "Granfondo", finisherCount: 300,
      results: [
        ...(id === 1 ? [mkResult({ pos: 1, genderPos: 1, raceTimeSecs: 100, athleteId: 1, name: "Jose Borges", team: "Team Alpha" })] : []),
        ...(id === 2 ? [mkResult({ pos: 1, genderPos: 1, raceTimeSecs: 100, athleteId: 1, name: "Jose Borges", team: "Guest Team" })] : []),
        ...Array.from({ length: 299 }, (_, i) =>
          mkResult({ pos: i + 2, genderPos: i + 2, raceTimeSecs: (i + 2) * 100, athleteId: 0, name: `Filler ${i}`, team: "Filler Team" })
        ),
      ],
    }]);
    const ranking = buildAggregateRanking(events, loader, athleteIndex);
    const joseEntries = ranking["2026"]!["Granfondo"]!["M"]!.filter((a) => a.name.toLowerCase() === "jose borges");
    expect(joseEntries.length).toBe(1);
    expect(joseEntries[0]!.id).toBe(1);
    expect(joseEntries[0]!.eventsScored).toBe(2);
  });

  it("without athleteId, different teams produce separate entries (baseline)", () => {
    const events = [mkEvent(1, 2026, "2026-02-15"), mkEvent(2, 2026, "2026-03-22")];
    const loader = (id: number) => mkEventResults(id, 2026, id === 1 ? "2026-02-15" : "2026-03-22", [{
      id: "1", name: "Granfondo", finisherCount: 1,
      results: [mkResult({ pos: 1, genderPos: 1, raceTimeSecs: 100, athleteId: 0, name: "Jose Borges", team: id === 1 ? "Team Alpha" : "Guest Team" })],
    }]);
    const teamIdStore = new Map([["team alpha", 1], ["guest team", 2]]);
    expect(buildAggregateRanking(events, loader, new Map(), new Map(), teamIdStore)["2026"]!["Granfondo"]!["M"]!.filter((a) => a.name.toLowerCase() === "jose borges").length).toBe(2);
  });

  it("uses athleteId to resolve id even when name+team key is not in athleteIndex", () => {
    const athleteIndex = new Map([["jose borges|canonical team", mkAthleteEntry(42, "jose borges", ["canonical team"])]]);
    const loader = () => mkEventResults(1, 2026, "2026-02-15", [{
      id: "1", name: "Granfondo", finisherCount: 1,
      results: [mkResult({ pos: 1, genderPos: 1, raceTimeSecs: 100, athleteId: 42, name: "Jose Borges", team: "Totally Different Team" })],
    }]);
    expect(buildAggregateRanking([mkEvent(1, 2026, "2026-02-15")], loader, athleteIndex)["2026"]!["Granfondo"]!["M"]![0]!.id).toBe(42);
  });

  it("normalizes distance aliases before grouping (BIG DAY and Clássica → Granfondo)", () => {
    const events = [mkEvent(1, 2026, "2026-02-15"), mkEvent(2, 2026, "2026-03-22")];
    const athleteIndex = new Map([["jose borges|team alpha", mkAthleteEntry(1, "jose borges", ["team alpha"])]]);
    const loader = (id: number) => mkEventResults(id, 2026, id === 1 ? "2026-02-15" : "2026-03-22", [{
      id: "1", name: id === 1 ? "BIG DAY" : "Clássica", finisherCount: 300,
      results: [
        mkResult({ pos: 1, genderPos: 1, raceTimeSecs: 100, athleteId: 1, name: "Jose Borges", team: "Team Alpha" }),
        ...Array.from({ length: 299 }, (_, i) =>
          mkResult({ pos: i + 2, genderPos: i + 2, raceTimeSecs: (i + 2) * 100, athleteId: 0, name: `Filler ${i}`, team: "Filler" })
        ),
      ],
    }]);
    const ranking = buildAggregateRanking(events, loader, athleteIndex);
    expect(ranking["2026"]!["Granfondo"]).toBeDefined();
    expect(ranking["2026"]!["BIG DAY"]).toBeUndefined();
    expect(ranking["2026"]!["Clássica"]).toBeUndefined();
    expect(ranking["2026"]!["Granfondo"]!["M"]!.find((a) => a.id === 1)?.eventsScored).toBe(2);
  });
});

// ── buildAggregateRanking — points cutoff ─────────────────────────────────────

describe("buildAggregateRanking — points cutoff", () => {
  it("gives 0 points to finishers outside top 50 — they don't appear in ranking", () => {
    const results = Array.from({ length: 60 }, (_, i) =>
      mkResult({ pos: i + 1, genderPos: i + 1, raceTimeSecs: (i + 1) * 100, name: `Athlete ${i + 1}` })
    );
    const loader = () => mkEventResults(1, 2026, "2026-02-15", [{ id: "1", name: "Granfondo", finisherCount: 60, results }]);
    const gf_m = buildAggregateRanking([mkEvent(1, 2026, "2026-02-15")], loader)["2026"]!["Granfondo"]!["M"]!;
    expect(gf_m.length).toBe(50);
    expect(gf_m.every((a) => a.bestPos <= 50)).toBe(true);
  });

  it("position 50 scores 1 base point, position 51 scores nothing", () => {
    const results = Array.from({ length: 300 }, (_, i) =>
      mkResult({ pos: i + 1, genderPos: i + 1, raceTimeSecs: (i + 1) * 100, name: `Athlete ${i + 1}` })
    );
    const loader = () => mkEventResults(1, 2026, "2026-02-15", [{ id: "1", name: "Granfondo", finisherCount: 300, results }]);
    const gf_m = buildAggregateRanking([mkEvent(1, 2026, "2026-02-15")], loader)["2026"]!["Granfondo"]!["M"]!;
    expect(gf_m.find((a) => a.bestPos === 50)?.totalPoints).toBe(1);
    expect(gf_m.find((a) => a.bestPos === 51)).toBeUndefined();
  });

  it("athlete finishing outside top 50 does not appear in ranking", () => {
    const results = Array.from({ length: 200 }, (_, i) =>
      mkResult({ pos: i + 1, genderPos: i + 1, raceTimeSecs: (i + 1) * 100, name: i === 140 ? "Tiago Cavaco" : `Athlete ${i + 1}`, athleteId: i === 140 ? 999 : 0 })
    );
    const loader = () => mkEventResults(1, 2026, "2026-02-21", [{ id: "1", name: "Mediofondo", finisherCount: 200, results }]);
    expect(buildAggregateRanking([mkEvent(1, 2026, "2026-02-21")], loader)["2026"]!["Mediofondo"]!["M"]!.find((a) => a.name.toLowerCase() === "tiago cavaco")).toBeUndefined();
  });
});

// ── buildTeamRanking ──────────────────────────────────────────────────────────

describe("buildTeamRanking", () => {
  function mkTeamResults(teamAthletes: Array<{ name: string; pos: number; team: string }>): StoredEventResults {
    return mkEventResults(1, 2025, "2025-03-15", [{
      id: "1", name: "Granfondo", finisherCount: teamAthletes.length,
      results: teamAthletes.map((a, i) =>
        mkResult({ pos: a.pos, genderPos: i + 1, raceTimeSecs: a.pos * 100, name: a.name, team: a.team })
      ),
    }]);
  }

  it("requires at least 3 athletes per team for eligibility", () => {
    const loader = () => mkTeamResults([
      { name: "A1", pos: 1, team: "Team Alpha" },
      { name: "A2", pos: 2, team: "Team Alpha" },
      { name: "B1", pos: 3, team: "Team Beta" },
      { name: "B2", pos: 4, team: "Team Beta" },
      { name: "B3", pos: 5, team: "Team Beta" },
    ]);
    const teams = buildTeamRanking([mkEvent(1, 2025, "2025-03-15")], loader)["2025"]!["Granfondo"]!;
    expect(teams.length).toBe(1);
    expect(teams[0]!.team).toBe("Team Beta");
  });

  it("ranks teams by sum of top-3 positions (lower = better)", () => {
    const loader = () => mkTeamResults([
      { name: "A1", pos: 1, team: "Team Alpha" }, { name: "A2", pos: 2, team: "Team Alpha" }, { name: "A3", pos: 3, team: "Team Alpha" },
      { name: "B1", pos: 4, team: "Team Beta" },  { name: "B2", pos: 5, team: "Team Beta" },  { name: "B3", pos: 6, team: "Team Beta" },
    ]);
    const teams = buildTeamRanking([mkEvent(1, 2025, "2025-03-15")], loader)["2025"]!["Granfondo"]!;
    expect(teams[0]!.team).toBe("Team Alpha");
    expect(teams[1]!.team).toBe("Team Beta");
  });

  it("awards 25 base points to team rank 1 with 25 eligible teams (coeff = 1.00)", () => {
    const athletes: Array<{ name: string; pos: number; team: string }> = [
      { name: "A1", pos: 1, team: "Team Alpha" },
      { name: "A2", pos: 2, team: "Team Alpha" },
      { name: "A3", pos: 3, team: "Team Alpha" },
    ];
    for (let t = 0; t < 24; t++) {
      athletes.push({ name: `T${t}a`, pos: t * 3 + 4, team: `Other${t}` });
      athletes.push({ name: `T${t}b`, pos: t * 3 + 5, team: `Other${t}` });
      athletes.push({ name: `T${t}c`, pos: t * 3 + 6, team: `Other${t}` });
    }
    expect(buildTeamRanking([mkEvent(1, 2025, "2025-03-15")], () => mkTeamResults(athletes))["2025"]!["Granfondo"]![0]!.totalPoints).toBe(25);
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
    expect(buildTeamRanking(events, loader)["2025"]!["Granfondo"]![0]!.eventsScored).toBe(2);
  });

  it("excludes athletes with individual/solo team from ranking", () => {
    const loader = () => mkTeamResults([
      { name: "A1", pos: 1, team: "Individual" }, { name: "A2", pos: 2, team: "Individual" }, { name: "A3", pos: 3, team: "Individual" },
      { name: "B1", pos: 4, team: "Team Beta" },  { name: "B2", pos: 5, team: "Team Beta" },  { name: "B3", pos: 6, team: "Team Beta" },
    ]);
    const teams = buildTeamRanking([mkEvent(1, 2025, "2025-03-15")], loader)["2025"]!["Granfondo"]!;
    expect(teams.every((t) => t.team !== "Individual")).toBe(true);
    expect(teams.length).toBe(1);
  });

  it("handles loader returning null", () => {
    expect(Object.keys(buildTeamRanking([mkEvent(1, 2025, "2025-03-15")], () => null)).length).toBe(0);
  });

  it("tiebreaks equal combined score by best individual position", () => {
    const loader = () => mkTeamResults([
      { name: "A1", pos: 1, team: "Team Alpha" }, { name: "A2", pos: 3, team: "Team Alpha" }, { name: "A3", pos: 5, team: "Team Alpha" },
      { name: "B1", pos: 2, team: "Team Beta" },  { name: "B2", pos: 3, team: "Team Beta" },  { name: "B3", pos: 4, team: "Team Beta" },
    ]);
    const teams = buildTeamRanking([mkEvent(1, 2025, "2025-03-15")], loader)["2025"]!["Granfondo"]!;
    expect(teams[0]!.team).toBe("Team Alpha");
    expect(teams[1]!.team).toBe("Team Beta");
  });

  it("includes athlete IDs in team race results when athleteIndex provided", () => {
    const athletes = [
      { name: "A1", pos: 1, team: "Team Alpha" },
      { name: "A2", pos: 2, team: "Team Alpha" },
      { name: "A3", pos: 3, team: "Team Alpha" },
    ];
    const teamIdStore = new Map([["team alpha", 1]]);
    const athleteIndex = new Map([
      ["a1|1", mkAthleteEntry(10, "a1")],
      ["a2|1", mkAthleteEntry(20, "a2")],
      ["a3|1", mkAthleteEntry(30, "a3")],
    ]);
    const ranking = buildTeamRanking([mkEvent(1, 2025, "2025-03-15")], () => mkTeamResults(athletes), athleteIndex, new Map(), teamIdStore);
    expect(ranking["2025"]!["Granfondo"]![0]!.results[0]!.athletes.map((a) => a.id)).toEqual([10, 20, 30]);
  });
});
