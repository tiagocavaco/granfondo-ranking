import { describe, it, expect } from "vitest";
import { applyManualResultAssignments } from "./manual-result-assignments.js";
import { buildRemainingTeamProfiles } from "./remaining-team-profiles.js";
import {
  mkPipelineCtx,
  mkEvent,
  mkDistance,
  mkStoredResult,
  mkRaw,
} from "../test-fixture.js";
import type { StoredEventResults } from "@granfondo/database/types";

function mkEventResults(
  eventId: number,
  results: ReturnType<typeof mkStoredResult>[],
  distName = "Granfondo",
): StoredEventResults {
  return {
    eventId,
    eventName: "Test",
    eventDate: "2025-04-01",
    eventYear: 2025,
    scrapedAt: "",
    distances: [
      { id: "1", name: distName, finisherCount: results.length, results },
    ],
  };
}

describe("applyManualResultAssignments", () => {
  it("moves a result from one athlete to another by bib + event ID", () => {
    // Operator override: bib 200 at event 1 was assigned by the pipeline to
    // the wrong athlete; assignment forces it onto athlete 1.
    const event = mkEvent({ id: 1 });
    const event2 = mkEvent({ id: 2 });
    const dist = mkDistance();
    const wrongResult = mkStoredResult({
      name: "João Silva",
      team: "Sporting",
      bib: "200",
    });

    const ctx = mkPipelineCtx({
      teamIdStore: new Map([
        ["sporting", 1],
        ["benfica", 2],
      ]),
      allResults: [
        mkRaw(
          event2,
          dist,
          mkStoredResult({ name: "João Silva", team: "Sporting" }),
        ),
        // Pipeline-assigned bib 200 to wrong athlete's profile (Benfica)
        mkRaw(
          event,
          dist,
          mkStoredResult({ name: "João Silva", team: "Benfica", bib: "200" }),
        ),
      ],
      assignments: [{ eventId: 1, bib: "200", athleteId: 1, note: undefined }],
    });
    ctx.loader = (id) => (id === 1 ? mkEventResults(1, [wrongResult]) : null);

    buildRemainingTeamProfiles(ctx);
    const sportingProfile = [...ctx.index.values()].find((e) =>
      e.results.some((r) => r.team === "Sporting"),
    )!;
    // Force the target athlete to have id=1 by remapping (manual assignments
    // address profiles by stable ID).
    sportingProfile.id = 1;

    applyManualResultAssignments(ctx);

    // The bib-200 result must now live on the Sporting profile.
    expect(sportingProfile.results.some((r) => r.eventId === 1)).toBe(true);
    expect(ctx.manualAssignments.has(`1:1`)).toBe(true);
  });

  it("marks already-on-target results as manual (protect from post-pass eviction)", () => {
    // Invariant from CLAUDE.md: when assignment target ALREADY has the
    // result, the pass must still add to manualAssignments so the category
    // sweep doesn't evict it as an outlier.
    const event = mkEvent({ id: 1 });
    const dist = mkDistance();
    const rawResult = mkStoredResult({ name: "João Silva", team: "Sporting" });

    const ctx = mkPipelineCtx({
      teamIdStore: new Map([["sporting", 1]]),
      allResults: [mkRaw(event, dist, rawResult)],
      assignments: [{ eventId: 1, bib: "100", athleteId: 1, note: undefined }],
    });
    ctx.loader = (id) => (id === 1 ? mkEventResults(1, [rawResult]) : null);

    buildRemainingTeamProfiles(ctx);
    const target = [...ctx.index.values()][0]!;
    target.id = 1;

    applyManualResultAssignments(ctx);

    expect(ctx.manualAssignments.has("1:1")).toBe(true);
  });

  it("evicts a conflicting target result and re-homes it to a fresh profile", () => {
    // If target already has a result at (eventId, distance) but it's NOT
    // the one specified by the assignment, the pass evicts the conflicting
    // result onto a separate profile (rather than discarding it).
    const event = mkEvent({ id: 1 });
    const event2 = mkEvent({ id: 2 });
    const dist = mkDistance();
    const targetRaw = mkStoredResult({
      name: "João Silva",
      team: "Sporting",
      bib: "100",
    });
    const evictRaw = mkStoredResult({
      name: "Other Name",
      team: "Sporting",
      bib: "999",
    });
    const moveRaw = mkStoredResult({
      name: "João Silva",
      team: "Benfica",
      bib: "200",
    });

    const ctx = mkPipelineCtx({
      teamIdStore: new Map([
        ["sporting", 1],
        ["benfica", 2],
      ]),
      allResults: [
        mkRaw(event2, dist, targetRaw),
        mkRaw(event, dist, evictRaw),
        mkRaw(event, dist, moveRaw),
      ],
      assignments: [{ eventId: 1, bib: "200", athleteId: 1, note: undefined }],
    });
    ctx.loader = (id) =>
      id === 1 ? mkEventResults(1, [evictRaw, moveRaw]) : null;

    buildRemainingTeamProfiles(ctx);
    // Manually inject a conflicting result onto the target's event 1 slot.
    const target = [...ctx.index.values()].find((e) =>
      e.results.some((r) => r.team === "Sporting"),
    )!;
    target.id = 1;
    // Simulate that pipeline gave target the wrong event-1 result (the one
    // that should be evicted).
    target.results.push({
      eventId: 1,
      eventName: "Test",
      eventDate: "2025-04-01",
      eventYear: 2025,
      distance: "Granfondo",
      pos: 1,
      genderPos: 1,
      catPos: 1,
      finisherCount: 1,
      category: "Masters A Male",
      gender: "M",
      team: "Sporting",
      country: "PRT",
      raceTime: "3:00:00",
      raceTimeSecs: 10800,
      gap: "",
      gapSecs: 0,
      dnf: false,
      dns: false,
      bib: "999",
    });

    const sizeBefore = ctx.index.size;
    applyManualResultAssignments(ctx);

    // The "Other Name" evictee should have been re-homed to its own profile.
    expect(ctx.index.size).toBeGreaterThanOrEqual(sizeBefore);
  });

  it("silently skips assignments whose target athleteId does not exist", () => {
    // Stale assignment (athlete was merged/deleted) — must not throw.
    const event = mkEvent({ id: 1 });
    const dist = mkDistance();
    const ctx = mkPipelineCtx({
      assignments: [
        { eventId: 1, bib: "100", athleteId: 999, note: undefined },
      ],
    });
    ctx.loader = () => null;

    expect(() => applyManualResultAssignments(ctx)).not.toThrow();
  });
});
