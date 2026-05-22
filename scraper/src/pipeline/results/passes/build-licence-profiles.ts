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
    const arr = [...names].sort((a, b) => b.length - a.length);
    if (arr.length === 1) {
      licenceToCanonicalName.set(lic, arr[0]!);
    } else {
      const canonical = arr[0]!;
      const allClose = arr
        .slice(1)
        .every((n) => levenshteinDistance(canonical, n) <= 2);
      if (allClose) {
        licenceToCanonicalName.set(lic, canonical);
        console.log(
          `  [pass1] licence ${lic}: merged name variants: ${arr.join(", ")} → "${canonical}"`,
        );
      } else {
        // Majority-vote: if one name has ≥3 results AND ≥3× all others combined,
        // it's a data-entry outlier — proceed with the dominant name only.
        const allRes = licenceToResults.get(lic)!;
        const nameCounts = new Map<string, number>();
        for (const { r } of allRes) {
          const nl = normalizeName(r.name);
          nameCounts.set(nl, (nameCounts.get(nl) ?? 0) + 1);
        }

        const sorted = [...nameCounts.entries()].sort((a, b) => b[1] - a[1]);
        const topName = sorted[0]![0];
        const topCount = sorted[0]![1];
        const otherCount = sorted.slice(1).reduce((s, [, c]) => s + c, 0);
        if (topCount >= 3 && topCount >= 3 * otherCount) {
          licenceToCanonicalName.set(lic, topName);
          licenceToFilteredResults.set(
            lic,
            allRes.filter(({ r }) => normalizeName(r.name) === topName),
          );
          const outliers = sorted
            .slice(1)
            .map(([n, c]) => `${n}(${c})`)
            .join(", ");
          console.log(
            `  [pass1] licence ${lic}: dominant name "${topName}" (${topCount}/${topCount + otherCount}), outlier(s) excluded: ${outliers}`,
          );
        } else {
          console.warn(
            `  [pass1] licence ${lic}: SKIPPED — distinct names: ${arr.join(", ")}`,
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
        `  [pass1] solo key collision on "${k}" — licences: ${lics.join(", ")} — keeping separate`,
      );
    }
  }

  for (const [lic, canonName] of licenceToCanonicalName) {
    const results =
      licenceToFilteredResults.get(lic) ?? licenceToResults.get(lic)!;
    const teamResult = results
      .filter((x) => !isSoloTeam(x.r.team))
      .sort(
        (a, b) =>
          new Date(b.event.date).getTime() - new Date(a.event.date).getTime(),
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

    for (const { event, dist, r } of results) {
      const rk = resultDedupeKey(event.id, dist.name, r.bib);
      if (assigned.has(rk)) {
        continue;
      }

      assigned.add(rk);
      addResult(entry, toRef(r, event, dist), true);
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

    // Canonicalise to the entry with the most results so the surviving key is stable
    keys.sort(
      (a, b) =>
        (index.get(b)?.results.length ?? 0) -
        (index.get(a)?.results.length ?? 0),
    );
    for (let i = 0; i < keys.length; i++) {
      const canonKey = keys[i]!;
      const canon = index.get(canonKey);
      if (!canon) {
        continue;
      }

      // Map event+distance → bib so we can distinguish co-occurrence from collision
      const canonBibBySlot = new Map(
        canon.results.map((r) => [`${r.eventId}|${r.distance}`, r.bib]),
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
        const hasCooc = [...canonLics].some((cl) =>
          [...laterLics].some((ll) => licenceCooc.get(cl)?.has(ll)),
        );
        if (!hasCooc) {
          continue;
        }

        // Different bib at the same slot → two people competing simultaneously → different athletes
        const hasCollision = later.results.some((r) => {
          const slot = `${r.eventId}|${r.distance}`;
          const canonBib = canonBibBySlot.get(slot);
          return canonBib !== undefined && canonBib !== r.bib;
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
    `  [pass1] ${index.size} licence-verified athletes built${mergedCount > 0 ? ` (${mergedCount} same-name multi-licence merge(s))` : ""}`,
  );
}
