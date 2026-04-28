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

  it("does not assign an athleteId to a result from a different team", () => {
    const entry = mkEntry(523, "filipe oliveira", [mkRef({ eventId: 1, pos: 5, team: "Team Penacova", distance: "Granfondo" })]);
    const allResults = new Map([[1, mkEventResults(1, [
      { nameLower: "filipe andre da silva oliveira", pos: 5, team: "Team Lisboa" },
    ])]]);

    injectAthleteIds(new Map([["filipe oliveira", entry]]), allResults);

    expect(allResults.get(1)!.distances[0]!.results[0]!.athleteId).toBe(0);
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
