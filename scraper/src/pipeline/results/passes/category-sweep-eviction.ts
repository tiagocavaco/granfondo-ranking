import {
  normalizeName,
  normalizeDistance,
  canonicalizeCategory,
} from "../../../normalize.js";
import type { PipelineCtx } from "../types.js";
import {
  athleteKey,
  newEntry,
  addToTeamsAndCategories,
  deriveCanonicalTeam,
  entryCanonCatForYear,
  isValidCatTransition,
  categoriesCompatible,
  SOLO_CAT_RANK,
  RANK_TO_CAT,
  clampRank,
} from "../helpers.js";

export function sweepCategoryEviction(ctx: PipelineCtx): void {
  const { index, manualAssignments, ids, teamIdStore, loader } = ctx;
  let drops = 0;
  let rehomed = 0;

  for (const entry of index.values()) {
    const yearSet = new Set(entry.results.map((r) => r.eventYear));

    // Phase 1: compute canonCat per year, then enforce forward-only progression.
    // An athlete cannot get younger: rank must be non-decreasing over time.
    // A year whose majority-vote category has a higher rank than the next year's
    // was polluted by wrong-athlete merges — override it with the next year's canon.
    const yearCatMap = new Map<number, string>();
    for (const year of yearSet) {
      const canonCat = entryCanonCatForYear(entry, year);
      if (canonCat) {
        yearCatMap.set(year, canonCat);
      }
    }

    const overriddenYears = new Set<number>();
    const sortedYears = [...yearCatMap.keys()].sort((a, b) => a - b);

    // Adjacent pass (right to left): fix backward transitions and adjacent
    // forward-too-fast skips (e.g. A→C in 1 year).  Uses isValidCatTransition
    // which already encodes both rules.
    for (let i = sortedYears.length - 2; i >= 0; i--) {
      const y = sortedYears[i]!;
      const yNext = sortedYears[i + 1]!;
      const catY = yearCatMap.get(y)!;
      const catNext = yearCatMap.get(yNext)!;
      if (isValidCatTransition(catY, catNext, yNext - y)) {
        continue;
      }

      const rankY = SOLO_CAT_RANK[catY] ?? -1;
      const rankNext = SOLO_CAT_RANK[catNext] ?? -1;
      const suffix = (rankY > rankNext ? catNext : catY).endsWith(" Female")
        ? " Female"
        : " Male";
      if (rankY > rankNext && rankNext >= 0) {
        yearCatMap.set(y, catNext);
      } else if (rankY < rankNext) {
        const clamped = RANK_TO_CAT.get(clampRank(rankY, yNext - y));
        if (clamped) {
          yearCatMap.set(
            yNext,
            suffix === " Female" ? clamped.female : clamped.male,
          );
        }
      }

      overriddenYears.add(rankY > rankNext ? y : yNext);
    }

    // Non-adjacent pass (left to right): catch multi-step forward-too-fast spans
    // (e.g. A 2024 → B 2025 → C 2026 — each adjacent step looks valid but
    // isValidCatTransition(A, C, 2) is false).
    for (let i = 0; i < sortedYears.length; i++) {
      for (let j = i + 2; j < sortedYears.length; j++) {
        const earlierYear = sortedYears[i]!;
        const laterYear = sortedYears[j]!;
        const earlierCat = yearCatMap.get(earlierYear)!;
        const laterCat = yearCatMap.get(laterYear)!;
        const earlierRank = SOLO_CAT_RANK[earlierCat] ?? -1;
        const laterRank = SOLO_CAT_RANK[laterCat] ?? -1;
        if (earlierRank >= laterRank || earlierRank < 0) {
          continue;
        }

        if (
          isValidCatTransition(earlierCat, laterCat, laterYear - earlierYear)
        ) {
          continue;
        }

        const suffix = earlierCat.endsWith(" Female") ? " Female" : " Male";
        const clamped = RANK_TO_CAT.get(
          clampRank(earlierRank, laterYear - earlierYear),
        );
        if (clamped) {
          yearCatMap.set(
            laterYear,
            suffix === " Female" ? clamped.female : clamped.male,
          );
          overriddenYears.add(laterYear);
        }
      }
    }

    // Phase 2: evict outliers using the (possibly adjusted) canonCats.
    // A result is only evictable if its athleteKey routes to a DIFFERENT entry —
    // if it would map back to this same entry, eviction would be a no-op (the
    // result is inseparable without a manual assignment).
    const evictedRefs: typeof entry.results = [];
    for (const year of yearSet) {
      const yearResults = entry.results.filter((r) => r.eventYear === year);
      const canonCat = yearCatMap.get(year);
      if (!canonCat) {
        continue;
      }

      const outliers = yearResults.filter((r) => {
        if (!r.category) {
          return false;
        }

        const canon = canonicalizeCategory(r.category);
        if (canon === "Unknown") {
          return false;
        }

        if (manualAssignments.has(`${entry.id}:${r.eventId}`)) {
          return false;
        }

        if (categoriesCompatible(canon, canonCat)) {
          return false;
        }

        // Skip if eviction would re-home back to this same entry (inseparable
        // without a manual assignment — don't evict, leave mixed).
        const rehomeKey = athleteKey(
          entry.nameLower,
          r.team,
          teamIdStore,
          r.category,
        );
        if (index.get(rehomeKey) === entry) {
          return false;
        }

        return true;
      });
      const canonCount = yearResults.length - outliers.length;
      // When canonCat was overridden by cross-year evidence (impossible backward
      // transition), bypass the minority guard — the override is justified by
      // external data, not the current year's vote count.
      if (!overriddenYears.has(year) && canonCount <= outliers.length) {
        continue;
      }

      for (const r of outliers) {
        entry.results.splice(entry.results.indexOf(r), 1);
        drops++;
        evictedRefs.push(r);
      }
    }

    // Re-home all evicted results. Results with the same athleteKey (same name +
    // team/category) land in the same entry automatically — so evicted results that
    // belong to the same other athlete stay together rather than being dropped.
    for (const r of evictedRefs) {
      const eventData = loader(r.eventId);
      let rehomeName = entry.name;
      let rehomeNameLower = entry.nameLower;
      if (eventData) {
        outer: for (const distance of eventData.distances) {
          if (normalizeDistance(distance.name) !== r.distance) {
            continue;
          }

          for (const raw of distance.results) {
            if (
              raw.pos === r.pos &&
              raw.team === r.team &&
              raw.category === r.category
            ) {
              rehomeName = raw.name;
              rehomeNameLower = normalizeName(raw.name);
              break outer;
            }
          }
        }
      }

      const key = athleteKey(rehomeNameLower, r.team, teamIdStore, r.category);
      let dest = index.get(key);
      const isNew = !dest;
      if (!dest) {
        dest = newEntry(ids.get(key), rehomeName, rehomeNameLower);
        index.set(key, dest);
      }

      dest.results.push(r);
      addToTeamsAndCategories(dest, r);
      rehomed++;
      console.log(
        `  [post] re-homed ev=${r.eventId} "${rehomeName}" (${r.category}) from id=${entry.id} → ${isNew ? "new" : "existing"} id=${dest.id}`,
      );
    }

    entry.categories = {};
    entry.teams = [];
    for (const r of entry.results) {
      addToTeamsAndCategories(entry, r);
    }

    deriveCanonicalTeam(entry);
  }

  if (drops > 0) {
    console.log(
      `  [post] ${drops} result(s) dropped — category inconsistent with athlete's year category`,
    );
  }

  if (rehomed > 0) {
    console.log(
      `  [post] ${rehomed} result(s) re-homed to a better-matching athlete`,
    );
  }
}
