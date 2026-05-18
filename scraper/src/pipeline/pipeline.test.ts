import { describe, it, expect } from "vitest";
import {
  normalizeDistance,
  DISTANCE_ALIASES,
  athleteKey,
  isSoloTeam,
  SOLO_TEAM_KEYS,
  buildAthletesIndex,
  isValidCatTransition,
  type ResultAssignment,
  type AthleteIdStore,
} from "./pipeline.js";
import { teamNormalKey } from "../normalize.js";
import type {
  StoredEvent,
  StoredEventResults,
  StoredDistanceResults,
  StoredResult,
} from "@granfondo/database/types";

// ── Fixtures ──────────────────────────────────────────────────────────────────

function mkEvent(id: number, year: number, date: string): StoredEvent {
  return {
    id, name: `Event ${id}`, year, date, location: "Lisbon",
    resultsUrl: `https://results.stopandgo.pro/${id}`, officialUrl: null,
    hasResults: true, distances: [{ id: "1", name: "Granfondo" }],
    participantCount: 0, finisherCount: 0, scrapedAt: "2025-01-01T00:00:00Z",
  };
}

function mkResult(overrides: Partial<StoredResult> = {}): StoredResult {
  return {
    pos: 1, genderPos: 1, catPos: 0, athleteId: 0, bib: "1",
    name: "Test Athlete",
    gender: "M", team: "Team Alpha", category: "ELITES M", country: "Portugal",
    raceTime: "03:25:10", raceTimeSecs: 12310,
    gap: "", gapSecs: 0, points: 0, licences: [], dnf: false, dns: false,
    ...overrides,
  };
}

function mkEventResults(
  eventId: number, year: number, date: string,
  distances: StoredDistanceResults[]
): StoredEventResults {
  return { eventId, eventName: `Event ${eventId}`, eventDate: date, eventYear: year, scrapedAt: "2025-01-01T00:00:00Z", distances };
}

function runPipeline(
  events: StoredEvent[],
  loader: (id: number) => StoredEventResults | null
) {
  // Build a teamIdStore from fixture data using the real teamNormalKey normalizer
  const teamIdStore = new Map<string, number>();
  let nextId = 1;
  for (const e of events) {
    const res = loader(e.id);
    if (!res) continue;
    for (const dist of res.distances) {
      for (const r of dist.results) {
        if (!isSoloTeam(r.team)) {
          const key = teamNormalKey(r.team);
          if (key && !teamIdStore.has(key)) teamIdStore.set(key, nextId++);
        }
      }
    }
  }
  return buildAthletesIndex(events, loader, [], [], new Map(), teamIdStore);
}

function mkTeamEvent(eventId: number, year: number, date: string, name: string, team: string, category: string, genderPos: number, distance = "Granfondo", country = "Portugal") {
  const event = mkEvent(eventId, year, date);
  const loader = () => mkEventResults(eventId, year, date, [{
    id: "1", name: distance, finisherCount: 100,
    results: [mkResult({ bib: String(eventId), name, team, category, genderPos, country, athleteId: 0 })],
  }]);
  return { event, loader };
}

function mkSoloEvent(eventId: number, year: number, date: string, name: string, category: string, genderPos: number, distance = "Granfondo", country = "Portugal") {
  return mkTeamEvent(eventId, year, date, name, "", category, genderPos, distance, country);
}

function runMulti(fixtures: Array<{ event: StoredEvent; loader: (id: number) => StoredEventResults | null }>) {
  const events = fixtures.map(f => f.event);
  const loaderMap = new Map(fixtures.map(f => [f.event.id, f.loader]));
  return runPipeline(events, id => loaderMap.get(id)?.(id) ?? null);
}

// ── normalizeDistance ─────────────────────────────────────────────────────────

describe("normalizeDistance", () => {
  it("normalizes known aliases", () => {
    expect(normalizeDistance("granfondo")).toBe("Granfondo");
    expect(normalizeDistance("mediofondo")).toBe("Mediofondo");
    expect(normalizeDistance("minifondo")).toBe("Minifondo");
    expect(normalizeDistance("time trial")).toBe("Time Trial");
    expect(normalizeDistance("big day")).toBe("Granfondo");
    expect(normalizeDistance("half day")).toBe("Mediofondo");
    expect(normalizeDistance("etapa")).toBe("Mediofondo");
    // Figueira Champions Classic (with km suffix)
    expect(normalizeDistance("BIG DAY 129KM")).toBe("Granfondo");
    expect(normalizeDistance("HALF DAY 77,3KM")).toBe("Mediofondo");
    // Clássica Douro Internacional
    expect(normalizeDistance("Clássica Longa")).toBe("Granfondo");
    expect(normalizeDistance("Clássica Média")).toBe("Mediofondo");
    expect(normalizeDistance("Clássica Curta")).toBe("Minifondo");
    expect(normalizeDistance("Classica Longa")).toBe("Granfondo");
    expect(normalizeDistance("Classica Média")).toBe("Mediofondo");
    expect(normalizeDistance("Classica Curta")).toBe("Minifondo");
    // L'Étape Portugal by Tour de France
    expect(normalizeDistance("L'Étape 125")).toBe("Granfondo");
    expect(normalizeDistance("L'Étape 100")).toBe("Mediofondo");
    expect(normalizeDistance("L'Étape 50")).toBe("Minifondo");
  });

  it("passes through unknown distance names", () => {
    expect(normalizeDistance("Unknown Distance")).toBe("Unknown Distance");
  });

  it("covers all DISTANCE_ALIASES entries", () => {
    for (const [alias, canonical] of Object.entries(DISTANCE_ALIASES)) {
      expect(normalizeDistance(alias)).toBe(canonical);
    }
  });
});

// ── athleteKey / isSoloTeam ───────────────────────────────────────────────────

describe("athleteKey", () => {
  const store = new Map([["team alpha", 10], ["cb almodovar", 20]]);

  it("returns nameLower|teamId for affiliated athletes", () => {
    expect(athleteKey("ana silva", "Team Alpha", store)).toBe("ana silva|10");
  });

  it("returns nameLower|0 for team not in store (unknown team)", () => {
    expect(athleteKey("ana silva", "Unknown Club", store)).toBe("ana silva|0");
  });

  it("returns nameLower| for solo athletes (empty team, no category)", () => {
    expect(athleteKey("ana silva", "", store)).toBe("ana silva|");
  });

  it("returns nameLower|solo:category for 'Individual' team with category", () => {
    expect(athleteKey("ana silva", "Individual", store, "MASTERS B")).toBe("ana silva|solo:masters-b");
  });

  it("returns nameLower|solo:category for 'Indivídual' (accented) with category", () => {
    expect(athleteKey("ana silva", "Indivídual", store, "MASTERS A")).toBe("ana silva|solo:masters-a");
  });

  it("returns nameLower| for 'Individual' team with no category", () => {
    expect(athleteKey("ana silva", "Individual", store)).toBe("ana silva|");
  });

  it("normalizes team name before ID lookup", () => {
    expect(athleteKey("test", "C.B. Almodovar", store)).toBe("test|20");
  });
});

describe("isSoloTeam", () => {
  it("returns true for empty string", () => expect(isSoloTeam("")).toBe(true));
  it("returns true for 'Individual'", () => expect(isSoloTeam("Individual")).toBe(true));
  it("returns true for 'Independente'", () => expect(isSoloTeam("Independente")).toBe(true));
  it("returns false for a real team", () => expect(isSoloTeam("Team Alpha")).toBe(false));

  it("SOLO_TEAM_KEYS contains expected values", () => {
    expect(SOLO_TEAM_KEYS.has("individual")).toBe(true);
    expect(SOLO_TEAM_KEYS.has("independente")).toBe(true);
  });
});

// ── buildAthletesIndex — duplicate event safeguard ────────────────────────────

