import { describe, it, expect, beforeAll } from "vitest";
import { getPredictions } from "./predictions.js";
import {
  setupTestDb,
  minimalData,
  mkEvent,
  mkAthlete,
  mkAthleteResult,
  mkParticipant,
} from "./test-db.js";

const CURRENT_YEAR = new Date().getFullYear();

beforeAll(() => {
  setupTestDb(
    minimalData({
      events: [
        mkEvent(10, {
          name: "Granfondo Algarve",
          date: "2025-04-01",
          hasResults: true,
        }),
        mkEvent(20, {
          name: "Upcoming Race",
          date: "2026-09-01",
          hasResults: false,
        }),
        mkEvent(30, {
          name: "Empty Event",
          date: "2026-10-01",
          hasResults: false,
        }),
      ],
      athletesIndex: new Map([
        [
          "joao silva|sporting",
          {
            ...mkAthlete(1, "João Silva", [
              mkAthleteResult({
                eventId: 10,
                eventDate: "2025-04-01",
                team: "Sporting",
                gender: "M",
                country: "PRT",
                category: "Masters A Male",
              }),
            ]),
            canonicalTeam: "Sporting",
            teams: ["sporting"],
          },
        ],
        [
          "maria costa|benfica",
          {
            ...mkAthlete(2, "Maria Costa", [
              mkAthleteResult({
                eventId: 10,
                eventDate: "2025-04-01",
                team: "Benfica",
                gender: "F",
                country: "PRT",
                category: "Elite Female",
              }),
            ]),
            canonicalTeam: "Benfica",
            teams: ["benfica"],
          },
        ],
      ]),
      teamIdStore: new Map([
        ["sporting", 1],
        ["benfica", 2],
      ]),
      // Aggregate ranking gives athlete 1 points in Granfondo
      aggregateRanking: {
        [String(CURRENT_YEAR - 1)]: {
          Granfondo: {
            M: [
              {
                rank: 1,
                id: 1,
                name: "João Silva",
                gender: "M",
                team: "Sporting",
                country: "PRT",
                totalPoints: 75,
                eventsScored: 1,
                bestPos: 1,
                results: [],
              },
            ],
            F: [
              {
                rank: 1,
                id: 2,
                name: "Maria Costa",
                gender: "F",
                team: "Benfica",
                country: "PRT",
                totalPoints: 60,
                eventsScored: 1,
                bestPos: 1,
                results: [],
              },
            ],
          },
        },
      },
      allParticipants: new Map([
        [
          20,
          [
            // Linked: athlete 1, will get weighted score
            mkParticipant({
              name: "João Silva",
              team: "Sporting",
              category: "Masters A Male",
              distance: "Granfondo",
              distanceId: "1",
            }),
            // Linked: athlete 2 (female)
            mkParticipant({
              name: "Maria Costa",
              team: "Benfica",
              category: "Elite Female",
              distance: "Granfondo",
              distanceId: "1",
            }),
            // Unlinked newcomer (Male)
            mkParticipant({
              name: "Unknown Rider",
              team: "",
              category: "Masters B Male",
              distance: "Granfondo",
              distanceId: "1",
            }),
            // Unlinked newcomer (Female)
            mkParticipant({
              name: "Unknown Female",
              team: "",
              category: "Masters A Female",
              distance: "Granfondo",
              distanceId: "1",
            }),
          ],
        ],
      ]),
      participantAthleteIds: new Map([
        ["20:João Silva:Sporting", 1],
        ["20:Maria Costa:Benfica", 2],
      ]),
    }),
  );
});

describe("getPredictions", () => {
  it("returns empty object for event with no participants", async () => {
    const preds = await getPredictions(30);
    expect(Object.keys(preds)).toHaveLength(0);
  });

  it("returns predictions grouped by distance", async () => {
    const preds = await getPredictions(20);
    expect(preds["Granfondo"]).toBeDefined();
  });

  it("linked athlete with points appears in ranked", async () => {
    const preds = await getPredictions(20);
    const cat = preds["Granfondo"]!.categories["Masters A Male"]!;
    expect(cat.ranked).toHaveLength(1);
    expect(cat.ranked[0]!.athleteId).toBe(1);
    expect(cat.ranked[0]!.weightedScore).toBeGreaterThan(0);
  });

  it("unlinked participant counted as newcomer", async () => {
    const preds = await getPredictions(20);
    const cat = preds["Granfondo"]!.categories["Masters B Male"]!;
    expect(cat.ranked).toHaveLength(0);
    expect(cat.newcomers).toBe(1);
  });

  it("overallMale picks highest-scoring male", async () => {
    const preds = await getPredictions(20);
    expect(preds["Granfondo"]!.overallMale).not.toBeNull();
    expect(preds["Granfondo"]!.overallMale!.athleteId).toBe(1);
    expect(preds["Granfondo"]!.overallMale!.gender).toBe("M");
  });

  it("overallFemale picks highest-scoring female", async () => {
    const preds = await getPredictions(20);
    expect(preds["Granfondo"]!.overallFemale).not.toBeNull();
    expect(preds["Granfondo"]!.overallFemale!.athleteId).toBe(2);
    expect(preds["Granfondo"]!.overallFemale!.gender).toBe("F");
  });

  it("ranked athletes sorted by weightedScore descending", async () => {
    const preds = await getPredictions(20);
    const ranked = preds["Granfondo"]!.categories["Masters A Male"]!.ranked;
    for (let i = 1; i < ranked.length; i++) {
      expect(ranked[i - 1]!.weightedScore).toBeGreaterThanOrEqual(
        ranked[i]!.weightedScore,
      );
    }
  });

  it("applies year decay coefficient (prior year < current year)", async () => {
    const preds = await getPredictions(20);
    const pred = preds["Granfondo"]!.categories["Masters A Male"]!.ranked[0]!;
    // points=75, dist coeff=1.0 (same distance), year coeff = 0.9 (1 year ago)
    expect(pred.weightedScore).toBeCloseTo(75 * 1.0 * 0.9, 5);
  });

  it("includes mainDistance (best-scoring distance for the athlete)", async () => {
    const preds = await getPredictions(20);
    const pred = preds["Granfondo"]!.categories["Masters A Male"]!.ranked[0]!;
    expect(pred.mainDistance).toBe("Granfondo");
  });

  it("includes raceCount for linked athletes", async () => {
    const preds = await getPredictions(20);
    const pred = preds["Granfondo"]!.categories["Masters A Male"]!.ranked[0]!;
    expect(pred.raceCount).toBe(1);
  });
});
