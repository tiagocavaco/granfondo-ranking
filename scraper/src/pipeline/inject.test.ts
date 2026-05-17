import { describe, it, expect } from "vitest";
import { injectAthleteIds } from "./inject.js";
import type { AthleteEntry, StoredEventResults } from "@granfondo/database/types";

function mkEntry(id: number, nameLower: string, results: AthleteEntry["results"]): AthleteEntry {
  return { id, name: nameLower, nameLower, teams: [], categories: {}, results };
}

function mkRef(overrides: Partial<AthleteEntry["results"][number]> = {}): AthleteEntry["results"][number] {
  return {
    eventId: 1, eventName: "Event 1", eventDate: "2025-04-01", eventYear: 2025,
    distance: "Granfondo", pos: 1, genderPos: 1, catPos: 0, finisherCount: 100,
    category: "ELITES M", gender: "M", team: "Team Alpha", country: "Portugal",
    raceTime: "03:25:10", raceTimeSecs: 12310, gap: "", gapSecs: 0,
    dnf: false, dns: false,
    ...overrides,
  };
}

function mkEventResults(eventId: number, rows: Array<{ nameLower: string; pos: number; team: string; distance?: string }>): StoredEventResults {
  return {
    eventId, eventName: `Event ${eventId}`, eventDate: "2025-04-01", eventYear: 2025,
    scrapedAt: "2025-04-01T00:00:00Z",
    distances: [{
      id: "1", name: "Granfondo", finisherCount: rows.length,
      results: rows.map(({ nameLower, pos, team, distance: _d }, i) => ({
        pos, genderPos: pos, catPos: 0, athleteId: 0, bib: String(i + 1),
        name: nameLower, nameLower, gender: "M", team,
        category: "ELITES M", country: "Portugal",
        raceTime: "03:00:00", raceTimeSecs: 10800, gap: "", gapSecs: 0,
        points: 0, licences: [], dnf: false, dns: false,
      })),
    }],
  };
}

