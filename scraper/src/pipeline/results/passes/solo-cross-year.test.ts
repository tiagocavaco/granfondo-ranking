import { describe, it, expect } from "vitest";
import { mergeSoloCrossYear } from "./solo-cross-year.js";
import { groupSoloIntraYear } from "./solo-intra-year.js";
import {
  mkPipelineCtx,
  mkEvent,
  mkDistance,
  mkStoredResult,
  mkRaw,
} from "../test-fixture.js";

describe("mergeSoloCrossYear", () => {
  it("merges two solo profiles for the same person across consecutive years", () => {
    // Same name + same category in 2024 and 2025 → one person who hasn't
    // aged out of the band. Solo profiles get folded into one.
    const event2024 = mkEvent({ id: 1, year: 2024, date: "2024-04-01" });
    const event2025 = mkEvent({ id: 2, year: 2025, date: "2025-04-01" });
    const dist = mkDistance();
    const ctx = mkPipelineCtx({
      allResults: [
        mkRaw(event2024, dist, mkStoredResult({ name: "João Silva", team: "", category: "Masters A Male" })),
        mkRaw(event2025, dist, mkStoredResult({ name: "João Silva", team: "", category: "Masters A Male", bib: "200" })),
      ],
    });

    groupSoloIntraYear(ctx);
    expect(ctx.index.size).toBe(2);

    mergeSoloCrossYear(ctx);

    expect(ctx.index.size).toBe(1);
    expect([...ctx.index.values()][0]!.results).toHaveLength(2);
  });

  it("merges adjacent-category transitions across one year (athlete ages over boundary)", () => {
    // Masters A → Masters B is a legitimate 1-year transition.
    const event2024 = mkEvent({ id: 1, year: 2024, date: "2024-04-01" });
    const event2025 = mkEvent({ id: 2, year: 2025, date: "2025-04-01" });
    const dist = mkDistance();
    const ctx = mkPipelineCtx({
      allResults: [
        mkRaw(event2024, dist, mkStoredResult({ name: "João Silva", team: "", category: "Masters A Male" })),
        mkRaw(event2025, dist, mkStoredResult({ name: "João Silva", team: "", category: "Masters B Male", bib: "200" })),
      ],
    });

    groupSoloIntraYear(ctx);
    mergeSoloCrossYear(ctx);

    expect(ctx.index.size).toBe(1);
  });

  it("refuses to merge when a category transition is impossible (band jump in too few years)", () => {
    // Elite (2024) → Masters B (2025) requires ~11 years, not 1. The
    // profiles must stay separate — different people.
    const event2024 = mkEvent({ id: 1, year: 2024, date: "2024-04-01" });
    const event2025 = mkEvent({ id: 2, year: 2025, date: "2025-04-01" });
    const dist = mkDistance();
    const ctx = mkPipelineCtx({
      allResults: [
        mkRaw(event2024, dist, mkStoredResult({ name: "João Silva", team: "", category: "Elite Male" })),
        mkRaw(event2025, dist, mkStoredResult({ name: "João Silva", team: "", category: "Masters B Male", bib: "200" })),
      ],
    });

    groupSoloIntraYear(ctx);
    mergeSoloCrossYear(ctx);

    expect(ctx.index.size).toBe(2);
  });

  it("refuses to merge when licences conflict", () => {
    // Even if categories are compatible, conflicting licences are
    // definitive proof of two different people.
    const event2024 = mkEvent({ id: 1, year: 2024 });
    const event2025 = mkEvent({ id: 2, year: 2025 });
    const dist = mkDistance();
    const ctx = mkPipelineCtx({
      allResults: [
        mkRaw(event2024, dist, mkStoredResult({ name: "João Silva", team: "", category: "Masters A Male" })),
        mkRaw(event2025, dist, mkStoredResult({ name: "João Silva", team: "", category: "Masters A Male", bib: "200" })),
      ],
    });

    groupSoloIntraYear(ctx);
    const keys = [...ctx.soloGroupKeys];
    ctx.entryLicences.set(keys[0]!, new Set(["L1"]));
    ctx.entryLicences.set(keys[1]!, new Set(["L2"]));

    mergeSoloCrossYear(ctx);

    expect(ctx.index.size).toBe(2);
  });

  it("leaves single-year solo profiles untouched", () => {
    // No cross-year link to consider — pass is a no-op.
    const event = mkEvent({ id: 1, year: 2025 });
    const dist = mkDistance();
    const ctx = mkPipelineCtx({
      allResults: [
        mkRaw(event, dist, mkStoredResult({ name: "João Silva", team: "", category: "Masters A Male" })),
      ],
    });

    groupSoloIntraYear(ctx);
    const sizeBefore = ctx.index.size;
    mergeSoloCrossYear(ctx);

    expect(ctx.index.size).toBe(sizeBefore);
  });
});
