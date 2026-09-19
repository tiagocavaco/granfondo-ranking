import {
  parseEventDate,
  getYear,
  isPast,
  fixRawTeamName,
  normalizeDistance,
} from "../normalize.js";
import { isGranfondoName, isKidsCamVariant } from "../transform.js";
import { DISTANCES } from "@granfondo/utils/distance";
import {
  YEARS,
  SUPPLEMENTAL_EVENT_IDS,
  OFFICIAL_EVENT_URLS,
  EVENT_DATE_OVERRIDES,
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
  const [granfondoResults, grandfondoResults, gfSearchResults] =
    await Promise.all([
      fetchNetEvents("granfondo", year),
      fetchNetEvents("grandfondo", year),
      fetchNetEvents("GF", year),
    ]);
  const seen = new Set<number>();
  const all: ApiNetEvent[] = [];
  for (const event of [
    ...granfondoResults,
    ...grandfondoResults,
    ...gfSearchResults,
  ]) {
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
    const rawDate = parseEventDate(e.data);
    const date = EVENT_DATE_OVERRIDES[id] ?? rawDate;
    return {
      id,
      name: e.nome,
      year: getYear(date),
      date,
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
      const resolvedDate = EVENT_DATE_OVERRIDES[e.id] ?? date;
      upcomingEvents.push({
        id: e.id,
        name: e.nome,
        year: eventYear,
        date: resolvedDate,
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
    const resolvedDate = EVENT_DATE_OVERRIDES[id] ?? date;
    seenIds.add(id);
    upcomingEvents.push({
      id,
      name: e.nome,
      year: eventYear,
      date: resolvedDate,
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

    if (isKidsCamVariant(distance)) {
      continue;
    }

    const canonicalDistance = normalizeDistance(distance);
    if (!DISTANCES.includes(canonicalDistance)) {
      continue;
    }

    const distanceId = String(DISTANCES.indexOf(canonicalDistance) + 1);

    const gender = category.toUpperCase().includes("FEM") ? "F" : "M";

    athletes.push({
      bib,
      name,
      fullName: name,
      gender,
      team,
      category,
      distance: canonicalDistance,
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

    // New layout (5 cols): bib | name+team+category | gender | distance | status
    // Old layout (8 cols): bib | name | empty | gender | team | distance | category | status
    const isNewLayout = tds.length === 5;
    const isOldLayout = tds.length >= 8;
    if (!isNewLayout && !isOldLayout) {
      continue;
    }

    rowCount++;

    let bib: string,
      name: string,
      team: string,
      category: string,
      gender: string,
      distance: string,
      status: string;

    if (isNewLayout) {
      status = tds[4] ?? "";
      if (status !== "Confirmado") {
        continue;
      }

      bib = tds[0] ?? "";
      // td[1] contains [avatar_initial?], name, team, category as newline-separated text nodes.
      // The avatar initial is a single letter and is not always present.
      const nameParts = (tds[1] ?? "")
        .split("\n")
        .map((s) => s.trim())
        .filter((s) => s && s !== "•");
      if (nameParts[0]?.length === 1) {
        nameParts.shift();
      }

      name = nameParts[0] ?? "";
      team = fixRawTeamName(nameParts[1] ?? "");
      category = nameParts[2] ?? "";
      gender = (tds[2] ?? "").toUpperCase() === "F" ? "F" : "M";
      distance = tds[3] ?? "";
    } else {
      status = tds[7] ?? "";
      if (status !== "Confirmado") {
        continue;
      }

      bib = tds[0] ?? "";
      name = tds[1] ?? "";
      gender = (tds[3] ?? "").toUpperCase() === "F" ? "F" : "M";
      team = fixRawTeamName(tds[4] ?? "");
      distance = tds[5] ?? "";
      category = tds[6] ?? "";
    }

    if (!name) {
      continue;
    }

    if (isKidsCamVariant(distance)) {
      continue;
    }

    const canonicalDistance = normalizeDistance(distance);
    if (!DISTANCES.includes(canonicalDistance)) {
      continue;
    }

    const distanceId = String(DISTANCES.indexOf(canonicalDistance) + 1);

    athletes.push({
      bib,
      name,
      fullName: name,
      gender,
      team,
      category,
      distance: canonicalDistance,
      distanceId,
      athleteId: 0,
    });
  }

  return { athletes, rowCount };
}

/**
 * Scrape all pages of confirmed participants from a stopandgo.net/events/{slug}/registrations page.
 * Pagination is handled via Livewire 3: the initial GET returns the first page and the Livewire
 * component snapshot; subsequent pages are fetched by POSTing to the Livewire update endpoint.
 */
export async function scrapeRegistrationsParticipants(
  url: string,
): Promise<StoredParticipant[]> {
  const browserHeaders = {
    "User-Agent": BROWSER_UA,
    Accept:
      "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
    "Accept-Language": "pt-PT,pt;q=0.9,en;q=0.8",
    "Accept-Encoding": "gzip, deflate, br",
  };

  // Initial GET — establishes session, returns first page of data + Livewire component state
  const initRes = await fetchWithRetry(url, { headers: browserHeaders });
  if (!initRes.ok) {
    throw new Error(`registrations HTTP ${initRes.status}: ${url}`);
  }

  const initHtml = await initRes.text();

  // Session cookies must be replayed in Livewire POST requests — extract from each response
  const cookieJar: Record<string, string> = {};
  const collectCookies = (res: Response) => {
    // getSetCookie() (Node 18+) returns each Set-Cookie header as a separate string
    for (const header of (res.headers as any).getSetCookie?.() ?? []) {
      const nameValue = header.split(";")[0] ?? "";
      const eqIdx = nameValue.indexOf("=");
      if (eqIdx > 0) {
        cookieJar[nameValue.slice(0, eqIdx).trim()] = nameValue
          .slice(eqIdx + 1)
          .trim();
      }
    }
  };

  collectCookies(initRes);

  const { athletes: firstAthletes, rowCount: firstRowCount } =
    parseRegistrationsPage(initHtml);
  const seen = new Set<string>(
    firstAthletes.map((a) => `${a.name}|${a.distance}`),
  );
  const all: StoredParticipant[] = [...firstAthletes];
  if (firstRowCount === 0) {
    return all;
  }

  // The Livewire <script> tag carries data-csrf (CSRF token) and data-update-uri (update endpoint).
  const csrfToken = initHtml.match(/data-csrf="([^"]+)"/)?.[1];
  const rawSnapshot = initHtml.match(/wire:snapshot="([^"]+)"/)?.[1];
  const livewireUpdateUrl =
    initHtml.match(/data-update-uri="([^"]+)"/)?.[1] ??
    "https://stopandgo.net/livewire/update";

  // Fall back to ?page=N GETs if the page doesn't include Livewire wiring
  if (!csrfToken || !rawSnapshot) {
    const baseUrl = url.replace(/[?&]page=\d+(&|$)/, "$1").replace(/\?$/, "");
    let prevPageKey = "";
    for (let page = 2; page <= 100; page++) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      const res = await fetchWithRetry(`${baseUrl}?page=${page}`, {
        headers: browserHeaders,
      });
      if (!res.ok) {
        break;
      }

      const { athletes, rowCount } = parseRegistrationsPage(await res.text());
      // Detect loop: Livewire returns the last page again when page > lastPage.
      // Only update prevPageKey when the page has real athletes — Caminhada/Kids-only
      // pages return empty athletes after filtering and must not reset the sentinel.
      const pageKey = athletes.map((a) => `${a.name}|${a.distance}`).join("|");
      if (rowCount === 0 || (pageKey !== "" && pageKey === prevPageKey)) {
        break;
      }

      if (pageKey !== "") {
        prevPageKey = pageKey;
      }

      const newAthletes = athletes.filter(
        (a) => !seen.has(`${a.name}|${a.distance}`),
      );
      newAthletes.forEach((a) => seen.add(`${a.name}|${a.distance}`));
      all.push(...newAthletes);
    }

    return all;
  }

  const initialSnapshot = rawSnapshot
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&amp;/g, "&");

  // Extract per-track IDs from the track filter select (if present).
  // When the component has a track filter, scrape each cycling distance separately
  // to bypass the server-side cap of ~500 rows on the unfiltered view.
  const trackOptions = [
    ...initHtml.matchAll(/<option value="(\d+)">([^<]+)<\/option>/g),
  ]
    .map((m) => ({ id: m[1]!, name: m[2]!.trim().toLowerCase() }))
    .filter(
      (t) =>
        t.name.includes("granfondo") ||
        t.name.includes("grandfondo") ||
        t.name.includes("mediofondo") ||
        t.name.includes("minifondo"),
    );

  const livewirePost = async (
    snapshotArg: string,
    updates: Record<string, string>,
    calls: Array<{ method: string; params: unknown[]; metadata: object }>,
  ) => {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    const cookieStr = Object.entries(cookieJar)
      .map(([key, val]) => `${key}=${val}`)
      .join("; ");
    const xsrfToken = decodeURIComponent(cookieJar["XSRF-TOKEN"] ?? "");
    const res = await fetchWithRetry(livewireUpdateUrl, {
      method: "POST",
      headers: {
        ...browserHeaders,
        Accept: "*/*",
        "Content-Type": "application/json",
        "X-Livewire": "1",
        "X-XSRF-TOKEN": xsrfToken,
        Origin: "https://stopandgo.net",
        Referer: url,
        Cookie: cookieStr,
      },
      body: JSON.stringify({
        _token: csrfToken,
        components: [{ snapshot: snapshotArg, updates, calls }],
      }),
    });
    if (!res.ok) {
      return null;
    }

    collectCookies(res);
    const json = (await res.json()) as {
      components: Array<{ snapshot: string; effects: { html?: string } }>;
    };
    return json.components?.[0] ?? null;
  };

  const scrapeTrack = async (
    trackId: string | null,
  ): Promise<StoredParticipant[]> => {
    const trackAthletes: StoredParticipant[] = [];
    const trackSeen = new Set<string>();

    // Set filter (or no-op if no track filter) and get the first page of this track
    const updates: Record<string, string> =
      trackId !== null ? { track: trackId } : {};
    const firstComponent = await livewirePost(initialSnapshot, updates, []);
    if (!firstComponent) {
      return trackAthletes;
    }

    let currentSnapshot = firstComponent.snapshot;
    const firstHtml = firstComponent.effects?.html ?? "";
    if (!firstHtml) {
      return trackAthletes;
    }

    const { athletes: firstPageAthletes } = parseRegistrationsPage(firstHtml);
    for (const athlete of firstPageAthletes) {
      const key = `${athlete.name}|${athlete.distance}`;
      if (!trackSeen.has(key)) {
        trackSeen.add(key);
        trackAthletes.push(athlete);
      }
    }

    let prevPageKey = firstPageAthletes
      .map((a) => `${a.name}|${a.distance}`)
      .join("|");

    for (let page = 2; page <= 100; page++) {
      const component = await livewirePost(currentSnapshot, {}, [
        { method: "gotoPage", params: [page, "page"], metadata: {} },
      ]);
      if (!component) {
        break;
      }

      currentSnapshot = component.snapshot;
      const html = component.effects?.html ?? "";
      if (!html) {
        break;
      }

      const { athletes, rowCount } = parseRegistrationsPage(html);
      const pageKey = athletes.map((a) => `${a.name}|${a.distance}`).join("|");
      if (rowCount === 0 || (pageKey !== "" && pageKey === prevPageKey)) {
        break;
      }

      if (pageKey !== "") {
        prevPageKey = pageKey;
      }

      for (const athlete of athletes) {
        const key = `${athlete.name}|${athlete.distance}`;
        if (!trackSeen.has(key)) {
          trackSeen.add(key);
          trackAthletes.push(athlete);
        }
      }
    }

    return trackAthletes;
  };

  if (trackOptions.length > 0) {
    // Per-track scraping bypasses the ~500-row unfiltered cap.
    // Discard the unfiltered first page (all) — per-track passes will cover it.
    all.length = 0;
    const trackResults: StoredParticipant[][] = [];
    for (const track of trackOptions) {
      trackResults.push(await scrapeTrack(track.id));
    }

    const combined = new Set<string>();
    for (const athletes of trackResults) {
      for (const athlete of athletes) {
        const key = `${athlete.name}|${athlete.distance}`;
        if (!combined.has(key)) {
          combined.add(key);
          all.push(athlete);
        }
      }
    }
  } else {
    // No track filter available — paginate the unfiltered view
    await scrapeTrack(null).then((athletes) => {
      for (const athlete of athletes) {
        const key = `${athlete.name}|${athlete.distance}`;
        if (!seen.has(key)) {
          seen.add(key);
          all.push(athlete);
        }
      }
    });
  }

  return all;
}
