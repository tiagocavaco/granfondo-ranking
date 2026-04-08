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
} from "./external.js";
import {
  normalizeName,
  normalizeTeam,
  teamNormalKey,
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
const YEARS = [2025, 2026]; // seasons to include
const DELAY_MS = 400; // polite delay between requests

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
 * Official event pages for upcoming events — overrides the default results.stopandgo.pro URL.
 * Used before results are published; replaced automatically once results go live.
 */
const OFFICIAL_EVENT_URLS: Record<number, string> = {
  // BikeService
  1741: "https://bikeservice.pt/event/eurobec-granfondo/",
  1766: "https://bikeservice.pt/event/douro-granfondo/",
  1806: "https://bikeservice.pt/event/geres-granfondo/",
  1883: "https://bikeservice.pt/event/braganca-granfondo/",
  1943: "https://bikeservice.pt/event/moncao-e-melgaco-granfondo/",
  1828: "https://bikeservice.pt/event/ourem-fatima-granfondo/",
  // Cabreira Solutions
  1751: "https://cabreirasolutions.com/evento/granfondo-torres-vedras/",
  1977: "https://cabreirasolutions.com/evento/granfondo-medio-tejo/",
  1956: "https://cabreirasolutions.com/evento/lousa-granfondo/",
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

  const pastEvents: StoredEvent[] = granfondos.map((e) => ({
    id: Number(e.id_evento),
    name: e.nome,
    year: getYear(parseEventDate(e.data)),
    date: parseEventDate(e.data),
    location: e.local,
    resultsUrl: OFFICIAL_EVENT_URLS[Number(e.id_evento)] ?? `https://results.stopandgo.pro/${Number(e.id_evento)}`,
    hasResults: false,
    distances: [],
    participantCount: 0,
    finisherCount: 0,
    scrapedAt: null,
  }));

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
        resultsUrl: OFFICIAL_EVENT_URLS[e.id] ?? `https://results.stopandgo.pro/${e.id}`,
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
      resultsUrl: OFFICIAL_EVENT_URLS[id] ?? `https://results.stopandgo.pro/${id}`,
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
    athletes = await fetchParticipants(event.id);
    await sleep(DELAY_MS);
  } catch (err) {
    console.error(`  ✗ participants: ${err}`);
    return event;
  }

  const distances = extractDistances(athletes);
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
    const needsBackfill = cached.distances.some((d) =>
      d.results.some((r) => !r.dnf && !r.dns && r.pos > 0 && !r.genderPos)
    );
    if (needsBackfill) {
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
        const key = r.nameLower;
        if (!index.has(key)) {
          index.set(key, { name: r.name, nameLower: r.nameLower, results: [] });
          teamOccurrences.set(key, new Map());
        }
        // Record team occurrence
        if (r.team) {
          const teamKey = teamNormalKey(r.team);
          const athleteTeams = teamOccurrences.get(key)!;
          if (!athleteTeams.has(teamKey)) athleteTeams.set(teamKey, new Map());
          const rawMap = athleteTeams.get(teamKey)!;
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

  // Sort each athlete's results by date descending
  for (const [key, entry] of index.entries()) {
    entry.results.sort(
      (a, b) => new Date(b.eventDate).getTime() - new Date(a.eventDate).getTime()
    );
    // Resolve canonical team: find the normalizedTeamKey with the most total occurrences
    const athleteTeams = teamOccurrences.get(key);
    if (athleteTeams && athleteTeams.size > 0) {
      // Pick the normalized group with highest total count
      let bestNormKey = "";
      let bestTotal = 0;
      for (const [normKey, rawMap] of athleteTeams) {
        const total = Array.from(rawMap.values()).reduce((s, n) => s + n, 0);
        if (total > bestTotal) { bestTotal = total; bestNormKey = normKey; }
      }
      const bestRawMap = athleteTeams.get(bestNormKey)!;
      entry.canonicalTeam = canonicalTeam(bestRawMap);
    }
  }

  return index;
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
};

function normalizeDistance(name: string): string {
  return DISTANCE_ALIASES[name.toLowerCase()] ?? name;
}

function buildAggregateRanking(events: StoredEvent[]): AggregateRanking {
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

          const key = r.nameLower;
          if (!distMap.has(key)) {
            distMap.set(key, {
              name: r.name,
              nameLower: r.nameLower,
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
      const needsBackfill = cached.distances.some((d) =>
        d.results.some((r) => !r.dnf && !r.dns && r.pos > 0 && !r.genderPos)
      );
      if (needsBackfill) {
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
  const athletesArray = Array.from(athletesIndex.values()).sort((a, b) =>
    a.nameLower.localeCompare(b.nameLower)
  );
  writeJson("athletes.json", athletesArray);
  console.log(`✓ athletes.json — ${athletesArray.length} athletes`);

  // 6. Build and write aggregate ranking
  console.log("🏆 Building aggregate ranking…");
  const aggregateRanking = buildAggregateRanking(scraped);
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

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
