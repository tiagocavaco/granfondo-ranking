import { normalizeName, isValidLicence, isSoloTeam, sameTeam } from "../../../normalize.js";
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
      index.get(key)!.teams.some((tk) => sameTeam(tk, r.team)),
    );

    if (candidates.length === 1) {
      assigned.add(rKey);
      addResult(index.get(candidates[0]!)!, toRef(r, event, dist), false);
      count++;
    } else if (candidates.length > 1) {
      console.warn(
        `  [pass2] ambiguous: "${r.name}" / "${r.team}" @ event ${event.id} — ${candidates.length} matches — left for pass3`,
      );
    }
  }

  console.log(`  [pass2] ${count} unlicensed results matched by name+team`);
}
