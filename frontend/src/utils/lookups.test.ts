import { describe, it, expect } from "vitest";
import { athleteLookupKey, resolveTeamKey } from "./lookups.js";

// ── athleteLookupKey ──────────────────────────────────────────────────────────

describe("athleteLookupKey", () => {
  it("combines normalised name and team key", () => {
    expect(athleteLookupKey("David Silva", "Sporting CP")).toBe("david silva|sporting cp");
  });

  it("normalises accented names", () => {
    expect(athleteLookupKey("João Gonçalves", "C.B. Almodôvar")).toBe("joao goncalves|cb almodovar");
  });

  it("drops team when team is empty string", () => {
    expect(athleteLookupKey("Maria Costa", "")).toBe("maria costa|");
  });

  it("drops team when team normalises to a solo key (Individual)", () => {
    expect(athleteLookupKey("Ana Lima", "Individual")).toBe("ana lima|");
  });

  it("drops team when team normalises to a solo key (Independente)", () => {
    expect(athleteLookupKey("Pedro Sousa", "Independente")).toBe("pedro sousa|");
  });

  it("drops team when team normalises to a solo key (Sem Equipa)", () => {
    expect(athleteLookupKey("Rui Costa", "Sem Equipa")).toBe("rui costa|");
  });

  it("keeps team when team is a real club", () => {
    const key = athleteLookupKey("Bruno Fernandes", "Sport Lisboa e Benfica");
    expect(key).toContain("|");
    expect(key.split("|")[1]).not.toBe("");
  });

  it("is case-insensitive for the name", () => {
    expect(athleteLookupKey("DAVID SILVA", "Sporting CP"))
      .toBe(athleteLookupKey("david silva", "Sporting CP"));
  });
});

// ── resolveTeamKey ────────────────────────────────────────────────────────────

describe("resolveTeamKey", () => {
  it("normalises a team name when no aliases are loaded", () => {
    expect(resolveTeamKey("C.B. Almodôvar")).toBe("cb almodovar");
  });

  it("strips punctuation and lowercases", () => {
    expect(resolveTeamKey("Sport Lisboa e Benfica")).toBe("sport lisboa e benfica");
  });

  it("returns empty string for empty input", () => {
    expect(resolveTeamKey("")).toBe("");
  });
});
