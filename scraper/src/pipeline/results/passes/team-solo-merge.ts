import { canonicalizeCategory } from "../../../normalize.js";
import type { AthleteEntry } from "@granfondo/database/types";
import type { PipelineCtx } from "../types.js";
import {
  addResult,
  deriveCanonicalTeam,
  isValidCatTransition,
  entryCanonCatForYear,
  profileDistanceSet,
  profileMedianPercentile,
  profileCountry,
  setsIntersect,
  categoriesCompatible,
  licencesConflict,
  mergeLicenceSets,
} from "../helpers.js";

export function mergeTeamSoloProfiles(ctx: PipelineCtx): void {
  const { index, crossPassFlags } = ctx;
  let count = 0;

  // Maps each athlete ID to the union of event IDs across all team profiles sharing that ID.
  // Used to detect when a candidate's ID-sibling already covers one of the solo's events —
  // merging in that case would create two entries with the same (athlete_id, event_id, distance),
  // which causes a UNIQUE constraint violation in the DB writer.
  const idToEventIds = new Map<number, Set<number>>();
  for (const [key, entry] of index) {
    if (key.includes("|solo:") || entry.id === undefined) continue;
    let eventSet = idToEventIds.get(entry.id);
    if (!eventSet) {
      eventSet = new Set();
      idToEventIds.set(entry.id, eventSet);
    }
    for (const result of entry.results) {
      eventSet.add(result.eventId);
    }
  }

  const soloKeys = [...index.keys()].filter((k) => k.includes("|solo:"));

  for (const soloKey of soloKeys) {
    const soloEntry = index.get(soloKey);
    if (!soloEntry) {
      continue;
    }

    const soloEventIds = new Set(soloEntry.results.map((r) => r.eventId));

    let candidates: Array<{ key: string; entry: AthleteEntry }> = [];
    for (const [k, e] of index) {
      if (k.includes("|solo:")) {
        continue;
      }

      if (e.nameLower === soloEntry.nameLower) {
        candidates.push({ key: k, entry: e });
      }
    }

    if (candidates.length === 0) {
      continue;
    }

    // Golden rule — remove candidates sharing any eventId
    candidates = candidates.filter(
      (c) => !c.entry.results.some((r) => soloEventIds.has(r.eventId)),
    );
    if (candidates.length === 0) {
      continue;
    }

    // Enhanced golden rule — remove candidates whose ID-sibling profiles already cover
    // any of the solo's events. Without this, the solo would be merged into a candidate
    // that doesn't itself have the event, but another profile sharing the same athlete ID
    // does, resulting in two entries with the same (athlete_id, event_id, distance).
    candidates = candidates.filter((candidate) => {
      if (candidate.entry.id === undefined) return true;
      const siblingEventIds = idToEventIds.get(candidate.entry.id);
      if (!siblingEventIds) return true;
      return !setsIntersect(soloEventIds, siblingEventIds);
    });
    if (candidates.length === 0) {
      continue;
    }

    // Distance sanity check
    const soloDists = profileDistanceSet(soloEntry.results);
    candidates = candidates.filter((c) =>
      setsIntersect(soloDists, profileDistanceSet(c.entry.results)),
    );
    if (candidates.length === 0) {
      continue;
    }

    // Percentile sanity check
    const soloMedian = profileMedianPercentile(soloEntry.results);
    if (soloMedian !== null) {
      candidates = candidates.filter((c) => {
        const m = profileMedianPercentile(c.entry.results);
        return m === null || Math.abs(soloMedian - m) <= 0.25;
      });
      if (candidates.length === 0) {
        continue;
      }
    }

    // Country sanity check
    const soloCountry = profileCountry(soloEntry.results);
    if (soloCountry !== null) {
      candidates = candidates.filter((c) => {
        const candidateCountry = profileCountry(c.entry.results);
        return candidateCountry === null || candidateCountry === soloCountry;
      });
      if (candidates.length === 0) {
        continue;
      }
    }

    // Category compatibility check
    const soloYearCats = Object.entries(soloEntry.categories)
      .map(([year, raws]) => ({
        year: Number(year),
        canon: canonicalizeCategory(raws[0] ?? ""),
      }))
      .filter((entry) => entry.canon);
    candidates = candidates.filter((c) => {
      const combined = [
        ...soloYearCats,
        ...Object.entries(c.entry.categories)
          .map(([year]) => ({
            year: Number(year),
            canon: entryCanonCatForYear(c.entry, Number(year)) ?? "",
          }))
          .filter((entry) => entry.canon),
      ].sort((a, b) => a.year - b.year);
      for (let i = 1; i < combined.length; i++) {
        const prev = combined[i - 1]!,
          curr = combined[i]!;
        if (prev.year === curr.year) {
          if (!categoriesCompatible(prev.canon, curr.canon)) {
            return false;
          }
        } else {
          if (
            !isValidCatTransition(prev.canon, curr.canon, curr.year - prev.year)
          ) {
            return false;
          }
        }
      }

      return true;
    });
    if (candidates.length === 0) {
      continue;
    }

    // Filter out team candidates whose licences conflict with the solo entry
    candidates = candidates.filter(
      (c) => !licencesConflict(soloKey, c.key, ctx.entryLicences),
    );
    if (candidates.length === 0) {
      continue;
    }

    if (candidates.length === 1) {
      const mergeTarget = candidates[0]!;
      for (const result of soloEntry.results) {
        addResult(mergeTarget.entry, result, false);
        // Keep the sibling-events map current so later solos see the post-merge event set.
        if (mergeTarget.entry.id !== undefined) {
          let eventSet = idToEventIds.get(mergeTarget.entry.id);
          if (!eventSet) {
            eventSet = new Set();
            idToEventIds.set(mergeTarget.entry.id, eventSet);
          }
          eventSet.add(result.eventId);
        }
      }

      mergeLicenceSets(mergeTarget.key, soloKey, ctx.entryLicences);
      ctx.deletedKeys.add(soloKey);
      index.delete(soloKey);
      deriveCanonicalTeam(mergeTarget.entry);
      count++;
    } else {
      crossPassFlags.push({
        soloKey,
        soloAthleteId: soloEntry.id,
        soloName: soloEntry.name,
        teamCandidates: candidates.map((c) => ({
          athleteId: c.entry.id,
          canonicalTeam: c.entry.canonicalTeam,
        })),
      });
    }
  }

  if (count > 0) {
    console.log(
      `  [team-solo-merge] ${count} solo profile(s) merged into team profile(s)`,
    );
  }

  if (crossPassFlags.length > 0) {
    console.log(
      `  [team-solo-merge] ${crossPassFlags.length} ambiguous cross-pass merge(s) flagged`,
    );
  }
}
