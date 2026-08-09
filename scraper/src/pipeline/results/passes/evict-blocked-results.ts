import type { BlockedResult } from "@granfondo/database/types";
import type { PipelineCtx } from "../types.js";
import { toRef, addToTeamsAndCategories } from "../helpers.js";
import { normalizeName } from "../../../normalize.js";

/**
 * Evicts specific bib+event results from an athlete's profile and collects
 * them into one new stub profile per blocked source athlete.
 *
 * All blocks with the same blockedAthleteId are assumed to belong to the same
 * person (e.g. a father whose results were merged onto a son's profile because
 * they share a name and team). They land in a single profile keyed by
 * BLOCK:{blockedAthleteId} so their results stay together across scrapes.
 *
 * Runs after applyManualResultAssignments so blocks take precedence over
 * pipeline merges, and before sweepCategoryEviction so the sweep sees the
 * already-corrected profiles.
 */
export function evictBlockedResults(
  ctx: PipelineCtx,
  blockedResults: BlockedResult[],
): void {
  // Group blocks by blocked source athlete so all evicted results land in one profile.
  const bySourceAthlete = new Map<number, BlockedResult[]>();
  for (const block of blockedResults) {
    const group = bySourceAthlete.get(block.blockedAthleteId) ?? [];
    group.push(block);
    bySourceAthlete.set(block.blockedAthleteId, group);
  }

  for (const [blockedAthleteId, blocks] of bySourceAthlete) {
    const profileKey = `BLOCK:${blockedAthleteId}`;
    const newId = ctx.ids.get(profileKey);
    let profileName = "";
    let profileNameLower = "";

    for (const block of blocks) {
      const rawResult = ctx.allResults.find(
        (rr) => rr.event.id === block.eventId && rr.r.bib === block.bib,
      );
      if (!rawResult) {
        console.warn(
          `  [block-eviction] no result for event ${block.eventId} bib ${block.bib} — skipping`,
        );
        continue;
      }

      // Remove from the source athlete's profile
      for (const [, entry] of ctx.index) {
        if (entry.id !== blockedAthleteId) continue;
        const before = entry.results.length;
        entry.results = entry.results.filter(
          (result) =>
            !(result.eventId === block.eventId && result.bib === block.bib),
        );
        if (entry.results.length < before) break;
      }

      // Accumulate onto the shared destination profile
      const resultRef = toRef(rawResult.r, rawResult.event, rawResult.dist);
      if (!profileName) {
        profileName = rawResult.r.name;
        profileNameLower = normalizeName(rawResult.r.name);
      }

      let destEntry = ctx.index.get(profileKey);
      if (!destEntry) {
        destEntry = {
          id: newId,
          name: profileName,
          nameLower: profileNameLower,
          teams: [],
          categories: {},
          results: [],
        };
        ctx.index.set(profileKey, destEntry);
      }

      destEntry.results.push(resultRef);
      addToTeamsAndCategories(destEntry, resultRef);
    }

    if (ctx.index.has(profileKey)) {
      console.log(
        `  [block-eviction] athlete ${blockedAthleteId}: ${blocks.length} result(s) moved → new profile ${newId} (${profileKey})`,
      );
    }
  }
}
