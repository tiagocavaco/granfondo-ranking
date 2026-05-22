import { describe, it, expect } from "vitest";
import { apiAthleteToParticipant, resolveDistances } from "./events.js";
import type { ApiAthlete } from "../types.js";

// ── apiAthleteToParticipant ───────────────────────────────────────────────────

describe("apiAthleteToParticipant", () => {
  const base: ApiAthlete = {
    dorsal: "42",
    nome: "João Silva",
    nomecompleto: "João Manuel Silva",
    sexo: "M",
    equipa: "Team Alpha",
    escalao: "ELITES M",
    percurso: "Granfondo",
    id_percursos: "1",
  };

  it("maps all fields correctly", () => {
    const p = apiAthleteToParticipant(base);
    expect(p.bib).toBe("42");
    expect(p.name).toBe("João Silva");
    expect(p.fullName).toBe("João Manuel Silva");
    expect(p.gender).toBe("M");
    expect(p.team).toBe("Team Alpha");
    expect(p.category).toBe("ELITES M");
    expect(p.distance).toBe("Granfondo");
    expect(p.distanceId).toBe("1");
  });

  it("always sets athleteId to 0", () => {
    expect(apiAthleteToParticipant(base).athleteId).toBe(0);
  });

  it("applies fixRawTeamName — e.g. 'C.B. Almodo^var' → 'C.B. Almodôvar'", () => {
    const p = apiAthleteToParticipant({ ...base, equipa: "C.B. Almodo^var" });
    expect(p.team).toBe("C.B. Almodôvar");
  });

  it("applies fixRawTeamName for all circumflex vowel variants", () => {
    const p = apiAthleteToParticipant({
      ...base,
      equipa: "Clube a^guas e^o^ u^",
    });
    expect(p.team).toBe("Clube âguas êô û");
  });

  it("falls back to empty string when dorsal is undefined", () => {
    const a = { ...base, dorsal: undefined as unknown as string };
    expect(apiAthleteToParticipant(a).bib).toBe("");
  });

  it("falls back to empty string when nome is undefined", () => {
    const a = { ...base, nome: undefined as unknown as string };
    expect(apiAthleteToParticipant(a).name).toBe("");
  });

  it("falls back to empty string when equipa is undefined", () => {
    const a = { ...base, equipa: undefined as unknown as string };
    expect(apiAthleteToParticipant(a).team).toBe("");
  });

  it("falls back to empty string when percurso is undefined", () => {
    const a = { ...base, percurso: undefined as unknown as string };
    expect(apiAthleteToParticipant(a).distance).toBe("");
  });

  it("falls back to empty string when id_percursos is undefined", () => {
    const a = { ...base, id_percursos: undefined as unknown as string };
    expect(apiAthleteToParticipant(a).distanceId).toBe("");
  });
});

// ── resolveDistances ──────────────────────────────────────────────────────────

describe("resolveDistances", () => {
  it("returns extracted distances when athletes carry distance info", () => {
    const athletes = [
      {
        bib: "1",
        name: "A",
        fullName: "A",
        gender: "M",
        team: "",
        category: "",
        distance: "Granfondo",
        distanceId: "1",
        athleteId: 0,
      },
      {
        bib: "2",
        name: "B",
        fullName: "B",
        gender: "F",
        team: "",
        category: "",
        distance: "Mediofondo",
        distanceId: "2",
        athleteId: 0,
      },
      {
        bib: "3",
        name: "C",
        fullName: "C",
        gender: "M",
        team: "",
        category: "",
        distance: "Granfondo",
        distanceId: "1",
        athleteId: 0,
      },
    ];
    const result = resolveDistances(athletes, 99999);
    expect(result).toEqual([
      { id: "1", name: "Granfondo" },
      { id: "2", name: "Mediofondo" },
    ]);
  });

  it("falls back to DEFAULT_DISTANCES[eventId] when extraction returns empty", () => {
    // Event 1741 has a known DEFAULT_DISTANCES entry: GF + MF + Mini
    const athletes = [
      {
        bib: "1",
        name: "A",
        fullName: "A",
        gender: "M",
        team: "",
        category: "",
        distance: "",
        distanceId: "",
        athleteId: 0,
      },
    ];
    const result = resolveDistances(athletes, 1741);
    expect(result).toEqual([
      { id: "1", name: "Granfondo" },
      { id: "2", name: "Mediofondo" },
      { id: "3", name: "Minifondo" },
    ]);
  });

  it("returns [] when athletes list is empty and event ID has no default", () => {
    const result = resolveDistances([], 99999);
    expect(result).toEqual([]);
  });

  it("prefers extracted distances over DEFAULT_DISTANCES when athletes have distance info", () => {
    // Event 1741 has DEFAULT_DISTANCES, but we override with a single distance from participants
    const athletes = [
      {
        bib: "1",
        name: "A",
        fullName: "A",
        gender: "M",
        team: "",
        category: "",
        distance: "CustomDist",
        distanceId: "5",
        athleteId: 0,
      },
    ];
    const result = resolveDistances(athletes, 1741);
    expect(result).toEqual([{ id: "5", name: "CustomDist" }]);
  });
});
