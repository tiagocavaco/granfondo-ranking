import { describe, it, expect } from "vitest";
import { resolveParticipantAthleteIds } from "./participants.js";

const EVENT_ID = 1;

function makeParticipants(
  entries: Array<{ name: string; team: string }>,
): Map<number, Array<{ name: string; team: string }>> {
  return new Map([[EVENT_ID, entries]]);
}

describe("resolveParticipantAthleteIds", () => {
  it("resolves exact name+team match via team ID", () => {
    // teamNormalKey("Sporting") = "sporting", ID 10
    const nameToId = { "joao silva|10": 42 };
    const teamIdStore = new Map([["sporting", 10]]);
    const { ids, linked } = resolveParticipantAthleteIds(
      nameToId,
      makeParticipants([{ name: "João Silva", team: "Sporting" }]),
      teamIdStore,
    );
    expect(linked).toBe(1);
    expect(ids.get(`${EVENT_ID}:João Silva:Sporting`)).toBe(42);
  });

  it("returns 0 linked when team ID is unknown", () => {
    const nameToId = { "joao silva|10": 42 };
    const teamIdStore = new Map<string, number>(); // team not in store
    const { ids, linked } = resolveParticipantAthleteIds(
      nameToId,
      makeParticipants([{ name: "João Silva", team: "Sporting" }]),
      teamIdStore,
    );
    expect(linked).toBe(0);
    expect(ids.size).toBe(0);
  });

  it("resolves solo-team participant (Individual) using empty key suffix", () => {
    // Solo athlete stored with key "david vaz|" (no team ID).
    // Participant registers as "Individual" → isSoloTeam → looks up "david vaz|".
    const nameToId = { "david vaz|": 3359 };
    const { ids, linked } = resolveParticipantAthleteIds(
      nameToId,
      makeParticipants([{ name: "David Vaz", team: "Individual" }]),
      new Map(),
    );
    expect(linked).toBe(1);
    expect(ids.get(`${EVENT_ID}:David Vaz:Individual`)).toBe(3359);
  });

  it("does not match solo-team participant against team athletes", () => {
    // Participant is "Individual"; should NOT match a team athlete.
    const nameToId = { "david vaz|5": 100 };
    const { linked } = resolveParticipantAthleteIds(
      nameToId,
      makeParticipants([{ name: "David Vaz", team: "Individual" }]),
      new Map([["sporting", 5]]),
    );
    expect(linked).toBe(0);
  });

  it("does not pollute nameToId — only reads from it", () => {
    const nameToId = { "pedro gomes|5": 5 };
    const original = { ...nameToId };
    resolveParticipantAthleteIds(
      nameToId,
      makeParticipants([{ name: "Pedro Gomes", team: "Sporting" }]),
      new Map([["sporting", 5]]),
    );
    expect(nameToId).toEqual(original);
  });

  it("handles multiple events independently", () => {
    const nameToId = { "carlos mota|7": 7 };
    const teamIdStore = new Map([["benfica", 7]]);
    const allParticipants = new Map([
      [1, [{ name: "Carlos Mota", team: "Benfica" }]],
      [2, [{ name: "Carlos Mota", team: "Benfica" }]],
    ]);
    const { ids, linked } = resolveParticipantAthleteIds(nameToId, allParticipants, teamIdStore);
    expect(linked).toBe(2);
    expect(ids.get("1:Carlos Mota:Benfica")).toBe(7);
    expect(ids.get("2:Carlos Mota:Benfica")).toBe(7);
  });

  it("returns 0 linked for completely unknown athlete", () => {
    const { ids, linked } = resolveParticipantAthleteIds(
      {},
      makeParticipants([{ name: "Unknown Athlete", team: "Random Team" }]),
      new Map(),
    );
    expect(linked).toBe(0);
    expect(ids.size).toBe(0);
  });
});
