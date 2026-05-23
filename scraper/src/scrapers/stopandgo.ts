import {
  parseEventDate,
  getYear,
  isPast,
  fixRawTeamName,
} from "../normalize.js";
import { isGranfondoName, isKidsCamVariant } from "../transform.js";
import {
  YEARS,
  SUPPLEMENTAL_EVENT_IDS,
  OFFICIAL_EVENT_URLS,
} from "../config.js";
import { BROWSER_UA, fetchWithRetry, decodeHtmlEntities } from "./shared.js";
import type { ApiEvent, ApiResult, ApiNetEvent, ApiAthlete } from "../types.js";
import type { StoredEvent, StoredParticipant } from "@granfondo/database/types";

// ── StopAndGo API client ──────────────────────────────────────────────────────

const BASE = "https://api.stopandgo.pro/xcrono";

const HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  Accept: "application/json, text/plain, */*",
};

async function getJson<T>(url: string): Promise<T> {
  const res = await fetchWithRetry(url, { headers: HEADERS });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: ${url}`);
  }

  const text = await res.text();
  if (!text.trim()) {
    return [] as unknown as T;
  }

  return JSON.parse(text) as T;
}

export async function fetchAllEvents(): Promise<ApiEvent[]> {
  return getJson<ApiEvent[]>(`${BASE}/eventos.php`);
}

export async function fetchParticipants(
  eventId: number,
): Promise<ApiAthlete[]> {
  return getJson<ApiAthlete[]>(`${BASE}/atletas.php?id_evento=${eventId}`);
}

export async function fetchResults(
  eventId: number,
  distanceId: string,
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

async function fetchNetEvents(
  search: string,
  year: number,
): Promise<ApiNetEvent[]> {
  const url = `https://stopandgo.net/api/events?search=${encodeURIComponent(search)}&year=${year}&per_page=100`;
  const res = await fetch(url, { headers: HEADERS });
  if (!res.ok) {
    return [];
  }

  const json = (await res.json()) as Record<string, unknown>;
  const events = (json?.data as Record<string, unknown>)?.events;
  const items = (events as Record<string, unknown>)?.data;
  return Array.isArray(items) ? (items as ApiNetEvent[]) : [];
}

export async function fetchUpcomingEvents(
  year: number,
): Promise<ApiNetEvent[]> {
  const [granfondoResults, grandfondoResults, gfSearchResults] = await Promise.all([
    fetchNetEvents("granfondo", year),
    fetchNetEvents("grandfondo", year),
    fetchNetEvents("GF", year),
  ]);
  const seen = new Set<number>();
  const all: ApiNetEvent[] = [];
  for (const event of [...granfondoResults, ...grandfondoResults, ...gfSearchResults]) {
    if (!seen.has(event.id)) {
      seen.add(event.id);
      all.push(event);
    }
  }

  return all;
}

export async function fetchNetEventById(
  id: number,
): Promise<ApiNetEvent | null> {
  const url = `https://stopandgo.net/api/events/${id}`;
  const res = await fetch(url, { headers: HEADERS });
  if (!res.ok) {
    return null;
  }

  const json = (await res.json()) as Record<string, unknown>;
  const data = json?.data as Record<string, unknown>;
  return (data?.event as ApiNetEvent) ?? null;
}

// ── Event discovery ───────────────────────────────────────────────────────────

