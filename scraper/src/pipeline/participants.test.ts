import { describe, it, expect } from "vitest";
import { resolveParticipantAthleteIds } from "./participants.js";

const EVENT_ID = 1;

function makeParticipants(
  entries: Array<{ name: string; team: string }>,
): Map<number, Array<{ name: string; team: string }>> {
  return new Map([[EVENT_ID, entries]]);
}

describe("resolveParticipantAthleteIds", () => {
  it("resolves exact name+team match", () => {
    const nameToId = { "joao silva|sporting": 10 };
    const { ids, linked } = resolveParticipantAthleteIds(
      nameToId,
      makeParticipants([{ name: "João Silva", team: "Sporting" }]),
    );
    expect(linked).toBe(1);
    expect(ids.get(`${EVENT_ID}:João Silva:Sporting`)).toBe(10);
  });

  it("returns 0 linked for unknown athlete", () => {
    const { ids, linked } = resolveParticipantAthleteIds(
      {},
      makeParticipants([{ name: "Unknown Athlete", team: "Random Team" }]),
    );
    expect(linked).toBe(0);
    expect(ids.size).toBe(0);
  });

  it("compact-equality match resolves whitespace variants", () => {
    // nameToId uses the spaced key "ccbtt elvas"; participant registered as "CCBTTELVAS"
    // (no space). normalizeTeam("CCBTTELVAS") = "ccbttelvas" ≠ "ccbtt elvas" → exact
    // match fails, but compact("ccbttelvas") == compact("ccbtt elvas") → match fires.
    const nameToId = { "ana lima|ccbtt elvas": 42 };
    const { ids, linked } = resolveParticipantAthleteIds(
      nameToId,
      makeParticipants([{ name: "Ana Lima", team: "CCBTTELVAS" }]),
    );
    expect(linked).toBe(1);
    expect(ids.get(`${EVENT_ID}:Ana Lima:CCBTTELVAS`)).toBe(42);
  });

  it("compact-equality does not match on short team keys (< 4 chars)", () => {
    // nameToId key team "a bb" (compact "abb", length 3 < 4).
    // Participant "ABB" → normalizeTeam → "abb" ≠ "a bb" (exact fails).
    // compact("abb") == compact("a bb") but length 3 < 4 → guard blocks the match.
    const nameToId = { "rui sa|a bb": 99 };
    const { ids, linked } = resolveParticipantAthleteIds(
      nameToId,
      makeParticipants([{ name: "Rui Sá", team: "ABB" }]),
    );
    expect(linked).toBe(0);
    expect(ids.size).toBe(0);
  });

  it("exact match takes priority over compact-equality", () => {
    // Two keys: one matches exactly for "ccbttelvas", one would match via compact for
    // "ccbtt elvas". Participant "CCBTTELVAS" → "ccbttelvas" → exact match hits id=1.
    const nameToId = {
      "maria costa|ccbttelvas": 1,   // exact match
      "maria costa|ccbtt elvas": 2,  // compact-equality candidate
    };
    const { ids } = resolveParticipantAthleteIds(
      nameToId,
      makeParticipants([{ name: "Maria Costa", team: "CCBTTELVAS" }]),
    );
    expect(ids.get(`${EVENT_ID}:Maria Costa:CCBTTELVAS`)).toBe(1);
  });

  it("links solo-team participant (Individual) using empty team key", () => {
    // Athlete stored with key "david vaz|" (no team). Participant registers as
    // team "Individual" which is in SOLO_TEAM_KEYS → soloKey = "" → matches.
    const nameToId = { "david vaz|": 3359 };
    const { ids, linked } = resolveParticipantAthleteIds(
      nameToId,
      makeParticipants([{ name: "David Vaz", team: "Individual" }]),
    );
    expect(linked).toBe(1);
    expect(ids.get(`${EVENT_ID}:David Vaz:Individual`)).toBe(3359);
  });

  it("does not compact-match solo-team participants against team athletes", () => {
    // Participant is "Individual"; should NOT match a team athlete via compact path.
    const nameToId = { "david vaz|sporting": 100 };
    const { linked } = resolveParticipantAthleteIds(
      nameToId,
      makeParticipants([{ name: "David Vaz", team: "Individual" }]),
    );
    expect(linked).toBe(0);
  });

  it("does not pollute nameToId — only reads from it", () => {
    const nameToId = { "pedro gomes|sporting": 5 };
    const original = { ...nameToId };
    resolveParticipantAthleteIds(
      nameToId,
      makeParticipants([{ name: "Pedro Gomes", team: "Sporting" }]),
    );
    expect(nameToId).toEqual(original);
  });

  it("handles multiple events independently", () => {
    const nameToId = { "carlos mota|benfica": 7 };
    const allParticipants = new Map([
      [1, [{ name: "Carlos Mota", team: "Benfica" }]],
      [2, [{ name: "Carlos Mota", team: "Benfica" }]],
    ]);
    const { ids, linked } = resolveParticipantAthleteIds(nameToId, allParticipants);
    expect(linked).toBe(2);
    expect(ids.get("1:Carlos Mota:Benfica")).toBe(7);
    expect(ids.get("2:Carlos Mota:Benfica")).toBe(7);
  });
});
