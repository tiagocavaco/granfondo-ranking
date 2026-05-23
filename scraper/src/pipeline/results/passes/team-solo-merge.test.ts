import { describe, it, expect } from "vitest";
import { mergeTeamSoloProfiles } from "./team-solo-merge.js";
import { buildRemainingTeamProfiles } from "./remaining-team-profiles.js";
import { groupSoloIntraYear } from "./solo-intra-year.js";
import {
  mkPipelineCtx,
  mkEvent,
  mkDistance,
  mkStoredResult,
  mkRaw,
} from "../test-fixture.js";

describe("mergeTeamSoloProfiles", () => {
  it("folds a solo profile into a matching team profile when name + signals align", () => {
    // Same name, non-overlapping events, same distance/country, valid
    // category — solo profile folds into the team one.
    const teamEvent = mkEvent({ id: 1, year: 2024, date: "2024-04-01" });
    const soloEvent = mkEvent({ id: 2, year: 2025, date: "2025-04-01" });
    const dist = mkDistance({ finisherCount: 100 });
    const ctx = mkPipelineCtx({
      teamIdStore: new Map([["sporting", 1]]),
      allResults: [
        mkRaw(teamEvent, dist, mkStoredResult({
          name: "João Silva", team: "Sporting", category: "Masters A Male",
          genderPos: 10, country: "PRT",
        })),
        mkRaw(soloEvent, dist, mkStoredResult({
          name: "João Silva", team: "Individual", category: "Masters A Male",
          genderPos: 12, country: "PRT", bib: "200",
        })),
      ],
    });

    buildRemainingTeamProfiles(ctx);
    groupSoloIntraYear(ctx);
    expect(ctx.index.size).toBe(2);

    mergeTeamSoloProfiles(ctx);

    expect(ctx.index.size).toBe(1);
    const surviving = [...ctx.index.values()][0]!;
    expect(surviving.results).toHaveLength(2);
  });

  it("refuses to merge when solo and team share an event (different people)", () => {
    // Same event with a solo and a team entry for the same name = two people.
    // The "golden rule" forbids merging.
    const event = mkEvent({ id: 1, year: 2025 });
    const dist = mkDistance();
    const ctx = mkPipelineCtx({
      teamIdStore: new Map([["sporting", 1]]),
      allResults: [
        mkRaw(event, dist, mkStoredResult({ name: "João Silva", team: "Sporting", bib: "100" })),
        mkRaw(event, dist, mkStoredResult({ name: "João Silva", team: "Individual", bib: "200" })),
      ],
    });

    buildRemainingTeamProfiles(ctx);
    groupSoloIntraYear(ctx);

    mergeTeamSoloProfiles(ctx);

    expect(ctx.index.size).toBe(2);
  });

  it("refuses to merge when distance sets are disjoint", () => {
    // Solo races Minifondo, team races Granfondo — likely two athletes with
    // the same name specialising in different distances.
    const teamEvent = mkEvent({ id: 1, year: 2024 });
    const soloEvent = mkEvent({ id: 2, year: 2025 });
    const granfondo = mkDistance({ id: "1", name: "Granfondo" });
    const minifondo = mkDistance({ id: "2", name: "Minifondo" });
    const ctx = mkPipelineCtx({
      teamIdStore: new Map([["sporting", 1]]),
      allResults: [
        mkRaw(teamEvent, granfondo, mkStoredResult({ name: "João Silva", team: "Sporting", category: "Masters A Male" })),
        mkRaw(soloEvent, minifondo, mkStoredResult({ name: "João Silva", team: "Individual", category: "Masters A Male", bib: "200" })),
      ],
    });

    buildRemainingTeamProfiles(ctx);
    groupSoloIntraYear(ctx);
    mergeTeamSoloProfiles(ctx);

    expect(ctx.index.size).toBe(2);
  });

  it("flags ambiguity when multiple team candidates match the solo profile", () => {
    // Solo João Silva could merge into Sporting João Silva or Benfica João
    // Silva — both pass sanity checks. Pass emits a crossPassFlag instead
    // of guessing.
    const teamEvent2024 = mkEvent({ id: 1, year: 2024 });
    const teamEvent2024b = mkEvent({ id: 2, year: 2024, date: "2024-06-01" });
    const soloEvent = mkEvent({ id: 3, year: 2025 });
    const dist = mkDistance({ finisherCount: 100 });
    const ctx = mkPipelineCtx({
      teamIdStore: new Map([["sporting", 1], ["benfica", 2]]),
      allResults: [
        mkRaw(teamEvent2024, dist, mkStoredResult({
          name: "João Silva", team: "Sporting", category: "Masters A Male",
          genderPos: 10, country: "PRT",
        })),
        mkRaw(teamEvent2024b, dist, mkStoredResult({
          name: "João Silva", team: "Benfica", category: "Masters A Male",
          genderPos: 11, country: "PRT", bib: "200",
        })),
        mkRaw(soloEvent, dist, mkStoredResult({
          name: "João Silva", team: "Individual", category: "Masters A Male",
          genderPos: 12, country: "PRT", bib: "300",
        })),
      ],
    });

    buildRemainingTeamProfiles(ctx);
    groupSoloIntraYear(ctx);

    mergeTeamSoloProfiles(ctx);

    expect(ctx.crossPassFlags.length).toBeGreaterThan(0);
  });

  it("respects licence conflicts — skips merge when solo and team have disjoint licences", () => {
    const teamEvent = mkEvent({ id: 1, year: 2024 });
    const soloEvent = mkEvent({ id: 2, year: 2025 });
    const dist = mkDistance({ finisherCount: 100 });
    const ctx = mkPipelineCtx({
      teamIdStore: new Map([["sporting", 1]]),
      allResults: [
        mkRaw(teamEvent, dist, mkStoredResult({
          name: "João Silva", team: "Sporting", category: "Masters A Male",
          genderPos: 10, country: "PRT",
        })),
        mkRaw(soloEvent, dist, mkStoredResult({
          name: "João Silva", team: "Individual", category: "Masters A Male",
          genderPos: 12, country: "PRT", bib: "200",
        })),
      ],
    });

    buildRemainingTeamProfiles(ctx);
    groupSoloIntraYear(ctx);
    const teamKey = [...ctx.index.keys()].find((k) => !k.includes("|solo:"))!;
    const soloKey = [...ctx.index.keys()].find((k) => k.includes("|solo:"))!;
    ctx.entryLicences.set(teamKey, new Set(["L1"]));
    ctx.entryLicences.set(soloKey, new Set(["L2"]));

    mergeTeamSoloProfiles(ctx);

    expect(ctx.index.size).toBe(2);
  });
});