export async function discoverGranfondos(): Promise<StoredEvent[]> {
  console.log("🔍 Fetching event list from StopAndGo API…");
  const all = await fetchAllEvents();

  const supplementalSet = new Set(SUPPLEMENTAL_EVENT_IDS);

  const granfondos = all.filter((e) => {
    const date = parseEventDate(e.data);
    const year = getYear(date);
    if (!YEARS.includes(year)) {
      return false;
    }

    if (isKidsCamVariant(e.nome)) {
      return false;
    }

    return isGranfondoName(e.nome) || supplementalSet.has(Number(e.id_evento));
  });

  const pastEvents: StoredEvent[] = granfondos.map((e) => {
    const id = Number(e.id_evento);
    return {
      id,
      name: e.nome,
      year: getYear(parseEventDate(e.data)),
      date: parseEventDate(e.data),
      location: e.local,
      officialUrl:
        OFFICIAL_EVENT_URLS[id] ?? `https://stopandgo.net/events/${id}`,
      resultsUrl: `https://results.stopandgo.pro/${id}`,
      hasResults: false,
      distances: [],
      participantCount: 0,
      finisherCount: 0,
      scrapedAt: null,
    };
  });

  const pastIds = new Set(pastEvents.map((e) => e.id));
  const seenIds = new Set(pastIds);
  const upcomingEvents: StoredEvent[] = [];

  for (const year of YEARS) {
    const netEvents = await fetchUpcomingEvents(year);
    for (const e of netEvents) {
      if (isKidsCamVariant(e.nome)) {
        continue;
      }

      if (!isGranfondoName(e.nome) && !supplementalSet.has(e.id)) {
        continue;
      }

      if (seenIds.has(e.id)) {
        continue;
      }

      seenIds.add(e.id);
      const date = e.data_inicio?.slice(0, 10) ?? "";
      if (!date) {
        continue;
      }

      const eventYear = getYear(date);
      if (!YEARS.includes(eventYear)) {
        continue;
      }

      const location = (e.location ?? "").split(",")[0]?.trim() ?? "";
      upcomingEvents.push({
        id: e.id,
        name: e.nome,
        year: eventYear,
        date,
        location,
        officialUrl:
          OFFICIAL_EVENT_URLS[e.id] ?? `https://stopandgo.net/events/${e.id}`,
        resultsUrl: `https://results.stopandgo.pro/${e.id}`,
        hasResults: false,
        distances: [],
        participantCount: 0,
        finisherCount: 0,
        scrapedAt: null,
      });
    }
  }

  for (const id of SUPPLEMENTAL_EVENT_IDS) {
    if (seenIds.has(id)) {
      continue;
    }

    const e = await fetchNetEventById(id);
    if (!e) {
      continue;
    }

    const date = e.data_inicio?.slice(0, 10) ?? "";
    if (!date) {
      continue;
    }

    const eventYear = getYear(date);
    if (!YEARS.includes(eventYear)) {
      continue;
    }

    if (isPast(date)) {
      continue;
    }

    const location = (e.location ?? "").split(",")[0]?.trim() ?? "";
    seenIds.add(id);
    upcomingEvents.push({
      id,
      name: e.nome,
      year: eventYear,
      date,
      location,
      officialUrl:
        OFFICIAL_EVENT_URLS[id] ?? `https://stopandgo.net/events/${id}`,
      resultsUrl: `https://results.stopandgo.pro/${id}`,
      hasResults: false,
      distances: [],
      participantCount: 0,
      finisherCount: 0,
      scrapedAt: null,
    });
  }

  console.log(
    `   Found ${pastEvents.length} past + ${upcomingEvents.length} upcoming granfondos in ${YEARS.join(", ")}\n`,
  );

  return [...pastEvents, ...upcomingEvents];
}

// ── Participant list scraper (stopandgo.net/lista/{slug}/) ────────────────────

/**
 * Scrape confirmed participants from a stopandgo.net/lista/{slug}/ page.
 * The page is server-rendered HTML with a DataTable; each row has:
 *   td[0]=dorsal, td[1]=name, td[2]=percurso, td[3]=escalão, td[4]=equipa
 *   td[5]=<span hidden>{status}</span><span class="badge">…</span>
 *     status: 1=Confirmado, -1=Pendente, 0=Anulado
 *
 * Gender is derived from the escalão field (suffix "FEM" → F, else M).
 * Distance ID is derived from the distance name position (1=GF, 2=MF, 3=Mini).
 */
