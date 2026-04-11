import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

import { fetchAllEvents, fetchUpcomingEvents, fetchNetEventById, fetchParticipants, fetchResults } from "./api.js";
import {
  EXTERNAL_EVENTS,
  MANUAL_UPCOMING_EVENTS,
  scrapeFigueiraChampionsDay,
  scrapeAgitagueda,
  scrapeApedalar5Quinas,
  scrapeEtapaDaVolta,
  scrapeListaParticipants,
} from "./external.js";
import {
  parseEventDate,
  getYear,
  isPast,
} from "./normalize.js";
import {
  isGranfondoName,
  isKidsCamVariant,
  extractDistances,
  assignGenderPositions,
  transformResult,
  athleteKey,
} from "./pipeline.js";
import {
  buildAthletesIndexV2,
  buildAggregateRanking,
  buildTeamRanking,
  type AthleteIdStore,
  type AthleteAliasRule,
  type ResultAssignment,
} from "./pipeline-v2.js";
import { normalizeName } from "./normalize.js";
import type {
  ApiAthlete,
  StoredEvent,
  StoredEventResults,
  StoredDistanceResults,
} from "./types.js";

// ── Config ────────────────────────────────────────────────────────────────────

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, "..", "..", "frontend", "public", "data");
const ATHLETE_IDS_PATH = path.join(__dirname, "..", "athlete-ids.json");
const ATHLETE_ALIASES_PATH = path.join(__dirname, "..", "athlete-aliases.json");
const RESULT_ASSIGNMENTS_PATH = path.join(__dirname, "..", "result-assignments.json");
const FORCE = process.argv.includes("--force");
const PARTICIPANTS_ONLY = process.argv.includes("--participants");
const YEARS = [2025, 2026]; // seasons to include
const DELAY_MS = 400; // polite delay between requests

// ── Athlete ID store ──────────────────────────────────────────────────────────

function loadIdStore(): AthleteIdStore {
  if (!fs.existsSync(ATHLETE_IDS_PATH)) return new Map();
  const obj = JSON.parse(fs.readFileSync(ATHLETE_IDS_PATH, "utf-8")) as Record<string, number>;
  return new Map(Object.entries(obj));
}

function saveIdStore(store: AthleteIdStore): void {
  const obj = Object.fromEntries(store);
  fs.writeFileSync(ATHLETE_IDS_PATH, JSON.stringify(obj, null, 2), "utf-8");
}

function loadAthleteAliases(): AthleteAliasRule[] {
  if (!fs.existsSync(ATHLETE_ALIASES_PATH)) return [];
  return JSON.parse(fs.readFileSync(ATHLETE_ALIASES_PATH, "utf-8")) as AthleteAliasRule[];
}

