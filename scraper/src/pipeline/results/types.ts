import type {
  StoredEvent,
  StoredDistanceResults,
  StoredResult,
  AthleteEntry,
  AthleteAliasRule,
  ResultAssignment,
  StoredEventResults,
} from "@granfondo/database/types";

export type { AthleteEntry, AthleteAliasRule, ResultAssignment };

export type ResultsLoader = (id: number) => StoredEventResults | null;
export type AthleteIdStore = Map<string, number>;

/** One raw result row with its event/distance context and dedup key. */
export type RawResult = {
  event: StoredEvent;
  dist: StoredDistanceResults;
  r: StoredResult;
  rKey: string;
};

export interface IdManager {
  get(key: string): number;
  getMinted(): Map<string, number>;
}

export interface SoloCollisionFlag {
  groupKey: string; // `nameLower|solo:CanonCat:year`
  eventId: number;
  eventName: string;
  resolution: "distance" | "percentile" | "flagged_manual";
  // For distance/percentile: results[0] is kept in the group, results[1] routed to bib-key.
  // For flagged_manual: all results are bib-keyed (none kept in group).
  results: Array<{
    athleteId: number;
    bib: string;
    distance: string;
    genderPos: number;
    finisherCount: number;
  }>;
}

export interface CrossPassFlag {
  soloKey: string;
  soloAthleteId: number;
  soloName: string;
  teamCandidates: Array<{
    athleteId: number;
    canonicalTeam: string | undefined;
  }>;
}

export interface PipelineCtx {
  // Inputs (read-only after init)
  allResults: RawResult[];
  aliasRules: AthleteAliasRule[];
  assignments: ResultAssignment[];
  loader: ResultsLoader;
  teamIdStore: Map<string, number>;
  // Mutable pipeline state
  index: Map<string, AthleteEntry>;
  assigned: Set<string>;
  ids: IdManager;
  soloFlags: SoloCollisionFlag[];
  crossPassFlags: CrossPassFlag[];
  deletedKeys: Set<string>;
  manualAssignments: Set<string>;
  soloGroupKeys: Set<string>;
  // Licence tracking: index key → set of licence numbers from buildLicenceProfiles.
  // Used by later passes to prevent merging athletes with conflicting licences.
  entryLicences: Map<string, Set<string>>;
}