export async function scrapeListaParticipants(
  url: string,
): Promise<StoredParticipant[]> {
  const res = await fetch(url, { headers: { "User-Agent": BROWSER_UA } });
  if (!res.ok) {
    throw new Error(`lista HTTP ${res.status}: ${url}`);
  }

  const html = await res.text();

  const athletes: StoredParticipant[] = [];

  const trPattern = /<tr[^>]*>([\s\S]*?)<\/tr>/g;
  for (const trMatch of html.matchAll(trPattern)) {
    const row = trMatch[1]!;
    const tds = [...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((m) =>
      decodeHtmlEntities(m[1]!.replace(/<[^>]+>/g, "").trim()),
    );
    if (tds.length < 6) {
      continue;
    }

    const statusMatch = row.match(/<span hidden>([-\d]+)<\/span>/);
    const status = statusMatch ? parseInt(statusMatch[1]!, 10) : 0;
    if (status !== 1) {
      continue;
    }

    const bib = tds[0] ?? "";
    const name = tds[1] ?? "";
    const distance = tds[2] ?? "";
    const category = tds[3] ?? "";
    const team = fixRawTeamName(tds[4] ?? "");

    if (!name) {
      continue;
    }

    const gender = category.toUpperCase().includes("FEM") ? "F" : "M";

    const distLower = distance.toLowerCase();
    const distanceId =
      distLower.includes("granfondo") || distLower.includes("grandfondo")
        ? "1"
        : distLower.includes("mediofondo")
          ? "2"
          : distLower.includes("minifondo")
            ? "3"
            : "1";

    athletes.push({
      bib,
      name,
      fullName: name,
      gender,
      team,
      category,
      distance,
      distanceId,
      athleteId: 0,
    });
  }

  return athletes;
}

// ── Participant list scraper (stopandgo.net/events/{slug}/registrations) ──────

/**
 * Parse one page of a stopandgo.net/events/{slug}/registrations HTML response.
 * Column order: td[0]=dorsal, td[1]=name, td[2]=empty, td[3]=gender, td[4]=team,
 *               td[5]=distance, td[6]=category, td[7]=status_text
 * Status is plain text: "Confirmado" | "Em Espera" | "Anulado"
 * Returns { athletes, rowCount } where rowCount includes all statuses (used to detect end-of-pages).
 */
function parseRegistrationsPage(html: string): {
  athletes: StoredParticipant[];
  rowCount: number;
} {
  const athletes: StoredParticipant[] = [];
  let rowCount = 0;

  const trPattern = /<tr[^>]*>([\s\S]*?)<\/tr>/g;
  for (const trMatch of html.matchAll(trPattern)) {
    const row = trMatch[1]!;
    const tds = [...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((m) =>
      decodeHtmlEntities(m[1]!.replace(/<[^>]+>/g, "").trim()),
    );
    if (tds.length < 8) {
      continue;
    }

    rowCount++;

    const status = tds[7] ?? "";
    if (status !== "Confirmado") {
      continue;
    }

    const bib = tds[0] ?? "";
    const name = tds[1] ?? "";
    const gender = (tds[3] ?? "").toUpperCase() === "F" ? "F" : "M";
    const team = fixRawTeamName(tds[4] ?? "");
    const distance = tds[5] ?? "";
    const category = tds[6] ?? "";

    if (!name) {
      continue;
    }

    const distLower = distance.toLowerCase();
    const distanceId =
      distLower.includes("granfondo") || distLower.includes("grandfondo")
        ? "1"
        : distLower.includes("mediofondo")
          ? "2"
          : distLower.includes("minifondo")
            ? "3"
            : "1";

    athletes.push({
      bib,
      name,
      fullName: name,
      gender,
      team,
      category,
      distance,
      distanceId,
      athleteId: 0,
    });
  }

  return { athletes, rowCount };
}

/**
 * Scrape all pages of confirmed participants from a stopandgo.net/events/{slug}/registrations page.
 * Stops when a page returns no data rows (past the last page).
 */
export async function scrapeRegistrationsParticipants(
  url: string,
): Promise<StoredParticipant[]> {
  const baseUrl = url.replace(/[?&]page=\d+(&|$)/, "$1").replace(/\?$/, "");
  const all: StoredParticipant[] = [];

  for (let page = 1; page <= 100; page++) {
    const pageUrl = page === 1 ? baseUrl : `${baseUrl}?page=${page}`;
    const res = await fetchWithRetry(pageUrl, {
      headers: { "User-Agent": BROWSER_UA },
    });
    if (!res.ok) {
      if (page === 1) {
        throw new Error(`registrations HTTP ${res.status}: ${pageUrl}`);
      }

      break;
    }

    const html = await res.text();
    const { athletes, rowCount } = parseRegistrationsPage(html);
    all.push(...athletes);
    if (rowCount === 0) {
      break;
    } // no more data rows — past the last page
  }

  return all;
}
