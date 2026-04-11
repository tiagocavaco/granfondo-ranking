import { describe, it, expect } from "vitest";
import {
  buildAggregateRanking,
  buildAthletesIndexV2,
  type AthleteAliasRule,
  type ResultAssignment,
  type AthleteIdStore,
} from "../pipeline-v2.js";
import type {
  StoredEvent,
  StoredEventResults,
  StoredDistanceResults,
  StoredResult,
  AthleteEntry,
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
    category: "MASTERS A",
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

// ── buildAggregateRanking — athleteId consolidation ───────────────────────────

describe("buildAggregateRanking — athleteId consolidation", () => {
  it("consolidates results for same athlete racing under different teams when athleteId is set", () => {
    // Scenario: Jose Borges races event 1 as "Team Alpha" (canonical) and
    // event 2 as "Guest Team" (different team, same athleteId=1 injected).
    // Without the fix, these produce two separate ranking entries.
    const events = [mkEvent(1, 2026, "2026-02-15"), mkEvent(2, 2026, "2026-03-22")];

    // Build athlete index so we have a canonical key for id=1
    const athleteIndex = new Map<string, AthleteEntry>([
      ["jose borges|team alpha", mkAthleteEntry(1, "jose borges", ["team alpha"])],
    ]);

    const loader = (id: number) => mkEventResults(id, 2026, id === 1 ? "2026-02-15" : "2026-03-22", [{
      id: "1", name: "Granfondo", finisherCount: 300,
      results: [
        // Event 1: canonical team, athleteId already set
        ...(id === 1 ? [mkResult({
          pos: 1, genderPos: 1, raceTimeSecs: 100,
          athleteId: 1,
          name: "Jose Borges", nameLower: "jose borges",
          team: "Team Alpha",
        })] : []),
        // Event 2: different team ("Guest Team"), same athleteId
        ...(id === 2 ? [mkResult({
          pos: 1, genderPos: 1, raceTimeSecs: 100,
          athleteId: 1,
          name: "Jose Borges", nameLower: "jose borges",
          team: "Guest Team",
        })] : []),
        // Filler athletes to reach 300 so coefficient = 1.0
        ...Array.from({ length: 299 }, (_, i) =>
          mkResult({ pos: i + 2, genderPos: i + 2, raceTimeSecs: (i + 2) * 100, athleteId: 0, name: `Filler ${i}`, nameLower: `filler ${i}`, team: "Filler Team" })
        ),
      ],
    }]);

    const ranking = buildAggregateRanking(events, loader, athleteIndex);
    const gf_m = ranking["2026"]!["Granfondo"]!["M"]!;
    const joseEntries = gf_m.filter((a) => a.nameLower === "jose borges");

    // Must be a single consolidated entry
    expect(joseEntries.length).toBe(1);
    expect(joseEntries[0]!.id).toBe(1);
    expect(joseEntries[0]!.eventsScored).toBe(2);
    expect(joseEntries[0]!.results.length).toBe(2);
  });

  it("without athleteId, different teams produce separate entries (baseline)", () => {
    // Confirms the no-id path still works as before
    const events = [mkEvent(1, 2026, "2026-02-15"), mkEvent(2, 2026, "2026-03-22")];
    const loader = (id: number) => mkEventResults(id, 2026, id === 1 ? "2026-02-15" : "2026-03-22", [{
      id: "1", name: "Granfondo", finisherCount: 1,
      results: [mkResult({
        pos: 1, genderPos: 1, raceTimeSecs: 100,
        athleteId: 0,
        name: "Jose Borges", nameLower: "jose borges",
        team: id === 1 ? "Team Alpha" : "Guest Team",
      })],
    }]);

    const ranking = buildAggregateRanking(events, loader);
    const gf_m = ranking["2026"]!["Granfondo"]!["M"]!;
    const joseEntries = gf_m.filter((a) => a.nameLower === "jose borges");
    // No athleteId → different team keys → two separate entries
    expect(joseEntries.length).toBe(2);
  });

  it("uses athleteId to resolve id even when name+team key is not in athleteIndex", () => {
    const events = [mkEvent(1, 2026, "2026-02-15")];
    const athleteIndex = new Map<string, AthleteEntry>([
      ["jose borges|canonical team", mkAthleteEntry(42, "jose borges", ["canonical team"])],
    ]);
    // Result uses a completely different team name, but has the correct athleteId
    const loader = () => mkEventResults(1, 2026, "2026-02-15", [{
      id: "1", name: "Granfondo", finisherCount: 1,
      results: [mkResult({
        pos: 1, genderPos: 1, raceTimeSecs: 100,
        athleteId: 42,
        name: "Jose Borges", nameLower: "jose borges",
        team: "Totally Different Team",
      })],
    }]);

    const ranking = buildAggregateRanking(events, loader, athleteIndex);
    const jose = ranking["2026"]!["Granfondo"]!["M"]![0]!;
    // ID resolved from stored athleteId, not from name+team lookup
    expect(jose.id).toBe(42);
  });

  it("normalizes distance aliases before grouping (BIG DAY and Clássica → Granfondo)", () => {
    const events = [mkEvent(1, 2026, "2026-02-15"), mkEvent(2, 2026, "2026-03-22")];
    const athleteIndex = new Map<string, AthleteEntry>([
      ["jose borges|team alpha", mkAthleteEntry(1, "jose borges", ["team alpha"])],
    ]);
    const loader = (id: number) => mkEventResults(id, 2026, id === 1 ? "2026-02-15" : "2026-03-22", [{
      id: "1",
      name: id === 1 ? "BIG DAY" : "Clássica",
      finisherCount: 300,
      results: [
        mkResult({ pos: 1, genderPos: 1, raceTimeSecs: 100, athleteId: 1, name: "Jose Borges", nameLower: "jose borges", team: "Team Alpha" }),
        ...Array.from({ length: 299 }, (_, i) =>
          mkResult({ pos: i + 2, genderPos: i + 2, raceTimeSecs: (i + 2) * 100, athleteId: 0, name: `Filler ${i}`, nameLower: `filler ${i}`, team: "Filler" })
        ),
      ],
    }]);

    const ranking = buildAggregateRanking(events, loader, athleteIndex);
    // Both BIG DAY and Clássica map to Granfondo
    expect(ranking["2026"]!["Granfondo"]).toBeDefined();
    expect(ranking["2026"]!["BIG DAY"]).toBeUndefined();
    expect(ranking["2026"]!["Clássica"]).toBeUndefined();

    // And the athlete's two results are consolidated under one entry
    const jose = ranking["2026"]!["Granfondo"]!["M"]!.find((a) => a.id === 1);
    expect(jose?.eventsScored).toBe(2);
  });
});

// ── buildAggregateRanking — points cutoff ─────────────────────────────────────

describe("buildAggregateRanking — points cutoff", () => {
  it("gives 0 points to finishers outside top 50 — they don't appear in ranking", () => {
    const event = mkEvent(1, 2026, "2026-02-15");
    // Create 60 finishers; positions 51-60 should earn 0 pts and be excluded
    const results = Array.from({ length: 60 }, (_, i) =>
      mkResult({ pos: i + 1, genderPos: i + 1, raceTimeSecs: (i + 1) * 100, name: `Athlete ${i + 1}`, nameLower: `athlete ${i + 1}` })
    );
    const loader = () => mkEventResults(1, 2026, "2026-02-15", [{
      id: "1", name: "Granfondo", finisherCount: 60, results,
    }]);

    const ranking = buildAggregateRanking([event], loader);
    const gf_m = ranking["2026"]!["Granfondo"]!["M"]!;

    // Max 50 scorers
    expect(gf_m.length).toBe(50);
    // Position 51+ not present
    expect(gf_m.every((a) => a.bestPos <= 50)).toBe(true);
  });

  it("position 50 scores 1 base point, position 51 scores nothing", () => {
    const event = mkEvent(1, 2026, "2026-02-15");
    // 300 finishers → coeff = 1.0; pos 50 → 1 pt; pos 51 → 0 pt
    const results = Array.from({ length: 300 }, (_, i) =>
      mkResult({ pos: i + 1, genderPos: i + 1, raceTimeSecs: (i + 1) * 100, name: `Athlete ${i + 1}`, nameLower: `athlete ${i + 1}` })
    );
    const loader = () => mkEventResults(1, 2026, "2026-02-15", [{
      id: "1", name: "Granfondo", finisherCount: 300, results,
    }]);

    const ranking = buildAggregateRanking([event], loader);
    const gf_m = ranking["2026"]!["Granfondo"]!["M"]!;
    const at50 = gf_m.find((a) => a.bestPos === 50);
    const at51 = gf_m.find((a) => a.bestPos === 51);

    expect(at50?.totalPoints).toBe(1);   // 1 base pt × 1.00 coeff
    expect(at51).toBeUndefined();
  });

  it("athlete finishing outside top 50 in all events does not appear in ranking", () => {
    // This is the Tiago Cavaco / Algarve Mediofondo scenario:
    // athlete finishes genderPos=141 → 0 points → absent from ranking
    const event = mkEvent(1, 2026, "2026-02-21");
    const results = Array.from({ length: 200 }, (_, i) =>
      mkResult({
        pos: i + 1, genderPos: i + 1, raceTimeSecs: (i + 1) * 100,
        name: i === 140 ? "Tiago Cavaco" : `Athlete ${i + 1}`,
        nameLower: i === 140 ? "tiago cavaco" : `athlete ${i + 1}`,
        athleteId: i === 140 ? 999 : 0,
      })
    );
    const loader = () => mkEventResults(1, 2026, "2026-02-21", [{
      id: "1", name: "Mediofondo", finisherCount: 200, results,
    }]);

    const ranking = buildAggregateRanking([event], loader);
    const mf_m = ranking["2026"]!["Mediofondo"]!["M"]!;
    const tiago = mf_m.find((a) => a.nameLower === "tiago cavaco");

    expect(tiago).toBeUndefined();
  });
});