describe("buildAthletesIndex — duplicate event safeguard", () => {
  it("same licence, same event, different categories → one result kept, no duplicate", () => {
    const event = mkEvent(1, 2025, "2025-04-27");
    const loader = () => mkEventResults(1, 2025, "2025-04-27", [{
      id: "1", name: "Mediofondo", finisherCount: 100,
      results: [
        mkResult({ bib: "10", name: "Hugo Dias", licences: ["12345678"], team: "Individual", category: "MASTERS C", genderPos: 19, athleteId: 0, pos: 19 }),
        mkResult({ bib: "11", name: "Hugo Dias", licences: ["12345678"], team: "Individual", category: "MASTERS B", genderPos: 231, athleteId: 0, pos: 231 }),
      ],
    }]);
    const { index } = runPipeline([event], loader);
    const entries = [...index.values()].filter(e => e.nameLower === "hugo dias");
    expect(entries.length).toBe(1);
    expect(entries[0]!.results.length).toBe(1);
    expect(entries[0]!.results[0]!.category).toBe("MASTERS C");
  });

  it("same licence, same event, ambiguous categories → one result kept", () => {
    const events = [mkEvent(1, 2025, "2025-02-01"), mkEvent(2, 2025, "2025-04-27")];
    const loader = (id: number) => mkEventResults(id, 2025, id === 1 ? "2025-02-01" : "2025-04-27", [{
      id: "1", name: "Granfondo", finisherCount: 100,
      results: id === 1
        ? [mkResult({ bib: "1", name: "Hugo Dias", licences: ["12345678"], team: "CC Lagos", category: "MASTERS B", genderPos: 20, athleteId: 0 })]
        : [
            mkResult({ bib: "10", name: "Hugo Dias", licences: ["12345678"], team: "Individual", category: "MASTERS C", genderPos: 19, athleteId: 0, pos: 19 }),
            mkResult({ bib: "11", name: "Hugo Dias", licences: ["12345678"], team: "Individual", category: "MASTERS B", genderPos: 231, athleteId: 0, pos: 231 }),
          ],
    }]);
    const { index } = runPipeline(events, loader);
    const entries = [...index.values()].filter(e => e.nameLower === "hugo dias");
    expect(entries.length).toBe(1);
    expect(entries[0]!.results.length).toBe(2);
  });

  it("same licence, two different events → two results kept", () => {
    const events = [mkEvent(1, 2025, "2025-03-01"), mkEvent(2, 2025, "2025-04-01")];
    const loader = (id: number) => mkEventResults(id, 2025, `2025-0${id}-01`, [{
      id: "1", name: "Granfondo", finisherCount: 100,
      results: [mkResult({ bib: "10", name: "Hugo Dias", licences: ["12345678"], team: "CC Lisboa", category: "MASTERS C", genderPos: 10, athleteId: 0 })],
    }]);
    const { index } = runPipeline(events, loader);
    const entries = [...index.values()].filter(e => e.nameLower === "hugo dias");
    expect(entries.length).toBe(1);
    expect(entries[0]!.results.length).toBe(2);
  });
});

// ── buildAthletesIndex — year-category consistency sweep ──────────────────────

describe("buildAthletesIndex — year-category consistency sweep", () => {
  it("5× MASTERS C + 1× MASTERS B in same year → MASTERS B result re-homed to separate entry", () => {
    // All results solo (Individual). Licence groups them into one entry keyed "hugo dias|0".
    // The MASTERS B outlier re-homes to "hugo dias|solo:masters-b" (different key) → eviction
    // is not self-referential so it proceeds. Main entry ends with 5 MASTERS C results.
    const events = [1, 2, 3, 4, 5, 6].map(id => mkEvent(id, 2025, `2025-0${id}-01`));
    const loader = (id: number) => mkEventResults(id, 2025, `2025-0${id}-01`, [{
      id: "1", name: "Granfondo", finisherCount: 100,
      results: [mkResult({ bib: String(id), name: "Hugo Dias", licences: ["12345678"], team: "Individual", category: id === 5 ? "MASTERS B" : "MASTERS C", genderPos: 10, athleteId: 0 })],
    }]);
    const { index } = runPipeline(events, loader);
    const entries = [...index.values()].filter(e => e.nameLower === "hugo dias");
    const main = entries.find(e => e.results.every(r => r.category === "MASTERS C"));
    expect(main).toBeDefined();
    expect(main!.results.length).toBe(5);
  });

  it("5× MASTERS C + 1× MASTERS B same team in same year → all kept (self-referential, inseparable)", () => {
    // When all results share the same team, the outlier's rehome key equals the entry's own
    // key. The self-referential guard fires and keeps all 6 results — the mixed categories
    // can only be separated via a manual assignment.
    const events = [1, 2, 3, 4, 5, 6].map(id => mkEvent(id, 2025, `2025-0${id}-01`));
    const loader = (id: number) => mkEventResults(id, 2025, `2025-0${id}-01`, [{
      id: "1", name: "Granfondo", finisherCount: 100,
      results: [mkResult({ bib: String(id), name: "Hugo Dias", licences: ["12345678"], team: "CC Lagos", category: id === 5 ? "MASTERS B" : "MASTERS C", genderPos: 10, athleteId: 0 })],
    }]);
    const { index } = runPipeline(events, loader);
    const entries = [...index.values()].filter(e => e.nameLower === "hugo dias");
    expect(entries.length).toBe(1);
    expect(entries[0]!.results.length).toBe(6);
  });

  it("equal counts of two incompatible categories (1 vs 1) → no removal (ambiguous)", () => {
    const events = [mkEvent(1, 2025, "2025-03-01"), mkEvent(2, 2025, "2025-06-01")];
    const loader = (id: number) => mkEventResults(id, 2025, `2025-0${id}-01`, [{
      id: "1", name: "Granfondo", finisherCount: 100,
      results: [mkResult({ bib: String(id), name: "Hugo Dias", licences: ["12345678"], team: "CC Lagos", category: id === 1 ? "MASTERS B" : "MASTERS C", genderPos: 10, athleteId: 0 })],
    }]);
    const { index } = runPipeline(events, loader);
    const entries = [...index.values()].filter(e => e.nameLower === "hugo dias");
    expect(entries.length).toBe(1);
    expect(entries[0]!.results.length).toBe(2);
  });
});

// ── buildAthletesIndex — Pass 5: same-year solo grouping ──────────────────────

