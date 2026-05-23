import { describe, it, expect } from "vitest";
import BetterSqlite3 from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { buildDatabase, type AllScrapedData } from "./db-writer.js";
import * as schema from "./schema.js";

function minimalData(overrides: Partial<AllScrapedData> = {}): AllScrapedData {
  return {
    events: [],
    allResults: new Map(),
    allParticipants: new Map(),
    athletesIndex: new Map(),
    nameToId: {},
    teamAliases: {},
    teamIdStore: new Map(),
    aggregateRanking: {},
    teamRanking: {},
    stats: { uniqueAthletes: 0, uniqueByYear: {}, scrapedAt: "" },
    aliasRules: [],
    assignments: [],
    ...overrides,
  };
}

function openDb(buf: Buffer): ReturnType<typeof drizzle> {
  return drizzle(new BetterSqlite3(buf), { schema });
}

function mkEvent(id: number): AllScrapedData["events"][0] {
  return {
    id,
    name: `Event ${id}`,
    year: 2025,
    date: "2025-04-01",
    location: "Lisbon",
    resultsUrl: "https://example.com",
    officialUrl: null,
    hasResults: false,
    distances: [],
    participantCount: 0,
    finisherCount: 0,
    scrapedAt: null,
  };
}

function mkParticipant(
  name: string,
  team: string,
): AllScrapedData["allParticipants"] extends Map<number, Array<infer T>>
  ? T
  : never {
  return {
    athleteId: 0,
    bib: "1",
    name,
    fullName: name,
    gender: "M",
    team,
    category: "Masters",
    distance: "Granfondo",
    distanceId: "1",
  };
}

function mkAthlete(
  id: number,
  name: string,
): AllScrapedData["athletesIndex"] extends Map<string, infer T> ? T : never {
  // Athletes without any athlete_results rows are pruned by pruneGhostAthletes,
  // so every test athlete needs at least one result to survive buildDatabase.
  return {
    id,
    name,
    nameLower: name.toLowerCase(),
    canonicalTeam: undefined,
    teams: [],
    categories: {},
    results: [
      {
        eventId: 1,
        eventName: "Event 1",
        eventDate: "2025-04-01",
        eventYear: 2025,
        distance: "Granfondo",
        pos: 1,
        genderPos: 1,
        catPos: 1,
        finisherCount: 1,
        category: "Masters A Male",
        gender: "M",
        team: "",
        country: "PRT",
        raceTime: "3:00:00",
        raceTimeSecs: 10800,
        gap: "",
        gapSecs: 0,
        dnf: false,
        dns: false,
        bib: "",
      },
    ],
  };
}

// ── insertParticipants ────────────────────────────────────────────────────────

describe("insertParticipants", () => {
  it("stores athlete_id=0 when participantAthleteIds is absent", () => {
    const buf = buildDatabase(
      minimalData({
        events: [mkEvent(1)],
        allParticipants: new Map([
          [1, [mkParticipant("João Silva", "Sporting")]],
        ]),
      }),
    );
    const [row] = openDb(buf).select().from(schema.participants).all();
    expect(row!.athleteId).toBe(0);
  });

  it("stores resolved athlete_id from participantAthleteIds map", () => {
    const participant = mkParticipant("João Silva", "Sporting");
    const pKey = `1:${participant.name}:${participant.team}`;
    const buf = buildDatabase(
      minimalData({
        events: [mkEvent(1)],
        allParticipants: new Map([[1, [participant]]]),
        participantAthleteIds: new Map([[pKey, 42]]),
        athletesIndex: new Map([["joao silva|sporting", mkAthlete(42, "João Silva")]]),
      }),
    );
    const [row] = openDb(buf).select().from(schema.participants).all();
    expect(row!.athleteId).toBe(42);
  });

  it("stores 0 for participants not present in the map", () => {
    const linked = mkParticipant("João Silva", "Sporting");
    const unlinked = mkParticipant("Maria Costa", "Benfica");
    const buf = buildDatabase(
      minimalData({
        events: [mkEvent(1)],
        allParticipants: new Map([[1, [linked, unlinked]]]),
        participantAthleteIds: new Map([
          [`1:${linked.name}:${linked.team}`, 10],
        ]),
        athletesIndex: new Map([["joao silva|sporting", mkAthlete(10, "João Silva")]]),
      }),
    );
    const rows = openDb(buf).select().from(schema.participants).all();
    expect(rows.find((r) => r.name === "João Silva")!.athleteId).toBe(10);
    expect(rows.find((r) => r.name === "Maria Costa")!.athleteId).toBe(0);
  });
});

// ── insertAthletes ────────────────────────────────────────────────────────────

describe("insertAthletes", () => {
  it("inserts athletes without error", () => {
    const athlete = mkAthlete(1, "João Silva");
    const buf = buildDatabase(
      minimalData({
        athletesIndex: new Map([["joao silva|sporting", athlete]]),
      }),
    );
    const rows = openDb(buf).select().from(schema.athletes).all();
    expect(rows).toHaveLength(1);
    expect(rows[0]!.id).toBe(1);
  });

  it("does not crash when athletesIndex contains duplicate athlete IDs", () => {
    // Before onConflictDoNothing, a duplicate id in the map caused a UNIQUE
    // constraint crash. This validates the fix.
    const athlete = mkAthlete(137, "Pedro Gomes");
    const buf = buildDatabase(
      minimalData({
        athletesIndex: new Map([
          ["pedro gomes|rota dossa", athlete],
          // Same id, different key — empty results so the per-result UNIQUE
          // constraint isn't tripped on the second pass.
          ["pedro gomes|rota d ossa", { ...athlete, results: [] }],
        ]),
      }),
    );
    const rows = openDb(buf).select().from(schema.athletes).all();
    expect(rows).toHaveLength(1); // second insert was silently ignored
    expect(rows[0]!.id).toBe(137);
  });
});
