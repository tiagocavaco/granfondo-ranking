import { describe, it, expect, beforeAll } from "vitest";
import { getTeamByKey, getTeamById } from "./teams.js";
import { setupTestDb, minimalData, mkEvent, mkAthlete, mkAthleteResult } from "./test-db.js";

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
                eventName: "Granfondo Algarve",
                eventDate: "2025-04-01",
                team: "Sporting",
                country: "PRT",
                category: "Masters A Male",
                gender: "M",
                pos: 1,
              }),
              mkAthleteResult({
                eventId: 10,
                eventName: "Granfondo Algarve",
                eventDate: "2025-03-01",
                team: "Sporting",
                country: "PRT",
                category: "Masters A Male",
                gender: "M",
                pos: 2,
                distance: "Mediofondo",
              }),
              mkAthleteResult({
                eventId: 10,
                eventName: "Granfondo Algarve",
                eventDate: "2025-02-01",
                team: "Sporting",
                country: "PRT",
                category: "Masters B Male",
                gender: "M",
                pos: 3,
                distance: "Minifondo",
              }),
            ]),
            canonicalTeam: "Sporting",
            teams: ["sporting"],
          },
        ],
      ]),
      teamIdStore: new Map([["sporting", 1]]),
    }),
  );
});

describe("getTeamByKey", () => {
  it("returns team detail for known key", async () => {
    const team = await getTeamByKey("sporting");
    expect(team).not.toBeNull();
  });

  it("returns null for unknown key", async () => {
    const team = await getTeamByKey("nonexistent");
    expect(team).toBeNull();
  });

  it("uses canonicalTeam as displayName when it matches the key", async () => {
    const team = await getTeamByKey("sporting");
    expect(team!.displayName).toBe("Sporting");
  });

  it("includes events the team participated in", async () => {
    const team = await getTeamByKey("sporting");
    expect(team!.events.length).toBeGreaterThanOrEqual(1);
  });

  it("groups results by event+distance key", async () => {
    const team = await getTeamByKey("sporting");
    // 3 results across 3 distances in event 10 → 3 distinct event+distance combos
    expect(team!.events).toHaveLength(3);
  });

  it("includes athlete entry in each event", async () => {
    const team = await getTeamByKey("sporting");
    const gfEvent = team!.events.find((e) => e.distance === "Granfondo")!;
    expect(gfEvent.athletes).toHaveLength(1);
    expect(gfEvent.athletes[0]!.id).toBe(1);
    expect(gfEvent.athletes[0]!.name).toBe("João Silva");
    expect(gfEvent.athletes[0]!.pos).toBe(1);
  });

  it("sorts events newest first", async () => {
    const team = await getTeamByKey("sporting");
    const dates = team!.events.map((e) => e.eventDate);
    expect(dates[0]! >= dates[1]!).toBe(true);
  });

  it("selects category by most-frequent of last 3 races", async () => {
    // athlete has: Masters A Male x2, Masters B Male x1 → most frequent is Masters A Male
    const team = await getTeamByKey("sporting");
    const gfEvent = team!.events.find((e) => e.distance === "Granfondo")!;
    expect(gfEvent.athletes[0]!.category).toBe("Masters A Male");
  });
});

describe("getTeamById", () => {
  it("returns team by numeric id", async () => {
    const team = await getTeamById(1);
    expect(team).not.toBeNull();
    expect(team!.displayName).toBe("Sporting");
  });

  it("returns null for unknown id", async () => {
    const team = await getTeamById(999);
    expect(team).toBeNull();
  });
});