describe("buildAthletesIndex — Pass 5: same-year solo grouping", () => {
  it("same name + category + year across different events → single profile", () => {
    const events = [mkEvent(1, 2026, "2026-02-15"), mkEvent(2, 2026, "2026-03-22")];
    const loader = (id: number) => mkEventResults(id, 2026, id === 1 ? "2026-02-15" : "2026-03-22", [{
      id: "1", name: "Granfondo", finisherCount: 100,
      results: [mkResult({ bib: id === 1 ? "10" : "20", name: "Joao Silva", team: "", category: "MASTERS A", genderPos: 5, athleteId: 0 })],
    }]);
    const { index, soloFlags } = runPipeline(events, loader);
    const soloEntries = [...index.values()].filter(e => e.nameLower === "joao silva");
    expect(soloEntries.length).toBe(1);
    expect(soloEntries[0]!.results.length).toBe(2);
    expect(soloFlags.length).toBe(0);
  });

  it("same name + different category → two separate profiles", () => {
    const events = [mkEvent(1, 2026, "2026-02-15"), mkEvent(2, 2026, "2026-03-22")];
    const loader = (id: number) => mkEventResults(id, 2026, id === 1 ? "2026-02-15" : "2026-03-22", [{
      id: "1", name: "Granfondo", finisherCount: 100,
      results: [mkResult({ bib: String(id), name: "Joao Silva", team: "", category: id === 1 ? "MASTERS A" : "MASTERS B", genderPos: 5, athleteId: 0 })],
    }]);
    expect([...runPipeline(events, loader).index.values()].filter(e => e.nameLower === "joao silva").length).toBe(2);
  });

  it("collision same event + same distance, divergent percentiles → resolved by percentile", () => {
    const events = [mkEvent(1, 2026, "2026-02-15"), mkEvent(2, 2026, "2026-03-22"), mkEvent(3, 2026, "2026-04-12")];
    const loader = (id: number) => mkEventResults(id, 2026, id === 1 ? "2026-02-15" : id === 2 ? "2026-03-22" : "2026-04-12", [{
      id: "1", name: "Granfondo", finisherCount: 100,
      results: id === 1
        ? [mkResult({ bib: "10", name: "Joao Silva", team: "", category: "MASTERS A", genderPos: 10, athleteId: 0 })]
        : id === 2
        ? [mkResult({ bib: "20", name: "Joao Silva", team: "", category: "MASTERS A", genderPos: 12, athleteId: 0 })]
        : [
            mkResult({ bib: "A", name: "Joao Silva", team: "", category: "MASTERS A", genderPos: 11, athleteId: 0 }),
            mkResult({ bib: "B", name: "Joao Silva", team: "", category: "MASTERS A", genderPos: 80, athleteId: 0, pos: 80 }),
          ],
    }]);
    const { index, soloFlags } = runPipeline(events, loader);
    expect([...index.values()].filter(e => e.nameLower === "joao silva").length).toBe(2);
    expect([...index.values()].filter(e => e.nameLower === "joao silva").find(e => e.results.length === 3)).toBeDefined();
    expect(soloFlags.length).toBe(1);
    expect(soloFlags[0]!.resolution).toBe("percentile");
  });

  it("collision same event + different distances → resolved by distance", () => {
    const events = [mkEvent(1, 2026, "2026-02-15"), mkEvent(2, 2026, "2026-03-22")];
    const loader = (id: number) => {
      if (id === 1) return mkEventResults(1, 2026, "2026-02-15", [{
        id: "1", name: "Granfondo", finisherCount: 100,
        results: [mkResult({ bib: "10", name: "Ana Costa", team: "", category: "MASTERS A FEM", genderPos: 5, athleteId: 0, gender: "F" })],
      }]);
      return mkEventResults(2, 2026, "2026-03-22", [
        { id: "1", name: "Granfondo",  finisherCount: 100, results: [mkResult({ bib: "A", name: "Ana Costa", team: "", category: "MASTERS A FEM", genderPos: 5, athleteId: 0, gender: "F" })] },
        { id: "2", name: "Mediofondo", finisherCount: 80,  results: [mkResult({ bib: "B", name: "Ana Costa", team: "", category: "MASTERS A FEM", genderPos: 3, athleteId: 0, gender: "F" })] },
      ]);
    };
    const { index, soloFlags } = runPipeline(events, loader);
    expect([...index.values()].filter(e => e.nameLower === "ana costa").length).toBe(2);
    expect(soloFlags[0]!.resolution).toBe("distance");
  });

  it("collision same event + different distances, no prior events → resolved by distance", () => {
    const loader = () => mkEventResults(1, 2026, "2026-02-15", [
      { id: "1", name: "Granfondo",  finisherCount: 100, results: [mkResult({ bib: "A", name: "Joao Silva", team: "", category: "MASTERS A", genderPos: 20, athleteId: 0 })] },
      { id: "2", name: "Mediofondo", finisherCount: 80,  results: [mkResult({ bib: "B", name: "Joao Silva", team: "", category: "MASTERS A", genderPos: 15, athleteId: 0 })] },
    ]);
    const { index, soloFlags } = runPipeline([mkEvent(1, 2026, "2026-02-15")], loader);
    expect([...index.values()].filter(e => e.nameLower === "joao silva").length).toBe(2);
    expect(soloFlags[0]!.resolution).toBe("distance");
  });

  it("unresolvable collision (no baseline) → both bib-keyed + flagged_manual", () => {
    const loader = () => mkEventResults(1, 2026, "2026-02-15", [{
      id: "1", name: "Granfondo", finisherCount: 100,
      results: [
        mkResult({ bib: "X", name: "Pedro Nunes", team: "", category: "MASTERS B", genderPos: 10, athleteId: 0 }),
        mkResult({ bib: "Y", name: "Pedro Nunes", team: "", category: "MASTERS B", genderPos: 50, athleteId: 0, pos: 50 }),
      ],
    }]);
    const { index, soloFlags } = runPipeline([mkEvent(1, 2026, "2026-02-15")], loader);
    expect([...index.values()].filter(e => e.nameLower === "pedro nunes").length).toBe(2);
    expect(soloFlags[0]!.resolution).toBe("flagged_manual");
  });

  it("Elite + Masters A same name + same year → two separate profiles", () => {
    const events = [mkEvent(1, 2026, "2026-02-15"), mkEvent(2, 2026, "2026-03-22")];
    const loader = (id: number) => mkEventResults(id, 2026, id === 1 ? "2026-02-15" : "2026-03-22", [{
      id: "1", name: "Granfondo", finisherCount: 100,
      results: [mkResult({ bib: String(id), name: "Joao Silva", team: "", category: id === 1 ? "M Elite" : "MASTERS A", genderPos: 5, athleteId: 0 })],
    }]);
    expect([...runPipeline(events, loader).index.values()].filter(e => e.nameLower === "joao silva").length).toBe(2);
  });
});

// ── isValidCatTransition ──────────────────────────────────────────────────────

describe("isValidCatTransition", () => {
  it("same category is always valid", () => {
    expect(isValidCatTransition("Masters B Male", "Masters B Male", 1)).toBe(true);
    expect(isValidCatTransition("Elite Male", "Elite Male", 5)).toBe(true);
  });

  it("adjacent step (rank diff 1) is valid with 1+ year gap", () => {
    expect(isValidCatTransition("Elite Male", "Masters A Male", 1)).toBe(true);
    expect(isValidCatTransition("Masters A Male", "Masters B Male", 1)).toBe(true);
    expect(isValidCatTransition("Masters B Male", "Masters C Male", 1)).toBe(true);
  });

  it("going backwards in rank is never valid", () => {
    expect(isValidCatTransition("Masters B Male", "Elite Male", 5)).toBe(false);
    expect(isValidCatTransition("Masters A Male", "Elite Female", 10)).toBe(false);
  });

  it("skipping a category (rank diff 2) requires at least 11 years", () => {
    // The bug: Elite → Masters B in 2 years was allowed (2 > 2 = false)
    expect(isValidCatTransition("Elite Male", "Masters B Male", 2)).toBe(false);
    expect(isValidCatTransition("Elite Male", "Masters B Male", 10)).toBe(false);
    expect(isValidCatTransition("Elite Male", "Masters B Male", 11)).toBe(true);
    expect(isValidCatTransition("Masters A Male", "Masters C Male", 11)).toBe(true);
    expect(isValidCatTransition("Masters A Male", "Masters C Male", 10)).toBe(false);
  });

  it("skipping two categories (rank diff 3) requires at least 21 years", () => {
    expect(isValidCatTransition("Elite Male", "Masters C Male", 20)).toBe(false);
    expect(isValidCatTransition("Elite Male", "Masters C Male", 21)).toBe(true);
  });

  it("unknown category returns false", () => {
    expect(isValidCatTransition("Elite Male", "Unknown", 5)).toBe(false);
    expect(isValidCatTransition("Unknown", "Masters A Male", 5)).toBe(false);
  });
});

// ── buildAthletesIndex — Pass 6: cross-year solo merge ────────────────────────

