import { describe, it, expect } from "vitest";
import {
  isGranfondoName,
  isKidsCamVariant,
  extractDistances,
  assignGenderPositions,
  transformResult,
} from "./transform.js";
import type { ApiResult } from "./types.js";
import type { StoredParticipant, StoredDistanceResults, StoredResult } from "@granfondo/database/types";

// ── Fixtures ──────────────────────────────────────────────────────────────────

function mkResult(overrides: Partial<StoredResult> = {}): StoredResult {
  return {
    pos: 1, genderPos: 1, athleteId: 0, bib: "1",
    name: "Test Athlete", nameLower: "test athlete",
    gender: "M", team: "Team Alpha", category: "ELITES M", country: "Portugal",
    raceTime: "03:25:10", raceTimeSecs: 12310,
    gap: "", gapSecs: 0, points: 0, licences: [], dnf: false, dns: false,
    ...overrides,
  };
}

function mkParticipant(overrides: Partial<StoredParticipant> = {}): StoredParticipant {
  return {
    bib: "1", name: "Test", fullName: "Test Athlete",
    gender: "M", team: "Team Alpha", category: "ELITES M",
    distance: "Granfondo", distanceId: "1",
    ...overrides,
  };
}

function mkApiResult(overrides: Partial<ApiResult> = {}): ApiResult {
  return {
    pos: "1", dorsal: "1", nome: "Test Athlete", equipa: "Team Alpha",
    escalao: "ELITES M", sexo: "M", licenca1: "", pais_nome: "Portugal",
    pais_iso2: "PT", temposeg: "12310", tempo: "03:25:10.000",
    diferenca: "00:00:00.000", percurso: "Granfondo", id_percursos: "1",
    obs: "", status: "1", pontos: "0",
    ...overrides,
  };
}

// ── isGranfondoName ───────────────────────────────────────────────────────────

describe("isGranfondoName", () => {
  it("matches granfondo", () => expect(isGranfondoName("Algarve Granfondo 2025")).toBe(true));
  it("matches grandfondo typo", () => expect(isGranfondoName("Grandfondo Médio Tejo")).toBe(true));
  it("case insensitive", () => expect(isGranfondoName("GRANFONDO COIMBRA")).toBe(true));
  it("rejects non-granfondo events", () => expect(isGranfondoName("BTT XCO Race 2025")).toBe(false));
});

// ── isKidsCamVariant ──────────────────────────────────────────────────────────

describe("isKidsCamVariant", () => {
  it("matches kids", () => expect(isKidsCamVariant("Kids Race 2025")).toBe(true));
  it("matches caminhada", () => expect(isKidsCamVariant("Caminhada Familiar")).toBe(true));
  it("matches VIP", () => expect(isKidsCamVariant("Granfondo VIP Tour")).toBe(true));
  it("matches kids/cam", () => expect(isKidsCamVariant("Kids/Cam Event")).toBe(true));
  it("does not match normal granfondo", () => expect(isKidsCamVariant("Algarve Granfondo")).toBe(false));
});

// ── extractDistances ──────────────────────────────────────────────────────────

describe("extractDistances", () => {
  it("extracts unique distances ordered by id", () => {
    const athletes: StoredParticipant[] = [
      mkParticipant({ distance: "Mediofondo", distanceId: "2" }),
      mkParticipant({ distance: "Granfondo",  distanceId: "1" }),
      mkParticipant({ distance: "Granfondo",  distanceId: "1" }),
    ];
    expect(extractDistances(athletes)).toEqual([
      { id: "1", name: "Granfondo" },
      { id: "2", name: "Mediofondo" },
    ]);
  });

  it("returns empty for no athletes", () => {
    expect(extractDistances([])).toEqual([]);
  });
});

// ── assignGenderPositions ─────────────────────────────────────────────────────

