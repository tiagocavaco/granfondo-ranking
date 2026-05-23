import { describe, it, expect } from "vitest";
import { sweepCategoryEviction } from "./category-sweep-eviction.js";
import { mkPipelineCtx } from "../test-fixture.js";
import type { AthleteEntry, StoredEventResults } from "@granfondo/database/types";

function mkEntry(over: Partial<AthleteEntry> = {}): AthleteEntry {
  return {
    id: 1,
    name: "Test Athlete",
    nameLower: "test athlete",
    teams: [],
    categories: {},
    results: [],
    ...over,
  };
}

function mkRef(over: Partial<AthleteEntry["results"][0]> = {}) {
  return {
    eventId: 1, eventName: "Test", eventDate: "2025-04-01", eventYear: 2025,
    distance: "Granfondo", pos: 1, genderPos: 1, catPos: 1, finisherCount: 100,
    category: "Masters A Male", gender: "M", team: "Sporting", country: "PRT",
    raceTime: "3:00:00", raceTimeSecs: 10800, gap: "", gapSecs: 0,
    dnf: false, dns: false, bib: "100",
    ...over,
  };
}

describe("sweepCategoryEviction", () => {
  it("keeps profile intact when all results are in the same category", () => {
    // No category inconsistency → nothing to evict.
    const entry = mkEntry({
      results: [
        mkRef({ eventId: 1, category: "Masters A Male" }),
        mkRef({ eventId: 2, category: "Masters A Male" }),
      ],
    });
    const ctx = mkPipelineCtx({
      teamIdStore: new Map([["sporting", 1]]),
    });
    ctx.index.set("test athlete|1", entry);

    sweepCategoryEviction(ctx);

    expect(entry.results).toHaveLength(2);
  });

  it("evicts a minority outlier whose rehome key differs from the current entry", () => {
    // 3 × Masters A Sporting + 1 × Masters C Benfica → the outlier is
    // separable (different team key) and gets evicted to its own profile.
    // Same-team outliers are kept (no-op rehome is not worth the churn).
    const entry = mkEntry({
      results: [
        mkRef({ eventId: 1, category: "Masters A Male", team: "Sporting" }),
        mkRef({ eventId: 2, category: "Masters A Male", team: "Sporting" }),
        mkRef({ eventId: 3, category: "Masters A Male", team: "Sporting" }),
        mkRef({ eventId: 4, category: "Masters C Male", team: "Benfica" }),
      ],
    });
    const ctx = mkPipelineCtx({
      teamIdStore: new Map([["sporting", 1], ["benfica", 2]]),
    });
    ctx.index.set("test athlete|1", entry);
    ctx.loader = (id): StoredEventResults | null => {
      if (id !== 4) return null;
      return {
        eventId: 4, eventName: "Test", eventDate: "2025-04-01", eventYear: 2025,
        scrapedAt: "",
        distances: [{
          id: "1", name: "Granfondo", finisherCount: 100,
          results: [{
            pos: 1, genderPos: 1, catPos: 1, athleteId: 0, bib: "100",
            name: "Test Athlete", gender: "M", team: "Benfica",
            category: "Masters C Male", country: "PRT",
            raceTime: "3:00:00", raceTimeSecs: 10800, gap: "", gapSecs: 0,
            points: 50, licences: [], dnf: false, dns: false,
          }],
        }],
      };
    };

    sweepCategoryEviction(ctx);

    expect(entry.results).toHaveLength(3);
    expect(entry.results.every((r) => r.category === "Masters A Male")).toBe(true);
    // Evicted result must have been re-homed to another entry (Benfica key).
    expect(ctx.index.size).toBeGreaterThan(1);
  });

  it("does not evict a result that was manually pinned", () => {
    // Manual assignments override pipeline guesses — the sweep must respect
    // them even if the category looks like an outlier.
    const entry = mkEntry({
      results: [
        mkRef({ eventId: 1, category: "Masters A Male" }),
        mkRef({ eventId: 2, category: "Masters A Male" }),
        mkRef({ eventId: 3, category: "Masters C Male" }),
      ],
    });
    const ctx = mkPipelineCtx({
      teamIdStore: new Map([["sporting", 1]]),
    });
    ctx.index.set("test athlete|1", entry);
    ctx.manualAssignments.add(`${entry.id}:3`);
    ctx.loader = () => null;

    sweepCategoryEviction(ctx);

    expect(entry.results).toHaveLength(3);
  });

  it("does not evict when canonicalizeCategory returns Unknown", () => {
    // Unrecognised category strings can't be safely classified as outliers.
    const entry = mkEntry({
      results: [
        mkRef({ eventId: 1, category: "Masters A Male" }),
        mkRef({ eventId: 2, category: "gibberish_category" }),
      ],
    });
    const ctx = mkPipelineCtx({
      teamIdStore: new Map([["sporting", 1]]),
    });
    ctx.index.set("test athlete|1", entry);
    ctx.loader = () => null;

    sweepCategoryEviction(ctx);

    // Gibberish category preserved — too risky to evict on unknown signals.
    expect(entry.results).toHaveLength(2);
  });

  it("corrects backward category transitions using future-year evidence", () => {
    // 2024: Masters C Benfica (likely a misattributed result), 2025: Masters A
    // Sporting (the real athlete). Backward transition is impossible — the
    // sweep overrides 2024's canon and evicts the Masters C result.
    // Different team makes the rehome key distinct so the eviction guard
    // doesn't short-circuit.
    const entry = mkEntry({
      results: [
        mkRef({ eventId: 1, eventYear: 2024, category: "Masters C Male", team: "Benfica" }),
        mkRef({ eventId: 2, eventYear: 2025, category: "Masters A Male", team: "Sporting" }),
        mkRef({ eventId: 3, eventYear: 2025, category: "Masters A Male", team: "Sporting" }),
      ],
    });
    const ctx = mkPipelineCtx({
      teamIdStore: new Map([["sporting", 1], ["benfica", 2]]),
    });
    ctx.index.set("test athlete|1", entry);
    ctx.loader = (id): StoredEventResults | null => {
      if (id !== 1) return null;
      return {
        eventId: 1, eventName: "Test", eventDate: "2024-04-01", eventYear: 2024,
        scrapedAt: "",
        distances: [{
          id: "1", name: "Granfondo", finisherCount: 100,
          results: [{
            pos: 1, genderPos: 1, catPos: 1, athleteId: 0, bib: "100",
            name: "Test Athlete", gender: "M", team: "Benfica",
            category: "Masters C Male", country: "PRT",
            raceTime: "3:00:00", raceTimeSecs: 10800, gap: "", gapSecs: 0,
            points: 50, licences: [], dnf: false, dns: false,
          }],
        }],
      };
    };

    sweepCategoryEviction(ctx);

    expect(entry.results.some((r) => r.category === "Masters C Male")).toBe(false);
  });
});
