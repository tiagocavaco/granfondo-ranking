import { describe, it, expect } from "vitest";
import {
  mergeLegalNameVariants,
  mergeMissingSpaceVariants,
} from "./merge-team-name-variants.js";
import { buildRemainingTeamProfiles } from "./remaining-team-profiles.js";
import {
  mkPipelineCtx,
  mkEvent,
  mkDistance,
  mkStoredResult,
  mkRaw,
} from "../test-fixture.js";

describe("mergeLegalNameVariants", () => {
  it("folds a 4-token Portuguese legal name into a 2-token short name on the same team", () => {
    // Portuguese convention: short name = first + last token. "Elio Fernando
    // Oliveira Silva" must merge into "Elio Silva" (last-token match).
    // Distinct events so addResult preserves both results.
    const event1 = mkEvent({ id: 1, date: "2025-04-01" });
    const event2 = mkEvent({ id: 2, date: "2025-05-01" });
    const dist = mkDistance();
    const ctx = mkPipelineCtx({
      teamIdStore: new Map([["sporting", 1]]),
      allResults: [
        mkRaw(event1, dist, mkStoredResult({ name: "Elio Fernando Oliveira Silva", team: "Sporting" })),
        mkRaw(event2, dist, mkStoredResult({ name: "Elio Silva", team: "Sporting" })),
      ],
    });

    buildRemainingTeamProfiles(ctx);
    expect(ctx.index.size).toBe(2);

    mergeLegalNameVariants(ctx);

    expect(ctx.index.size).toBe(1);
    const surviving = [...ctx.index.values()][0]!;
    expect(surviving.nameLower).toBe("elio silva");
    expect(surviving.results).toHaveLength(2);
  });

  it("does not merge across different teams even with matching legal names", () => {
    // Different team = presumed different person. The legal-name pattern is
    // an intra-team disambiguation only.
    const event = mkEvent({ id: 1 });
    const dist = mkDistance();
    const ctx = mkPipelineCtx({
      teamIdStore: new Map([["sporting", 1], ["benfica", 2]]),
      allResults: [
        mkRaw(event, dist, mkStoredResult({ name: "Elio Fernando Oliveira Silva", team: "Sporting", bib: "100" })),
        mkRaw(event, dist, mkStoredResult({ name: "Elio Silva", team: "Benfica", bib: "101" })),
      ],
    });

    buildRemainingTeamProfiles(ctx);
    mergeLegalNameVariants(ctx);

    expect(ctx.index.size).toBe(2);
  });

  it("skips solo (team-id 0) entries", () => {
    // Solo entries have their own collision resolution — this pass must
    // ignore them.
    const event = mkEvent({ id: 1 });
    const dist = mkDistance();
    const ctx = mkPipelineCtx({
      allResults: [
        mkRaw(event, dist, mkStoredResult({ name: "Elio Fernando Silva", team: "Individual", bib: "100" })),
        mkRaw(event, dist, mkStoredResult({ name: "Elio Silva", team: "Individual", bib: "101" })),
      ],
    });

    buildRemainingTeamProfiles(ctx);
    const sizeBefore = ctx.index.size;
    mergeLegalNameVariants(ctx);

    // Solo profiles weren't even built by buildRemainingTeamProfiles, but
    // confirm pass is a no-op regardless.
    expect(ctx.index.size).toBe(sizeBefore);
  });
});

describe("mergeMissingSpaceVariants", () => {
  it("merges a missing-space variant into its spaced sibling within a team", () => {
    // "PedroGalante" and "Pedro Galante" on the same team are the same
    // person with a data-entry error. The pass collapses them into one profile.
    // The surviving profile is whichever has more results — when tied, the
    // first-inserted wins (an implementation detail, not a guarantee).
    const event1 = mkEvent({ id: 1, date: "2025-04-01" });
    const event2 = mkEvent({ id: 2, date: "2025-05-01" });
    const event3 = mkEvent({ id: 3, date: "2025-06-01" });
    const dist = mkDistance();
    const ctx = mkPipelineCtx({
      teamIdStore: new Map([["sporting", 1]]),
      allResults: [
        // Spaced form has 2 results — must win as the surviving profile.
        mkRaw(event1, dist, mkStoredResult({ name: "Pedro Galante", team: "Sporting" })),
        mkRaw(event2, dist, mkStoredResult({ name: "Pedro Galante", team: "Sporting" })),
        mkRaw(event3, dist, mkStoredResult({ name: "PedroGalante", team: "Sporting" })),
      ],
    });

    buildRemainingTeamProfiles(ctx);
    expect(ctx.index.size).toBe(2);

    mergeMissingSpaceVariants(ctx);

    expect(ctx.index.size).toBe(1);
    expect([...ctx.index.values()][0]!.nameLower).toBe("pedro galante");
    expect([...ctx.index.values()][0]!.results).toHaveLength(3);
  });

  it("skips when both variants have spaces (not a missing-space case)", () => {
    // The pass is only meant to fix one-token vs multi-token collisions,
    // not arbitrary name similarities.
    const event = mkEvent({ id: 1 });
    const dist = mkDistance();
    const ctx = mkPipelineCtx({
      teamIdStore: new Map([["sporting", 1]]),
      allResults: [
        mkRaw(event, dist, mkStoredResult({ name: "Pedro Galante", team: "Sporting", bib: "100" })),
        mkRaw(event, dist, mkStoredResult({ name: "Pedro Galante Junior", team: "Sporting", bib: "101" })),
      ],
    });

    buildRemainingTeamProfiles(ctx);
    mergeMissingSpaceVariants(ctx);

    // Different names, no missing-space collision — kept apart.
    expect(ctx.index.size).toBe(2);
  });

  it("respects licence conflicts — does not merge profiles with disjoint licences", () => {
    // Even if names look like a missing-space variant, conflicting licences
    // are definitive proof of two different people.
    const event = mkEvent({ id: 1 });
    const dist = mkDistance();
    const ctx = mkPipelineCtx({
      teamIdStore: new Map([["sporting", 1]]),
      allResults: [
        mkRaw(event, dist, mkStoredResult({ name: "PedroGalante", team: "Sporting", bib: "100" })),
        mkRaw(event, dist, mkStoredResult({ name: "Pedro Galante", team: "Sporting", bib: "101" })),
      ],
    });

    buildRemainingTeamProfiles(ctx);
    // Inject conflicting licences on the two profiles.
    const keys = [...ctx.index.keys()];
    ctx.entryLicences.set(keys[0]!, new Set(["L1"]));
    ctx.entryLicences.set(keys[1]!, new Set(["L2"]));

    mergeMissingSpaceVariants(ctx);

    expect(ctx.index.size).toBe(2);
  });
});
