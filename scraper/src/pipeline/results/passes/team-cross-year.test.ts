import { describe, it, expect } from "vitest";
import { mergeTeamCrossYear } from "./team-cross-year.js";
import { buildRemainingTeamProfiles } from "./remaining-team-profiles.js";
import {
  mkPipelineCtx,
  mkEvent,
  mkDistance,
  mkStoredResult,
  mkRaw,
} from "../test-fixture.js";

describe("mergeTeamCrossYear", () => {
  it("merges same-name profiles across non-overlapping years (team change)", () => {
    // Athlete moved from Sporting (2024) to Benfica (2025) — same person,
    // different teams in different years.
    const event2024 = mkEvent({ id: 1, year: 2024, date: "2024-04-01" });
    const event2025 = mkEvent({ id: 2, year: 2025, date: "2025-04-01" });
    const dist = mkDistance({ finisherCount: 100 });
    const ctx = mkPipelineCtx({
      teamIdStore: new Map([["sporting", 1], ["benfica", 2]]),
      allResults: [
        mkRaw(event2024, dist, mkStoredResult({
          name: "João Silva", team: "Sporting", category: "Masters A Male",
          genderPos: 10, country: "PRT",
        })),
        mkRaw(event2025, dist, mkStoredResult({
          name: "João Silva", team: "Benfica", category: "Masters A Male",
          genderPos: 12, country: "PRT", bib: "200",
        })),
      ],
    });

    buildRemainingTeamProfiles(ctx);
    expect(ctx.index.size).toBe(2);

    mergeTeamCrossYear(ctx);

    expect(ctx.index.size).toBe(1);
    expect([...ctx.index.values()][0]!.results).toHaveLength(2);
  });

  it("refuses to merge when years overlap (must be different people)", () => {
    // Same name on two different teams in the same year cannot be one
    // person — pass keeps them separate.
    const event = mkEvent({ id: 1, year: 2025, date: "2025-04-01" });
    const event2 = mkEvent({ id: 2, year: 2025, date: "2025-05-01" });
    const dist = mkDistance();
    const ctx = mkPipelineCtx({
      teamIdStore: new Map([["sporting", 1], ["benfica", 2]]),
      allResults: [
        mkRaw(event, dist, mkStoredResult({ name: "João Silva", team: "Sporting", bib: "100" })),
        mkRaw(event2, dist, mkStoredResult({ name: "João Silva", team: "Benfica", bib: "200" })),
      ],
    });

    buildRemainingTeamProfiles(ctx);
    mergeTeamCrossYear(ctx);

    expect(ctx.index.size).toBe(2);
  });

  it("refuses to merge when distances are disjoint", () => {
    // Different distance specialisation across years suggests two athletes
    // with the same name, not one person who switched.
    const event2024 = mkEvent({ id: 1, year: 2024 });
    const event2025 = mkEvent({ id: 2, year: 2025 });
    const granfondo = mkDistance({ id: "1", name: "Granfondo" });
    const minifondo = mkDistance({ id: "2", name: "Minifondo" });
    const ctx = mkPipelineCtx({
      teamIdStore: new Map([["sporting", 1], ["benfica", 2]]),
      allResults: [
        mkRaw(event2024, granfondo, mkStoredResult({ name: "João Silva", team: "Sporting", category: "Masters A Male" })),
        mkRaw(event2025, minifondo, mkStoredResult({ name: "João Silva", team: "Benfica", category: "Masters A Male", bib: "200" })),
      ],
    });

    buildRemainingTeamProfiles(ctx);
    mergeTeamCrossYear(ctx);

    expect(ctx.index.size).toBe(2);
  });

  it("merges when both profiles share a licence (authoritative override)", () => {
    // Shared licence is definitive proof of same person. Bypasses soft
    // checks (distance overlap, percentile divergence, country).
    const event2024 = mkEvent({ id: 1, year: 2024 });
    const event2025 = mkEvent({ id: 2, year: 2025 });
    const granfondo = mkDistance({ id: "1", name: "Granfondo" });
    const minifondo = mkDistance({ id: "2", name: "Minifondo" });
    const ctx = mkPipelineCtx({
      teamIdStore: new Map([["sporting", 1], ["benfica", 2]]),
      allResults: [
        mkRaw(event2024, granfondo, mkStoredResult({ name: "João Silva", team: "Sporting", category: "Masters A Male" })),
        mkRaw(event2025, minifondo, mkStoredResult({ name: "João Silva", team: "Benfica", category: "Masters A Male", bib: "200" })),
      ],
    });

    buildRemainingTeamProfiles(ctx);
    const keys = [...ctx.index.keys()];
    ctx.entryLicences.set(keys[0]!, new Set(["L1"]));
    ctx.entryLicences.set(keys[1]!, new Set(["L1"]));

    mergeTeamCrossYear(ctx);

    expect(ctx.index.size).toBe(1);
  });

  it("refuses to merge when licences are disjoint (different people)", () => {
    // Same name, compatible everything else, but explicit licence conflict
    // → different people.
    const event2024 = mkEvent({ id: 1, year: 2024 });
    const event2025 = mkEvent({ id: 2, year: 2025 });
    const dist = mkDistance();
    const ctx = mkPipelineCtx({
      teamIdStore: new Map([["sporting", 1], ["benfica", 2]]),
      allResults: [
        mkRaw(event2024, dist, mkStoredResult({ name: "João Silva", team: "Sporting", category: "Masters A Male" })),
        mkRaw(event2025, dist, mkStoredResult({ name: "João Silva", team: "Benfica", category: "Masters A Male", bib: "200" })),
      ],
    });

    buildRemainingTeamProfiles(ctx);
    const keys = [...ctx.index.keys()];
    ctx.entryLicences.set(keys[0]!, new Set(["L1"]));
    ctx.entryLicences.set(keys[1]!, new Set(["L2"]));

    mergeTeamCrossYear(ctx);

    expect(ctx.index.size).toBe(2);
  });
});
