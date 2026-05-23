import { normalizeName, isValidLicence, isSoloTeam } from "../../../normalize.js";
import { levenshteinDistance } from "../../../normalize.js";
import type { PipelineCtx, RawResult } from "../types.js";
import {
  resolveTeamId,
  newEntry,
  addResult,
  toRef,
  resultDedupeKey,
  mergeLicenceSets,
} from "../helpers.js";

type RawResultEntry = Pick<RawResult, "event" | "dist" | "r">;

export function buildLicenceProfiles(ctx: PipelineCtx): void {
  const { allResults, index, assigned, ids } = ctx;

  const licenceToResults = new Map<string, RawResultEntry[]>();
  const licenceToNames = new Map<string, Set<string>>();
  // Which other licences each licence has appeared alongside in the same result row.
  // Co-occurrence is definitive proof that two licences belong to the same person.
  const licenceCooc = new Map<string, Set<string>>();

  for (const { event, dist, r } of allResults) {
    const validLicences = r.licences.filter(isValidLicence);
    if (validLicences.length === 0) {
      continue;
    }

    const nameLower = normalizeName(r.name);
    for (const lic of validLicences) {
      if (!licenceToNames.has(lic)) {
        licenceToNames.set(lic, new Set());
      }

      if (!licenceToResults.has(lic)) {
        licenceToResults.set(lic, []);
      }

      licenceToNames.get(lic)!.add(nameLower);
      licenceToResults.get(lic)!.push({ event, dist, r });
      if (!licenceCooc.has(lic)) {
        licenceCooc.set(lic, new Set());
      }
    }

    // Record pairwise co-occurrence for all licences on this result
    if (validLicences.length > 1) {
      for (const lic of validLicences) {
        for (const other of validLicences) {
          if (other !== lic) {
            licenceCooc.get(lic)!.add(other);
          }
        }
      }
    }
  }

  const licenceToCanonicalName = new Map<string, string>();
  // When outlier results are filtered out, store the pruned array here
  const licenceToFilteredResults = new Map<string, RawResultEntry[]>();

  for (const [lic, names] of licenceToNames) {
    const namesByLength = [...names].sort(
      (nameA, nameB) => nameB.length - nameA.length,
    );
    if (namesByLength.length === 1) {
      licenceToCanonicalName.set(lic, namesByLength[0]!);
    } else {
      const canonical = namesByLength[0]!;
      const allClose = namesByLength
        .slice(1)
        .every((name) => levenshteinDistance(canonical, name) <= 2);
      if (allClose) {
        licenceToCanonicalName.set(lic, canonical);
        console.log(
          `  [licence-profiles] licence ${lic}: merged name variants: ${namesByLength.join(", ")} → "${canonical}"`,
        );
      } else {
        // Majority-vote: if one name has ≥3 results AND ≥3× all others combined,
        // it's a data-entry outlier — proceed with the dominant name only.
        const allRes = licenceToResults.get(lic)!;
        const nameCounts = new Map<string, number>();
        for (const { r: result } of allRes) {
          const nameLower = normalizeName(result.name);
          nameCounts.set(nameLower, (nameCounts.get(nameLower) ?? 0) + 1);
        }

        const sorted = [...nameCounts.entries()].sort(
          ([, countA], [, countB]) => countB - countA,
        );
        const topName = sorted[0]![0];
        const topCount = sorted[0]![1];
        const otherCount = sorted
          .slice(1)
          .reduce((sum, [, count]) => sum + count, 0);
        if (topCount >= 3 && topCount >= 3 * otherCount) {
          licenceToCanonicalName.set(lic, topName);
          licenceToFilteredResults.set(
            lic,
            allRes.filter(
              ({ r: result }) => normalizeName(result.name) === topName,
            ),
          );
          const outliers = sorted
            .slice(1)
            .map(([name, count]) => `${name}(${count})`)
            .join(", ");
          console.log(
            `  [licence-profiles] licence ${lic}: dominant name "${topName}" (${topCount}/${topCount + otherCount}), outlier(s) excluded: ${outliers}`,
          );
        } else {
          console.warn(
            `  [licence-profiles] licence ${lic}: SKIPPED — distinct names: ${namesByLength.join(", ")}`,
          );
        }
      }
    }
  }

  // Pre-scan: find name|0 keys claimed by more than one licence.
  // Two different licences with the same name and no team result are different people —
  // they must not share a key, so we disambiguate with the licence number.
  const soloKeyLicences = new Map<string, string[]>();
  for (const [lic, canonName] of licenceToCanonicalName) {
    const results = licenceToResults.get(lic)!;
    const hasTeam = results.some((x) => !isSoloTeam(x.r.team));
    if (!hasTeam) {
      const k = `${canonName}|0`;
      if (!soloKeyLicences.has(k)) {
        soloKeyLicences.set(k, []);
      }

      soloKeyLicences.get(k)!.push(lic);
    }
  }

  const soloKeyCollisions = new Set(
    [...soloKeyLicences.entries()]
      .filter(([, lics]) => lics.length > 1)
      .map(([k]) => k),
  );
  if (soloKeyCollisions.size > 0) {
    for (const k of soloKeyCollisions) {
      const lics = soloKeyLicences.get(k)!;
      console.warn(
        `  [licence-profiles] solo key collision on "${k}" — licences: ${lics.join(", ")} — keeping separate`,
      );
    }
  }

  for (const [lic, canonName] of licenceToCanonicalName) {
    const results =
      licenceToFilteredResults.get(lic) ?? licenceToResults.get(lic)!;
    const teamResult = results
      .filter((entry) => !isSoloTeam(entry.r.team))
      .sort(
        (entryA, entryB) =>
          new Date(entryB.event.date).getTime() -
          new Date(entryA.event.date).getTime(),
      )[0];
    const teamId = teamResult
      ? resolveTeamId(teamResult.r.team, ctx.teamIdStore)
      : 0;
    const baseKey = `${canonName}|${teamId}`;
    // If multiple licences would collide on name|0, disambiguate by licence number
    const key = soloKeyCollisions.has(baseKey) ? `${baseKey}:${lic}` : baseKey;

    if (!index.has(key)) {
      const displayName = results.reduce(
        (best, x) => (x.r.name.length > best.length ? x.r.name : best),
        "",
      );
      index.set(key, newEntry(ids.get(key), displayName, canonName));
    }

    const entry = index.get(key)!;

    // Register this licence against the entry key so later passes can detect conflicts
    if (!ctx.entryLicences.has(key)) {
      ctx.entryLicences.set(key, new Set());
    }

    ctx.entryLicences.get(key)!.add(lic);

    for (const { event, dist, r: result } of results) {
      const dedupeKey = resultDedupeKey(event.id, dist.name, result.bib);
      if (assigned.has(dedupeKey)) {
        continue;
      }

      assigned.add(dedupeKey);
      addResult(entry, toRef(result, event, dist), true);
    }
  }

  // Within-Pass-1 merge: same canonical name → same person with multiple licences.
  // Team is irrelevant as an identity signal here — licences are the authority.
  // Conflict check: same event+distance with a DIFFERENT bib = two athletes competing
  // simultaneously = different people. Same bib = co-occurring licences on one result = same person.
  const byName = new Map<string, string[]>();
  for (const key of index.keys()) {
    const nameLower = index.get(key)!.nameLower;
    if (!byName.has(nameLower)) {
      byName.set(nameLower, []);
    }

    byName.get(nameLower)!.push(key);
  }

  let mergedCount = 0;
  for (const [, keys] of byName) {
    if (keys.length < 2) {
      continue;
    }

    // Canonicalise to the entry with the most results so the surviving key is stable.
    keys.sort(
      (keyA, keyB) =>
        (index.get(keyB)?.results.length ?? 0) -
        (index.get(keyA)?.results.length ?? 0),
    );
    for (let i = 0; i < keys.length; i++) {
      const canonKey = keys[i]!;
      const canon = index.get(canonKey);
      if (!canon) {
        continue;
      }

      // Map event+distance → bib so we can distinguish co-occurrence from collision.
      const canonBibBySlot = new Map(
        canon.results.map((result) => [
          `${result.eventId}|${result.distance}`,
          result.bib,
        ]),
      );
      for (let j = i + 1; j < keys.length; j++) {
        const laterKey = keys[j]!;
        if (!index.has(laterKey)) {
          continue;
        }

        const later = index.get(laterKey)!;
        // Require licence co-occurrence as proof of identity: at least one licence from each
        // entry must have appeared together in the same result row. Without this, same-name
        // is not sufficient — two different licenced athletes with the same name would merge.
        const canonLics = ctx.entryLicences.get(canonKey) ?? new Set<string>();
        const laterLics = ctx.entryLicences.get(laterKey) ?? new Set<string>();
        const hasCooc = [...canonLics].some((canonLicence) =>
          [...laterLics].some((laterLicence) =>
            licenceCooc.get(canonLicence)?.has(laterLicence),
          ),
        );
        if (!hasCooc) {
          continue;
        }

        // Different bib at the same slot → two people competing simultaneously → different athletes.
        const hasCollision = later.results.some((result) => {
          const slot = `${result.eventId}|${result.distance}`;
          const canonBib = canonBibBySlot.get(slot);
          return canonBib !== undefined && canonBib !== result.bib;
        });
        if (hasCollision) {
          continue;
        }

        for (const result of later.results) {
          addResult(canon, result, true);
          canonBibBySlot.set(
            `${result.eventId}|${result.distance}`,
            result.bib,
          );
        }

        mergeLicenceSets(canonKey, laterKey, ctx.entryLicences);
        index.delete(laterKey);
        ctx.deletedKeys.add(laterKey);
        mergedCount++;
      }
    }
  }

  console.log(
    `  [licence-profiles] ${index.size} licence-verified athletes built${mergedCount > 0 ? ` (${mergedCount} same-name multi-licence merge(s))` : ""}`,
  );
}