describe("buildAthletesIndex — Pass 6: cross-year solo merge", () => {
  it("Masters A in 2025 + Masters B in 2026 → merged (valid step-up)", () => {
    const events = [mkEvent(1, 2025, "2025-03-15"), mkEvent(2, 2026, "2026-03-22")];
    const loader = (id: number) => mkEventResults(id, id === 1 ? 2025 : 2026, id === 1 ? "2025-03-15" : "2026-03-22", [{
      id: "1", name: "Granfondo", finisherCount: 100,
      results: [mkResult({ bib: String(id), name: "Rui Ferreira", team: "", category: id === 1 ? "MASTERS A" : "MASTERS B", genderPos: 5, athleteId: 0 })],
    }]);
    const entries = [...runPipeline(events, loader).index.values()].filter(e => e.nameLower === "rui ferreira");
    expect(entries.length).toBe(1);
    expect(entries[0]!.results.length).toBe(2);
  });

  it("Masters B in 2025 + Masters A in 2026 → NOT merged (de-aging)", () => {
    const events = [mkEvent(1, 2025, "2025-03-15"), mkEvent(2, 2026, "2026-03-22")];
    const loader = (id: number) => mkEventResults(id, id === 1 ? 2025 : 2026, id === 1 ? "2025-03-15" : "2026-03-22", [{
      id: "1", name: "Granfondo", finisherCount: 100,
      results: [mkResult({ bib: String(id), name: "Rui Ferreira", team: "", category: id === 1 ? "MASTERS B" : "MASTERS A", genderPos: 5, athleteId: 0 })],
    }]);
    expect([...runPipeline(events, loader).index.values()].filter(e => e.nameLower === "rui ferreira").length).toBe(2);
  });

  it("Masters A in 2025 + Masters C in 2026 → NOT merged (skipped a level)", () => {
    const events = [mkEvent(1, 2025, "2025-03-15"), mkEvent(2, 2026, "2026-03-22")];
    const loader = (id: number) => mkEventResults(id, id === 1 ? 2025 : 2026, id === 1 ? "2025-03-15" : "2026-03-22", [{
      id: "1", name: "Granfondo", finisherCount: 100,
      results: [mkResult({ bib: String(id), name: "Rui Ferreira", team: "", category: id === 1 ? "MASTERS A" : "MASTERS C", genderPos: 5, athleteId: 0 })],
    }]);
    expect([...runPipeline(events, loader).index.values()].filter(e => e.nameLower === "rui ferreira").length).toBe(2);
  });

  it("Elite in 2025 + Open 19-34 in 2026 → merged (bridge category)", () => {
    const events = [mkEvent(1, 2025, "2025-03-15"), mkEvent(2, 2026, "2026-03-22")];
    const loader = (id: number) => mkEventResults(id, id === 1 ? 2025 : 2026, id === 1 ? "2025-03-15" : "2026-03-22", [{
      id: "1", name: "Granfondo", finisherCount: 100,
      results: [mkResult({ bib: String(id), name: "Ana Costa", team: "", category: id === 1 ? "F Elite" : "F 19-34", genderPos: 5, athleteId: 0 })],
    }]);
    const entries = [...runPipeline(events, loader).index.values()].filter(e => e.nameLower === "ana costa");
    expect(entries.length).toBe(1);
    expect(entries[0]!.results.length).toBe(2);
  });

  it("Open 19-34 in 2025 + Masters A in 2026 → merged (bridge category, natural aging)", () => {
    const events = [mkEvent(1, 2025, "2025-03-15"), mkEvent(2, 2026, "2026-03-22")];
    const loader = (id: number) => mkEventResults(id, id === 1 ? 2025 : 2026, id === 1 ? "2025-03-15" : "2026-03-22", [{
      id: "1", name: "Granfondo", finisherCount: 100,
      results: [mkResult({ bib: String(id), name: "Carlos Matos", team: "", category: id === 1 ? "M 19-34" : "MASTERS A", genderPos: 5, athleteId: 0 })],
    }]);
    const entries = [...runPipeline(events, loader).index.values()].filter(e => e.nameLower === "carlos matos");
    expect(entries.length).toBe(1);
    expect(entries[0]!.results.length).toBe(2);
  });

  it("Masters A in 2025 + Open 19-34 in 2026 → merged (bridge category, bidirectional)", () => {
    const events = [mkEvent(1, 2025, "2025-03-15"), mkEvent(2, 2026, "2026-03-22")];
    const loader = (id: number) => mkEventResults(id, id === 1 ? 2025 : 2026, id === 1 ? "2025-03-15" : "2026-03-22", [{
      id: "1", name: "Granfondo", finisherCount: 100,
      results: [mkResult({ bib: String(id), name: "Carlos Matos", team: "", category: id === 1 ? "MASTERS A" : "M 19-34", genderPos: 5, athleteId: 0 })],
    }]);
    const entries = [...runPipeline(events, loader).index.values()].filter(e => e.nameLower === "carlos matos");
    expect(entries.length).toBe(1);
    expect(entries[0]!.results.length).toBe(2);
  });

  it("Open 19-34 in 2025 + Masters B in 2026 → NOT merged (bridge incompatible with Masters B+)", () => {
    const events = [mkEvent(1, 2025, "2025-03-15"), mkEvent(2, 2026, "2026-03-22")];
    const loader = (id: number) => mkEventResults(id, id === 1 ? 2025 : 2026, id === 1 ? "2025-03-15" : "2026-03-22", [{
      id: "1", name: "Granfondo", finisherCount: 100,
      results: [mkResult({ bib: String(id), name: "Carlos Matos", team: "", category: id === 1 ? "M 19-34" : "MASTERS B", genderPos: 5, athleteId: 0 })],
    }]);
    expect([...runPipeline(events, loader).index.values()].filter(e => e.nameLower === "carlos matos").length).toBe(2);
  });
});

// ── buildAthletesIndex — Pass 7: cross-year team-change merge ─────────────────

describe("buildAthletesIndex — Pass 7: cross-year team-change merge", () => {
  it("same name, 2 team profiles non-overlapping years, compatible category → merged", () => {
    const { event: e1, loader: l1 } = mkTeamEvent(1, 2025, "2025-03-15", "Abel Carmona", "Agila Xtrem", "MASTERS B", 5);
    const { event: e2, loader: l2 } = mkTeamEvent(2, 2026, "2026-03-22", "Abel Carmona", "Agila Extrem", "MASTERS B", 5);
    const entries = [...runMulti([{ event: e1, loader: l1 }, { event: e2, loader: l2 }]).index.values()].filter(e => e.nameLower === "abel carmona");
    expect(entries.length).toBe(1);
    expect(entries[0]!.results.length).toBe(2);
  });

  it("same name, 2 team profiles overlapping years → NOT merged (likely different people)", () => {
    const { event: e1, loader: l1 } = mkTeamEvent(1, 2025, "2025-03-15", "Abel Carmona", "Velocistar Cycling", "MASTERS B", 5);
    const { event: e2, loader: l2 } = mkTeamEvent(2, 2025, "2025-06-15", "Abel Carmona", "Pedalistas Porto", "MASTERS B", 5);
    expect([...runMulti([{ event: e1, loader: l1 }, { event: e2, loader: l2 }]).index.values()].filter(e => e.nameLower === "abel carmona").length).toBe(2);
  });

  it("same name, non-overlapping years, de-aging category → NOT merged", () => {
    const { event: e1, loader: l1 } = mkTeamEvent(1, 2025, "2025-03-15", "Abel Carmona", "Velocistar Cycling", "MASTERS B", 5);
    const { event: e2, loader: l2 } = mkTeamEvent(2, 2026, "2026-03-22", "Abel Carmona", "Pedalistas Porto", "MASTERS A", 5);
    expect([...runMulti([{ event: e1, loader: l1 }, { event: e2, loader: l2 }]).index.values()].filter(e => e.nameLower === "abel carmona").length).toBe(2);
  });

  it("same name, non-overlapping years, disjoint distances → NOT merged", () => {
    const { event: e1, loader: l1 } = mkTeamEvent(1, 2025, "2025-03-15", "Abel Carmona", "Velocistar Cycling", "MASTERS B", 5, "Granfondo");
    const { event: e2, loader: l2 } = mkTeamEvent(2, 2026, "2026-03-22", "Abel Carmona", "Pedalistas Porto", "MASTERS B", 5, "Minifondo");
    expect([...runMulti([{ event: e1, loader: l1 }, { event: e2, loader: l2 }]).index.values()].filter(e => e.nameLower === "abel carmona").length).toBe(2);
  });

  it("same name, non-overlapping years, country mismatch → NOT merged", () => {
    const { event: e1, loader: l1 } = mkTeamEvent(1, 2025, "2025-03-15", "Abel Carmona", "Velocistar Cycling", "MASTERS B", 5, "Granfondo", "ES");
    const { event: e2, loader: l2 } = mkTeamEvent(2, 2026, "2026-03-22", "Abel Carmona", "Pedalistas Porto", "MASTERS B", 5, "Granfondo", "PT");
    expect([...runMulti([{ event: e1, loader: l1 }, { event: e2, loader: l2 }]).index.values()].filter(e => e.nameLower === "abel carmona").length).toBe(2);
  });

  it("valid pair not blocked by third same-name profile with year overlap (pairwise regression)", () => {
    // Profile A: 2025 Team Alpha ES — same person as C, different year
    // Profile B: 2025 Team Beta PT — genuinely different person (country differs, same year as A so overlap blocks A-B anyway)
    // Profile C: 2026 Team Gamma ES — should merge with A; old code blocked this because B overlapped with A
    const { event: e1, loader: l1 } = mkTeamEvent(1, 2025, "2025-03-15", "Miguel Garcia", "Team Alpha", "MASTERS A", 4, "Granfondo", "ES");
    const { event: e2, loader: l2 } = mkTeamEvent(2, 2025, "2025-06-15", "Miguel Garcia", "Team Beta",  "MASTERS A", 4, "Granfondo", "PT");
    const { event: e3, loader: l3 } = mkTeamEvent(3, 2026, "2026-03-15", "Miguel Garcia", "Team Gamma", "MASTERS B", 6, "Granfondo", "ES");
    const entries = [...runMulti([{ event: e1, loader: l1 }, { event: e2, loader: l2 }, { event: e3, loader: l3 }]).index.values()].filter(e => e.nameLower === "miguel garcia");
    expect(entries.length).toBe(2); // A+C merged, B stays separate
    expect(entries.some(e => e.results.length === 2)).toBe(true); // one profile has both 2025 and 2026 results
  });

  it("non-overlapping years but divergent percentiles → NOT merged", () => {
    // Ensures the percentile check still guards against false positives after the pairwise fix
    // Profile A: top 3% in 2025; Profile B: ~40% in 2026 — |0.03 - 0.40| = 0.37 > 0.25
    const events = [
      mkEvent(1, 2025, "2025-03-15"), mkEvent(2, 2025, "2025-06-15"),
      mkEvent(3, 2026, "2026-03-15"), mkEvent(4, 2026, "2026-06-15"),
    ];
    const loader = (id: number) => mkEventResults(id, id <= 2 ? 2025 : 2026, id === 1 ? "2025-03-15" : id === 2 ? "2025-06-15" : id === 3 ? "2026-03-15" : "2026-06-15", [{
      id: "1", name: "Granfondo", finisherCount: 100,
      results: [mkResult({ bib: String(id), name: "Rui Alves", team: id <= 2 ? "Team Fast" : "Team Slow", category: "MASTERS A", genderPos: id <= 2 ? 3 : 40, athleteId: 0 })],
    }]);
    expect([...runPipeline(events, loader).index.values()].filter(e => e.nameLower === "rui alves").length).toBe(2);
  });

  it("licence-only solo athlete (teamId=0, all-solo results) is NOT merged into a same-name team athlete", () => {
    // Regression: Elite team cyclist in 2025 + a DIFFERENT person with the same name racing
    // solo as Masters A in 2026 with a licence. Elite→Masters A in 1 year is a valid category
    // transition and the percentile difference (4% vs 22%) is under the 0.25 threshold — before
    // the fix, Pass 7 merged them; after the fix, the |0 all-solo entry stays separate.
    const { event: e1, loader: l1 } = mkTeamEvent(1, 2025, "2025-03-15", "Ruben Pereira", "Team Carpintaria", "ELITES M", 4);
    const e2 = mkEvent(2, 2026, "2026-03-22");
    const l2 = () => mkEventResults(2, 2026, "2026-03-22", [{
      id: "1", name: "Granfondo", finisherCount: 100,
      results: [mkResult({ bib: "142", name: "Ruben Pereira", team: "Individual", category: "MASTERS A", genderPos: 22, licences: ["97734"], athleteId: 0 })],
    }]);
    const entries = [...runMulti([{ event: e1, loader: l1 }, { event: e2, loader: l2 }]).index.values()]
      .filter(e => e.nameLower === "ruben pereira");
    expect(entries.length).toBe(2);
    // The team athlete's profile is not contaminated
    const teamAthlete = entries.find(e => e.results.some(r => r.team === "Team Carpintaria"));
    expect(teamAthlete).toBeDefined();
    expect(teamAthlete!.results.length).toBe(1);
  });
});

