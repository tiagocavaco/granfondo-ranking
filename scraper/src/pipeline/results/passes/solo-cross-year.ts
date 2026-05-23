import type { PipelineCtx } from "../types.js";
import {
  addResult,
  isValidCatTransition,
  licencesConflict,
  mergeLicenceSets,
} from "../helpers.js";

export function mergeSoloCrossYear(ctx: PipelineCtx): void {
  const { index, soloGroupKeys } = ctx;

  type SoloYearEntry = { key: string; canonCat: string; year: number };
  const soloByName = new Map<string, SoloYearEntry[]>();

  for (const groupKey of soloGroupKeys) {
    if (!index.has(groupKey)) {
      continue;
    }

    const pipeIdx = groupKey.indexOf("|solo:");
    if (pipeIdx < 0) {
      continue;
    }

    const nameLower = groupKey.slice(0, pipeIdx);
    const rest = groupKey.slice(pipeIdx + 6); // after "|solo:"
    const lastColon = rest.lastIndexOf(":");
    if (lastColon < 0) {
      continue;
    }

    const yearStr = rest.slice(lastColon + 1);
    const canonCat = rest.slice(0, lastColon);
    const year = parseInt(yearStr, 10);
    if (isNaN(year)) {
      continue;
    }

    if (!soloByName.has(nameLower)) {
      soloByName.set(nameLower, []);
    }

    soloByName.get(nameLower)!.push({ key: groupKey, canonCat, year });
  }

  let count = 0;
  for (const [, yearProfiles] of soloByName) {
    if (yearProfiles.length <= 1) {
      continue;
    }

    yearProfiles.sort((a, b) => a.year - b.year);

    let allValid = true;
    for (let i = 1; i < yearProfiles.length; i++) {
      const prev = yearProfiles[i - 1]!;
      const curr = yearProfiles[i]!;
      if (
        !isValidCatTransition(
          prev.canonCat,
          curr.canonCat,
          curr.year - prev.year,
        )
      ) {
        allValid = false;
        break;
      }
    }

    if (!allValid) {
      continue;
    }

    const canonKey = yearProfiles[0]!.key;
    const canonEntry = index.get(canonKey)!;
    for (let i = 1; i < yearProfiles.length; i++) {
      const laterKey = yearProfiles[i]!.key;
      const laterEntry = index.get(laterKey);
      if (!laterEntry) {
        continue;
      }

      if (licencesConflict(canonKey, laterKey, ctx.entryLicences)) {
        continue;
      }

      for (const result of laterEntry.results) {
        addResult(canonEntry, result, false);
      }

      mergeLicenceSets(canonKey, laterKey, ctx.entryLicences);
      ctx.deletedKeys.add(laterKey);
      index.delete(laterKey);
      count++;
    }
  }

  if (count > 0) {
    console.log(`  [solo-cross-year] ${count} cross-year solo profile(s) merged`);
  }
}
