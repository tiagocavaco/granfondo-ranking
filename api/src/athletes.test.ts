import { describe, it, expect, beforeAll } from "vitest";
import { getAthlete, searchAthletes } from "./athletes.js";
import {
  setupTestDb,
  minimalData,
  mkAthlete,
  mkAthleteResult,
} from "./test-db.js";

beforeAll(() => {
  setupTestDb(
    minimalData({
      athletesIndex: new Map([
        [
          "joao silva|sporting",
          mkAthlete(1, "João Silva", [
            mkAthleteResult({
              eventId: 10,
              eventName: "Granfondo Algarve",
              pos: 3,
              genderPos: 3,
            }),
            mkAthleteResult({
              eventId: 11,
              eventName: "Granfondo Porto",
              pos: 1,
              genderPos: 1,
            }),
          ]),
        ],
        [
          "maria costa|benfica",
          mkAthlete(2, "Maria Costa", [
            mkAthleteResult({
              eventId: 10,
              eventName: "Granfondo Algarve",
              gender: "F",
              pos: 1,
              genderPos: 1,
            }),
          ]),
        ],
        [
          "pedro alves|independente",
          mkAthlete(3, "Pedro Alves", [
            mkAthleteResult({
              eventId: 10,
              eventName: "Granfondo Algarve",
              pos: 5,
              genderPos: 5,
            }),
          ]),
        ],
      ]),
    }),
  );
});

describe("getAthlete", () => {
  it("returns athlete by id with results", async () => {
    const athlete = await getAthlete(1);
    expect(athlete.id).toBe(1);
    expect(athlete.name).toBe("João Silva");
    expect(athlete.results).toHaveLength(2);
  });

  it("results contain expected fields", async () => {
    const athlete = await getAthlete(1);
    const r = athlete.results.find((r) => r.eventId === 11)!;
    expect(r.pos).toBe(1);
    expect(r.distance).toBe("Granfondo");
    expect(r.team).toBe("Sporting");
  });

  it("throws for unknown athlete id", async () => {
    await expect(getAthlete(999)).rejects.toThrow("999");
  });

  it("returns athlete with a single result", async () => {
    const athlete = await getAthlete(3);
    expect(athlete.results).toHaveLength(1);
  });
});

describe("searchAthletes", () => {
  it("returns matching athletes by name prefix", async () => {
    const results = await searchAthletes("João");
    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results.some((a) => a.id === 1)).toBe(true);
  });

  it("is case-insensitive", async () => {
    const results = await searchAthletes("maria");
    expect(results.some((a) => a.id === 2)).toBe(true);
  });

  it("returns empty array when no match", async () => {
    const results = await searchAthletes("zzznomatch");
    expect(results).toHaveLength(0);
  });

  it("returns at most 20 results", async () => {
    const results = await searchAthletes("a");
    expect(results.length).toBeLessThanOrEqual(20);
  });
});