describe("injectAthleteIds", () => {
  it("injects athleteId when scraped name matches canonical name exactly", () => {
    const entry = mkEntry(42, "filipe oliveira", [mkRef({ eventId: 1, pos: 1, team: "Team Alpha", distance: "Granfondo" })]);
    const allResults = new Map([[1, mkEventResults(1, [{ nameLower: "filipe oliveira", pos: 1, team: "Team Alpha" }])]]);

    injectAthleteIds(new Map([["filipe oliveira", entry]]), allResults);

    expect(allResults.get(1)!.distances[0]!.results[0]!.athleteId).toBe(42);
  });

  it("injects athleteId when scraped name is a longer variant of the canonical name", () => {
    // Regression: "Filipe André Da Silva Oliveira" in results should link to
    // athlete "Filipe Oliveira" (id 523) when the pipeline already matched them.
    const entry = mkEntry(523, "filipe oliveira", [mkRef({ eventId: 1, pos: 5, team: "Team Penacova", distance: "Granfondo" })]);
    const allResults = new Map([[1, mkEventResults(1, [
      { nameLower: "filipe andre da silva oliveira", pos: 5, team: "Team Penacova" },
    ])]]);

    injectAthleteIds(new Map([["filipe oliveira", entry]]), allResults);

    expect(allResults.get(1)!.distances[0]!.results[0]!.athleteId).toBe(523);
  });

  it("assigns athleteId by position even when result team differs from athlete's canonical team", () => {
    // The pos-based approach uses position as the sole discriminator for finishers.
    // If the pipeline placed athlete 523 at pos=5 for this event, the result row at
    // pos=5 is their result regardless of which team name appears in the raw data.
    const entry = mkEntry(523, "filipe oliveira", [mkRef({ eventId: 1, pos: 5, team: "Team Penacova", distance: "Granfondo" })]);
    const allResults = new Map([[1, mkEventResults(1, [
      { nameLower: "filipe andre da silva oliveira", pos: 5, team: "Team Lisboa" },
    ])]]);

    injectAthleteIds(new Map([["filipe oliveira", entry]]), allResults);

    expect(allResults.get(1)!.distances[0]!.results[0]!.athleteId).toBe(523);
  });

  it("tied positions: two athletes at the same pos each get their correct athleteId via name fallback", () => {
    // Regression: pos key collision when timing system records both athletes as pos=4.
    // The pos key is marked ambiguous; injection falls back to name lookup.
    const entryA = mkEntry(10, "diogo graca", [mkRef({ eventId: 1, pos: 4, team: "Team A", distance: "Granfondo" })]);
    const entryB = mkEntry(20, "ricardo silva", [mkRef({ eventId: 1, pos: 4, team: "Team B", distance: "Granfondo" })]);
    const allResults = new Map([[1, mkEventResults(1, [
      { nameLower: "diogo graca",   pos: 4, team: "Team A" },
      { nameLower: "ricardo silva", pos: 4, team: "Team B" },
    ])]]);

    injectAthleteIds(new Map([["diogo graca", entryA], ["ricardo silva", entryB]]), allResults);

    const results = allResults.get(1)!.distances[0]!.results;
    expect(results.find(r => r.name === "diogo graca")!.athleteId).toBe(10);
    expect(results.find(r => r.name === "ricardo silva")!.athleteId).toBe(20);
  });

  it("leaves DNF results (pos=0) with athleteId=0 when only name variant differs", () => {
    // DNF variant lookup is skipped to avoid ambiguity
    const entry = mkEntry(523, "filipe oliveira", [mkRef({ eventId: 1, pos: 0, team: "Team Penacova", distance: "Granfondo", dnf: true })]);
    const allResults = new Map([[1, mkEventResults(1, [
      { nameLower: "filipe andre da silva oliveira", pos: 0, team: "Team Penacova" },
    ])]]);

    injectAthleteIds(new Map([["filipe oliveira", entry]]), allResults);

    expect(allResults.get(1)!.distances[0]!.results[0]!.athleteId).toBe(0);
  });

  it("does not assign athleteId via name fallback to an unrelated result at the same event", () => {
    // Regression: two athletes with the same name at the same event in different positions.
    // Athlete 17523 is at pos=195 (Masters C, Individual). A different athlete (17611) is at
    // pos=27 (Elite, team) but has no result ref in the index for this event.
    // The name fallback must NOT assign 17523 to the pos=27 result row — that would be wrong.
    // Only tied positions should register a name fallback key; non-tied positions must not.
    const entry = mkEntry(17523, "joao pereira", [mkRef({ eventId: 1, pos: 195, team: "", distance: "Granfondo" })]);
    const allResults = new Map([[1, mkEventResults(1, [
      { nameLower: "joao pereira", pos: 27, team: "Escola Ciclismo" },
      { nameLower: "joao pereira", pos: 195, team: "" },
    ])]]);

    injectAthleteIds(new Map([["joao pereira", entry]]), allResults);

    const results = allResults.get(1)!.distances[0]!.results;
    expect(results.find(r => r.pos === 195)!.athleteId).toBe(17523); // correctly assigned
    expect(results.find(r => r.pos === 27)!.athleteId).toBe(0);      // NOT cross-assigned
  });

  it("returns the count of events with at least one updated row", () => {
    const entry = mkEntry(1, "test athlete", [
      mkRef({ eventId: 1, pos: 1, team: "T", distance: "Granfondo" }),
      mkRef({ eventId: 2, pos: 1, team: "T", distance: "Granfondo" }),
    ]);
    const allResults = new Map([
      [1, mkEventResults(1, [{ nameLower: "test athlete", pos: 1, team: "T" }])],
      [2, mkEventResults(2, [{ nameLower: "test athlete", pos: 1, team: "T" }])],
    ]);

    const count = injectAthleteIds(new Map([["test athlete", entry]]), allResults);

    expect(count).toBe(2);
  });
});
