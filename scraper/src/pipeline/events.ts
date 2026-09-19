/**
 * event-pipeline.ts
 *
 * Per-event scraping pipeline: participant fetch, distance resolution, and
 * result scraping for a single StopAndGo event.
 */

import BetterSqlite3 from "better-sqlite3";

import {
  fetchParticipants,
  fetchResults,
  scrapeListaParticipants,
  scrapeRegistrationsParticipants,
} from "../scrapers/stopandgo.js";
import { scrapeApedalarParticipants } from "../external.js";
import {
  isPast,
  distancePriority,
  normalizeDistance,
  fixRawTeamName,
} from "../normalize.js";
import {
  extractDistances,
  assignGenderPositions,
  assignCategoryPositions,
  transformResult,
} from "../transform.js";
import {
  DELAY_MS,
  DEFAULT_DISTANCES,
  LISTA_URLS,
  REGISTRATIONS_URLS,
  APEDALAR_PARTICIPANT_URLS,
  EVENT_DISTANCE_REMAPS,
} from "../config.js";
import { loadResultsFromDb, loadParticipantsFromDb, loadEventDistancesFromDb } from "../db/db-loader.js";
import { shouldKeepExistingParticipants } from "./participants/helpers.js";
import type {
  StoredEvent,
  StoredEventResults,
  StoredDistanceResults,
  StoredParticipant,
} from "@granfondo/database/types";
import type { ApiAthlete } from "../types.js";

// ── Types ─────────────────────────────────────────────────────────────────────

export type ScrapeResult = {
  event: StoredEvent;
  results?: StoredEventResults;
  participants?: StoredParticipant[];
};

// ── Helpers ───────────────────────────────────────────────────────────────────

async function sleep(milliseconds: number) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

export function apiAthleteToParticipant(
  athlete: ApiAthlete,
): StoredParticipant {
  return {
    bib: athlete.dorsal ?? "",
    name: athlete.nome ?? "",
    fullName: athlete.nomecompleto ?? "",
    gender: athlete.sexo ?? "",
    team: fixRawTeamName(athlete.equipa ?? ""),
    category: athlete.escalao ?? "",
    distance: athlete.percurso ?? "",
    distanceId: athlete.id_percursos ?? "",
    athleteId: 0,
  };
}

export async function fetchEventParticipants(
  eventId: number,
): Promise<StoredParticipant[]> {
  if (LISTA_URLS[eventId]) {
    return scrapeListaParticipants(LISTA_URLS[eventId]!);
  }

  if (REGISTRATIONS_URLS[eventId]) {
    return scrapeRegistrationsParticipants(REGISTRATIONS_URLS[eventId]!);
  }

  if (APEDALAR_PARTICIPANT_URLS[eventId]) {
    return scrapeApedalarParticipants(APEDALAR_PARTICIPANT_URLS[eventId]!);
  }

  const athletes = await fetchParticipants(eventId);
  await sleep(DELAY_MS);
  return athletes.map(apiAthleteToParticipant);
}

export function resolveDistances(
  athletes: StoredParticipant[],
  eventId: number,
) {
  const distances = extractDistances(athletes);
  return distances.length > 0 ? distances : (DEFAULT_DISTANCES[eventId] ?? []);
}

// ── Per-event scraping ────────────────────────────────────────────────────────

