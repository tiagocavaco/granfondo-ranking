/**
 * pipeline/results/results.ts
 *
 * Multi-pass athlete index builder — orchestrator.
 * Each pass lives in its own file under passes/.
 *
 * buildLicenceProfiles        — licence holders only (authoritative)
 * enrichLicenceProfiles       — unlicensed team results matched to existing profiles by name + team
 * buildRemainingTeamProfiles  — remaining team results become new profiles
 * mergeLegalNameVariants      — full legal name folded into short name within same team
 * mergeMissingSpaceVariants   — missing-space name variants merged within same team
 * applyManualAthleteAliases   — alias rules from DB merge duplicate identities early
 * groupSoloIntraYear          — solo results grouped by (name, category, year); collision resolution
 * mergeSoloCrossYear          — cross-year solo profile merge
 * mergeTeamCrossYear          — cross-year team-change merge
 * mergeTeamSoloProfiles       — team ↔ solo cross-pass merge
 * applyManualResultAssignments — manual result assignments from DB (run last)
 * sweepCategoryEviction       — post-pass category-consistency eviction
 */

import { normalizeName } from "../../normalize.js";
import type { StoredEvent } from "@granfondo/database/types";
import { PLACEHOLDER_NAMES } from "../../config.js";
import {
  makeIdManager,
  deriveCanonicalTeam,
  resultDedupeKey,
} from "./helpers.js";
import { buildLicenceProfiles } from "./passes/build-licence-profiles.js";
import { enrichLicenceProfiles } from "./passes/enrich-licence-profiles.js";
import { buildRemainingTeamProfiles } from "./passes/remaining-team-profiles.js";
import {
  mergeLegalNameVariants,
  mergeMissingSpaceVariants,
} from "./passes/merge-team-name-variants.js";
import { applyManualAthleteAliases } from "./passes/manual-athlete-aliases.js";
import { groupSoloIntraYear } from "./passes/solo-intra-year.js";
import { mergeSoloCrossYear } from "./passes/solo-cross-year.js";
import { mergeTeamCrossYear } from "./passes/team-cross-year.js";
import { mergeTeamSoloProfiles } from "./passes/team-solo-merge.js";
import { applyManualResultAssignments } from "./passes/manual-result-assignments.js";
import { sweepCategoryEviction } from "./passes/category-sweep-eviction.js";

// ── Public type re-exports ────────────────────────────────────────────────────

export type {
  AthleteEntry,
  AthleteAliasRule,
  ResultAssignment,
} from "./types.js";
export type { ResultsLoader, AthleteIdStore } from "./types.js";
export type { SoloCollisionFlag, CrossPassFlag } from "./types.js";

export {
  normalizeName as normalizeAthleteNameKey,
  isValidLicence,
  levenshteinDistance,
  normalizeDistance,
  DISTANCE_ALIASES,
  canonicalizeCategory,
  SOLO_TEAM_KEYS,
  isSoloTeam,
  sameTeam,
} from "../../normalize.js";

export {
  athleteKey,
  soloGroupCat,
  isValidCatTransition,
  SOLO_CAT_RANK,
} from "./helpers.js";

// ── ID store helpers ──────────────────────────────────────────────────────────

import type { AthleteEntry, AthleteIdStore } from "./types.js";

/** Build a fresh ID store from only the live athletes in the final index. */
export function buildUpdatedIdStore(
  index: Map<string, AthleteEntry>,
): AthleteIdStore {
  const store = new Map<string, number>();
  for (const [key, entry] of index) {
    store.set(key, entry.id);
  }

  return store;
}

// ── Main builder ──────────────────────────────────────────────────────────────

import type {
  ResultsLoader,
  SoloCollisionFlag,
  CrossPassFlag,
} from "./types.js";
import type { AthleteAliasRule, ResultAssignment } from "./types.js";

export function buildAthletesIndex(
  events: StoredEvent[],
  loader: ResultsLoader,
  aliasRules: AthleteAliasRule[],
  assignments: ResultAssignment[],
  idStore: AthleteIdStore = new Map(),
  teamIdStore: Map<string, number> = new Map(),
): {
  index: Map<string, AthleteEntry>;
  updatedIdStore: AthleteIdStore;
  soloFlags: SoloCollisionFlag[];
  crossPassFlags: CrossPassFlag[];
} {
  const ids = makeIdManager(idStore);

  // Preload all results — skip known placeholder names used by organizers
  const allResults = [];
  for (const event of events.filter((e) => e.hasResults)) {
    const stored = loader(event.id);
    if (!stored) {
      continue;
    }

    for (const dist of stored.distances) {
      for (const r of dist.results) {
        if (PLACEHOLDER_NAMES.has(normalizeName(r.name))) {
          continue;
        }

        allResults.push({
          event,
          dist,
          r,
          rKey: resultDedupeKey(event.id, dist.name, r.bib),
        });
      }
    }
  }

  const ctx = {
    allResults,
    aliasRules,
    assignments,
    loader,
    teamIdStore,
    index: new Map<string, AthleteEntry>(),
    assigned: new Set<string>(),
    ids,
    soloFlags: [] as SoloCollisionFlag[],
    crossPassFlags: [] as CrossPassFlag[],
    deletedKeys: new Set<string>(),
    manualAssignments: new Set<string>(),
    soloGroupKeys: new Set<string>(),
    entryLicences: new Map<string, Set<string>>(),
  };

  buildLicenceProfiles(ctx);
  enrichLicenceProfiles(ctx);
  const { teamCount } = buildRemainingTeamProfiles(ctx);
  mergeLegalNameVariants(ctx);
  mergeMissingSpaceVariants(ctx);
  applyManualAthleteAliases(ctx);
  const { soloCount } = groupSoloIntraYear(ctx);
  mergeSoloCrossYear(ctx);
  mergeTeamCrossYear(ctx);
  mergeTeamSoloProfiles(ctx);
  console.log(
    `  [pipeline] ${teamCount} new team profiles, ${soloCount} solo profiles (${ctx.soloFlags.length} collision flag(s))`,
  );

  // Final sort + canonical teams before manual assignments
  for (const entry of ctx.index.values()) {
    entry.results.sort(
      (a, b) =>
        new Date(b.eventDate).getTime() - new Date(a.eventDate).getTime(),
    );
    deriveCanonicalTeam(entry);
  }

  applyManualResultAssignments(ctx);
  sweepCategoryEviction(ctx);

  // Build updated ID store from ONLY the live athletes in the final index.
  // Intentionally do NOT inherit stale keys from idStore — merged/evicted athletes
  // inflate Math.max(idStore.values()) and cause the next scrape to mint
  // unnecessarily high IDs, creating gaps.
  const updatedIdStore = buildUpdatedIdStore(ctx.index);

  return {
    index: ctx.index,
    updatedIdStore,
    soloFlags: ctx.soloFlags,
    crossPassFlags: ctx.crossPassFlags,
  };
}
