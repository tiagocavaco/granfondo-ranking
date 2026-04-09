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
  normalizeName,
  normalizeTeam,
  teamNormalKey,
  teamKeySimilarity,
  fixRawTeamName,
  canonicalTeam,
  posToBasePoints,
  finisherCoefficient,
  rankToTeamBasePoints,
  teamCoefficient,
  timeToSeconds,
  formatTime,
  parseEventDate,
  getYear,
  isPast,
} from "./normalize.js";
import type {
  ApiAthlete,
  ApiResult,
  StoredEvent,
  StoredEventResults,
  StoredDistanceResults,
  StoredResult,
  AthleteEntry,
  StoredDistance,
  AggregateAthlete,
  AggregateRanking,
  TeamRanking,
  TeamEntry,
} from "./types.js";

// ── Config ────────────────────────────────────────────────────────────────────

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, "..", "..", "frontend", "public", "data");
const FORCE = process.argv.includes("--force");
const PARTICIPANTS_ONLY = process.argv.includes("--participants");
const YEARS = [2025, 2026]; // seasons to include
const DELAY_MS = 400; // polite delay between requests

// ── Manual athlete merges ─────────────────────────────────────────────────────

interface MergeRule {
  canonical: string; // slug of the profile to keep
  aliases: string[]; // slugs to merge into canonical
  note?: string;
}

const MERGES_PATH = path.join(__dirname, "..", "athlete-merges.json");
const MERGE_RULES: MergeRule[] = fs.existsSync(MERGES_PATH)
  ? (JSON.parse(fs.readFileSync(MERGES_PATH, "utf-8")) as MergeRule[])
  : [];

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

function isGranfondoName(name: string): boolean {
  const n = name.toLowerCase();
  return n.includes("granfondo") || n.includes("grandfondo");
}

function isKidsCamVariant(name: string): boolean {
  const n = name.toLowerCase();
  return (
    n.includes("kids") ||
    n.includes("caminhada") ||
    n.includes(" vip") ||
    n.includes("kids/cam")
  );
}

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

// ── Distance extraction from participants ─────────────────────────────────────

function extractDistances(athletes: ApiAthlete[]): StoredDistance[] {
  const seen = new Map<string, string>(); // id → name
  for (const a of athletes) {
    if (a.id_percursos && a.percurso && !seen.has(a.id_percursos)) {
      seen.set(a.id_percursos, a.percurso);
    }
  }
  return Array.from(seen.entries())
    .map(([id, name]) => ({ id, name }))
    .sort((a, b) => Number(a.id) - Number(b.id));
}

// ── Result row transformation ─────────────────────────────────────────────────

/** Fill in genderPos for all results in a set of distances. */
function assignGenderPositions(distances: StoredDistanceResults[]): void {
  for (const dist of distances) {
    const genderCounters = new Map<string, number>();
    const finishers = dist.results
      .filter((r) => !r.dnf && !r.dns && r.pos > 0)
      .slice()
      .sort((a, b) => a.raceTimeSecs - b.raceTimeSecs);
    for (const r of finishers) {
      const next = (genderCounters.get(r.gender) ?? 0) + 1;
      genderCounters.set(r.gender, next);
      r.genderPos = next;
    }
  }
}

