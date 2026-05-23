import { describe, it, expect } from "vitest";
import { groupSoloIntraYear } from "./solo-intra-year.js";
import {
  mkPipelineCtx,
  mkEvent,
  mkDistance,
  mkStoredResult,
  mkRaw,
} from "../test-fixture.js";

describe("groupSoloIntraYear", () => {
  it("creates a solo profile for a single unassigned solo result", () => {
    // Solo results have no team — they need their own grouping pass
    // because team-id|name keys would all collide on `name|0`.
    const event = mkEvent({ id: 1 });
    const dist = mkDistance();
    const ctx = mkPipelineCtx({
      allResults: [
        mkRaw(event, dist, mkStoredResult({ name: "João Silva", team: "Individual" })),
      ],
    });

    const { soloCount } = groupSoloIntraYear(ctx);

    expect(soloCount).toBe(1);
    expect(ctx.index.size).toBe(1);
    const groupKey = [...ctx.index.keys()][0]!;
    expect(groupKey).toContain("|solo:");
  });

  it("groups solo results across events by (name, category, year)", () => {
    // Same person racing as solo in two events of the same year, same
    // category, should land on one profile.
    const event1 = mkEvent({ id: 1, year: 2025, date: "2025-04-01" });
    const event2 = mkEvent({ id: 2, year: 2025, date: "2025-05-01" });
    const dist = mkDistance();
    const ctx = mkPipelineCtx({
      allResults: [
        mkRaw(event1, dist, mkStoredResult({ name: "João Silva", team: "Individual" })),
        mkRaw(event2, dist, mkStoredResult({ name: "João Silva", team: "Individual", bib: "200" })),
      ],
    });

    groupSoloIntraYear(ctx);

    expect(ctx.index.size).toBe(1);
    expect([...ctx.index.values()][0]!.results).toHaveLength(2);
  });

  it("flags 3+ collision results in the same event for manual review", () => {
    // Three solo results with same name/category/year at the same event is
    // unresolvable automatically — they all get routed to bib-keys and
    // a flag is emitted.
    const event = mkEvent({ id: 1 });
    const dist = mkDistance();
    const ctx = mkPipelineCtx({
      allResults: [
        mkRaw(event, dist, mkStoredResult({ name: "João Silva", team: "", bib: "100" })),
        mkRaw(event, dist, mkStoredResult({ name: "João Silva", team: "", bib: "200" })),
        mkRaw(event, dist, mkStoredResult({ name: "João Silva", team: "", bib: "300" })),
      ],
    });

    groupSoloIntraYear(ctx);

    expect(ctx.soloFlags).toHaveLength(1);
    expect(ctx.soloFlags[0]!.resolution).toBe("flagged_manual");
    expect(ctx.soloFlags[0]!.results).toHaveLength(3);
  });

  it("resolves 2-way same-event collisions using distance as the disambiguator", () => {
    // Two solo entries at the same event but in different distances are
    // unambiguously different people — no person races two distances on
    // the same day. With a baseline of past results favouring Granfondo,
    // the Granfondo entry is kept and the other routed to a bib-key.
    const event = mkEvent({ id: 1, date: "2025-05-01" });
    const baselineEvent = mkEvent({ id: 2, date: "2025-04-01" });
    const granfondo = mkDistance({ id: "1", name: "Granfondo" });
    const mediofondo = mkDistance({ id: "2", name: "Mediofondo" });
    const ctx = mkPipelineCtx({
      allResults: [
        // Baseline result in Granfondo — establishes the athlete's "home" distance
        mkRaw(event, granfondo, mkStoredResult({ name: "João Silva", team: "", bib: "100" })),
        mkRaw(event, mediofondo, mkStoredResult({ name: "João Silva", team: "", bib: "101" })),
        mkRaw(baselineEvent, granfondo, mkStoredResult({ name: "João Silva", team: "", bib: "300" })),
      ],
    });

    groupSoloIntraYear(ctx);

    // One flag of resolution "distance"
    const distanceFlag = ctx.soloFlags.find((f) => f.resolution === "distance");
    expect(distanceFlag).toBeDefined();
  });

  it("does not touch already-assigned results", () => {
    const event = mkEvent({ id: 1 });
    const dist = mkDistance();
    const ctx = mkPipelineCtx({
      allResults: [
        mkRaw(event, dist, mkStoredResult({ name: "João Silva", team: "", bib: "100" })),
      ],
    });
    ctx.assigned.add(`${event.id}|${dist.name}|100`);

    const { soloCount } = groupSoloIntraYear(ctx);

    expect(soloCount).toBe(0);
    expect(ctx.index.size).toBe(0);
  });
});
