import { describe, it, expect } from "vitest";
import { applyManualAthleteAliases } from "./manual-athlete-aliases.js";
import { buildRemainingTeamProfiles } from "./remaining-team-profiles.js";
import {
  mkPipelineCtx,
  mkEvent,
  mkDistance,
  mkStoredResult,
  mkRaw,
} from "../test-fixture.js";

describe("applyManualAthleteAliases", () => {
  it("merges an alias profile into its canonical target", () => {
    // Manual alias rules are operator-set DB overrides. Pass folds the
    // alias profile's results into the canonical profile and deletes the alias.
    // Distinct events so addResult doesn't dedupe.
    const event1 = mkEvent({ id: 1, date: "2025-04-01" });
    const event2 = mkEvent({ id: 2, date: "2025-05-01" });
    const dist = mkDistance();
    const ctx = mkPipelineCtx({
      teamIdStore: new Map([["sporting", 1]]),
      allResults: [
        mkRaw(
          event1,
          dist,
          mkStoredResult({ name: "João Silva", team: "Sporting", bib: "100" }),
        ),
        mkRaw(
          event2,
          dist,
          mkStoredResult({ name: "Joao S", team: "Sporting", bib: "101" }),
        ),
      ],
      aliasRules: [
        {
          name: "João Silva",
          canonicalTeam: "Sporting",
          aliases: [{ name: "Joao S", team: "Sporting" }],
        },
      ],
    });

    buildRemainingTeamProfiles(ctx);
    expect(ctx.index.size).toBe(2);

    applyManualAthleteAliases(ctx);

    expect(ctx.index.size).toBe(1);
    expect([...ctx.index.values()][0]!.nameLower).toBe("joao silva");
    expect([...ctx.index.values()][0]!.results).toHaveLength(2);
  });

  it("no-op when the canonical profile does not exist", () => {
    // Alias rules that reference a canonical that wasn't built are silently
    // ignored (data drift between rules and current scrape is normal).
    const event = mkEvent({ id: 1 });
    const dist = mkDistance();
    const ctx = mkPipelineCtx({
      teamIdStore: new Map([["sporting", 1]]),
      allResults: [
        mkRaw(
          event,
          dist,
          mkStoredResult({ name: "Joao S", team: "Sporting" }),
        ),
      ],
      aliasRules: [
        {
          name: "Some Missing Canonical",
          canonicalTeam: "Sporting",
          aliases: [{ name: "Joao S", team: "Sporting" }],
        },
      ],
    });

    buildRemainingTeamProfiles(ctx);
    const sizeBefore = ctx.index.size;
    applyManualAthleteAliases(ctx);

    expect(ctx.index.size).toBe(sizeBefore);
  });

  it("registers the deleted alias key for downstream awareness", () => {
    // deletedKeys is consumed by participant-link resolution + the post-scrape
    // sweep. The alias key must be present after the merge.
    const event1 = mkEvent({ id: 1, date: "2025-04-01" });
    const event2 = mkEvent({ id: 2, date: "2025-05-01" });
    const dist = mkDistance();
    const ctx = mkPipelineCtx({
      teamIdStore: new Map([["sporting", 1]]),
      allResults: [
        mkRaw(
          event1,
          dist,
          mkStoredResult({ name: "João Silva", team: "Sporting" }),
        ),
        mkRaw(
          event2,
          dist,
          mkStoredResult({ name: "Joao S", team: "Sporting" }),
        ),
      ],
      aliasRules: [
        {
          name: "João Silva",
          canonicalTeam: "Sporting",
          aliases: [{ name: "Joao S", team: "Sporting" }],
        },
      ],
    });

    buildRemainingTeamProfiles(ctx);
    applyManualAthleteAliases(ctx);

    expect(ctx.deletedKeys.size).toBeGreaterThanOrEqual(1);
  });

  it("alias merge proceeds even when licences look like they conflict", () => {
    // Manual aliases are operator overrides — they intentionally bypass
    // licencesConflict. Without that, an operator-set merge could be silently
    // discarded.
    const event1 = mkEvent({ id: 1, date: "2025-04-01" });
    const event2 = mkEvent({ id: 2, date: "2025-05-01" });
    const dist = mkDistance();
    const ctx = mkPipelineCtx({
      teamIdStore: new Map([["sporting", 1]]),
      allResults: [
        mkRaw(
          event1,
          dist,
          mkStoredResult({ name: "João Silva", team: "Sporting" }),
        ),
        mkRaw(
          event2,
          dist,
          mkStoredResult({ name: "Joao S", team: "Sporting" }),
        ),
      ],
      aliasRules: [
        {
          name: "João Silva",
          canonicalTeam: "Sporting",
          aliases: [{ name: "Joao S", team: "Sporting" }],
        },
      ],
    });

    buildRemainingTeamProfiles(ctx);
    const keys = [...ctx.index.keys()];
    ctx.entryLicences.set(keys[0]!, new Set(["L1"]));
    ctx.entryLicences.set(keys[1]!, new Set(["L2"]));

    applyManualAthleteAliases(ctx);

    expect(ctx.index.size).toBe(1);
  });

  it("ignores aliases with empty team string", () => {
    // Empty-team aliases are not currently supported (would need solo-key
    // semantics) and are skipped to avoid accidental cross-team merges.
    const event = mkEvent({ id: 1 });
    const dist = mkDistance();
    const ctx = mkPipelineCtx({
      teamIdStore: new Map([["sporting", 1]]),
      allResults: [
        mkRaw(
          event,
          dist,
          mkStoredResult({ name: "João Silva", team: "Sporting", bib: "100" }),
        ),
      ],
      aliasRules: [
        {
          name: "João Silva",
          canonicalTeam: "Sporting",
          aliases: [{ name: "Joao", team: "" }],
        },
      ],
    });

    buildRemainingTeamProfiles(ctx);
    const sizeBefore = ctx.index.size;
    applyManualAthleteAliases(ctx);

    expect(ctx.index.size).toBe(sizeBefore);
  });
});
