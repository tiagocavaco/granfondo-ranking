import { isSoloTeam } from "../../../normalize.js";
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
  licencesConflict,
  mergeLicenceSets,
} from "../helpers.js";

export function mergeTeamCrossYear(ctx: PipelineCtx): void {
  const { index } = ctx;

  type TeamYearEntry = {
    key: string;
    entry: AthleteEntry;
    minYear: number;
    maxYear: number;
  };
  const teamByName = new Map<string, TeamYearEntry[]>();

  for (const [key, entry] of index) {
    if (key.includes("|solo:")) {
      continue;
    }

    const years = Object.keys(entry.categories).map(Number);
    if (years.length === 0) {
      continue;
    }

    if (!teamByName.has(entry.nameLower)) {
      teamByName.set(entry.nameLower, []);
    }

    teamByName.get(entry.nameLower)!.push({
      key,
      entry,
      minYear: Math.min(...years),
      maxYear: Math.max(...years),
    });
  }

  let count = 0;
  for (const [, profiles] of teamByName) {
    if (profiles.length < 2) {
      continue;
    }

    profiles.sort((a, b) => a.minYear - b.minYear);

    // Pairwise evaluation: try to merge each profile into any earlier profile that
    // passes all checks. This avoids blocking valid merges when other same-name profiles
    // from genuinely different people overlap in years.
    for (let i = 0; i < profiles.length - 1; i++) {
      const canon = profiles[i]!;
      if (!index.has(canon.key)) {
        continue;
      }

      for (let j = i + 1; j < profiles.length; j++) {
        const later = profiles[j]!;
        if (!index.has(later.key)) {
          continue;
        }

        // If entries share a valid licence they are the same person — bypass all soft
        // checks (year overlap, category transition, distance, percentile, country).
        // The only hard guard is same-event + same-distance + different-bib, which
        // would mean two physically different bibs competing simultaneously.
        const canonLics = ctx.entryLicences.get(canon.key);
        const laterLics = ctx.entryLicences.get(later.key);
        const shareLicence = !!(
          canonLics?.size &&
          laterLics?.size &&
          [...canonLics].some((l) => laterLics!.has(l))
        );

        if (shareLicence) {
          const canonBibBySlot = new Map(
            canon.entry.results.map((r) => [
              `${r.eventId}|${r.distance}`,
              r.bib,
            ]),
          );
          const hasCollision = later.entry.results.some((r) => {
            const cb = canonBibBySlot.get(`${r.eventId}|${r.distance}`);
            return cb !== undefined && cb !== r.bib;
          });
          if (hasCollision) {
            continue;
          }

          // Shared licence bypasses soft checks, but flag a warning if categories are
          // incompatible — this likely means the licence was scraped onto the wrong result
          // at one event rather than genuinely being the same person.
          const canonCatSL = entryCanonCatForYear(canon.entry, canon.maxYear);
          const laterCatSL = entryCanonCatForYear(later.entry, later.minYear);
          if (
            canonCatSL &&
            laterCatSL &&
            !isValidCatTransition(
              canonCatSL,
              laterCatSL,
              later.minYear - canon.maxYear,
            )
          ) {
            const sharedLics = [
              ...(ctx.entryLicences.get(canon.key) ?? new Set()),
            ].filter((l) => ctx.entryLicences.get(later.key)?.has(l));
            console.warn(
              `  [pass7] WARNING: shared licence (${sharedLics.join(", ")}) but incompatible categories "${canonCatSL}" → "${laterCatSL}" for "${canon.entry.name}" — merging anyway, but likely a scraped licence error`,
            );
          }
        } else {
          if (canon.maxYear >= later.minYear) {
            continue;
          } // year overlap → different people

          // Don't merge a licence-only individual (teamId=0, all solo teams) into a team
          // athlete. These are frequently different people who share a name. They should
          // be handled by Pass 8 (team ↔ solo) or left separate.
          const laterTeamId = parseInt(
            later.key.slice(later.key.lastIndexOf("|") + 1),
            10,
          );
          if (
            laterTeamId === 0 &&
            later.entry.results.every((r) => isSoloTeam(r.team))
          ) {
            continue;
          }

          const prevCat = entryCanonCatForYear(canon.entry, canon.maxYear);
          const currCat = entryCanonCatForYear(later.entry, later.minYear);
          if (
            !prevCat ||
            !currCat ||
            !isValidCatTransition(
              prevCat,
              currCat,
              later.minYear - canon.maxYear,
            )
          ) {
            continue;
          }

          if (
            !setsIntersect(
              profileDistanceSet(canon.entry.results),
              profileDistanceSet(later.entry.results),
            )
          ) {
            continue;
          }

          const mA = profileMedianPercentile(canon.entry.results);
          const mB = profileMedianPercentile(later.entry.results);
          if (mA !== null && mB !== null && Math.abs(mA - mB) > 0.25) {
            continue;
          }

          const cA = profileCountry(canon.entry.results);
          const cB = profileCountry(later.entry.results);
          if (cA !== null && cB !== null && cA !== cB) {
            continue;
          }
        }

        if (licencesConflict(canon.key, later.key, ctx.entryLicences)) {
          continue;
        }

        for (const result of later.entry.results) {
          addResult(canon.entry, result, false);
        }

        mergeLicenceSets(canon.key, later.key, ctx.entryLicences);
        ctx.deletedKeys.add(later.key);
        index.delete(later.key);
        canon.maxYear = Math.max(canon.maxYear, later.maxYear);
        deriveCanonicalTeam(canon.entry);
        count++;
      }
    }
  }

  if (count > 0) {
    console.log(`  [pass7] ${count} cross-year team profile(s) merged`);
  }
}
