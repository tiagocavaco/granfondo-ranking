import {
  normalizeName,
  isValidLicence,
  isSoloTeam,
  sameTeam,
} from "../../../normalize.js";
import type { PipelineCtx } from "../types.js";
import { addResult, toRef, buildNameLookup } from "../helpers.js";

export function enrichLicenceProfiles(ctx: PipelineCtx): void {
  const { allResults, index, assigned } = ctx;
  let count = 0;
  const nameLookup = buildNameLookup(index);

  for (const { event, dist, r, rKey } of allResults) {
    if (assigned.has(rKey)) {
      continue;
    }

    if (isSoloTeam(r.team)) {
      continue;
    }

    if (r.licences.some(isValidLicence)) {
      continue;
    }

    const nameLower = normalizeName(r.name);
    const candidates = (nameLookup.get(nameLower) ?? []).filter((key) =>
      index.get(key)!.teams.some((teamKey) => sameTeam(teamKey, r.team)),
    );

    if (candidates.length === 1) {
      assigned.add(rKey);
      addResult(index.get(candidates[0]!)!, toRef(r, event, dist), false);
      count++;
    } else if (candidates.length > 1) {
      console.warn(
        `  [enrich-licences] ambiguous — multiple matches, left for remaining-team-profiles`,
      );
    }
  }

  console.log(
    `  [enrich-licences] ${count} unlicensed results matched by name+team`,
  );
}
