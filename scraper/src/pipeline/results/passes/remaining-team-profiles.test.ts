import { describe, it, expect } from "vitest";
import { buildRemainingTeamProfiles } from "./remaining-team-profiles.js";
import {
  mkPipelineCtx,
  mkEvent,
  mkDistance,
  mkStoredResult,
  mkRaw,
} from "../test-fixture.js";

describe("buildRemainingTeamProfiles", () => {
  it("creates a fresh profile for an unassigned team result", () => {
    // A team result that no earlier pass claimed becomes its own new profile.
    const event = mkEvent({ id: 1 });
    const dist = mkDistance();
    const ctx = mkPipelineCtx({
      teamIdStore: new Map([["sporting", 1]]),
      allResults: [
        mkRaw(event, dist, mkStoredResult({ name: "Pedro Alves", team: "Sporting" })),
      ],
    });

    const { teamCount } = buildRemainingTeamProfiles(ctx);

    expect(teamCount).toBe(1);
    expect(ctx.index.size).toBe(1);
    expect([...ctx.index.values()][0]!.name).toBe("Pedro Alves");
  });

  it("attaches a second result to the same profile when name + team match exactly", () => {
    // Same person across events with consistent team — one profile, two results.
    const event1 = mkEvent({ id: 1, date: "2025-04-01" });
    const event2 = mkEvent({ id: 2, date: "2025-05-01" });
    const dist = mkDistance();
    const ctx = mkPipelineCtx({
      teamIdStore: new Map([["sporting", 1]]),
      allResults: [
        mkRaw(event1, dist, mkStoredResult({ name: "Pedro Alves", team: "Sporting" })),
        mkRaw(event2, dist, mkStoredResult({ name: "Pedro Alves", team: "Sporting", bib: "200" })),
      ],
    });

    const { teamCount } = buildRemainingTeamProfiles(ctx);

    expect(teamCount).toBe(1);
    expect([...ctx.index.values()][0]!.results).toHaveLength(2);
  });

  it("skips already-assigned results", () => {
    const event = mkEvent({ id: 1 });
    const dist = mkDistance();
    const ctx = mkPipelineCtx({
      teamIdStore: new Map([["sporting", 1]]),
      allResults: [
        mkRaw(event, dist, mkStoredResult({ name: "Pedro", team: "Sporting" })),
      ],
    });
    // Mark the result as already assigned by another pass.
    ctx.assigned.add(`${event.id}|${dist.name}|100`);

    const { teamCount } = buildRemainingTeamProfiles(ctx);

    expect(teamCount).toBe(0);
    expect(ctx.index.size).toBe(0);
  });

  it("skips solo (no-team) results", () => {
    // Solo profiles are built later by groupSoloIntraYear with proper
    // collision detection. This pass only touches team results.
    const event = mkEvent({ id: 1 });
    const dist = mkDistance();
    const ctx = mkPipelineCtx({
      allResults: [
        mkRaw(event, dist, mkStoredResult({ name: "Pedro", team: "Individual" })),
      ],
    });

    const { teamCount } = buildRemainingTeamProfiles(ctx);

    expect(teamCount).toBe(0);
    expect(ctx.index.size).toBe(0);
  });

  it("creates separate profiles for the same name on different teams", () => {
    // Without licence info, two athletes with the same name on different teams
    // are presumed to be different people.
    const event = mkEvent({ id: 1 });
    const dist = mkDistance();
    const ctx = mkPipelineCtx({
      teamIdStore: new Map([["sporting", 1], ["benfica", 2]]),
      allResults: [
        mkRaw(event, dist, mkStoredResult({ name: "João Silva", team: "Sporting", bib: "100" })),
        mkRaw(event, dist, mkStoredResult({ name: "João Silva", team: "Benfica", bib: "101" })),
      ],
    });

    buildRemainingTeamProfiles(ctx);

    expect(ctx.index.size).toBe(2);
  });
});
