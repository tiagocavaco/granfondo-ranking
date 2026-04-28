import { normalizeName } from "../normalize.js";
import type { AthleteEntry, StoredEventResults } from "@granfondo/database/types";

/**
 * Injects athlete IDs into raw result rows in-place.
 *
 * Builds a lookup keyed by (eventId, nameLower, team). For each athlete entry
 * the canonical name is always registered; if the pipeline matched a result
 * whose scraped name differs from the canonical (e.g. "Filipe André Da Silva
 * Oliveira" matched to athlete "Filipe Oliveira"), the raw name variant is also
 * registered so the injection step can resolve it.
 *
 * DNF/DNS results (pos=0) are skipped for variant lookup because pos alone
 * cannot uniquely identify a row when multiple athletes from the same team
 * did not finish.
 *
 * Returns the number of events that had at least one row updated.
 */
export function injectAthleteIds(
  athletesIndex: Map<string, AthleteEntry>,
  allResults: Map<number, StoredEventResults>,
): number {
  const resultLookup = new Map<string, number>();
  for (const entry of athletesIndex.values()) {
    const canonName = normalizeName(entry.nameLower);
    for (const ref of entry.results) {
      // Primary key: canonical name (handles exact matches)
      resultLookup.set(`${ref.eventId}|${canonName}|${ref.team}`, entry.id);

      // Also register under the actual scraped name for this result, which may
      // differ (e.g. "Filipe André Da Silva Oliveira" → athlete "Filipe Oliveira")
      const stored = allResults.get(ref.eventId);
      if (!stored) continue;
      for (const dist of stored.distances) {
        if (dist.name !== ref.distance) continue;
        // Skip DNF/DNS (pos=0): ambiguous without a unique tiebreaker
        if (ref.pos === 0) continue;
        const raw = dist.results.find(
          (r) => r.pos === ref.pos && r.team === ref.team,
        );
        if (raw && raw.nameLower !== canonName) {
          resultLookup.set(`${ref.eventId}|${raw.nameLower}|${raw.team}`, entry.id);
        }
      }
    }
  }

  let injectedEvents = 0;
  for (const [eventId, stored] of allResults) {
    let changed = false;
    for (const dist of stored.distances) {
      for (const r of dist.results) {
        const k = `${eventId}|${r.nameLower}|${r.team}`;
        const id = resultLookup.get(k) ?? 0;
        if (r.athleteId !== id) { r.athleteId = id; changed = true; }
      }
    }
    if (changed) injectedEvents++;
  }
  return injectedEvents;
}
