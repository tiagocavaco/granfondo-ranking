/**
 * event-pipeline.ts
 *
 * Per-event scraping pipeline: participant fetch, distance resolution, and
 * result scraping for a single StopAndGo event.
 */

import BetterSqlite3 from "better-sqlite3";

import { fetchParticipants, fetchResults, scrapeListaParticipants, scrapeRegistrationsParticipants } from "../scrapers/stopandgo.js";
import { scrapeApedalarParticipants } from "../external.js";
import { isPast, distancePriority, fixRawTeamName } from "../normalize.js";
import {
  extractDistances,
  assignGenderPositions,
  assignCategoryPositions,
  transformResult,
} from "../transform.js";
import { DELAY_MS, DEFAULT_DISTANCES, LISTA_URLS, REGISTRATIONS_URLS, APEDALAR_PARTICIPANT_URLS } from "../config.js";
import { loadResultsFromDb } from "../db/db-loader.js";
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

async function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

export function apiAthleteToParticipant(a: ApiAthlete): StoredParticipant {
  return {
    bib:        a.dorsal ?? "",
    name:       a.nome ?? "",
    fullName:   a.nomecompleto ?? "",
    gender:     a.sexo ?? "",
    team:       fixRawTeamName(a.equipa ?? ""),
    category:   a.escalao ?? "",
    distance:   a.percurso ?? "",
    distanceId: a.id_percursos ?? "",
    athleteId:  0,
  };
}

export async function fetchEventParticipants(eventId: number): Promise<StoredParticipant[]> {
  if (LISTA_URLS[eventId]) return scrapeListaParticipants(LISTA_URLS[eventId]!);
  if (REGISTRATIONS_URLS[eventId]) return scrapeRegistrationsParticipants(REGISTRATIONS_URLS[eventId]!);
  if (APEDALAR_PARTICIPANT_URLS[eventId]) return scrapeApedalarParticipants(APEDALAR_PARTICIPANT_URLS[eventId]!);
  const athletes = await fetchParticipants(eventId);
  await sleep(DELAY_MS);
  return athletes.map(apiAthleteToParticipant);
}

export function resolveDistances(athletes: StoredParticipant[], eventId: number) {
  const distances = extractDistances(athletes);
  return distances.length > 0 ? distances : (DEFAULT_DISTANCES[eventId] ?? []);
}

// ── Per-event scraping ────────────────────────────────────────────────────────

export async function scrapeEvent(
  event: StoredEvent,
  scrapedEvents: Record<string, string>,
  sourceDb: BetterSqlite3.Database | null,
  force: boolean,
): Promise<ScrapeResult> {
  const label = `[${event.id}] ${event.name} (${event.date})`;

  // Step 1: participants / distance discovery
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
    console.log(
      `  ⏳ upcoming — ${athletes.length} registered, ${event.distances.map((d) => d.name).join(" / ")}`
    );
    return { event, participants: athletes };
  }

  // Step 2: results per distance
  const isStable = !force && (String(event.id) in scrapedEvents) && sourceDb !== null;

  if (isStable) {
    const cached = loadResultsFromDb(sourceDb, event);
    if (cached) {
      event.hasResults = true;
      event.finisherCount = cached.distances.reduce((s, d) => s + d.finisherCount, 0);
      event.scrapedAt = cached.scrapedAt;
      console.log(`  · cached — ${event.finisherCount} finishers across ${cached.distances.length} distances`);
      return { event, results: cached, participants: athletes };
    }
  }

  const distanceResults: StoredDistanceResults[] = [];

  for (const dist of event.distances) {
    try {
      const rows = await fetchResults(event.id, dist.id);
      await sleep(DELAY_MS);

      if (rows.length === 0) {
        console.log(`  · ${dist.name} — no results published yet`);
        continue;
      }

      const results = rows.map(transformResult).filter((r) => r.pos > 0);
      results.sort((a, b) => a.pos - b.pos);

      distanceResults.push({
        id: dist.id,
        name: dist.name,
        finisherCount: results.filter((r) => !r.dnf && !r.dns).length,
        results,
      });
    } catch (err) {
      console.error(`  ✗ ${dist.name}: ${err}`);
    }
  }

  if (distanceResults.length === 0) {
    console.log(`  ! no results scraped for ${label}`);
    return { event, participants: athletes };
  }

  // Re-assign distance names by winner time: longest course → shortest maps to
  // the expected names in the order they appear on event.distances (GF, MF, Mini).
  // This corrects events where the organizer's dist_id order doesn't match name order.
  if (distanceResults.length > 1) {
    const expectedNames = event.distances
      .filter((d) => distanceResults.some((dr) => dr.id === d.id))
      .map((d) => d.name)
      .sort((a, b) => distancePriority(a) - distancePriority(b));
    distanceResults.sort((a, b) => {
      const winA = a.results.find((r) => r.pos === 1)?.raceTimeSecs ?? 0;
      const winB = b.results.find((r) => r.pos === 1)?.raceTimeSecs ?? 0;
      return winB - winA; // descending: longest course first
    });
    distanceResults.forEach((dr, i) => {
      dr.name = expectedNames[i] ?? dr.name;
      dr.id = String(i + 1);
    });
  }

  for (const dr of distanceResults) {
    console.log(`  ✓ ${dr.name} — ${dr.results.length} rows`);
  }

  assignGenderPositions(distanceResults);
  assignCategoryPositions(distanceResults);

  const stored: StoredEventResults = {
    eventId:   event.id,
    eventName: event.name,
    eventDate: event.date,
    eventYear: event.year,
    scrapedAt: new Date().toISOString(),
    distances: distanceResults,
  };

  event.hasResults = true;
  event.finisherCount = distanceResults.reduce((s, d) => s + d.finisherCount, 0);
  event.scrapedAt = stored.scrapedAt;

  return { event, results: stored, participants: athletes };
}