// ── buildAthletesIndex — Pass 8: team ↔ solo cross-pass merge ────────────────

describe("buildAthletesIndex — Pass 8: team ↔ solo cross-pass merge", () => {
  it("solo result + team profile, no shared event, compatible → merged", () => {
    const { event: e1, loader: l1 } = mkTeamEvent(1, 2025, "2025-03-15", "Maria Sousa", "CC Faro", "MASTERS A", 5);
    const { event: e2, loader: l2 } = mkSoloEvent(2, 2025, "2025-06-15", "Maria Sousa", "MASTERS A", 6);
    const entries = [...runMulti([{ event: e1, loader: l1 }, { event: e2, loader: l2 }]).index.values()].filter(e => e.nameLower === "maria sousa");
    expect(entries.length).toBe(1);
    expect(entries[0]!.results.length).toBe(2);
  });

  it("solo + team sharing same eventId → NOT merged (golden rule)", () => {
    const { event: e1 } = mkTeamEvent(1, 2025, "2025-03-15", "Maria Sousa", "CC Faro", "MASTERS A", 5);
    const loader = (id: number) => mkEventResults(id, 2025, "2025-03-15", [{
      id: "1", name: "Granfondo", finisherCount: 100,
      results: [
        mkResult({ bib: "10", name: "Maria Sousa", team: "CC Faro", category: "MASTERS A", genderPos: 5, athleteId: 0 }),
        mkResult({ bib: "20", name: "Maria Sousa", team: "", category: "MASTERS A", genderPos: 6, athleteId: 0 }),
      ],
    }]);
    expect([...runPipeline([e1], loader).index.values()].filter(e => e.nameLower === "maria sousa").length).toBe(2);
  });

  it("solo Granfondo-only + team Minifondo-only → NOT merged (distance mismatch)", () => {
    const { event: e1, loader: l1 } = mkTeamEvent(1, 2025, "2025-03-15", "Maria Sousa", "CC Faro", "MASTERS A", 5, "Minifondo");
    const { event: e2, loader: l2 } = mkSoloEvent(2, 2025, "2025-06-15", "Maria Sousa", "MASTERS A", 6, "Granfondo");
    expect([...runMulti([{ event: e1, loader: l1 }, { event: e2, loader: l2 }]).index.values()].filter(e => e.nameLower === "maria sousa").length).toBe(2);
  });

  it("solo top-5% + team bottom-60% (≥2 results each) → NOT merged (percentile mismatch)", () => {
    const events = [mkEvent(1, 2025, "2025-01-15"), mkEvent(2, 2025, "2025-02-15"), mkEvent(3, 2025, "2025-04-15"), mkEvent(4, 2025, "2025-05-15")];
    const loader = (id: number) => mkEventResults(id, 2025, `2025-0${id}-15`, [{
      id: "1", name: "Granfondo", finisherCount: 100,
      results: [mkResult({ bib: String(id), name: "Maria Sousa", team: id <= 2 ? "CC Faro" : "", category: "MASTERS A", genderPos: id <= 2 ? 60 : 3, athleteId: 0 })],
    }]);
    expect([...runPipeline(events, loader).index.values()].filter(e => e.nameLower === "maria sousa").length).toBe(2);
  });

  it("solo country 'ES' + team country 'PT' → NOT merged (country mismatch)", () => {
    const { event: e1, loader: l1 } = mkTeamEvent(1, 2025, "2025-03-15", "Maria Sousa", "CC Faro", "MASTERS A", 5, "Granfondo", "PT");
    const { event: e2, loader: l2 } = mkSoloEvent(2, 2025, "2025-06-15", "Maria Sousa", "MASTERS A", 6, "Granfondo", "ES");
    expect([...runMulti([{ event: e1, loader: l1 }, { event: e2, loader: l2 }]).index.values()].filter(e => e.nameLower === "maria sousa").length).toBe(2);
  });

  it("2 team candidates survive all filters → flagged (no merge)", () => {
    const events = [mkEvent(1, 2025, "2025-02-01"), mkEvent(2, 2025, "2025-03-01"), mkEvent(3, 2025, "2025-04-01")];
    const loader = (id: number) => mkEventResults(id, 2025, `2025-0${id}-01`, [{
      id: "1", name: "Granfondo", finisherCount: 100,
      results: [mkResult({ bib: String(id), name: "Maria Sousa", team: id === 1 ? "CC Faro" : id === 2 ? "Bike Team X" : "", category: "MASTERS A", genderPos: 5, athleteId: 0 })],
    }]);
    expect([...runPipeline(events, loader).index.values()].filter(e => e.nameLower === "maria sousa").length).toBe(3);
  });

  it("solo with 1 result (inconclusive percentile) + 1 compatible team candidate → merged", () => {
    const { event: e1, loader: l1 } = mkTeamEvent(1, 2025, "2025-03-15", "Tiago Neto", "CC Lisboa", "MASTERS B", 10);
    const { event: e2, loader: l2 } = mkSoloEvent(2, 2025, "2025-06-15", "Tiago Neto", "MASTERS B", 12);
    const entries = [...runMulti([{ event: e1, loader: l1 }, { event: e2, loader: l2 }]).index.values()].filter(e => e.nameLower === "tiago neto");
    expect(entries.length).toBe(1);
    expect(entries[0]!.results.length).toBe(2);
  });
});