function transformResult(r: ApiResult): StoredResult {
  const raceTimeSecs = parseFloat(r.temposeg) || 0;
  const gapSecs = timeToSeconds(r.diferenca);

  // Detect non-finishers: obs field or 0 time with pos > 1
  const obs = (r.obs ?? "").toUpperCase();
  const dnf = obs.includes("DNF") || obs.includes("ABANDONOU") || obs === "AB";
  const dns = obs.includes("DNS") || obs.includes("NÃO PARTIU");

  return {
    pos: parseInt(r.pos, 10) || 0,
    genderPos: 0, // filled in after all results are collected
    bib: r.dorsal,
    name: r.nome,
    nameLower: normalizeName(r.nome),
    gender: r.sexo || "M",
    team: r.equipa ?? "",
    category: r.escalao ?? "",
    country: r.pais_nome ?? "",
    raceTime: formatTime(r.tempo),
    raceTimeSecs,
    gap: formatTime(r.diferenca),
    gapSecs,
    points: Number(r.pontos) || 0,
    licence: r.licenca1 ?? "",
    dnf,
    dns,
  };
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
    writeJson(`${event.id}_participants.json`, athletes);
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

// ── Athletes index builder ────────────────────────────────────────────────────

/** Team names that indicate the athlete is racing without an affiliation. */
const SOLO_TEAMS = new Set(["individual", "independente", "no team", "sem equipa", ""]);

function isSoloTeam(team: string): boolean {
  return SOLO_TEAMS.has(teamNormalKey(team).toLowerCase()) || !team.trim();
}

/**
 * Composite dedup key: nameLower + "|" + normalised team key.
 * Solo/unaffiliated results use an empty team bucket so they can be
 * merged later into the athlete's real team, if one is identified.
 */
function athleteKey(nameLower: string, team: string): string {
  return isSoloTeam(team) ? `${nameLower}|` : `${nameLower}|${teamNormalKey(team)}`;
}

function buildAthletesIndex(events: StoredEvent[]): Map<string, AthleteEntry> {
  const index = new Map<string, AthleteEntry>();
  // Track team name occurrences per athlete for canonical resolution
  const teamOccurrences = new Map<string, Map<string, Map<string, number>>>();
  // athleteKey → normalizedTeamKey → rawTeamName → count

  for (const event of events.filter((e) => e.hasResults)) {
    const stored = readJson<StoredEventResults>(`${event.id}_results.json`);
    if (!stored) continue;

    for (const dist of stored.distances) {
      for (const r of dist.results) {
        const key = athleteKey(r.nameLower, r.team);
        if (!index.has(key)) {
          const slug = key.replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
          index.set(key, { name: r.name, nameLower: r.nameLower, slug, results: [] });
          teamOccurrences.set(key, new Map());
        }
        if (r.team && !isSoloTeam(r.team)) {
          const tk = teamNormalKey(r.team);
          const athleteTeams = teamOccurrences.get(key)!;
          if (!athleteTeams.has(tk)) athleteTeams.set(tk, new Map());
          const rawMap = athleteTeams.get(tk)!;
          const fixedName = fixRawTeamName(r.team);
          rawMap.set(fixedName, (rawMap.get(fixedName) ?? 0) + 1);
        }
        index.get(key)!.results.push({
          eventId: event.id,
          eventName: event.name,
          eventDate: event.date,
          eventYear: event.year,
          distance: dist.name,
          pos: r.pos,
          category: r.category,
          gender: r.gender,
          team: r.team,
          country: r.country,
          raceTime: r.raceTime,
          raceTimeSecs: r.raceTimeSecs,
          gap: r.gap,
          gapSecs: r.gapSecs,
          dnf: r.dnf,
          dns: r.dns,
        });
      }
    }
  }

  // Merge solo bucket into the biggest team bucket for that name (if exactly one team exists)
  for (const nameLowerVal of new Set([...index.keys()].map((k) => k.split("|")[0]!))) {
    const soloKey = `${nameLowerVal}|`;
    if (!index.has(soloKey)) continue;
    // Find all non-solo keys for this name
    const teamKeys = [...index.keys()].filter(
      (k) => k.startsWith(`${nameLowerVal}|`) && k !== soloKey
    );
    if (teamKeys.length === 1) {
      // Merge solo results into the one team bucket
      const target = index.get(teamKeys[0]!)!;
      target.results.push(...index.get(soloKey)!.results);
      index.delete(soloKey);
      teamOccurrences.delete(soloKey);
    }
    // If 0 or 2+ team buckets exist, keep solo as its own entry
  }

  // Fuzzy team merge: merge buckets for the same name whose normalised team keys
  // are similar enough (e.g. "vivavita" vs "vivavita training and social club").
  const FUZZY_THRESHOLD = 0.6;
  const allNames = new Set([...index.keys()].map((k) => k.split("|")[0]!));
  for (const nameLowerVal of allNames) {
    let changed = true;
    while (changed) {
      changed = false;
      const nameKeys = [...index.keys()].filter(
        (k) => k.startsWith(`${nameLowerVal}|`) && k !== `${nameLowerVal}|`
      );
      outer: for (let i = 0; i < nameKeys.length; i++) {
        for (let j = i + 1; j < nameKeys.length; j++) {
          const kA = nameKeys[i]!;
          const kB = nameKeys[j]!;
          const teamA = kA.slice(nameLowerVal.length + 1);
          const teamB = kB.slice(nameLowerVal.length + 1);
          if (teamKeySimilarity(teamA, teamB) >= FUZZY_THRESHOLD) {
            // Merge smaller bucket into larger
            const eA = index.get(kA)!;
            const eB = index.get(kB)!;
            const [target, source, , sourceKey] =
              eA.results.length >= eB.results.length
                ? [eA, eB, kA, kB]
                : [eB, eA, kB, kA];
            target.results.push(...source.results);
            index.delete(sourceKey);
            teamOccurrences.delete(sourceKey);
            changed = true;
            break outer;
          }
        }
      }
    }
  }

  // Sort each athlete's results by date descending and resolve canonical team
  for (const [key, entry] of index.entries()) {
    entry.results.sort(
      (a, b) => new Date(b.eventDate).getTime() - new Date(a.eventDate).getTime()
    );
    const athleteTeams = teamOccurrences.get(key);
    if (athleteTeams && athleteTeams.size > 0) {
      let bestNormKey = "";
      let bestTotal = 0;
      for (const [normKey, rawMap] of athleteTeams) {
        const total = Array.from(rawMap.values()).reduce((s, n) => s + n, 0);
        if (total > bestTotal) { bestTotal = total; bestNormKey = normKey; }
      }
      entry.canonicalTeam = canonicalTeam(athleteTeams.get(bestNormKey)!);
    }
  }

  return index;
}

/**
 * Apply manual merge rules to the athletes index.
 * Returns a map of aliasSlug → canonicalSlug for writing redirect files,
 * and a map of aliasAthleteKey → canonicalAthleteKey for use in aggregate ranking.
 */
function applyAthleteMerges(index: Map<string, AthleteEntry>): {
  redirects: Map<string, string>;
  keyAliases: Map<string, string>;
} {
  const redirects = new Map<string, string>(); // aliasSlug → canonicalSlug
  const keyAliases = new Map<string, string>(); // aliasAthleteKey → canonicalAthleteKey

  // Build slug → athleteKey map
  const slugToKey = new Map<string, string>();
  for (const [key, entry] of index) slugToKey.set(entry.slug, key);

  for (const rule of MERGE_RULES) {
    const canonicalKey = slugToKey.get(rule.canonical);
    if (!canonicalKey) {
      console.warn(`  ⚠ merge: canonical slug "${rule.canonical}" not found in index`);
      continue;
    }
    const canonical = index.get(canonicalKey)!;

    for (const aliasSlug of rule.aliases) {
      const aliasKey = slugToKey.get(aliasSlug);
      if (!aliasKey) {
        console.warn(`  ⚠ merge: alias slug "${aliasSlug}" not found in index`);
        continue;
      }
      const alias = index.get(aliasKey)!;
      canonical.results.push(...alias.results);
      keyAliases.set(aliasKey, canonicalKey);
      redirects.set(aliasSlug, rule.canonical);
      index.delete(aliasKey);
    }

    // Re-sort merged results by date descending
    canonical.results.sort(
      (a, b) => new Date(b.eventDate).getTime() - new Date(a.eventDate).getTime()
    );
  }

  if (MERGE_RULES.length > 0)
    console.log(`  ✓ applied ${redirects.size} athlete merge(s)`);

  return { redirects, keyAliases };
}

// ── Aggregate ranking builder ─────────────────────────────────────────────────

const DISTANCE_ALIASES: Record<string, string> = {
  granfondo: "Granfondo",
  mediofondo: "Mediofondo",
  minifondo: "Minifondo",
  "time trial": "Time Trial",
  // Figueira Champions Classic uses "BIG DAY" / "HALF DAY" branding
  "big day": "Granfondo",
  "half day": "Mediofondo",
  // Aveiro Spring Classic uses "CLÁSSICA" / "Classica" branding
  "clássica": "Granfondo",
  "classica": "Granfondo",
  // Etapa da Volta uses "Etapa" branding
  "etapa": "Mediofondo",
};

function normalizeDistance(name: string): string {
  return DISTANCE_ALIASES[name.toLowerCase()] ?? name;
}

function buildAggregateRanking(
  events: StoredEvent[],
  keyAliases: Map<string, string> = new Map()
): AggregateRanking {
  // year → distance → gender → athleteKey → aggregation data
  type AccEntry = {
    name: string;
    nameLower: string;
    gender: string;
    team: string;
    country: string;
    totalPoints: number;
    eventsScored: number;
    bestPos: number; // gender-specific position
    results: AggregateAthlete["results"];
  };
  const acc: Record<string, Record<string, Record<string, Map<string, AccEntry>>>> = {};
  // year → distance → gender → athleteKey → normalizedTeamKey → rawTeamName → count
  const teamOcc: Record<string, Record<string, Record<string, Map<string, Map<string, Map<string, number>>>>>> = {};

  for (const event of events.filter((e) => e.hasResults)) {
    const stored = readJson<StoredEventResults>(`${event.id}_results.json`);
    if (!stored) continue;

    const yearKey = String(event.year);
    if (!acc[yearKey]) acc[yearKey] = {};
    if (!teamOcc[yearKey]) teamOcc[yearKey] = {};

    for (const dist of stored.distances) {
      const distKey = normalizeDistance(dist.name);
      if (!acc[yearKey][distKey]) acc[yearKey][distKey] = {};
      if (!teamOcc[yearKey][distKey]) teamOcc[yearKey][distKey] = {};

      // Group finishers by gender, sorted by race time for gender-specific positions
      const byGender = new Map<string, StoredResult[]>();
      for (const r of dist.results) {
        if (r.dnf || r.dns || r.pos < 1) continue;
        if (!byGender.has(r.gender)) byGender.set(r.gender, []);
        byGender.get(r.gender)!.push(r);
      }

      for (const [gender, finishers] of byGender) {
        finishers.sort((a, b) => a.raceTimeSecs - b.raceTimeSecs);
        const genderFinisherCount = finishers.length;
        const coeff = finisherCoefficient(genderFinisherCount);

        if (!acc[yearKey][distKey][gender]) acc[yearKey][distKey][gender] = new Map();
        if (!teamOcc[yearKey][distKey][gender]) teamOcc[yearKey][distKey][gender] = new Map();
        const distMap = acc[yearKey][distKey][gender];
        const distTeams = teamOcc[yearKey][distKey][gender];

        finishers.forEach((r, idx) => {
          const genderPos = idx + 1;
          const basePoints = posToBasePoints(genderPos);
          if (basePoints === 0) return;
          const pts = Math.round(basePoints * coeff * 10) / 10;

          const rawKey = athleteKey(r.nameLower, r.team);
          let key = keyAliases.get(rawKey) ?? rawKey;
          // Fuzzy team match: if no exact entry yet, check if a similar team key
          // already exists for this athlete name (same logic as athletes index)
          if (!distMap.has(key)) {
            const teamPart = key.slice(r.nameLower.length + 1);
            for (const existingKey of distMap.keys()) {
              if (!existingKey.startsWith(`${r.nameLower}|`)) continue;
              const existingTeam = existingKey.slice(r.nameLower.length + 1);
              if (teamKeySimilarity(teamPart, existingTeam) >= 0.6) {
                key = existingKey;
                break;
              }
            }
          }
          if (!distMap.has(key)) {
            const slug = key.replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
            distMap.set(key, {
              name: r.name,
              nameLower: r.nameLower,
              slug,
              gender: r.gender,
              team: r.team,
              country: r.country,
              totalPoints: 0,
              eventsScored: 0,
              bestPos: genderPos,
              results: [],
            });
            distTeams.set(key, new Map());
          }
          const entry = distMap.get(key)!;
          entry.totalPoints = Math.round((entry.totalPoints + pts) * 10) / 10;
          entry.eventsScored += 1;
          if (genderPos < entry.bestPos) entry.bestPos = genderPos;
          entry.country = r.country || entry.country;
          if (r.team) {
            const teamKey = teamNormalKey(r.team);
            const athleteTeams = distTeams.get(key)!;
            if (!athleteTeams.has(teamKey)) athleteTeams.set(teamKey, new Map());
            const rawMap = athleteTeams.get(teamKey)!;
            const fixedName = fixRawTeamName(r.team);
            rawMap.set(fixedName, (rawMap.get(fixedName) ?? 0) + 1);
          }
          entry.results.push({
            eventId: event.id,
            eventName: event.name,
            eventDate: event.date,
            distanceFinishers: genderFinisherCount,
            coefficient: coeff,
            pos: genderPos,
            basePoints,
            points: pts,
          });
        });
      }
    }
  }

  // Resolve canonical team and convert to sorted arrays with rank
  const ranking: AggregateRanking = {};
  for (const [year, distances] of Object.entries(acc)) {
    ranking[year] = {};
    for (const [dist, genders] of Object.entries(distances)) {
      ranking[year][dist] = {};
      for (const [gender, distMap] of Object.entries(genders)) {
        const distTeams = teamOcc[year]?.[dist]?.[gender];
        if (distTeams) {
          for (const [athleteKey, entry] of distMap) {
            const athleteTeams = distTeams.get(athleteKey);
            if (!athleteTeams || athleteTeams.size === 0) continue;
            let bestNormKey = "";
            let bestTotal = 0;
            for (const [normKey, rawMap] of athleteTeams) {
              const total = Array.from(rawMap.values()).reduce((s, n) => s + n, 0);
              if (total > bestTotal) { bestTotal = total; bestNormKey = normKey; }
            }
            entry.team = canonicalTeam(athleteTeams.get(bestNormKey)!);
          }
        }
        const sorted = Array.from(distMap.values())
          .sort((a, b) => b.totalPoints - a.totalPoints || a.bestPos - b.bestPos);
        ranking[year][dist][gender] = sorted.map((entry, i) => ({
          ...entry,
          rank: i + 1,
          results: entry.results.sort((a, b) =>
            new Date(b.eventDate).getTime() - new Date(a.eventDate).getTime()
          ),
        }));
      }
    }
  }

  return ranking;
}

// ── Team ranking builder ──────────────────────────────────────────────────────

const INDIVIDUAL_TEAM_KEYS = new Set(["individual", "independente", ""]);

function buildTeamRanking(events: StoredEvent[]): TeamRanking {
  // year → distance → teamKey → accumulated entry
  type AccTeam = {
    teamKey: string;
    // raw name occurrences for canonical display
    nameOcc: Map<string, number>;
    totalPoints: number;
    eventsScored: number;
    bestRank: number;
    results: TeamEntry["results"];
  };
  const acc: Record<string, Record<string, Map<string, AccTeam>>> = {};

  for (const event of events.filter((e) => e.hasResults)) {
    const stored = readJson<StoredEventResults>(`${event.id}_results.json`);
    if (!stored) continue;

    const yearKey = String(event.year);
    if (!acc[yearKey]) acc[yearKey] = {};

    for (const dist of stored.distances) {
      const distKey = normalizeDistance(dist.name);
      if (!acc[yearKey][distKey]) acc[yearKey][distKey] = new Map();
      const distMap = acc[yearKey][distKey];

      // Group finishers by normalized team
      const teamAthletes = new Map<string, Array<{ name: string; pos: number; rawTeam: string }>>();
      for (const r of dist.results) {
        if (r.dnf || r.dns || r.pos < 1 || !r.team) continue;
        const tk = teamNormalKey(r.team);
        if (INDIVIDUAL_TEAM_KEYS.has(tk)) continue;
        if (!teamAthletes.has(tk)) teamAthletes.set(tk, []);
        teamAthletes.get(tk)!.push({ name: r.name, pos: r.pos, rawTeam: fixRawTeamName(r.team) });
      }

      // Total teams present (for coefficient) — all with ≥1 finisher
      const totalTeams = teamAthletes.size;
      const coeff = teamCoefficient(totalTeams);

      // Eligible teams: ≥3 athletes — rank them by sum of top-3 positions
      type EligibleTeam = {
        tk: string;
        rawTeam: string;
        combinedScore: number;
        bestPos: number;
        top3: Array<{ name: string; pos: number }>;
      };
      const eligible: EligibleTeam[] = [];

      for (const [tk, athletes] of teamAthletes) {
        if (athletes.length < 3) continue;
        const sorted = [...athletes].sort((a, b) => a.pos - b.pos);
        const top3 = sorted.slice(0, 3);
        const combinedScore = top3.reduce((s, a) => s + a.pos, 0);
        const bestPos = top3[0]!.pos;
        // most common raw team name in top3 athletes
        const rawTeam = sorted[0]!.rawTeam;
        eligible.push({ tk, rawTeam, combinedScore, bestPos, top3 });
      }

      // Sort eligible: lower combinedScore is better; tie-break by best individual pos
      eligible.sort((a, b) =>
        a.combinedScore - b.combinedScore || a.bestPos - b.bestPos
      );

      const eligibleTeams = eligible.length;

      // Award points to top 10 eligible teams
      eligible.slice(0, 10).forEach((et, i) => {
        const teamRank = i + 1;
        const basePoints = rankToTeamBasePoints(teamRank);
        const pts = Math.round(basePoints * coeff * 10) / 10;

        if (!distMap.has(et.tk)) {
          distMap.set(et.tk, {
            teamKey: et.tk,
            nameOcc: new Map(),
            totalPoints: 0,
            eventsScored: 0,
            bestRank: teamRank,
            results: [],
          });
        }
        const entry = distMap.get(et.tk)!;
        entry.totalPoints = Math.round((entry.totalPoints + pts) * 10) / 10;
        entry.eventsScored += 1;
        if (teamRank < entry.bestRank) entry.bestRank = teamRank;
        // Track raw name occurrence for canonical display
        entry.nameOcc.set(et.rawTeam, (entry.nameOcc.get(et.rawTeam) ?? 0) + 1);

        entry.results.push({
          eventId: event.id,
          eventName: event.name,
          eventDate: event.date,
          totalTeams,
          eligibleTeams,
          coefficient: coeff,
          teamRank,
          basePoints,
          points: pts,
          combinedScore: et.combinedScore,
          athletes: et.top3.map((a) => ({ name: a.name, pos: a.pos })),
        });
      });
    }
  }

  // Resolve canonical team name and build sorted output
  const ranking: TeamRanking = {};
  for (const [year, distances] of Object.entries(acc)) {
    ranking[year] = {};
    for (const [dist, distMap] of Object.entries(distances)) {
      const sorted = Array.from(distMap.values())
        .sort((a, b) => b.totalPoints - a.totalPoints || a.bestRank - b.bestRank);
      ranking[year][dist] = sorted.map((entry, i) => ({
        rank: i + 1,
        team: canonicalTeam(entry.nameOcc),
        totalPoints: entry.totalPoints,
        eventsScored: entry.eventsScored,
        bestRank: entry.bestRank,
        results: entry.results.sort(
          (a, b) => new Date(b.eventDate).getTime() - new Date(a.eventDate).getTime()
        ),
      }));
    }
  }

  return ranking;
}

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
        writeJson(`${event.id}_participants.json`, athletes);
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
        writeJson(`${event.id}_participants.json`, athletes);
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
  console.log("🔨 Building athletes index…");
  const athletesIndex = buildAthletesIndex(scraped);

  // Apply manual merges (must happen before writing files and before aggregate ranking)
  const { redirects, keyAliases } = applyAthleteMerges(athletesIndex);

  const athletesArray = Array.from(athletesIndex.values()).sort((a, b) =>
    a.nameLower.localeCompare(b.nameLower)
  );
  writeJson("athletes.json", athletesArray);
  console.log(`✓ athletes.json — ${athletesArray.length} athletes`);
  const uniqueByYear: Record<string, number> = {};
  for (const year of YEARS) {
    const names = new Set(
      athletesArray
        .filter((a) => a.results.some((r) => r.eventYear === year))
        .map((a) => a.nameLower)
    );
    uniqueByYear[String(year)] = names.size;
  }
  writeJson("stats.json", { uniqueAthletes: athletesArray.length, uniqueByYear });

  // Write individual athlete files — wipe dir first to remove stale files
  const athleteDir = path.join(DATA_DIR, "athlete");
  fs.rmSync(athleteDir, { recursive: true, force: true });
  fs.mkdirSync(athleteDir, { recursive: true });
  for (const a of athletesIndex.values()) {
    fs.writeFileSync(path.join(athleteDir, `${a.slug}.json`), JSON.stringify(a), "utf-8");
  }
  // Write redirect stubs for merged aliases so old bookmarked URLs still resolve
  for (const [aliasSlug, canonicalSlug] of redirects) {
    fs.writeFileSync(
      path.join(athleteDir, `${aliasSlug}.json`),
      JSON.stringify({ redirectTo: canonicalSlug }),
      "utf-8"
    );
  }

  // Write name-only slug files so clicking an athlete name (without knowing their team)
  // resolves correctly: redirect if unique name, disambiguation picker if multiple.
  const byName = new Map<string, typeof athletesArray[number][]>();
  for (const a of athletesIndex.values()) {
    const nameSlug = a.nameLower.replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
    const bucket = byName.get(nameSlug) ?? [];
    bucket.push(a);
    byName.set(nameSlug, bucket);
  }
  let disambigCount = 0;
  for (const [nameSlug, athletes] of byName) {
    const filePath = path.join(athleteDir, `${nameSlug}.json`);
    if (fs.existsSync(filePath)) continue; // composite slug already wrote this file (single-name athlete)
    if (athletes.length === 1) {
      fs.writeFileSync(filePath, JSON.stringify({ redirectTo: athletes[0]!.slug }), "utf-8");
    } else {
      disambigCount++;
      fs.writeFileSync(filePath, JSON.stringify({
        disambiguation: true,
        matches: athletes
          .sort((a, b) => b.results.length - a.results.length)
          .map((a) => ({
            slug: a.slug,
            name: a.name,
            team: a.canonicalTeam ?? "",
            resultCount: a.results.length,
          })),
      }), "utf-8");
    }
  }
  console.log(`✓ athlete/ — ${athletesIndex.size} files + ${redirects.size} redirect(s) + ${disambigCount} disambiguation(s)`);

  // 6. Build and write aggregate ranking
  console.log("🏆 Building aggregate ranking…");
  const aggregateRanking = buildAggregateRanking(scraped, keyAliases);
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
  const teamRanking = buildTeamRanking(scraped);
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
