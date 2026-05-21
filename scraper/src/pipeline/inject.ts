import { normalizeName, normalizeDistance } from "../normalize.js";
import type {
  AthleteEntry,
  StoredEventResults,
} from "@granfondo/database/types";

/**
 * Injects athlete IDs into raw result rows in-place.
 *
 * Primary key for finishers: (eventId, distance, pos). This handles same-name
 * athletes in different categories without a secondary lookup.
 *
 * Tie handling: when multiple athletes share the same pos (e.g. both recorded
 * as 4th), the pos key is marked ambiguous (id=0) and a name-based fallback
 * key (eventId, distance, nameLower) is registered for each tied athlete only.
 * Registering name keys for every result would cause spurious cross-athlete
 * injection when an unmatched result falls through to the name lookup.
 * The injection phase falls back to the name key only when the pos key is 0.
 *
 * DNF/DNS rows (pos=0) always use (eventId, distance, nameLower, team).
 *
 * Returns the number of events that had at least one row updated.
 */
export function injectAthleteIds(
  athletesIndex: Map<string, AthleteEntry>,
  allResults: Map<number, StoredEventResults>,
): number {
  const resultLookup = new Map<string, number>();
  // Track the first athlete for each pos key so we can retroactively register
  // their name fallback if a second athlete ties at the same pos.
  const posKeyFirst = new Map<string, { nameLower: string; id: number }>();

  for (const entry of athletesIndex.values()) {
    for (const ref of entry.results) {
      if (ref.pos > 0) {
        const posKey = `${ref.eventId}|${ref.distance}|${ref.pos}`;
        const existing = resultLookup.get(posKey);
        if (existing === undefined) {
          // First occurrence: register pos key, remember for potential tie.
          resultLookup.set(posKey, entry.id);
          posKeyFirst.set(posKey, { nameLower: entry.nameLower, id: entry.id });
        } else {
          // Collision — tie detected.
          if (existing !== 0) {
            // Retroactively register name fallback for the first athlete.
            const first = posKeyFirst.get(posKey)!;
            resultLookup.set(
              `${ref.eventId}|${ref.distance}|${first.nameLower}`,
              first.id,
            );
            resultLookup.set(posKey, 0); // mark pos key as ambiguous
          }

          // Register name fallback for this (second or Nth) tied athlete.
          resultLookup.set(
            `${ref.eventId}|${ref.distance}|${entry.nameLower}`,
            entry.id,
          );
        }
      } else {
        resultLookup.set(
          `${ref.eventId}|${ref.distance}|${entry.nameLower}|${ref.team}`,
          entry.id,
        );
      }
    }
  }

  let injectedEvents = 0;
  for (const [eventId, stored] of allResults) {
    let changed = false;
    for (const dist of stored.distances) {
      const distNorm = normalizeDistance(dist.name);
      for (const r of dist.results) {
        let id: number;
        if (r.pos > 0) {
          const posId =
            resultLookup.get(`${eventId}|${distNorm}|${r.pos}`) ?? 0;
          // Fall back to name when pos key is ambiguous (tied positions)
          id =
            posId > 0
              ? posId
              : (resultLookup.get(
                  `${eventId}|${distNorm}|${normalizeName(r.name)}`,
                ) ?? 0);
        } else {
          id =
            resultLookup.get(
              `${eventId}|${distNorm}|${normalizeName(r.name)}|${r.team}`,
            ) ?? 0;
        }

        if (r.athleteId !== id) {
          r.athleteId = id;
          changed = true;
        }
      }
    }

    if (changed) {
      injectedEvents++;
    }
  }

  return injectedEvents;
}