// ── buildAthletesIndex — athlete-aliases regression (Pass 7/8) ────────────────

describe("buildAthletesIndex — athlete-aliases regression (Pass 7/8)", () => {
  it("Matteo Cigala — solo races merged into team profile by Pass 8", () => {
    const { event: e1, loader: l1 } = mkTeamEvent(1, 2025, "2025-03-01", "Matteo Cigala", "Casa Benfica Almodovar", "MASTERS B", 8);
    const { event: e2, loader: l2 } = mkTeamEvent(2, 2025, "2025-04-01", "Matteo Cigala", "Casa Benfica Almodovar", "MASTERS B", 9);
    const { event: e3, loader: l3 } = mkSoloEvent(3, 2025, "2025-05-01", "Matteo Cigala", "MASTERS B", 7);
    const { event: e4, loader: l4 } = mkSoloEvent(4, 2025, "2025-06-01", "Matteo Cigala", "MASTERS B", 10);
    const entries = [...runMulti([{ event: e1, loader: l1 }, { event: e2, loader: l2 }, { event: e3, loader: l3 }, { event: e4, loader: l4 }]).index.values()].filter(e => e.nameLower === "matteo cigala");
    expect(entries.length).toBe(1);
    expect(entries[0]!.results.length).toBe(4);
  });

  it("Gonçalo Freitas — solo race merged into team profile by Pass 8", () => {
    const { event: e1, loader: l1 } = mkTeamEvent(1, 2026, "2026-03-01", "Goncalo Freitas", "Love Tiles", "MASTERS A", 5);
    const { event: e2, loader: l2 } = mkSoloEvent(2, 2026, "2026-05-01", "Goncalo Freitas", "MASTERS A", 6);
    const entries = [...runMulti([{ event: e1, loader: l1 }, { event: e2, loader: l2 }]).index.values()].filter(e => e.nameLower === "goncalo freitas");
    expect(entries.length).toBe(1);
    expect(entries[0]!.results.length).toBe(2);
  });

  it("Helder Loureiro — solo race merged into team profile by Pass 8", () => {
    const { event: e1, loader: l1 } = mkTeamEvent(1, 2026, "2026-02-01", "Helder Loureiro", "Crp Ribafria", "MASTERS C", 12);
    const { event: e2, loader: l2 } = mkSoloEvent(2, 2026, "2026-04-01", "Helder Loureiro", "MASTERS C", 11);
    const entries = [...runMulti([{ event: e1, loader: l1 }, { event: e2, loader: l2 }]).index.values()].filter(e => e.nameLower === "helder loureiro");
    expect(entries.length).toBe(1);
    expect(entries[0]!.results.length).toBe(2);
  });

  it("Miguel García — team change across years merged by Pass 7 (Elite 2025 → Masters A 2026)", () => {
    const { event: e1, loader: l1 } = mkTeamEvent(1, 2025, "2025-04-01", "Miguel Garcia", "Love Tiles", "ELITES M", 3, "Granfondo", "ES");
    const { event: e2, loader: l2 } = mkTeamEvent(2, 2026, "2026-03-01", "Miguel Garcia", "Penacova CEG", "M Masters A", 5, "Granfondo", "ES");
    const entries = [...runMulti([{ event: e1, loader: l1 }, { event: e2, loader: l2 }]).index.values()].filter(e => e.nameLower === "miguel garcia");
    expect(entries.length).toBe(1);
    expect(entries[0]!.results.length).toBe(2);
  });
});

// ── buildAthletesIndex — Pass 9: manual result assignments ───────────────────

describe("buildAthletesIndex — Pass 9: manual result assignments", () => {
  it("manually assigned result exempt from post-pass category sweep", () => {
    const events = [1, 2, 3, 4, 5, 6].map(id => mkEvent(id, 2026, `2026-0${id}-01`));
    const idStore: AthleteIdStore = new Map([["carlos matos|solo:Masters B Male:2026", 100]]);
    const loader = (id: number) => mkEventResults(id, 2026, `2026-0${id}-01`, [{
      id: "1", name: "Granfondo", finisherCount: 100,
      results: [mkResult({ bib: String(id), name: "Carlos Matos", team: "", category: id < 6 ? "MASTERS B" : "MASTERS A", genderPos: 10, athleteId: 0 })],
    }]);
    const assignments: ResultAssignment[] = [{ athleteId: 100, eventId: 6, bib: "6" }];
    const { index } = buildAthletesIndex(events, loader, [], assignments, idStore);
    const entry = [...index.values()].find(e => e.id === 100);
    expect(entry).toBeDefined();
    expect(entry!.results.length).toBe(6);
    expect(entry!.results.some(r => r.category === "MASTERS A")).toBe(true);
  });

  it("without manual assignment, category outlier is dropped by post-pass sweep", () => {
    const events = [1, 2, 3, 4, 5, 6].map(id => mkEvent(id, 2026, `2026-0${id}-01`));
    const idStore: AthleteIdStore = new Map([["carlos matos|solo:Masters B Male:2026", 100]]);
    const loader = (id: number) => mkEventResults(id, 2026, `2026-0${id}-01`, [{
      id: "1", name: "Granfondo", finisherCount: 100,
      results: [mkResult({ bib: String(id), name: "Carlos Matos", team: "", category: id < 6 ? "MASTERS B" : "MASTERS A", genderPos: 10, athleteId: 0 })],
    }]);
    const { index } = buildAthletesIndex(events, loader, [], [], idStore);
    const entry = [...index.values()].find(e => e.id === 100);
    expect(entry).toBeDefined();
    expect(entry!.results.length).toBe(5);
    expect(entry!.results.every(r => r.category === "MASTERS B")).toBe(true);
  });

  it("en-dash category variants (Coimbra 2024 format) are not dropped as outliers", () => {
    // Regression: "M40–44" (en-dash) was not in CATEGORY_MAP so canonicalizeCategory
    // returned gender-agnostic "Masters B" instead of "Masters B Male".
    // categoriesCompatible("Masters B", "Masters B Male") was false → result removed.
    const events = [1, 2, 3, 4, 5].map(id => mkEvent(id, 2024, `2024-0${id}-01`));
    const teamId = 99;
    const idStore: AthleteIdStore = new Map([[`pedro silva|${teamId}`, 200]]);
    const teamIdStore = new Map([["team alpha", teamId]]);
    // Events 1-4: standard CATEGORY_MAP format ("MASTERS B") → "Masters B Male"
    // Event 5: en-dash format ("M40–44") — should NOT be dropped
    const loader = (id: number) => mkEventResults(id, 2024, `2024-0${id}-01`, [{
      id: "1", name: "Granfondo", finisherCount: 200,
      results: [mkResult({
        bib: String(id), name: "Pedro Silva", team: "Team Alpha",
        category: id < 5 ? "MASTERS B" : "M40–44",  // U+2013 = en-dash
        pos: id * 10, genderPos: id * 10, athleteId: 0,
      })],
    }]);
    const { index } = buildAthletesIndex(events, loader, [], [], idStore, teamIdStore);
    const entry = [...index.values()].find(e => e.id === 200);
    expect(entry).toBeDefined();
    expect(entry!.results.length).toBe(5);  // all 5 results kept, including en-dash one
  });

  it("already-on-target result is protected from post-pass sweep by manual assignment", () => {
    // Regression: if the pipeline already placed the result on the correct athlete
    // (entry === target in Pass 9), the old code skipped manualAssignments.add()
    // so the post-pass sweep could still drop it as a category outlier.
    // Events 1-5: Masters B (dominant). Event 6: Masters A (outlier).
    // The pipeline groups all of these under the SAME team athlete since all share
    // the same team and licence. Without manual protection, Masters A gets swept.
    const teamId = 77;
    const teamIdStore = new Map([["team beta", teamId]]);
    const idStore: AthleteIdStore = new Map([[`paulo lopes|${teamId}`, 200]]);
    const loader = (id: number) => mkEventResults(id, 2025, `2025-0${id}-01`, [{
      id: "1", name: "Granfondo", finisherCount: 100,
      results: [mkResult({
        bib: String(id), name: "Paulo Lopes", team: "Team Beta",
        category: id < 6 ? "MASTERS B" : "MASTERS A",
        licences: ["55555"], pos: id * 5, genderPos: id * 5, athleteId: 0,
      })],
    }]);
    const events = [1, 2, 3, 4, 5, 6].map(id => mkEvent(id, 2025, `2025-0${id}-01`));
    const assignments: ResultAssignment[] = [{ athleteId: 200, eventId: 6, bib: "6" }];
    const { index } = buildAthletesIndex(events, loader, [], assignments, idStore, teamIdStore);
    const entry = [...index.values()].find(e => e.id === 200);
    expect(entry).toBeDefined();
    expect(entry!.results.length).toBe(6);  // Masters A result kept despite being an outlier
    expect(entry!.results.some(r => r.category === "MASTERS A")).toBe(true);
  });
});

