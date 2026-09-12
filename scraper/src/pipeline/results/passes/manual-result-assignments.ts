import { normalizeName, normalizeDistance } from "../../../normalize.js";
import type { PipelineCtx } from "../types.js";
import {
  athleteKey,
  newEntry,
  addToTeamsAndCategories,
  toRef,
} from "../helpers.js";

export function applyManualResultAssignments(ctx: PipelineCtx): void {
  const {
    index,
    allResults,
    assignments,
    loader,
    deletedKeys,
    manualAssignments,
    ids,
    teamIdStore,
  } = ctx;
  let count = 0;

  for (const assignment of assignments) {
    const target = [...index.values()].find(
      (e) => e.id === assignment.athleteId,
    );
    if (!target) {
      console.error(
        `  [manual-assignments] ERROR: athleteId ${assignment.athleteId} not found — skipping`,
      );
      continue;
    }

    const eventResults = loader(assignment.eventId);
    let bibNameLower: string | null = null;
    let bibPos: number | null = null;
    let bibDistNorm: string | null = null;
    if (eventResults) {
      for (const dist of eventResults.distances) {
        const match = dist.results.find((r) => r.bib === assignment.bib);
        if (match) {
          bibNameLower = normalizeName(match.name);
          bibPos = match.pos;
          bibDistNorm = normalizeDistance(dist.name);
          break;
        }
      }
    }

    if (!bibNameLower) {
      console.warn(
        `  [manual-assignments] eventId=${assignment.eventId} bib=${assignment.bib} not found in raw results`,
      );
      continue;
    }

    let moved = false;
    outer: for (const [key, entry] of index) {
      if (entry.nameLower !== bibNameLower) {
        continue;
      }

      for (let i = 0; i < entry.results.length; i++) {
        const r = entry.results[i]!;
        if (r.eventId !== assignment.eventId) {
          continue;
        }

        // When bib pos is known, ensure we're acting on the correct result ref
        // (same-name athletes at the same event can have multiple result refs).
        if (
          bibPos !== null &&
          bibDistNorm !== null &&
          (r.pos !== bibPos || r.distance !== bibDistNorm)
        ) {
          continue;
        }

        if (entry === target) {
          // Already on target — protect from post-pass eviction without moving anything.
          manualAssignments.add(
            `${assignment.athleteId}:${assignment.eventId}`,
          );
          moved = true;
          break outer;
        }

        // Evict any result already on target for the same (eventId, distance) —
        // the manually-assigned result takes priority over an earlier pipeline match.
        const conflictIdx = target.results.findIndex(
          (x) => x.eventId === r.eventId && x.distance === r.distance,
        );
        if (conflictIdx >= 0) {
          const evicted = target.results[conflictIdx]!;
          target.results.splice(conflictIdx, 1);
          // Re-home the evicted result rather than discarding it.
          // Recover the original name from raw event data (AthleteResultRef has no name field).
          let evictedName = target.name;
          let evictedNameLower = target.nameLower;
          if (eventResults) {
            evictNameSearch: for (const d of eventResults.distances) {
              if (normalizeDistance(d.name) !== evicted.distance) {
                continue;
              }

              for (const raw of d.results) {
                if (
                  raw.pos === evicted.pos &&
                  raw.team === evicted.team &&
                  raw.category === evicted.category
                ) {
                  evictedName = raw.name;
                  evictedNameLower = normalizeName(raw.name);
                  break evictNameSearch;
                }
              }
            }
          }

          const evictedKey = athleteKey(
            evictedNameLower,
            evicted.team,
            teamIdStore,
            evicted.category,
          );
          let evictedEntry = index.get(evictedKey);
          if (!evictedEntry) {
            const freshId = ids.get(evictedKey);
            evictedEntry = newEntry(freshId, evictedName, evictedNameLower);
            index.set(evictedKey, evictedEntry);
            console.log(
              `  [manual-assignments] evicted ${evictedName} (${evicted.category}) ev=${evicted.eventId} → new athlete id=${freshId}`,
            );
          } else {
            console.log(
              `  [manual-assignments] evicted ${evictedName} (${evicted.category}) ev=${evicted.eventId} → merged into existing id=${evictedEntry.id}`,
            );
          }

          evictedEntry.results.push(evicted);
          addToTeamsAndCategories(evictedEntry, evicted);
        }

        target.results.push(r);
        addToTeamsAndCategories(target, r);
        entry.results.splice(i, 1);
        if (entry.results.length === 0) {
          deletedKeys.add(key);
          index.delete(key);
        }

        manualAssignments.add(`${assignment.athleteId}:${assignment.eventId}`);
        count++;
        moved = true;
        break outer;
      }
    }

    if (!moved) {
      // Result is in raw data but no profile claimed it — this happens when
      // the result was rejected by addResult during normal passes due to a
      // same-event conflict that a preceding block eviction has since cleared.
      // Add the result directly to the target athlete.
      const rawResult = allResults.find(
        (rr) =>
          rr.event.id === assignment.eventId && rr.r.bib === assignment.bib,
      );
      if (rawResult) {
        const conflictIdx = target.results.findIndex(
          (x) =>
            x.eventId === assignment.eventId &&
            x.distance === normalizeDistance(rawResult.dist.name),
        );
        if (conflictIdx >= 0) {
          target.results.splice(conflictIdx, 1);
        }
        const ref = toRef(rawResult.r, rawResult.event, rawResult.dist);
        target.results.push(ref);
        addToTeamsAndCategories(target, ref);
        manualAssignments.add(`${assignment.athleteId}:${assignment.eventId}`);
        count++;
        console.log(
          `  [manual-assignments] ev=${assignment.eventId} bib=${assignment.bib} added directly to athlete ${assignment.athleteId} (was unprofiled)`,
        );
      } else {
        console.warn(
          `  [manual-assignments] eventId=${assignment.eventId} bib=${assignment.bib} (${bibNameLower}) not found in index or raw results`,
        );
      }
    }
  }

  if (count > 0) {
    for (const entry of index.values()) {
      entry.results.sort(
        (a, b) =>
          new Date(b.eventDate).getTime() - new Date(a.eventDate).getTime(),
      );
    }

    console.log(`  [manual-assignments] ${count} manual result(s) applied`);
  }
}