function loadResultAssignments(): ResultAssignment[] {
  if (!fs.existsSync(RESULT_ASSIGNMENTS_PATH)) return [];
  return JSON.parse(fs.readFileSync(RESULT_ASSIGNMENTS_PATH, "utf-8")) as ResultAssignment[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function outPath(filename: string) {
  return path.join(DATA_DIR, filename);
}

function writeJson(filename: string, data: unknown) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(outPath(filename), JSON.stringify(data, null, 2), "utf-8");
}

function readJson<T>(filename: string): T | null {
  const p = outPath(filename);
  if (!fs.existsSync(p)) return null;
  return JSON.parse(fs.readFileSync(p, "utf-8")) as T;
}

function isCachedForever(filename: string): boolean {
  if (FORCE) return false;
  return fs.existsSync(outPath(filename));
}

async function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

/** Strip API-only null fields before writing participants to disk. */
function leanAthletes(athletes: ApiAthlete[]): ApiAthlete[] {
  return athletes.map(({ dorsal, nome, nomecompleto, sexo, equipa, escalao, percurso, id_percursos }) => ({
    dorsal, nome, nomecompleto, sexo, equipa, escalao, percurso, id_percursos,
  }));
}

// ── Event discovery ───────────────────────────────────────────────────────────

/**
 * Supplemental event IDs that are Portuguese granfondo-series events but don't
 * have "granfondo" in their StopAndGo name (different spelling, abbreviation, etc.).
 * Add entries here when the name-based filter misses an event.
 */
const SUPPLEMENTAL_EVENT_IDS: number[] = [
  // 2025 events with non-standard names
  1621, // Aveiro Spring Classic 2025
  1553, // MONÇÃO e MELGAÇO GF 2025
  1681, // Grandfondo Médio Tejo 2025 (typo: "Grandfondo" with extra d)
  // 2026 events with non-standard names or missing "granfondo" in name
  1944, // Aveiro Spring Classic 2026
  1880, // Figueira Champions Classic 2026 (BIG DAY = Granfondo, HALF DAY = Mediofondo)
  1741, // EuroBEC Granfondo 2026 (Apr 12)
  1751, // Granfondo Torres Vedras 2026 (Apr 19)
  1766, // Love Tiles Douro Granfondo 2026 (Apr 26)
  1798, // SÃO MAMEDE GRANFONDO 2026 (Jun 7)
  1806, // Gerês Granfondo 2026 (Jun 7)
  1700, // Granfondo Serra da Estrela 2026 (Jun 28)
  1883, // Bragança Granfondo 2026 (Jul 12)
  1956, // Lousã Granfondo 2026 (Sep 13)
  1943, // Monção e Melgaço GF 2026 (Sep 20)
  1942, // TAVIRA GRANFONDO 2026 (Sep 27)
  1828, // Ourém Fatima Granfondo 2026 (Oct 18)
  1977, // Grandfondo Médio Tejo 2026 (May 24)
];

/**
 * Official organiser/event pages. Applied to all events (past and upcoming) as officialUrl.
 * For StopAndGo-native events without an entry here, officialUrl falls back to
 * https://stopandgo.net/events/{id} (which redirects to the slug-based page).
 */
const OFFICIAL_EVENT_URLS: Record<number, string> = {
  // BikeService
  1720: "https://bikeservice.pt/event/viana-granfondo/",
  1741: "https://bikeservice.pt/event/eurobec-granfondo/",
  1766: "https://bikeservice.pt/event/douro-granfondo/",
  1806: "https://bikeservice.pt/event/geres-granfondo/",
  1883: "https://bikeservice.pt/event/braganca-granfondo/",
  1943: "https://bikeservice.pt/event/moncao-e-melgaco-granfondo/",
  1828: "https://bikeservice.pt/event/ourem-fatima-granfondo/",
  // Algarve Granfondo
  1831: "https://www.algarvegranfondo.com/",
  // Cabreira Solutions
  1751: "https://cabreirasolutions.com/evento/granfondo-torres-vedras/",
  1977: "https://cabreirasolutions.com/evento/granfondo-medio-tejo/",
  1956: "https://cabreirasolutions.com/evento/lousa-granfondo/",
  90011: "https://cabreirasolutions.com/evento/granfondo-terras-de-basto/",
  90013: "https://cabreirasolutions.com/evento/granfondo-paredes/",
  90015: "https://cabreirasolutions.com/evento/granfondo-serra-dossa/",
  90016: "https://cabreirasolutions.com/evento/granfondo-portimao/",
  // Figueira Champions Classic
  1880: "https://www.figueirachampionsclassic.com/day/regulamento/",
  // Aveiro Spring Classic
  1944: "https://cabreirasolutions.com/evento/aveiro-spring-classic/",
  // São Mamede Granfondo
  1798: "https://stopandgo.net/events/sao-mamede-granfondo-2026",
  // Tavira Granfondo
  1942: "https://stopandgo.net/events/tavira-granfondo-2026",
  // Serra da Estrela Granfondo
  1700: "https://granfondoserradaestrela.com/",
};

/**
 * Default distances for upcoming events where StopAndGo returns no participants yet.
 * Format: { id: string (1-based), name: string }
 */
const DEFAULT_DISTANCES: Record<number, Array<{ id: string; name: string }>> = {
  // BikeService events (GF + MF + Mini)
  1741: [{ id: "1", name: "Granfondo" }, { id: "2", name: "Mediofondo" }, { id: "3", name: "Minifondo" }],
  1766: [{ id: "1", name: "Granfondo" }, { id: "2", name: "Mediofondo" }, { id: "3", name: "Minifondo" }],
  1806: [{ id: "1", name: "Granfondo" }, { id: "2", name: "Mediofondo" }, { id: "3", name: "Minifondo" }],
  1883: [{ id: "1", name: "Granfondo" }, { id: "2", name: "Mediofondo" }, { id: "3", name: "Minifondo" }],
  1943: [{ id: "1", name: "Granfondo" }, { id: "2", name: "Mediofondo" }, { id: "3", name: "Minifondo" }],
  1828: [{ id: "1", name: "Granfondo" }, { id: "2", name: "Mediofondo" }, { id: "3", name: "Minifondo" }],
  // Cabreira Solutions events (GF + MF + Mini)
  1751: [{ id: "1", name: "Granfondo" }, { id: "2", name: "Mediofondo" }, { id: "3", name: "Minifondo" }],
  1977: [{ id: "1", name: "Granfondo" }, { id: "2", name: "Mediofondo" }, { id: "3", name: "Minifondo" }],
  1956: [{ id: "1", name: "Granfondo" }, { id: "2", name: "Mediofondo" }, { id: "3", name: "Minifondo" }],
  // Figueira Champions Classic (BIG DAY = GF, HALF DAY = MF)
  1880: [{ id: "1", name: "Granfondo" }, { id: "2", name: "Mediofondo" }],
  // Aveiro Spring Classic (GF + MF)
  1944: [{ id: "1", name: "Granfondo" }, { id: "2", name: "Mediofondo" }],
  // São Mamede, Tavira, Serra da Estrela (GF + MF + Mini)
  1798: [{ id: "1", name: "Granfondo" }, { id: "2", name: "Mediofondo" }, { id: "3", name: "Minifondo" }],
  1942: [{ id: "1", name: "Granfondo" }, { id: "2", name: "Mediofondo" }, { id: "3", name: "Minifondo" }],
  1700: [{ id: "1", name: "Granfondo" }, { id: "2", name: "Mediofondo" }, { id: "3", name: "Minifondo" }],
};

/**
 * Events that publish their participant list on stopandgo.net/lista/{slug}/.
 * Used instead of the xcrono atletas.php API (which returns empty for upcoming events).
 * Only confirmed participants (status=1) are included.
 */
const LISTA_URLS: Record<number, string> = {
  // stopandgo.net/lista/ — BikeService events
  1741: "https://stopandgo.net/lista/eurobecgf26/",
  1766: "https://stopandgo.net/lista/douro_granfondo25/",
  1806: "https://stopandgo.net/lista/geres_granfondo2026/",
  1883: "https://stopandgo.net/lista/braganca_gf_26/",
  1943: "https://stopandgo.net/lista/moncao_melgaco_gf26/",
  1956: "https://stopandgo.net/lista/lousagf_26/",
  1828: "https://stopandgo.net/lista/ourem_25/",
  // inscricoes.cabreirasolutions.com/listas/ — same HTML table format
  1751: "https://inscricoes.cabreirasolutions.com/listas/gf-torres-vedras-2026",
  1977: "https://inscricoes.cabreirasolutions.com/listas/grandfondo-m-dio-tejo-2026",
  90011: "https://inscricoes.cabreirasolutions.com/listas/granfondo-terras-de-basto-2026",
  90013: "https://inscricoes.cabreirasolutions.com/listas/granfondo-paredes-2026",
  90015: "https://inscricoes.cabreirasolutions.com/listas/granfondo-serra-d-ossa-2026",
  90016: "https://inscricoes.cabreirasolutions.com/listas/grandfondo-portim-o-2026",
};

async function discoverGranfondos(): Promise<StoredEvent[]> {
  console.log("🔍 Fetching event list from StopAndGo API…");
  const all = await fetchAllEvents();

  const supplementalSet = new Set(SUPPLEMENTAL_EVENT_IDS);

  const granfondos = all.filter((e) => {
    const date = parseEventDate(e.data);
    const year = getYear(date);
    if (!YEARS.includes(year)) return false;
    if (isKidsCamVariant(e.nome)) return false;
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
      officialUrl: OFFICIAL_EVENT_URLS[id] ?? `https://stopandgo.net/events/${id}`,
      resultsUrl: `https://results.stopandgo.pro/${id}`,
      hasResults: false,
      distances: [],
      participantCount: 0,
      finisherCount: 0,
      scrapedAt: null,
    };
  });

  // Fetch upcoming events from stopandgo.net (Pro API only returns past events)
  const pastIds = new Set(pastEvents.map((e) => e.id));
  const seenIds = new Set(pastIds);
  const upcomingEvents: StoredEvent[] = [];

  for (const year of YEARS) {
    const netEvents = await fetchUpcomingEvents(year);
    for (const e of netEvents) {
      if (isKidsCamVariant(e.nome)) continue;
      if (!isGranfondoName(e.nome) && !supplementalSet.has(e.id)) continue;
      if (seenIds.has(e.id)) continue; // already have it
      seenIds.add(e.id);
      const date = e.data_inicio?.slice(0, 10) ?? "";
      if (!date) continue;
      const eventYear = getYear(date);
      if (!YEARS.includes(eventYear)) continue;
      // location is "City, Country" — take just the city part
      const location = (e.location ?? "").split(",")[0]?.trim() ?? "";
      upcomingEvents.push({
        id: e.id,
        name: e.nome,
        year: eventYear,
        date,
        location,
        officialUrl: OFFICIAL_EVENT_URLS[e.id] ?? `https://stopandgo.net/events/${e.id}`,
        resultsUrl: `https://results.stopandgo.pro/${e.id}`,
        hasResults: false,
        distances: [],
        participantCount: 0,
        finisherCount: 0,
        scrapedAt: null,
      });
    }
  }

  // Look up any supplemental IDs not yet found via search
  for (const id of SUPPLEMENTAL_EVENT_IDS) {
    if (seenIds.has(id)) continue;
    const e = await fetchNetEventById(id);
    if (!e) continue;
    const date = e.data_inicio?.slice(0, 10) ?? "";
    if (!date) continue;
    const eventYear = getYear(date);
    if (!YEARS.includes(eventYear)) continue;
    if (isPast(date)) continue; // past events come from Pro API
    const location = (e.location ?? "").split(",")[0]?.trim() ?? "";
    seenIds.add(id);
    upcomingEvents.push({
      id,
      name: e.nome,
      year: eventYear,
      date,
      location,
      officialUrl: OFFICIAL_EVENT_URLS[id] ?? `https://stopandgo.net/events/${id}`,
      resultsUrl: `https://results.stopandgo.pro/${id}`,
      hasResults: false,
      distances: [],
      participantCount: 0,
      finisherCount: 0,
      scrapedAt: null,
    });
  }

  console.log(`   Found ${pastEvents.length} past + ${upcomingEvents.length} upcoming granfondos in ${YEARS.join(", ")}\n`);

  return [...pastEvents, ...upcomingEvents];
}

