import { normalizeName } from "../../../normalize.js";
import type { PipelineCtx } from "../types.js";
import {
  resolveTeamId,
  addResult,
  deriveCanonicalTeam,
  mergeLicenceSets,
} from "../helpers.js";

export function applyManualAthleteAliases(ctx: PipelineCtx): void {
  const { index, aliasRules } = ctx;

  for (const rule of aliasRules) {
    const canonNameLower = normalizeName(rule.name);
    const canonKey = `${canonNameLower}|${resolveTeamId(rule.canonicalTeam, ctx.teamIdStore)}`;
    const canonEntry = index.get(canonKey);
    if (!canonEntry) {
      continue;
    }

    for (const alias of rule.aliases) {
      if (alias.team === "") {
        continue;
      }

      const aliasKey = `${normalizeName(alias.name)}|${resolveTeamId(alias.team, ctx.teamIdStore)}`;
      if (aliasKey === canonKey) {
        continue;
      }

      const aliasEntry = index.get(aliasKey);
      if (!aliasEntry) {
        continue;
      }

      for (const result of aliasEntry.results) {
        addResult(canonEntry, result, false);
      }

      mergeLicenceSets(canonKey, aliasKey, ctx.entryLicences); // alias override — merge regardless of conflict
      index.delete(aliasKey);
      ctx.deletedKeys.add(aliasKey);
    }

    deriveCanonicalTeam(canonEntry);
  }
}