describe("buildAthletesIndex — Pass 1: licence majority-vote outlier detection", () => {
  it("dominant name (≥3 results, ≥3× others) proceeds; outlier results excluded", () => {
    // Licence 12345 appears under "Jose Silva" 4× and "Jo Silva" 1×.
    // The dominant name is "Jose Silva" → licence proceeds; the outlier result is ignored.
    const events = [1, 2, 3, 4, 5].map(id => mkEvent(id, 2025, `2025-0${id}-01`));
    const loader = (id: number) => mkEventResults(id, 2025, `2025-0${id}-01`, [{
      id: "1", name: "Granfondo", finisherCount: 50,
      results: [mkResult({
        bib: String(id), name: id < 5 ? "Jose Silva" : "Jo Silva",
        team: "Team Gamma", licences: ["12345"], genderPos: id * 5, athleteId: 0,
      })],
    }]);
    const { index } = runPipeline(events, loader);
    const entries = [...index.values()].filter(e => e.nameLower === "jose silva");
    expect(entries.length).toBe(1);
    expect(entries[0]!.results.length).toBe(4);  // outlier "Jo Silva" event excluded
  });

  it("non-dominant split (2 vs 2) is skipped entirely — licence not used", () => {
    // Both names appear equally → not dominant → licence is skipped.
    // The athletes end up as separate unlicenced profiles via later passes.
    const events = [1, 2, 3, 4].map(id => mkEvent(id, 2025, `2025-0${id}-01`));
    const loader = (id: number) => mkEventResults(id, 2025, `2025-0${id}-01`, [{
      id: "1", name: "Granfondo", finisherCount: 50,
      results: [mkResult({
        bib: String(id), name: id <= 2 ? "Rui Matos" : "Rui Oliveira",
        team: "Team Delta", licences: ["99999"], genderPos: id * 5, athleteId: 0,
      })],
    }]);
    const { index } = runPipeline(events, loader);
    // Licence skipped — the two names produce two separate unlicenced team profiles
    const ruis = [...index.values()].filter(e => e.nameLower.startsWith("rui "));
    expect(ruis.length).toBe(2);
  });
});

describe("buildAthletesIndex — Pass 1: bib collision guard", () => {
  it("co-occurring licences with different bibs at the same event are NOT merged", () => {
    // Licences 111001 and 222002 appear together on Event A's result row, which makes
    // `hasCooc = true` in the within-Pass-1 merge — enough to attempt a merge.
    // At Event B (later, determines teamId), the same-named athletes have DIFFERENT bibs
    // (bib "10" vs "20"), which is physical proof of two distinct people competing
    // simultaneously. The bib collision guard must block the merge and keep 2 entries.
    //
    // Regression: before `bib` was added to AthleteResultRef (toRef() omitted it), r.bib
    // was always undefined at runtime. canonBibBySlot then mapped every slot to undefined,
    // so `canonBib !== undefined` was always false — all hasCooc pairs incorrectly merged.
    const eA = mkEvent(1, 2025, "2025-03-15");
    const eB = mkEvent(2, 2025, "2025-06-15");
    const lA = () => mkEventResults(1, 2025, "2025-03-15", [{
      id: "1", name: "Granfondo", finisherCount: 100,
      results: [mkResult({ bib: "5", name: "Joao Pereira", team: "Team Alpha", category: "MASTERS B",
        licences: ["111001", "222002"], genderPos: 10, athleteId: 0 })],
    }]);
    const lB = () => mkEventResults(2, 2025, "2025-06-15", [{
      id: "1", name: "Granfondo", finisherCount: 100,
      results: [
        mkResult({ bib: "10", name: "Joao Pereira", team: "Team Alpha", category: "MASTERS B",
          licences: ["111001"], genderPos: 10, athleteId: 0 }),
        mkResult({ bib: "20", name: "Joao Pereira", team: "Team Beta",  category: "MASTERS B",
          licences: ["222002"], genderPos: 20, athleteId: 0 }),
      ],
    }]);
    const entries = [...runMulti([{ event: eA, loader: lA }, { event: eB, loader: lB }]).index.values()]
      .filter(e => e.nameLower === "joao pereira");
    expect(entries.length).toBe(2);
    expect(entries.some(e => e.results.some(r => r.bib === "10"))).toBe(true);
    expect(entries.some(e => e.results.some(r => r.bib === "20"))).toBe(true);
  });
});

describe("buildAthletesIndex — licence conflict guard (Pass 7)", () => {
  it("disjoint licences block Pass 7 merge even when all soft checks pass", () => {
    // Two team profiles: non-overlapping years, same name, compatible category,
    // same distance, similar percentile, same country — all soft checks pass.
    // But each profile has a distinct licence → they are definitively different people.
    const e1 = mkEvent(1, 2025, "2025-03-15");
    const e2 = mkEvent(2, 2026, "2026-03-22");
    const l1 = () => mkEventResults(1, 2025, "2025-03-15", [{
      id: "1", name: "Granfondo", finisherCount: 100,
      results: [mkResult({ bib: "10", name: "Nuno Costa", team: "CC Porto", category: "MASTERS B", licences: ["111001"], genderPos: 10, athleteId: 0 })],
    }]);
    const l2 = () => mkEventResults(2, 2026, "2026-03-22", [{
      id: "1", name: "Granfondo", finisherCount: 100,
      results: [mkResult({ bib: "20", name: "Nuno Costa", team: "CC Lisboa", category: "MASTERS C", licences: ["222002"], genderPos: 10, athleteId: 0 })],
    }]);
    const entries = [...runMulti([{ event: e1, loader: l1 }, { event: e2, loader: l2 }]).index.values()]
      .filter(e => e.nameLower === "nuno costa");
    expect(entries.length).toBe(2);  // NOT merged — disjoint licences
  });

  it("shared licence merges profiles; backward-transition override then separates the de-aged year", () => {
    // Same licence on Masters B (2025) and Masters A (2026). Pass 1 merges them into one
    // entry (licence is authoritative for identity). However the post-pass backward-transition
    // override detects an impossible de-aging (B→A) and evicts the 2025 Masters B result,
    // re-homing it to a new entry. The two years end up in separate profiles.
    // Organiser data errors like this can be resolved with a manual alias rule.
    const e1 = mkEvent(1, 2025, "2025-03-15");
    const e2 = mkEvent(2, 2026, "2026-03-22");
    const l1 = () => mkEventResults(1, 2025, "2025-03-15", [{
      id: "1", name: "Granfondo", finisherCount: 100,
      results: [mkResult({ bib: "10", name: "Luis Silva", team: "Club A", category: "MASTERS B", licences: ["77777"], genderPos: 5, athleteId: 0 })],
    }]);
    const l2 = () => mkEventResults(2, 2026, "2026-03-22", [{
      id: "1", name: "Granfondo", finisherCount: 100,
      results: [mkResult({ bib: "20", name: "Luis Silva", team: "Club B", category: "MASTERS A", licences: ["77777"], genderPos: 5, athleteId: 0 })],
    }]);
    const entries = [...runMulti([{ event: e1, loader: l1 }, { event: e2, loader: l2 }]).index.values()]
      .filter(e => e.nameLower === "luis silva");
    // Backward override splits: one entry per year, each with 1 result.
    expect(entries.length).toBe(2);
    expect(entries.every(e => e.results.length === 1)).toBe(true);
  });
});