// ── Per-event scraping ────────────────────────────────────────────────────────

async function scrapeEvent(event: StoredEvent): Promise<StoredEvent> {
  const label = `[${event.id}] ${event.name} (${event.date})`;

  // ── Step 1: participants / distance discovery ──────────────────────────────
  let athletes: ApiAthlete[] = [];
  try {
    if (LISTA_URLS[event.id]) {
      athletes = await scrapeListaParticipants(LISTA_URLS[event.id]!);
    } else {
      athletes = await fetchParticipants(event.id);
      await sleep(DELAY_MS);
    }
  } catch (err) {
    console.error(`  ✗ participants: ${err}`);
    return event;
  }

  let distances = extractDistances(athletes);
  // Fall back to hardcoded defaults when participants API returns nothing yet
  if (distances.length === 0 && DEFAULT_DISTANCES[event.id]) {
    distances = DEFAULT_DISTANCES[event.id]!;
  }
  event.distances = distances;
  event.participantCount = athletes.length;

  if (!isPast(event.date)) {
    // Upcoming: just save participants list, no results yet
    writeJson(`${event.id}_participants.json`, leanAthletes(athletes));
    console.log(
      `  ⏳ upcoming — ${athletes.length} registered, ${distances.map((d) => d.name).join(" / ")}`
    );
    return event;
  }

  // ── Step 2: results per distance ──────────────────────────────────────────
  const resultsFile = `${event.id}_results.json`;

  if (isCachedForever(resultsFile)) {
    const cached = readJson<StoredEventResults>(resultsFile)!;
    // Backfill genderPos if missing from older cached files
    const needsGenderPos = cached.distances.some((d) =>
      d.results.some((r) => !r.dnf && !r.dns && r.pos > 0 && !r.genderPos)
    );
    if (needsGenderPos) {
      assignGenderPositions(cached.distances);
      writeJson(resultsFile, cached);
    }
    event.hasResults = true;
    event.finisherCount = cached.distances.reduce(
      (s, d) => s + d.finisherCount,
      0
    );
    event.scrapedAt = cached.scrapedAt;
    console.log(`  · cached — ${event.finisherCount} finishers across ${cached.distances.length} distances`);
    return event;
  }

  const distanceResults: StoredDistanceResults[] = [];

  for (const dist of distances) {
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
      console.log(`  ✓ ${dist.name} — ${results.length} rows`);
    } catch (err) {
      console.error(`  ✗ ${dist.name}: ${err}`);
    }
  }

  if (distanceResults.length === 0) {
    console.log(`  ! no results scraped for ${label}`);
    return event;
  }

  assignGenderPositions(distanceResults);

  const stored: StoredEventResults = {
    eventId: event.id,
    eventName: event.name,
    eventDate: event.date,
    eventYear: event.year,
    scrapedAt: new Date().toISOString(),
    distances: distanceResults,
  };

  writeJson(resultsFile, stored);

  event.hasResults = true;
  event.finisherCount = distanceResults.reduce(
    (s, d) => s + d.finisherCount,
    0
  );
  event.scrapedAt = stored.scrapedAt;

  return event;
}