export async function scrapeEvent(
  event: StoredEvent,
  scrapedEvents: Record<string, string>,
  sourceDb: BetterSqlite3.Database | null,
  force: boolean,
  fast: boolean,
): Promise<ScrapeResult> {
  const label = `[${event.id}] ${event.name} (${event.date})`;
  const isStable =
    !force && String(event.id) in scrapedEvents && sourceDb !== null;

  // For stable past events: load everything from the previous DB — no API calls.
  if (isPast(event.date) && isStable) {
    const cached = loadResultsFromDb(sourceDb, event);
    if (cached) {
      const prevEvent = sourceDb
        .prepare(
          "SELECT participant_count, finisher_count FROM events WHERE id = ?",
        )
        .get(event.id) as
        | { participant_count: number; finisher_count: number }
        | undefined;
      event.hasResults = true;
      event.finisherCount = cached.distances.reduce(
        (sum, distance) => sum + distance.finisherCount,
        0,
      );
      event.participantCount = prevEvent?.participant_count ?? 0;
      event.scrapedAt = cached.scrapedAt;
      event.distances = cached.distances.map((distance) => ({
        id: distance.id,
        name: distance.name,
      }));
      const participants = loadParticipantsFromDb(sourceDb, event.id);
      console.log(
        `  · cached — ${event.finisherCount} finishers across ${cached.distances.length} distances`,
      );
      return { event, results: cached, participants };
    }
  }

  const loadPreviousCount = (): number => {
    const existing = sourceDb!
      .prepare("SELECT participant_count FROM events WHERE id = ?")
      .get(event.id) as { participant_count: number } | undefined;
    return existing?.participant_count ?? 0;
  };

  const loadUpcomingFromDb = (previousCount: number, warning?: string): ScrapeResult => {
    if (warning) { console.warn(`  ⚠️  ${warning}`); }
    event.participantCount = previousCount;
    const storedDistances = loadEventDistancesFromDb(sourceDb!, event.id);
    event.distances = storedDistances.length > 0 ? storedDistances : resolveDistances([], event.id);
    const participants = loadParticipantsFromDb(sourceDb!, event.id);
    console.log(`  · participants from cache — ${event.participantCount} registered`);
    return { event, participants };
  };

  // For upcoming events with --fast: load from DB, no API call.
  if (!isPast(event.date) && fast && sourceDb !== null) {
    return loadUpcomingFromDb(loadPreviousCount());
  }

  // Live fetch — participants first (distance discovery), then results per distance
  let athletes: StoredParticipant[] = [];
  try {
    athletes = await fetchEventParticipants(event.id);
  } catch (err) {
    console.error(`  ✗ participants: ${err}`);
    return { event };
  }

  event.distances = resolveDistances(athletes, event.id);
  event.participantCount = athletes.length;

  if (!isPast(event.date)) {
    if (sourceDb !== null) {
      const previousCount = loadPreviousCount();
      const dropCheck = shouldKeepExistingParticipants(athletes.length, previousCount);
      if (dropCheck.keep) {
        return loadUpcomingFromDb(previousCount, dropCheck.reason);
      }
    }

    console.log(
      `  ⏳ upcoming — ${athletes.length} registered, ${event.distances.map((distance) => distance.name).join(" / ")}`,
    );
    return { event, participants: athletes };
  }

  const distanceResults: StoredDistanceResults[] = [];
  let fetchErrors = 0;

  for (const dist of event.distances) {
    try {
      const rows = await fetchResults(event.id, dist.id);
      await sleep(DELAY_MS);

      if (rows.length === 0) {
        console.log(`  · ${dist.name} — no results published yet`);
        continue;
      }

      const results = rows.map(transformResult).filter((row) => row.pos > 0);
      results.sort((rowA, rowB) => rowA.pos - rowB.pos);

      distanceResults.push({
        id: dist.id,
        name: dist.name,
        finisherCount: results.filter((row) => !row.dnf && !row.dns).length,
        results,
      });
    } catch (err) {
      console.error(`  ✗ ${dist.name}: ${err}`);
      fetchErrors++;
    }
  }

  if (distanceResults.length === 0) {
    console.log(`  ! no results scraped for ${label}`);
    return { event, participants: athletes };
  }

  if (fetchErrors > 0) {
    console.warn(
      `⚠️  ${label}: ${fetchErrors} distance(s) failed to fetch — results will NOT be cached to avoid partial data`,
    );
    return { event, participants: athletes };
  }

  // Re-assign distance names by winner time: longest course → shortest maps to
  // the expected names in the order they appear on event.distances (GF, MF, Mini).
  // This corrects events where the organizer's dist_id order doesn't match name order.
  // When a priority gap exists (e.g. GF + Mini with no MF), use positional canonical
  // names so a 2-distance Clássica event becomes GF + MF rather than GF + Mini.
  if (distanceResults.length > 1) {
    const expectedNames = event.distances
      .filter((distance) =>
        distanceResults.some((result) => result.id === distance.id),
      )
      .map((distance) => distance.name)
      .sort(
        (nameA, nameB) => distancePriority(nameA) - distancePriority(nameB),
      );
    distanceResults.sort((distanceA, distanceB) => {
      const winA =
        distanceA.results.find((row) => row.pos === 1)?.raceTimeSecs ?? 0;
      const winB =
        distanceB.results.find((row) => row.pos === 1)?.raceTimeSecs ?? 0;
      return winB - winA; // descending: longest course first
    });
    const CANONICAL_ORDER = ["Granfondo", "Mediofondo", "Minifondo"];
    const canonicals = expectedNames.map((name) => normalizeDistance(name));
    // Gap: a hole in the middle of the canonical sequence (e.g. GF + Mini, missing MF).
    // MF + Mini (missing GF at the start) is NOT a gap — they are consecutive.
    const canonicalIndices = canonicals
      .map((c) => CANONICAL_ORDER.indexOf(c))
      .filter((i) => i !== -1);
    const hasGap = canonicalIndices.some(
      (idx, i) => i > 0 && idx - canonicalIndices[i - 1]! > 1,
    );
    distanceResults.forEach((distance, index) => {
      distance.name = hasGap
        ? (CANONICAL_ORDER[index] ?? distance.name)
        : (expectedNames[index] ?? distance.name);
      distance.id = String(index + 1);
    });
  }

  const distanceRemap = EVENT_DISTANCE_REMAPS[event.id];
  if (distanceRemap) {
    for (const distance of distanceResults) {
      distance.name = distanceRemap[distance.name] ?? distance.name;
    }
  }

  for (const distance of distanceResults) {
    console.log(`  ✓ ${distance.name} — ${distance.results.length} rows`);
  }

  assignGenderPositions(distanceResults);
  assignCategoryPositions(distanceResults);

  const stored: StoredEventResults = {
    eventId: event.id,
    eventName: event.name,
    eventDate: event.date,
    eventYear: event.year,
    scrapedAt: new Date().toISOString(),
    distances: distanceResults,
  };

  event.hasResults = true;
  event.finisherCount = distanceResults.reduce(
    (sum, distance) => sum + distance.finisherCount,
    0,
  );
  event.scrapedAt = stored.scrapedAt;

  if (sourceDb) {
    const prev =
      (
        sourceDb
          .prepare("SELECT finisher_count FROM events WHERE id = ?")
          .get(event.id) as { finisher_count: number } | undefined
      )?.finisher_count ?? 0;
    if (prev > 0 && event.finisherCount < prev * 0.5) {
      console.warn(
        `⚠️  Regression: ${event.name} finishers dropped ${prev} → ${event.finisherCount} (>${Math.round((1 - event.finisherCount / prev) * 100)}% drop)`,
      );
    }
  }

  return { event, results: stored, participants: athletes };
}
