import { normalizeName, normalizeDistance } from "../normalize.js";
import type { AthleteEntry, StoredEventResults } from "@granfondo/database/types";

/**
 * Injects athlete IDs into raw result rows in-place.
 *
 * Uses (eventId, distance, pos) as the primary key for finishers (pos > 0).
 * Position is unique within a distance so this unambiguously handles same-name
 * athletes (e.g. two "José Lopes / Individual" in different categories). It
 * also covers scraped-name variants without a separate secondary lookup.
 *
 * DNF/DNS rows (pos=0) fall back to (eventId, distance, nameLower, team) since
 * multiple non-finishers can share pos=0.
 *
 * Returns the number of events that had at least one row updated.
 */
export function injectAthleteIds(
  athletesIndex: Map<string, AthleteEntry>,
  allResults: Map<number, StoredEventResults>,
): number {
  const resultLookup = new Map<string, number>();
  for (const entry of athletesIndex.values()) {
    for (const ref of entry.results) {
      if (ref.pos > 0) {
        resultLookup.set(`${ref.eventId}|${ref.distance}|${ref.pos}`, entry.id);
      } else {
        resultLookup.set(`${ref.eventId}|${ref.distance}|${entry.nameLower}|${ref.team}`, entry.id);
      }
    }
  }

  let injectedEvents = 0;
  for (const [eventId, stored] of allResults) {
    let changed = false;
    for (const dist of stored.distances) {
      const distNorm = normalizeDistance(dist.name);
      for (const r of dist.results) {
        const k = r.pos > 0
          ? `${eventId}|${distNorm}|${r.pos}`
          : `${eventId}|${distNorm}|${normalizeName(r.name)}|${r.team}`;
        const id = resultLookup.get(k) ?? 0;
        if (r.athleteId !== id) { r.athleteId = id; changed = true; }
      }
    }
    if (changed) injectedEvents++;
  }
  return injectedEvents;
}
