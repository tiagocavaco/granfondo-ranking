import BetterSqlite3 from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { buildDatabase, type AllScrapedData } from "@granfondo/database/db-writer";
import * as schema from "@granfondo/database/schema";
import type { DrizzleDb } from "@granfondo/database/db-client";
import { setGetDb } from "./db.js";
import type { AthleteResultRef, StoredResult, StoredParticipant } from "@granfondo/database/types";

export function minimalData(overrides: Partial<AllScrapedData> = {}): AllScrapedData {
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

export function mkEvent(id: number, overrides: Partial<AllScrapedData["events"][0]> = {}): AllScrapedData["events"][0] {
  return {
    id,
    name: `Event ${id}`,
    year: 2025,
    date: "2025-04-01",
    location: "Lisbon",
    resultsUrl: "https://example.com",
    officialUrl: null,
    hasResults: true,
    distances: [{ id: "1", name: "Granfondo" }],
    participantCount: 10,
    finisherCount: 8,
    scrapedAt: "2025-04-02T10:00:00.000Z",
    ...overrides,
  };
}

export function mkAthlete(
  id: number,
  name: string,
  results: AthleteResultRef[] = [],
): AllScrapedData["athletesIndex"] extends Map<string, infer T> ? T : never {
  return {
    id,
    name,
    nameLower: name.toLowerCase(),
    canonicalTeam: undefined,
    teams: [],
    categories: {},
    results,
  };
}

export function mkAthleteResult(
  overrides: Partial<AthleteResultRef> = {},
): AthleteResultRef {
  return {
    eventId: 1,
    eventName: "Event 1",
    eventDate: "2025-04-01",
    eventYear: 2025,
    distance: "Granfondo",
    pos: 1,
    genderPos: 1,
    catPos: 1,
    finisherCount: 8,
    category: "Masters",
    gender: "M",
    team: "Sporting",
    country: "PRT",
    raceTime: "3:00:00",
    raceTimeSecs: 10800,
    gap: "",
    gapSecs: 0,
    dnf: false,
    dns: false,
    ...overrides,
  };
}

export function mkStoredResult(overrides: Partial<StoredResult> = {}): StoredResult {
  return {
    pos: 1,
    genderPos: 1,
    catPos: 1,
    athleteId: 0,
    bib: "",
    name: "Test Athlete",
    gender: "M",
    team: "",
    category: "Masters A Male",
    country: "PRT",
    raceTime: "3:00:00",
    raceTimeSecs: 10800,
    gap: "",
    gapSecs: 0,
    points: 50,
    licences: [],
    dnf: false,
    dns: false,
    ...overrides,
  };
}

export function mkParticipant(overrides: Partial<StoredParticipant> = {}): StoredParticipant {
  return {
    athleteId: 0,
    bib: "1",
    name: "Test Participant",
    fullName: "Test Participant",
    gender: "M",
    team: "",
    category: "Masters A Male",
    distance: "Granfondo",
    distanceId: "1",
    ...overrides,
  };
}

export function setupTestDb(data: AllScrapedData) {
  const buf = buildDatabase(data);
  const sqlite = new BetterSqlite3(buf);
  const db = drizzle(sqlite, { schema }) as unknown as DrizzleDb;
  setGetDb(() => Promise.resolve(db));
}
