import { normalizeName, isSoloTeam } from "../../../normalize.js";
import type { PipelineCtx } from "../types.js";
import { resolveTeamId, newEntry, addResult, toRef } from "../helpers.js";

export function buildRemainingTeamProfiles(ctx: PipelineCtx): { teamCount: number } {
  const { allResults, index, assigned, ids } = ctx;
  let teamCount = 0;

  for (const { event, dist, r, rKey } of allResults) {
    if (assigned.has(rKey)) {
      continue;
    }

    if (isSoloTeam(r.team)) {
      continue;
    }

    const nameLower = normalizeName(r.name);
    const exactKey = `${nameLower}|${resolveTeamId(r.team, ctx.teamIdStore)}`;

    const matchKey: string | undefined = index.has(exactKey)
      ? exactKey
      : undefined;

    assigned.add(rKey);
    if (matchKey) {
      addResult(index.get(matchKey)!, toRef(r, event, dist), false);
    } else {
      index.set(exactKey, newEntry(ids.get(exactKey), r.name, nameLower));
      addResult(index.get(exactKey)!, toRef(r, event, dist), false);
      teamCount++;
    }
  }

  return { teamCount };
}
