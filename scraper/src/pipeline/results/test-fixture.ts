/**
 * Shared fixtures for pipeline pass tests.
 *
 * mkPipelineCtx() returns a minimal valid PipelineCtx with sensible defaults.
 * mkEvent / mkDistance / mkStoredResult build raw inputs.
 * mkRaw is a convenience wrapper for the {event, dist, r, rKey} tuple each
 * pass iterates over.
 */

import type {
  StoredEvent,
  StoredDistanceResults,
  StoredResult,
  AthleteAliasRule,
  ResultAssignment,
} from "@granfondo/database/types";
import type { PipelineCtx, RawResult } from "./types.js";
import { makeIdManager, resultDedupeKey } from "./helpers.js";

export function mkEvent(over: Partial<StoredEvent> = {}): StoredEvent {
  return {
    id: 1,
    name: "Test Event",
    year: 2025,
    date: "2025-04-01",
    location: "Lisbon",
    resultsUrl: "https://example.com",
    officialUrl: null,
    hasResults: true,
    distances: [],
    participantCount: 100,
    finisherCount: 50,
    scrapedAt: null,
    ...over,
  };
}

export function mkDistance(
  over: Partial<StoredDistanceResults> = {},
): StoredDistanceResults {
  return {
    id: "1",
    name: "Granfondo",
    finisherCount: 50,
    results: [],
    ...over,
  };
}

export function mkStoredResult(over: Partial<StoredResult> = {}): StoredResult {
  return {
    pos: 1,
    genderPos: 1,
    catPos: 1,
    athleteId: 0,
    bib: "100",
    name: "Test Athlete",
    gender: "M",
    team: "Sporting",
    category: "Masters A Male",
    country: "PRT",
    raceTime: "3:00:00",
    raceTimeSecs: 10800,
    gap: "",
    gapSecs: 0,
    points: 50,
    licences: [],
    dnf: false,
    dns: false,
    ...over,
  };
}

export function mkRaw(
  event: StoredEvent,
  dist: StoredDistanceResults,
  result: StoredResult,
): RawResult {
  return {
    event,
    dist,
    r: result,
    rKey: resultDedupeKey(event.id, dist.name, result.bib),
  };
}

export interface PipelineCtxOverrides {
  allResults?: RawResult[];
  aliasRules?: AthleteAliasRule[];
  assignments?: ResultAssignment[];
  teamIdStore?: Map<string, number>;
}

export function mkPipelineCtx(
  overrides: PipelineCtxOverrides = {},
): PipelineCtx {
  return {
    allResults: overrides.allResults ?? [],
    aliasRules: overrides.aliasRules ?? [],
    assignments: overrides.assignments ?? [],
    loader: () => null,
    teamIdStore: overrides.teamIdStore ?? new Map(),
    index: new Map(),
    assigned: new Set(),
    ids: makeIdManager(new Map()),
    soloFlags: [],
    crossPassFlags: [],
    deletedKeys: new Set(),
    manualAssignments: new Set(),
    soloGroupKeys: new Set(),
    entryLicences: new Map(),
  };
}
