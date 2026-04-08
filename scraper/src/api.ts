import type { ApiEvent, ApiAthlete, ApiResult, ApiNetEvent } from "./types.js";

const BASE = "https://api.stopandgo.pro/xcrono";

const HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  Accept: "application/json, text/plain, */*",
};

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: HEADERS });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${url}`);
  const text = await res.text();
  if (!text.trim()) return [] as unknown as T;
  return JSON.parse(text) as T;
}

/**
 * Fetch all events from StopAndGo.
 * Returns all events — caller filters by name/year.
 */
export async function fetchAllEvents(): Promise<ApiEvent[]> {
  return getJson<ApiEvent[]>(`${BASE}/eventos.php`);
}

/**
 * Fetch participant/registration list for an event.
 * Used to discover available distances (id_percursos / percurso names).
 */
export async function fetchParticipants(eventId: number): Promise<ApiAthlete[]> {
  return getJson<ApiAthlete[]>(`${BASE}/atletas.php?id_evento=${eventId}`);
}

/**
 * Fetch individual race results for one distance of an event.
 *
 * Parameters:
 *   id_etapas=1   → main stage (multi-stage events use >1, granfondos are always 1)
 *   id_percursos  → distance ID extracted from atletas.php
 *   local=F       → location = Finish line (gives chip time + full result row)
 *   id_escaloes=0 → all categories combined
 *
 * Returns an empty array when results are not yet published.
 */
/**
 * Fetch upcoming events from stopandgo.net (includes future events not yet in the Pro API).
 */
export async function fetchUpcomingEvents(year: number): Promise<ApiNetEvent[]> {
  const url = `https://stopandgo.net/api/events?search=granfondo&year=${year}&per_page=100`;
  const res = await fetch(url, { headers: HEADERS });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${url}`);
  const json = await res.json() as Record<string, unknown>;
  // Response shape: { data: { events: { data: [...] } } }
  const events = (json?.data as Record<string, unknown>)?.events;
  const items = (events as Record<string, unknown>)?.data;
  return Array.isArray(items) ? (items as ApiNetEvent[]) : [];
}

export async function fetchResults(
  eventId: number,
  distanceId: string
): Promise<ApiResult[]> {
  const url =
    `${BASE}/classificacao_individual.php` +
    `?id_evento=${eventId}` +
    `&id_etapas=1` +
    `&id_percursos=${distanceId}` +
    `&local=F` +
    `&id_escaloes=0`;
  return getJson<ApiResult[]>(url);
}
