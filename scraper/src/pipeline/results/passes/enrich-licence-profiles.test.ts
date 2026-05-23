import { describe, it, expect } from "vitest";
import { enrichLicenceProfiles } from "./enrich-licence-profiles.js";
import { buildLicenceProfiles } from "./build-licence-profiles.js";
import {
  mkPipelineCtx,
  mkEvent,
  mkDistance,
  mkStoredResult,
  mkRaw,
} from "../test-fixture.js";

describe("enrichLicenceProfiles", () => {
  it("attaches an unlicensed result to an existing licence profile when name + team match", () => {
    // The licenced result builds the profile in pass 1, then the unlicensed
    // result from a different event lands on the same profile because the
    // name and team match.
    const event1 = mkEvent({ id: 1, date: "2025-04-01" });
    const event2 = mkEvent({ id: 2, date: "2025-05-01" });
    const dist = mkDistance();
    const teamIdStore = new Map([["sporting", 1]]);

    const ctx = mkPipelineCtx({
      teamIdStore,
      allResults: [
        mkRaw(event1, dist, mkStoredResult({ name: "João Silva", team: "Sporting", licences: ["L1"] })),
        mkRaw(event2, dist, mkStoredResult({ name: "João Silva", team: "Sporting", licences: [], bib: "200" })),
      ],
    });

    buildLicenceProfiles(ctx);
    expect(ctx.index.size).toBe(1);
    enrichLicenceProfiles(ctx);

    expect(ctx.index.size).toBe(1);
    expect([...ctx.index.values()][0]!.results).toHaveLength(2);
  });

  it("skips solo (no-team) results — they go to a later pass", () => {
    // Solo results don't have a team signal to match on, so this pass
    // ignores them. They get handled by remainingTeamProfiles + solo passes.
    const event1 = mkEvent({ id: 1 });
    const event2 = mkEvent({ id: 2 });
    const dist = mkDistance();
    const ctx = mkPipelineCtx({
      teamIdStore: new Map([["sporting", 1]]),
      allResults: [
        mkRaw(event1, dist, mkStoredResult({ name: "João Silva", team: "Sporting", licences: ["L1"] })),
        mkRaw(event2, dist, mkStoredResult({ name: "João Silva", team: "Individual", licences: [], bib: "200" })),
      ],
    });

    buildLicenceProfiles(ctx);
    const profileResultsBefore = [...ctx.index.values()][0]!.results.length;
    enrichLicenceProfiles(ctx);
    const profileResultsAfter = [...ctx.index.values()][0]!.results.length;

    // Solo result must NOT have been added to the licenced profile.
    expect(profileResultsAfter).toBe(profileResultsBefore);
  });

  it("skips results that themselves have a valid licence", () => {
    // Licensed results are owned by pass 1. This pass only enriches with
    // unlicensed results.
    const event = mkEvent({ id: 1 });
    const dist = mkDistance();
    const ctx = mkPipelineCtx({
      teamIdStore: new Map([["sporting", 1]]),
      allResults: [
        mkRaw(event, dist, mkStoredResult({ name: "João Silva", team: "Sporting", licences: ["L1"] })),
      ],
    });

    buildLicenceProfiles(ctx);
    const countBefore = [...ctx.index.values()][0]!.results.length;
    enrichLicenceProfiles(ctx);
    const countAfter = [...ctx.index.values()][0]!.results.length;

    // Licensed result was already in the profile — no double-add.
    expect(countAfter).toBe(countBefore);
  });

  it("attaches unlicensed result only when exactly one name+team candidate exists", () => {
    // With one Sporting "João Silva" profile from pass 1, enrich attaches
    // the unlicensed Sporting "João Silva" result. (Ambiguity from two
    // distinct profiles with the same name+team is hard to construct because
    // pass 1 collapses them onto one key — confirmed in build-licence
    // co-occurrence tests.)
    const event = mkEvent({ id: 1 });
    const event2 = mkEvent({ id: 2 });
    const dist = mkDistance();
    const ctx = mkPipelineCtx({
      teamIdStore: new Map([["sporting", 1]]),
      allResults: [
        mkRaw(event, dist, mkStoredResult({ name: "João Silva", team: "Sporting", licences: ["L1"] })),
        mkRaw(event2, dist, mkStoredResult({ name: "João Silva", team: "Sporting", licences: [], bib: "200" })),
      ],
    });

    buildLicenceProfiles(ctx);
    enrichLicenceProfiles(ctx);

    const unlicensedKey = `${event2.id}|${dist.name}|200`;
    expect(ctx.assigned.has(unlicensedKey)).toBe(true);
  });

  it("does not match by name alone — team must agree", () => {
    // A different team with the same name must not collapse onto the
    // existing profile. Pipeline must keep them separate.
    const event = mkEvent({ id: 1 });
    const event2 = mkEvent({ id: 2 });
    const dist = mkDistance();
    const ctx = mkPipelineCtx({
      teamIdStore: new Map([["sporting", 1], ["benfica", 2]]),
      allResults: [
        mkRaw(event, dist, mkStoredResult({ name: "João Silva", team: "Sporting", licences: ["L1"] })),
        mkRaw(event2, dist, mkStoredResult({ name: "João Silva", team: "Benfica", licences: [], bib: "200" })),
      ],
    });

    buildLicenceProfiles(ctx);
    enrichLicenceProfiles(ctx);

    // The Benfica result should NOT have landed on the Sporting profile.
    const sportingEntry = [...ctx.index.values()][0]!;
    expect(sportingEntry.results.every((r) => r.team !== "Benfica")).toBe(true);
  });
});
