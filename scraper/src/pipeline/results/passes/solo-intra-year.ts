import { normalizeName, canonicalizeCategory } from "../../../normalize.js";
import type { PipelineCtx, RawResult } from "../types.js";
import {
  newEntry,
  addResult,
  toRef,
  soloGroupCat,
  PERCENTILE_CLOSE_1,
  PERCENTILE_FAR_1,
  PERCENTILE_CLOSE_2,
  PERCENTILE_FAR_2,
} from "../helpers.js";

export function groupSoloIntraYear(ctx: PipelineCtx): { soloCount: number } {
  const { allResults, index, assigned, ids, soloFlags, soloGroupKeys } = ctx;
  let soloCount = 0;

  const routeToBibKey = (c: RawResult): number => {
    const nameLower = normalizeName(c.r.name);
    const canonCat = canonicalizeCategory(c.r.category);
    const bibKey = `${nameLower}|solo:${canonCat}:${c.event.year}:${c.r.bib}`;
    const id = ids.get(bibKey);
    index.set(bibKey, newEntry(id, c.r.name, nameLower));
    assigned.add(c.rKey);
    addResult(index.get(bibKey)!, toRef(c.r, c.event, c.dist), false);
    soloCount++;
    return id;
  };

  // Group all remaining unassigned results by (name, canonCat, year)
  const soloGroups = new Map<string, RawResult[]>();
  for (const cand of allResults) {
    if (assigned.has(cand.rKey)) {
      continue;
    }

    const nameLower = normalizeName(cand.r.name);
    const canonCat = soloGroupCat(canonicalizeCategory(cand.r.category));
    const groupKey = `${nameLower}|solo:${canonCat}:${cand.event.year}`;
    if (!soloGroups.has(groupKey)) {
      soloGroups.set(groupKey, []);
    }

    soloGroups.get(groupKey)!.push(cand);
  }

  for (const [groupKey, candidates] of soloGroups) {
    const byEvent = new Map<number, RawResult[]>();
    for (const c of candidates) {
      if (!byEvent.has(c.event.id)) {
        byEvent.set(c.event.id, []);
      }

      byEvent.get(c.event.id)!.push(c);
    }

    const cleanResults = candidates.filter(
      (c) => byEvent.get(c.event.id)!.length === 1,
    );
    const mainCandidates: RawResult[] = [...cleanResults];

    for (const colliders of byEvent.values()) {
      if (colliders.length <= 1) {
        continue;
      }

      if (colliders.length === 2) {
        const [a, b] = colliders as [RawResult, RawResult];
        let resolved = false;

        // Distance filter: different distances at same event → unambiguously two different people.
        // If baseline exists, keep the distance matching the athlete's most common distance.
        // If no baseline (first-time athlete), keep `a` arbitrarily — both splits are equally valid.
        if (!resolved && a.dist.name !== b.dist.name) {
          let keptCandidate: RawResult, routedCandidate: RawResult;
          if (cleanResults.length >= 1) {
            const distCounts = new Map<string, number>();
            for (const c of cleanResults) {
              distCounts.set(
                c.dist.name,
                (distCounts.get(c.dist.name) ?? 0) + 1,
              );
            }

            const topDist = [...distCounts.entries()].sort(
              (x, y) => y[1] - x[1],
            )[0]![0];
            keptCandidate = a.dist.name === topDist ? a : b;
            routedCandidate = keptCandidate === a ? b : a;
          } else {
            keptCandidate = a;
            routedCandidate = b;
          }

          mainCandidates.push(keptCandidate);
          const routedId = routeToBibKey(routedCandidate);
          soloFlags.push({
            groupKey,
            eventId: a.event.id,
            eventName: a.event.name,
            resolution: "distance",
            results: [
              {
                athleteId: 0,
                bib: keptCandidate.r.bib,
                distance: keptCandidate.dist.name,
                genderPos: keptCandidate.r.genderPos,
                finisherCount: keptCandidate.dist.finisherCount,
              },
              {
                athleteId: routedId,
                bib: routedCandidate.r.bib,
                distance: routedCandidate.dist.name,
                genderPos: routedCandidate.r.genderPos,
                finisherCount: routedCandidate.dist.finisherCount,
              },
            ],
          });
          resolved = true;
        }

        // Percentile filter: compare each collider's percentile against the baseline median.
        // ≥2 results → standard thresholds (within PERCENTILE_CLOSE_2/FAR_2).
        // ≥1 result  → stricter thresholds (PERCENTILE_CLOSE_1/FAR_1) since single data point is less reliable.
        if (!resolved) {
          const baseline = cleanResults.filter(
            (c) =>
              !c.r.dnf &&
              !c.r.dns &&
              c.r.genderPos > 0 &&
              c.dist.finisherCount > 0,
          );
          if (baseline.length >= 1) {
            const pcts = baseline
              .map((c) => c.r.genderPos / c.dist.finisherCount)
              .sort((x, y) => x - y);
            const median = pcts[Math.floor(pcts.length / 2)]!;
            const pctA =
              a.r.genderPos > 0 && a.dist.finisherCount > 0
                ? a.r.genderPos / a.dist.finisherCount
                : null;
            const pctB =
              b.r.genderPos > 0 && b.dist.finisherCount > 0
                ? b.r.genderPos / b.dist.finisherCount
                : null;
            if (pctA !== null && pctB !== null) {
              const diffA = Math.abs(pctA - median);
              const diffB = Math.abs(pctB - median);
              const [closeThresh, farThresh] =
                baseline.length >= 2
                  ? [PERCENTILE_CLOSE_2, PERCENTILE_FAR_2]
                  : [PERCENTILE_CLOSE_1, PERCENTILE_FAR_1];
              if (
                (diffA <= closeThresh && diffB > farThresh) ||
                (diffB <= closeThresh && diffA > farThresh)
              ) {
                const keptCandidate = diffA < diffB ? a : b;
                const routedCandidate = diffA < diffB ? b : a;
                mainCandidates.push(keptCandidate);
                const routedIdPct = routeToBibKey(routedCandidate);
                soloFlags.push({
                  groupKey,
                  eventId: a.event.id,
                  eventName: a.event.name,
                  resolution: "percentile",
                  results: [
                    {
                      athleteId: 0,
                      bib: keptCandidate.r.bib,
                      distance: keptCandidate.dist.name,
                      genderPos: keptCandidate.r.genderPos,
                      finisherCount: keptCandidate.dist.finisherCount,
                    },
                    {
                      athleteId: routedIdPct,
                      bib: routedCandidate.r.bib,
                      distance: routedCandidate.dist.name,
                      genderPos: routedCandidate.r.genderPos,
                      finisherCount: routedCandidate.dist.finisherCount,
                    },
                  ],
                });
                resolved = true;
              }
            }
          }
        }

        if (!resolved) {
          const idA = routeToBibKey(a);
          const idB = routeToBibKey(b);
          soloFlags.push({
            groupKey,
            eventId: a.event.id,
            eventName: a.event.name,
            resolution: "flagged_manual",
            results: [
              {
                athleteId: idA,
                bib: a.r.bib,
                distance: a.dist.name,
                genderPos: a.r.genderPos,
                finisherCount: a.dist.finisherCount,
              },
              {
                athleteId: idB,
                bib: b.r.bib,
                distance: b.dist.name,
                genderPos: b.r.genderPos,
                finisherCount: b.dist.finisherCount,
              },
            ],
          });
        }
      } else {
        // 3+ collision results for the same event — flag all
        const colliderIds = colliders.map((c) => routeToBibKey(c));
        soloFlags.push({
          groupKey,
          eventId: colliders[0]!.event.id,
          eventName: colliders[0]!.event.name,
          resolution: "flagged_manual",
          results: colliders.map((c, i) => ({
            athleteId: colliderIds[i]!,
            bib: c.r.bib,
            distance: c.dist.name,
            genderPos: c.r.genderPos,
            finisherCount: c.dist.finisherCount,
          })),
        });
      }
    }

    if (mainCandidates.length > 0) {
      const displayName = mainCandidates.reduce(
        (best, c) => (c.r.name.length > best.length ? c.r.name : best),
        "",
      );
      const nameLower = normalizeName(displayName);
      index.set(groupKey, newEntry(ids.get(groupKey), displayName, nameLower));
      soloGroupKeys.add(groupKey);
      soloCount++;
      const entry = index.get(groupKey)!;
      for (const c of mainCandidates) {
        assigned.add(c.rKey);
        addResult(entry, toRef(c.r, c.event, c.dist), false);
      }
    }
  }

  return { soloCount };
}