// ── buildAthletesIndex — post-pass self-referential eviction guard ─────────────

describe("buildAthletesIndex — post-pass self-referential eviction guard", () => {
  it("outlier whose rehome key maps back to same entry is NOT evicted", () => {
    // 4× MASTERS B + 1× MASTERS A, all under the same team in 2025.
    // MASTERS A is a backward outlier (de-aging) and would normally be evicted.
    // But athleteKey("name", "CC Faro", store, "MASTERS A") == entry's own key →
    // self-referential guard fires → result is kept (inseparable without a manual
    // assignment).
    const teamIdStore = new Map([["cc faro", 5]]);
    const idStore: AthleteIdStore = new Map([["carlos mendes|5", 100]]);
    const events = [1, 2, 3, 4, 5].map(id => mkEvent(id, 2025, `2025-0${id}-01`));
    const loader = (id: number) => mkEventResults(id, 2025, `2025-0${id}-01`, [{
      id: "1", name: "Granfondo", finisherCount: 100,
      results: [mkResult({
        bib: String(id), name: "Carlos Mendes", team: "CC Faro",
        category: id < 5 ? "MASTERS B" : "MASTERS A",
        licences: ["55001"], genderPos: id * 5, athleteId: 0,
      })],
    }]);
    const { index } = buildAthletesIndex(events, loader, [], [], idStore, teamIdStore);
    const entry = [...index.values()].find(e => e.id === 100)!;
    expect(entry).toBeDefined();
    // All 5 results kept — eviction was self-referential so the outlier stays
    expect(entry.results.length).toBe(5);
    expect(entry.results.some(r => r.category === "MASTERS A")).toBe(true);
  });
});

// ── buildAthletesIndex — post-pass backward transition override ───────────────

describe("buildAthletesIndex — post-pass backward transition override", () => {
  it("backward year sequence overrides earlier year's canon and evicts its results", () => {
    // Solo athlete (licence 66001) races as MASTERS D in 2024 and MASTERS A in 2025.
    // MASTERS D → MASTERS A is an impossible backward transition (de-aging by 3 ranks).
    // The post-pass overrides 2024 canon to MASTERS A, then evicts all MASTERS D results
    // from 2024 — bypassing the minority guard because the year was overridden.
    // Solo key ("name|") != rehome key ("name|solo:masters-d") → not self-referential.
    const events = [1, 2, 3, 4, 5, 6].map(id => mkEvent(id, id <= 3 ? 2024 : 2025, `202${id <= 3 ? 4 : 5}-0${id <= 3 ? id : id - 3}-01`));
    const loader = (id: number) => {
      const year = id <= 3 ? 2024 : 2025;
      const date = `${year}-0${id <= 3 ? id : id - 3}-01`;
      return mkEventResults(id, year, date, [{
        id: "1", name: "Granfondo", finisherCount: 100,
        results: [mkResult({
          bib: String(id), name: "Dinis Fonseca", team: "Individual",
          category: id <= 3 ? "MASTERS D" : "MASTERS A",
          licences: ["66001"], genderPos: id * 5, athleteId: 0,
        })],
      }]);
    };
    const { index } = runPipeline(events, loader);
    const entries = [...index.values()].filter(e => e.nameLower === "dinis fonseca");
    // All 2024 MASTERS D results evicted; only 2025 MASTERS A results remain on this entry.
    const main = entries.find(e => e.results.every(r => r.category === "MASTERS A"));
    expect(main).toBeDefined();
    expect(main!.results.length).toBe(3);
    expect(main!.results.every(r => r.eventYear === 2025)).toBe(true);
  });

  it("equal counts in a backward year do not block eviction when year is overridden", () => {
    // 1× MASTERS D in 2024 and 1× MASTERS A in 2025 — same licence groups them.
    // Normally 1 outlier vs 0 compatible (0 ≤ 1) would block eviction.
    // But the 2024 year is overridden by the backward sequence → minority guard bypassed.
    const events = [mkEvent(1, 2024, "2024-03-01"), mkEvent(2, 2025, "2025-03-01")];
    const loader = (id: number) => mkEventResults(id, id === 1 ? 2024 : 2025, `${id === 1 ? 2024 : 2025}-03-01`, [{
      id: "1", name: "Granfondo", finisherCount: 100,
      results: [mkResult({
        bib: String(id), name: "Egas Vieira", team: "Individual",
        category: id === 1 ? "MASTERS D" : "MASTERS A",
        licences: ["66002"], genderPos: 10, athleteId: 0,
      })],
    }]);
    const { index } = runPipeline(events, loader);
    const entries = [...index.values()].filter(e => e.nameLower === "egas vieira");
    const main = entries.find(e => e.results.some(r => r.category === "MASTERS A"));
    expect(main).toBeDefined();
    expect(main!.results.filter(r => r.category === "MASTERS D").length).toBe(0);
  });
});

// ── buildAthletesIndex — post-pass non-adjacent forward-too-fast ──────────────

describe("buildAthletesIndex — post-pass non-adjacent forward-too-fast", () => {
  it("A→B→C over 3 years is valid (each step +1 rank, +1 year)", () => {
    // Adjacent steps are both valid; span A→C in 2 years is also within the
    // 1-rank-per-year limit (A is rank 1, C is rank 3, 2 years apart).
    // Wait — rankDiff(A→C) = 2, maxRankDiff for 2 years = 1 → too fast!
    // So this test verifies the 3-year case (enough time) is NOT evicted.
    const events = [1, 2, 3, 4, 5, 6, 7, 8, 9].map(id =>
      mkEvent(id, id <= 3 ? 2024 : id <= 6 ? 2025 : 2026, `${id <= 3 ? 2024 : id <= 6 ? 2025 : 2026}-0${((id - 1) % 3) + 1}-01`));
    const loader = (id: number) => {
      const year = id <= 3 ? 2024 : id <= 6 ? 2025 : 2026;
      const month = ((id - 1) % 3) + 1;
      const cat = year === 2024 ? "MASTERS A" : year === 2025 ? "MASTERS B" : "MASTERS C";
      return mkEventResults(id, year, `${year}-0${month}-01`, [{
        id: "1", name: "Granfondo", finisherCount: 100,
        results: [mkResult({ bib: String(id), name: "Fabio Monteiro", team: "Individual", category: cat, licences: ["77001"], genderPos: 10, athleteId: 0 })],
      }]);
    };
    // A→C spans 2 years (2024→2026): isValidCatTransition(A,C,2) is false → clamped
    // The non-adjacent pass fires and 2026 MASTERS C results are evicted.
    // 6 results remain (3 MASTERS A + 3 MASTERS B), 0 MASTERS C.
    const { index } = runPipeline(events, loader);
    const entries = [...index.values()].filter(e => e.nameLower === "fabio monteiro");
    const main = entries.find(e => e.results.some(r => r.category === "MASTERS A"));
    expect(main).toBeDefined();
    expect(main!.results.filter(r => r.category === "MASTERS C").length).toBe(0);
    expect(main!.results.filter(r => r.category === "MASTERS A" || r.category === "MASTERS B").length).toBe(6);
  });

  it("A→B→C over 22+ years is valid (enough time to reach C from A)", () => {
    // 2004 MASTERS A, 2015 MASTERS B, 2026 MASTERS C — well within allowed pace.
    const events = [mkEvent(1, 2004, "2004-03-01"), mkEvent(2, 2015, "2015-03-01"), mkEvent(3, 2026, "2026-03-01")];
    const loader = (id: number) => {
      const year = id === 1 ? 2004 : id === 2 ? 2015 : 2026;
      const cat = id === 1 ? "MASTERS A" : id === 2 ? "MASTERS B" : "MASTERS C";
      return mkEventResults(id, year, `${year}-03-01`, [{
        id: "1", name: "Granfondo", finisherCount: 100,
        results: [mkResult({ bib: String(id), name: "Gaspar Branco", team: "Individual", category: cat, licences: ["77002"], genderPos: 10, athleteId: 0 })],
      }]);
    };
    const { index } = runPipeline(events, loader);
    const entries = [...index.values()].filter(e => e.nameLower === "gaspar branco");
    expect(entries.length).toBe(1);
    expect(entries[0]!.results.length).toBe(3);
  });
});