describe("assignGenderPositions", () => {
  it("assigns gender positions sorted by race time", () => {
    const dist: StoredDistanceResults = {
      id: "1", name: "Granfondo", finisherCount: 3,
      results: [
        mkResult({ pos: 3, gender: "M", raceTimeSecs: 300, name: "C" }),
        mkResult({ pos: 1, gender: "M", raceTimeSecs: 100, name: "A" }),
        mkResult({ pos: 2, gender: "M", raceTimeSecs: 200, name: "B" }),
      ],
    };
    assignGenderPositions([dist]);
    const sorted = dist.results.map((r) => ({ name: r.name, genderPos: r.genderPos }));
    expect(sorted.find((r) => r.name === "A")?.genderPos).toBe(1);
    expect(sorted.find((r) => r.name === "B")?.genderPos).toBe(2);
    expect(sorted.find((r) => r.name === "C")?.genderPos).toBe(3);
  });

  it("separates genders correctly", () => {
    const dist: StoredDistanceResults = {
      id: "1", name: "Granfondo", finisherCount: 2,
      results: [
        mkResult({ pos: 1, gender: "M", raceTimeSecs: 100, name: "Male1" }),
        mkResult({ pos: 2, gender: "F", raceTimeSecs: 120, name: "Female1" }),
        mkResult({ pos: 3, gender: "M", raceTimeSecs: 200, name: "Male2" }),
      ],
    };
    assignGenderPositions([dist]);
    expect(dist.results.find((r) => r.name === "Male1")?.genderPos).toBe(1);
    expect(dist.results.find((r) => r.name === "Female1")?.genderPos).toBe(1);
    expect(dist.results.find((r) => r.name === "Male2")?.genderPos).toBe(2);
  });

  it("skips DNF and DNS entries", () => {
    const dist: StoredDistanceResults = {
      id: "1", name: "Granfondo", finisherCount: 1,
      results: [
        mkResult({ pos: 1, gender: "M", raceTimeSecs: 100, name: "Finisher", genderPos: 0 }),
        mkResult({ pos: 0, gender: "M", raceTimeSecs: 0, dnf: true, name: "DNF", genderPos: 0 }),
        mkResult({ pos: 0, gender: "M", raceTimeSecs: 0, dns: true, name: "DNS", genderPos: 0 }),
      ],
    };
    assignGenderPositions([dist]);
    expect(dist.results.find((r) => r.name === "Finisher")?.genderPos).toBe(1);
    expect(dist.results.find((r) => r.name === "DNF")?.genderPos).toBe(0);
    expect(dist.results.find((r) => r.name === "DNS")?.genderPos).toBe(0);
  });
});

// ── transformResult ───────────────────────────────────────────────────────────

describe("transformResult", () => {
  it("maps basic fields correctly", () => {
    const r = transformResult(mkApiResult());
    expect(r.pos).toBe(1);
    expect(r.name).toBe("Test Athlete");
    expect(r.nameLower).toBe("test athlete");
    expect(r.gender).toBe("M");
    expect(r.team).toBe("Team Alpha");
    expect(r.raceTime).toBe("03:25:10");
    expect(r.raceTimeSecs).toBe(12310);
  });

  it("detects DNF from obs field", () => {
    const r = transformResult(mkApiResult({ obs: "DNF" }));
    expect(r.dnf).toBe(true);
    expect(r.dns).toBe(false);
  });

  it("detects ABANDONOU as DNF", () => {
    expect(transformResult(mkApiResult({ obs: "ABANDONOU" })).dnf).toBe(true);
  });

  it("detects AB as DNF", () => {
    expect(transformResult(mkApiResult({ obs: "AB" })).dnf).toBe(true);
  });

  it("detects DNS", () => {
    const r = transformResult(mkApiResult({ obs: "DNS" }));
    expect(r.dns).toBe(true);
    expect(r.dnf).toBe(false);
  });

  it("detects NÃO PARTIU as DNS", () => {
    expect(transformResult(mkApiResult({ obs: "NÃO PARTIU" })).dns).toBe(true);
  });

  it("defaults gender to M when missing", () => {
    expect(transformResult(mkApiResult({ sexo: "" })).gender).toBe("M");
  });

  it("sets genderPos to 0 (filled in later)", () => {
    expect(transformResult(mkApiResult()).genderPos).toBe(0);
  });
});
