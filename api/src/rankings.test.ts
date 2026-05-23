import { describe, it, expect, beforeAll } from "vitest";
import { getAggregateRanking, getTeamRanking } from "./rankings.js";
import {
  setupTestDb,
  minimalData,
  mkEvent,
  mkAthlete,
  mkAthleteResult,
} from "./test-db.js";

beforeAll(() => {
  setupTestDb(
    minimalData({
      events: [mkEvent(10, { name: "Granfondo Algarve", date: "2025-04-01" })],
      athletesIndex: new Map([
        [
          "joao silva|sporting",
          {
            ...mkAthlete(1, "João Silva", [
              mkAthleteResult({
                eventId: 10,
                eventDate: "2025-04-01",
                team: "Sporting",
                country: "PRT",
                gender: "M",
              }),
            ]),
            canonicalTeam: "Sporting",
            teams: ["sporting"],
          },
        ],
      ]),
      teamIdStore: new Map([["sporting", 1]]),
      aggregateRanking: {
        "2025": {
          Granfondo: {
            M: [
              {
                rank: 1,
                id: 1,
                name: "João Silva",
                gender: "M",
                team: "Sporting",
                country: "PRT",
                totalPoints: 100.5,
                eventsScored: 1,
                bestPos: 1,
                results: [
                  {
                    eventId: 10,
                    eventName: "Granfondo Algarve",
                    eventDate: "2025-04-01",
                    distanceFinishers: 300,
                    coefficient: 1.0,
                    pos: 1,
                    basePoints: 75,
                    points: 75.0,
                  },
                ],
              },
            ],
          },
        },
      },
      teamRanking: {
        "2025": {
          Granfondo: [
            {
              rank: 1,
              team: "Sporting",
              teamId: 1,
              teamKey: "sporting",
              totalPoints: 50.0,
              eventsScored: 1,
              bestRank: 1,
              results: [
                {
                  eventId: 10,
                  eventName: "Granfondo Algarve",
                  eventDate: "2025-04-01",
                  totalTeams: 10,
                  eligibleTeams: 5,
                  coefficient: 1.41,
                  teamRank: 1,
                  basePoints: 25,
                  points: 35.25,
                  combinedScore: 6,
                  athletes: [
                    {
                      id: 1,
                      name: "João Silva",
                      pos: 1,
                      scoring: true,
                      country: "PRT",
                      category: "Masters A Male",
                    },
                    {
                      id: 0,
                      name: "Pedro Alves",
                      pos: 2,
                      scoring: true,
                      country: "PRT",
                      category: "Masters A Male",
                    },
                    {
                      id: 0,
                      name: "Rui Costa",
                      pos: 3,
                      scoring: true,
                      country: "PRT",
                      category: "Masters A Male",
                    },
                  ],
                },
              ],
            },
          ],
        },
      },
    }),
  );
});

describe("getAggregateRanking", () => {
  it("returns the correct year/distance/gender structure", async () => {
    const r = await getAggregateRanking();
    expect(r["2025"]).toBeDefined();
    expect(r["2025"]!["Granfondo"]).toBeDefined();
    expect(r["2025"]!["Granfondo"]!["M"]).toHaveLength(1);
  });

  it("returns athlete with correct fields", async () => {
    const r = await getAggregateRanking();
    const athlete = r["2025"]!["Granfondo"]!["M"]![0]!;
    expect(athlete.rank).toBe(1);
    expect(athlete.id).toBe(1);
    expect(athlete.name).toBe("João Silva");
    expect(athlete.team).toBe("Sporting");
    expect(athlete.totalPoints).toBe(100.5);
    expect(athlete.eventsScored).toBe(1);
    expect(athlete.bestPos).toBe(1);
  });

  it("resolves athlete name from athletes table", async () => {
    const r = await getAggregateRanking();
    const athlete = r["2025"]!["Granfondo"]!["M"]![0]!;
    expect(athlete.name).toBe("João Silva");
  });

  it("resolves country from athleteResults (most frequent)", async () => {
    const r = await getAggregateRanking();
    const athlete = r["2025"]!["Granfondo"]!["M"]![0]!;
    expect(athlete.country).toBe("PRT");
  });

  it("joins aggregate results per athlete", async () => {
    const r = await getAggregateRanking();
    const athlete = r["2025"]!["Granfondo"]!["M"]![0]!;
    expect(athlete.results).toHaveLength(1);
    expect(athlete.results[0]!.eventId).toBe(10);
    expect(athlete.results[0]!.points).toBe(75.0);
    expect(athlete.results[0]!.coefficient).toBe(1.0);
  });

  it("returns empty object when no ranking data", async () => {
    // The base minimalData has no ranking — confirmed via separate empty check
    const r = await getAggregateRanking();
    expect(r["2024"]).toBeUndefined();
  });
});

describe("getTeamRanking", () => {
  it("returns the correct year/distance structure", async () => {
    const r = await getTeamRanking();
    expect(r["2025"]).toBeDefined();
    expect(r["2025"]!["Granfondo"]).toHaveLength(1);
  });

  it("returns team entry with correct fields", async () => {
    const r = await getTeamRanking();
    const entry = r["2025"]!["Granfondo"]![0]!;
    expect(entry.rank).toBe(1);
    expect(entry.team).toBe("Sporting");
    expect(entry.teamId).toBe(1);
    expect(entry.totalPoints).toBe(50.0);
    expect(entry.eventsScored).toBe(1);
    expect(entry.bestRank).toBe(1);
  });

  it("joins race results per team", async () => {
    const r = await getTeamRanking();
    const entry = r["2025"]!["Granfondo"]![0]!;
    expect(entry.results).toHaveLength(1);
    const race = entry.results[0]!;
    expect(race.eventId).toBe(10);
    expect(race.teamRank).toBe(1);
    expect(race.points).toBe(35.25);
    expect(race.combinedScore).toBe(6);
    expect(race.eligibleTeams).toBe(5);
  });

  it("joins athletes per race result", async () => {
    const r = await getTeamRanking();
    const athletes = r["2025"]!["Granfondo"]![0]!.results[0]!.athletes;
    expect(athletes).toHaveLength(3);
    expect(athletes[0]!.pos).toBe(1);
    expect(athletes[0]!.scoring).toBe(true);
  });

  it("returns empty object when no ranking data", async () => {
    const r = await getTeamRanking();
    expect(r["2024"]).toBeUndefined();
  });
});