// ── Results loader ──────────────────────────────────────────────────────────────

const loader = (id: number) => readJson<StoredEventResults>(`${id}_results.json`);

// ── Participants-only scrape ──────────────────────────────────────────────────

/**
 * Lightweight scrape that only updates participant lists for upcoming events.
 * Used on the Friday-evening schedule (registrations close Friday 20:00 UTC).
 * Past events are loaded from cache — no results are re-fetched.
 * Aggregate/team rankings are not rebuilt (they only change when results change).
 */
async function scrapeParticipants() {
  console.log(`🚴  Granfondo Portugal Scraper — participants mode`);
  console.log(`    ${new Date().toISOString()}\n`);

  const events = await discoverGranfondos();
  const scraped: StoredEvent[] = [];

  for (const event of events) {
    if (!isPast(event.date)) {
      // Upcoming: fetch fresh participants
      console.log(`⏳ [${event.id}] ${event.name}`);
      try {
        let athletes: ApiAthlete[] = [];
        if (LISTA_URLS[event.id]) {
          athletes = await scrapeListaParticipants(LISTA_URLS[event.id]!);
        } else {
          athletes = await fetchParticipants(event.id);
          await sleep(DELAY_MS);
        }
        let distances = extractDistances(athletes);
        if (distances.length === 0 && DEFAULT_DISTANCES[event.id]) {
          distances = DEFAULT_DISTANCES[event.id]!;
        }
        event.distances = distances;
        event.participantCount = athletes.length;
        writeJson(`${event.id}_participants.json`, leanAthletes(athletes));
        console.log(`  ⏳ ${athletes.length} confirmed, ${distances.map((d) => d.name).join(" / ")}`);
      } catch (err) {
        console.error(`  ✗ ${err}`);
      }
    } else {
      // Past: load from cache, no API call
      const resultsFile = `${event.id}_results.json`;
      const cached = readJson<StoredEventResults>(resultsFile);
      if (cached) {
        event.hasResults = true;
        event.finisherCount = cached.distances.reduce((s, d) => s + d.finisherCount, 0);
        event.distances = cached.distances.map((d) => ({ id: d.id, name: d.name }));
        event.scrapedAt = cached.scrapedAt;
      }
    }
    scraped.push(event);
  }

  // External events (past results cached, upcoming are static)
  for (const { event } of [
    { event: EXTERNAL_EVENTS[0]! },
    { event: EXTERNAL_EVENTS[1]! },
    { event: EXTERNAL_EVENTS[2]! },
    { event: EXTERNAL_EVENTS[3]! },
  ]) {
    const cached = readJson<StoredEventResults>(`${event.id}_results.json`);
    if (cached) {
      event.hasResults = true;
      event.finisherCount = cached.distances.reduce((s, d) => s + d.finisherCount, 0);
      event.distances = cached.distances.map((d) => ({ id: d.id, name: d.name }));
      event.scrapedAt = cached.scrapedAt;
    }
    scraped.push(event);
  }

  for (const event of MANUAL_UPCOMING_EVENTS) {
    const listaUrl = LISTA_URLS[event.id];
    if (listaUrl) {
      console.log(`⏳ [${event.id}] ${event.name}`);
      try {
        const athletes = await scrapeListaParticipants(listaUrl);
        let distances = extractDistances(athletes);
        if (distances.length === 0 && DEFAULT_DISTANCES[event.id]) {
          distances = DEFAULT_DISTANCES[event.id]!;
        }
        event.distances = distances;
        event.participantCount = athletes.length;
        writeJson(`${event.id}_participants.json`, leanAthletes(athletes));
        console.log(`  ⏳ ${athletes.length} confirmed, ${distances.map((d) => d.name).join(" / ")}`);
      } catch (err) {
        console.error(`  ✗ ${err}`);
      }
    }
    scraped.push(event);
  }

  writeJson("events.json", scraped);
  console.log(`\n✓ events.json — ${scraped.length} events updated`);
  console.log("\n✅ Done.");
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`🚴  Granfondo Portugal Scraper`);
  console.log(`    ${new Date().toISOString()}`);
  console.log(`    Seasons: ${YEARS.join(", ")}`);
  console.log(`    Output: ${DATA_DIR}`);
  console.log(FORCE ? "    ⚡ Force mode\n" : "\n");

  // 1. Discover all granfondo events from StopAndGo
  const events = await discoverGranfondos();

  // 2. Scrape each StopAndGo event
  const scraped: StoredEvent[] = [];
  for (const event of events) {
    const past = isPast(event.date);
    console.log(`${past ? "✅" : "⏳"} [${event.id}] ${event.name}`);
    const result = await scrapeEvent(event);
    scraped.push(result);
  }

  // 3. Scrape external platform events
  console.log("\n🌐 Scraping external platform events…");
  const externalScrapers: Array<{
    event: StoredEvent;
    fn: () => Promise<import("./types.js").StoredEventResults>;
  }> = [
    { event: EXTERNAL_EVENTS[0]!, fn: scrapeFigueiraChampionsDay },
    { event: EXTERNAL_EVENTS[1]!, fn: scrapeAgitagueda },
    { event: EXTERNAL_EVENTS[2]!, fn: scrapeApedalar5Quinas },
    { event: EXTERNAL_EVENTS[3]!, fn: scrapeEtapaDaVolta },
  ];

  for (const { event, fn } of externalScrapers) {
    const resultsFile = `${event.id}_results.json`;
    console.log(`✅ [${event.id}] ${event.name}`);

    if (isCachedForever(resultsFile)) {
      const cached = readJson<import("./types.js").StoredEventResults>(resultsFile)!;
      const needsGenderPos = cached.distances.some((d) =>
        d.results.some((r) => !r.dnf && !r.dns && r.pos > 0 && !r.genderPos)
      );
      if (needsGenderPos) {
        assignGenderPositions(cached.distances);
        writeJson(resultsFile, cached);
      }
      event.hasResults = true;
      event.finisherCount = cached.distances.reduce((s, d) => s + d.finisherCount, 0);
      event.scrapedAt = cached.scrapedAt;
      console.log(`  · cached — ${event.finisherCount} finishers`);
    } else {
      try {
        const results = await fn();
        assignGenderPositions(results.distances);
        writeJson(resultsFile, results);
        event.hasResults = true;
        event.finisherCount = results.distances.reduce((s, d) => s + d.finisherCount, 0);
        event.scrapedAt = results.scrapedAt;
        console.log(
          `  ✓ ${results.distances.map((d) => `${d.name}: ${d.finisherCount}`).join(", ")}`
        );
      } catch (err) {
        console.error(`  ✗ ${err}`);
      }
    }

    scraped.push(event);
  }

  // 3b. Add manual upcoming events (no StopAndGo ID yet)
  for (const event of MANUAL_UPCOMING_EVENTS) {
    console.log(`⏳ [${event.id}] ${event.name}`);
    scraped.push(event);
  }

  // 4. Write events manifest
  writeJson("events.json", scraped);
  const withResults = scraped.filter((e) => e.hasResults).length;
  console.log(
    `\n✓ events.json — ${scraped.length} events, ${withResults} with results`
  );

  // 5. Build and write athletes index
  console.log("🔨 Building athletes index (v2 pipeline)…");
  const idStore = loadIdStore();
  const aliasRules = loadAthleteAliases();
  const assignments = loadResultAssignments();
  const { index: athletesIndex, updatedIdStore, flags } = buildAthletesIndexV2(
    scraped, loader, aliasRules, assignments, idStore
  );

  if (flags.length > 0) {
    console.warn(`⚠️  ${flags.length} duplicate event flag(s) require manual review:`);
    for (const f of flags) {
      console.warn(
        `   FLAG athleteId=${f.athleteId} eventId=${f.eventId} "${f.eventName}" ` +
        `existing="${f.existing.category}" incoming="${f.incoming.category}" [${f.resolution}]`
      );
    }
  }

  saveIdStore(updatedIdStore);

  // Build alias → canonical key map so merged athletes accumulate correctly in rankings.
  // Any key in updatedIdStore that is NOT in athletesIndex but whose ID matches a
  // canonical entry is an alias.
  const idToCanonicalKey = new Map<number, string>();
  for (const [key, entry] of athletesIndex) idToCanonicalKey.set(entry.id, key);
  const keyToCanonical = new Map<string, string>();
  for (const [key, id] of updatedIdStore) {
    const canon = idToCanonicalKey.get(id);
    if (canon && canon !== key) keyToCanonical.set(key, canon);
  }

  // Build (eventId, bib) → athleteId lookup from the index
  const bibToAthleteId = new Map<string, number>();
  for (const entry of athletesIndex.values()) {
    for (const r of entry.results) {
      // r doesn't carry bib — we'll match by (eventId, nameLower) as fallback
      // primary: (eventId, nameLower, team) is unique enough
      const k = `${r.eventId}|${r.eventName}|${normalizeName(r.eventName)}`;
      bibToAthleteId.set(k, entry.id);
    }
  }

  // Build (eventId, nameLower, team) → athleteId lookup
  const resultLookup = new Map<string, number>();
  for (const entry of athletesIndex.values()) {
    for (const r of entry.results) {
      const k = `${r.eventId}|${normalizeName(entry.nameLower)}|${r.team}`;
      resultLookup.set(k, entry.id);
    }
  }

  // Inject athleteId into every result row in every cached result file
  console.log("🔑 Injecting athlete IDs into result files…");
  let injectedFiles = 0;
  for (const event of scraped.filter((e) => e.hasResults)) {
    const resultsFile = `${event.id}_results.json`;
    const stored = readJson<StoredEventResults>(resultsFile);
    if (!stored) continue;
    let changed = false;
    for (const dist of stored.distances) {
      for (const r of dist.results) {
        const k = `${event.id}|${r.nameLower}|${r.team}`;
        const id = resultLookup.get(k) ?? 0;
        if (r.athleteId !== id) { r.athleteId = id; changed = true; }
      }
    }
    if (changed) { writeJson(resultsFile, stored); injectedFiles++; }
  }
  console.log(`✓ updated ${injectedFiles} result file(s)`);

  const athletesArray = Array.from(athletesIndex.values()).sort((a, b) =>
    a.nameLower.localeCompare(b.nameLower)
  );
  writeJson("athletes.json", athletesArray);
  console.log(`✓ athletes.json — ${athletesArray.length} athletes`);

  const uniqueByYear: Record<string, number> = {};
  for (const year of YEARS) {
    uniqueByYear[String(year)] = athletesArray.filter(
      (a) => a.results.some((r) => r.eventYear === year)
    ).length;
  }
  writeJson("stats.json", { uniqueAthletes: athletesArray.length, uniqueByYear });

  // Write individual athlete files by numeric ID — wipe dir first to remove stale files
  const athleteDir = path.join(DATA_DIR, "athlete");
  fs.rmSync(athleteDir, { recursive: true, force: true });
  fs.mkdirSync(athleteDir, { recursive: true });
  for (const a of athletesIndex.values()) {
    fs.writeFileSync(path.join(athleteDir, `${a.id}.json`), JSON.stringify(a), "utf-8");
  }

  // Write name-to-id lookup: athleteKey (nameLower|teamKey) → id
  // Include both canonical keys (from athletesIndex) and alias keys (from updatedIdStore)
  // so that merged athletes can be found regardless of which team they raced for.
  const nameToId: Record<string, number> = {};
  for (const [key, id] of updatedIdStore) nameToId[key] = id;
  for (const [key, entry] of athletesIndex) nameToId[key] = entry.id; // canonical takes priority
  writeJson("name-to-id.json", nameToId);
  console.log(`✓ athlete/ — ${athletesIndex.size} profiles`);
  console.log(`✓ name-to-id.json — ${Object.keys(nameToId).length} entries`);

  // 6. Build and write aggregate ranking
  console.log("🏆 Building aggregate ranking…");
  const aggregateRanking = buildAggregateRanking(scraped, loader, athletesIndex, keyToCanonical);
  writeJson("aggregate_ranking.json", aggregateRanking);
  for (const [year, distances] of Object.entries(aggregateRanking)) {
    for (const [dist, genders] of Object.entries(distances)) {
      for (const [gender, athletes] of Object.entries(genders)) {
        console.log(`   ${year} ${dist} ${gender}: ${athletes.length} athletes scored`);
      }
    }
  }
  console.log(`✓ aggregate_ranking.json`);

  // 7. Build and write team ranking
  console.log("🏅 Building team ranking…");
  const teamRanking = buildTeamRanking(scraped, loader, athletesIndex, keyToCanonical);
  writeJson("team_ranking.json", teamRanking);
  for (const [year, distances] of Object.entries(teamRanking)) {
    for (const [dist, teams] of Object.entries(distances)) {
      console.log(`   ${year} ${dist}: ${teams.length} teams scored`);
    }
  }
  console.log(`✓ team_ranking.json`);

  console.log("\n✅ Done.");
}

(PARTICIPANTS_ONLY ? scrapeParticipants() : main()).catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
