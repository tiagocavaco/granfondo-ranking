import fs from "fs";
import os from "os";
import path from "path";
import { createDecipheriv } from "crypto";
import { fileURLToPath } from "url";

import BetterSqlite3 from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { eq, inArray } from "drizzle-orm";
import * as schema from "@granfondo/db/schema";

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
} from "./transform.js";
import {
  buildAthletesIndex,
  buildAggregateRanking,
  buildTeamRanking,
  type AthleteIdStore,
  type AthleteAliasRule,
  type ResultAssignment,
} from "./pipeline.js";
import {
  SUPPLEMENTAL_EVENT_IDS,
  OFFICIAL_EVENT_URLS,
  DEFAULT_DISTANCES,
  LISTA_URLS,
} from "./config.js";
import { normalizeName } from "./normalize.js";
import { buildDatabase, type AllScrapedData } from "@granfondo/db/db-writer";
import { encryptBuffer } from "./encrypt.js";
import type {
  StoredEvent,
  StoredEventResults,
  StoredDistanceResults,
  StoredResult,
  StoredParticipant,
  AthleteEntry,
  AggregateRanking,
  TeamRanking,
} from "@granfondo/db/types";
import type { ApiAthlete } from "./types.js";

// ── Config ────────────────────────────────────────────────────────────────────

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Load .env from scraper root if present (local dev). CI injects env vars directly.
{
  const envFile = path.join(__dirname, "..", ".env");
  if (fs.existsSync(envFile)) {
    for (const line of fs.readFileSync(envFile, "utf-8").split("\n")) {
      const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.+)$/);
      if (m) process.env[m[1]] ??= m[2].trim();
    }
  }
}
const DATA_DIR = path.join(__dirname, "..", "..", "frontend", "public", "data");
const ATHLETE_ALIASES_PATH = path.join(__dirname, "..", "athlete-aliases.json");
const RESULT_ASSIGNMENTS_PATH = path.join(__dirname, "..", "result-assignments.json");
const SCRAPED_EVENTS_PATH = path.join(__dirname, "..", "scraped-events.json");
const DB_ENC_PATH = path.join(DATA_DIR, "data.db.enc");
const TMP_DB_PATH = path.join(os.tmpdir(), `granfondo-${process.pid}.db`);
const FORCE = process.argv.includes("--force");
const PARTICIPANTS_ONLY = process.argv.includes("--participants");
const YEARS = [2025, 2026]; // seasons to include
const DELAY_MS = 400; // polite delay between requests

// ── Types ─────────────────────────────────────────────────────────────────────

type ScrapeResult = {
  event: StoredEvent;
  results?: StoredEventResults;
  participants?: StoredParticipant[];
};

function apiAthleteToParticipant(a: ApiAthlete): StoredParticipant {
  return {
    bib:        a.dorsal ?? "",
    name:       a.nome ?? "",
    fullName:   a.nomecompleto ?? "",
    gender:     a.sexo ?? "",
    team:       a.equipa ?? "",
    category:   a.escalao ?? "",
    distance:   a.percurso ?? "",
    distanceId: a.id_percursos ?? "",
  };
}

// ── Source-DB helpers ─────────────────────────────────────────────────────────

/** Decrypts data.db.enc to a writable temp file and returns an open BetterSqlite3 DB. */
function openSourceDb(): BetterSqlite3.Database | null {
  if (!fs.existsSync(DB_ENC_PATH)) return null;
  const keyHex = process.env.DATA_KEY;
  if (!keyHex) return null;
  try {
    const enc = fs.readFileSync(DB_ENC_PATH);
    const iv  = enc.subarray(0, 12);
    const tag = enc.subarray(12, 28);
    const ct  = enc.subarray(28);
    const key = Buffer.from(keyHex, "hex");
    const d = createDecipheriv("aes-256-gcm", key, iv);
    d.setAuthTag(tag);
    const plain = Buffer.concat([d.update(ct), d.final()]);
    fs.writeFileSync(TMP_DB_PATH, plain);
    return new BetterSqlite3(TMP_DB_PATH);
  } catch (err) {
    console.warn("⚠️  Could not open source DB:", err);
    return null;
  }
}

function closeSourceDb(db: BetterSqlite3.Database | null): void {
  db?.close();
  try { if (fs.existsSync(TMP_DB_PATH)) fs.unlinkSync(TMP_DB_PATH); } catch {}
}

/** Reconstruct StoredEventResults for one event from an open source DB. */
function loadResultsFromDb(
  sourceDb: BetterSqlite3.Database,
  event: StoredEvent,
): StoredEventResults | null {
  const db = drizzle(sourceDb, { schema });

  const rows = db.select().from(schema.results)
    .where(eq(schema.results.eventId, event.id))
    .orderBy(schema.results.distanceId, schema.results.pos, schema.results.name)
    .all();

  if (rows.length === 0) return null;

  // Fetch all licences for these results in one typed query
  const resultIds = rows.map((r) => r.id);
  const licenceRows = db.select().from(schema.resultLicences)
    .where(inArray(schema.resultLicences.resultId, resultIds))
    .all();

  const licencesByResultId = new Map<number, string[]>();
  for (const lr of licenceRows) {
    if (!licencesByResultId.has(lr.resultId)) licencesByResultId.set(lr.resultId, []);
    licencesByResultId.get(lr.resultId)!.push(lr.licence);
  }

  const eventRow = db.select({ scrapedAt: schema.events.scrapedAt })
    .from(schema.events)
    .where(eq(schema.events.id, event.id))
    .get();
  const scrapedAt = eventRow?.scrapedAt ?? event.scrapedAt ?? new Date().toISOString();

  const distanceMap = new Map<string, StoredDistanceResults>();
  for (const row of rows) {
    if (!distanceMap.has(row.distanceId)) {
      distanceMap.set(row.distanceId, {
        id: row.distanceId,
        name: row.distanceName,
        finisherCount: row.finisherCount,
        results: [],
      });
    }
    const dist = distanceMap.get(row.distanceId)!;
    dist.results.push({
      pos:          row.pos,
      genderPos:    row.genderPos,
      athleteId:    row.athleteId,
      bib:          row.bib,
      name:         row.name,
      nameLower:    row.nameLower,
      gender:       row.gender,
      team:         row.team,
      category:     row.category,
      country:      row.country,
      raceTime:     row.raceTime,
      raceTimeSecs: row.raceTimeSecs,
      gap:          row.gap,
      gapSecs:      row.gapSecs,
      points:       row.points,
      dnf:          row.dnf === 1,
      dns:          row.dns === 1,
      licences:     licencesByResultId.get(row.id) ?? [],
    });
  }

  return {
    eventId:   event.id,
    eventName: event.name,
    eventDate: event.date,
    eventYear: event.year,
    scrapedAt,
    distances: Array.from(distanceMap.values()),
  };
}

// ── Athlete ID store ──────────────────────────────────────────────────────────

function loadIdStore(sourceDb: BetterSqlite3.Database | null): AthleteIdStore {
  if (!sourceDb) return new Map();
  try {
    const rows = drizzle(sourceDb, { schema }).select().from(schema.athleteLookup).all();
    return new Map(rows.map((r) => [r.key, r.athleteId]));
  } catch {
    return new Map();
  }
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

/** Used only for flag JSON files and scraped-events index. */
function writeJson(filename: string, data: unknown) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(outPath(filename), JSON.stringify(data, null, 2), "utf-8");
}

async function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchEventParticipants(eventId: number): Promise<StoredParticipant[]> {
  if (LISTA_URLS[eventId]) return scrapeListaParticipants(LISTA_URLS[eventId]!);
  const athletes = await fetchParticipants(eventId);
  await sleep(DELAY_MS);
  return athletes.map(apiAthleteToParticipant);
}

function resolveDistances(athletes: StoredParticipant[], eventId: number) {
  const distances = extractDistances(athletes);
  return distances.length > 0 ? distances : (DEFAULT_DISTANCES[eventId] ?? []);
}

// ── Scraped-events index ──────────────────────────────────────────────────────

function loadScrapedEvents(): Record<string, string> {
  if (!fs.existsSync(SCRAPED_EVENTS_PATH)) return {};
  return JSON.parse(fs.readFileSync(SCRAPED_EVENTS_PATH, "utf-8")) as Record<string, string>;
}

function saveScrapedEvents(index: Record<string, string>): void {
  fs.writeFileSync(SCRAPED_EVENTS_PATH, JSON.stringify(index, null, 2), "utf-8");
}

// ── Database builder ──────────────────────────────────────────────────────────

async function writeEncryptedDatabase(
  scraped: StoredEvent[],
  allResults: Map<number, StoredEventResults>,
  allParticipants: Map<number, StoredParticipant[]>,
  athletesIndex: Map<string, AthleteEntry>,
  nameToId: Record<string, number>,
  aggregateRanking: AggregateRanking,
  teamRanking: TeamRanking,
  stats: { uniqueAthletes: number; uniqueByYear: Record<string, number> },
): Promise<void> {
  const keyHex = process.env.DATA_KEY;
  if (!keyHex) {
    console.warn("⚠️  DATA_KEY not set — skipping data.db.enc");
    return;
  }

  console.log("🗄  Building encrypted SQLite database…");

  const data: AllScrapedData = {
    events: scraped,
    allResults,
    allParticipants,
    athletesIndex,
    nameToId,
    teamAliases: {},
    aggregateRanking,
    teamRanking,
    stats,
  };

  const dbBuffer = buildDatabase(data);
  const encrypted = encryptBuffer(dbBuffer, keyHex);
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(DB_ENC_PATH, encrypted);
  console.log(`✓ data.db.enc — ${(encrypted.length / 1024 / 1024).toFixed(1)} MB`);

  const scrapedEvents = loadScrapedEvents();
  const now = new Date().toISOString();
  for (const event of scraped.filter((e) => e.hasResults)) {
    scrapedEvents[String(event.id)] = event.scrapedAt ?? now;
  }
  saveScrapedEvents(scrapedEvents);
  console.log(`✓ scraped-events.json — ${Object.keys(scrapedEvents).length} stable events`);
}

// ── Event discovery ───────────────────────────────────────────────────────────

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

  const pastIds = new Set(pastEvents.map((e) => e.id));
  const seenIds = new Set(pastIds);
  const upcomingEvents: StoredEvent[] = [];

  for (const year of YEARS) {
    const netEvents = await fetchUpcomingEvents(year);
    for (const e of netEvents) {
      if (isKidsCamVariant(e.nome)) continue;
      if (!isGranfondoName(e.nome) && !supplementalSet.has(e.id)) continue;
      if (seenIds.has(e.id)) continue;
      seenIds.add(e.id);
      const date = e.data_inicio?.slice(0, 10) ?? "";
      if (!date) continue;
      const eventYear = getYear(date);
      if (!YEARS.includes(eventYear)) continue;
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

  for (const id of SUPPLEMENTAL_EVENT_IDS) {
    if (seenIds.has(id)) continue;
    const e = await fetchNetEventById(id);
    if (!e) continue;
    const date = e.data_inicio?.slice(0, 10) ?? "";
    if (!date) continue;
    const eventYear = getYear(date);
    if (!YEARS.includes(eventYear)) continue;
    if (isPast(date)) continue;
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

async function scrapeEvent(
  event: StoredEvent,
  scrapedEvents: Record<string, string>,
  sourceDb: BetterSqlite3.Database | null,
): Promise<ScrapeResult> {
  const label = `[${event.id}] ${event.name} (${event.date})`;

  // ── Step 1: participants / distance discovery ──────────────────────────────
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

  // ── Step 2: results per distance ──────────────────────────────────────────
  const isStable = !FORCE && (String(event.id) in scrapedEvents) && sourceDb !== null;

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
      console.log(`  ✓ ${dist.name} — ${results.length} rows`);
    } catch (err) {
      console.error(`  ✗ ${dist.name}: ${err}`);
    }
  }

  if (distanceResults.length === 0) {
    console.log(`  ! no results scraped for ${label}`);
    return { event, participants: athletes };
  }

  assignGenderPositions(distanceResults);

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

// ── Participants-only scrape ──────────────────────────────────────────────────

/**
 * Lightweight scrape that updates participant lists for upcoming events in the
 * existing encrypted DB without running the full athlete pipeline.
 */
async function scrapeParticipants() {
  console.log(`🚴  Granfondo Portugal Scraper — participants mode`);
  console.log(`    ${new Date().toISOString()}\n`);

  const keyHex = process.env.DATA_KEY;
  if (!keyHex) {
    console.warn("⚠️  DATA_KEY not set — skipping DB update");
    return;
  }

  const sourceDb = openSourceDb();
  if (!sourceDb) {
    console.warn("⚠️  No existing data.db.enc — run full scrape first");
    return;
  }

  const db = drizzle(sourceDb, { schema });
  const existingEventIds = new Set(
    db.select({ id: schema.events.id }).from(schema.events).all().map((r) => r.id)
  );

  const events = await discoverGranfondos();

  // Collect all events for DB update, fetching participants for upcoming ones
  const updatedParticipants = new Map<number, { event: StoredEvent; athletes: StoredParticipant[] }>();

  for (const event of events) {
    if (!isPast(event.date)) {
      console.log(`⏳ [${event.id}] ${event.name}`);
      try {
        const athletes = await fetchEventParticipants(event.id);
        event.distances = resolveDistances(athletes, event.id);
        event.participantCount = athletes.length;
        updatedParticipants.set(event.id, { event, athletes });
        console.log(`  ⏳ ${athletes.length} confirmed, ${event.distances.map((d) => d.name).join(" / ")}`);
      } catch (err) {
        console.error(`  ✗ ${err}`);
      }
    }
  }

  for (const event of MANUAL_UPCOMING_EVENTS) {
    if (LISTA_URLS[event.id]) {
      console.log(`⏳ [${event.id}] ${event.name}`);
      try {
        const athletes = await fetchEventParticipants(event.id);
        event.distances = resolveDistances(athletes, event.id);
        event.participantCount = athletes.length;
        updatedParticipants.set(event.id, { event, athletes });
        console.log(`  ⏳ ${athletes.length} confirmed`);
      } catch (err) {
        console.error(`  ✗ ${err}`);
      }
    }
  }

  // Surgical DB update inside a single transaction
  sourceDb.transaction(() => {
    for (const [eventId, { event, athletes }] of updatedParticipants) {
      if (!existingEventIds.has(eventId)) {
        db.insert(schema.events).values({
          id:               eventId,
          name:             event.name,
          year:             event.year,
          date:             event.date,
          location:         event.location ?? "",
          officialUrl:      event.officialUrl ?? null,
          resultsUrl:       event.resultsUrl,
          hasResults:       0,
          participantCount: 0,
          finisherCount:    0,
          scrapedAt:        null,
        }).onConflictDoNothing().run();
      }

      db.update(schema.events)
        .set({ participantCount: event.participantCount })
        .where(eq(schema.events.id, eventId))
        .run();

      db.delete(schema.eventDistances)
        .where(eq(schema.eventDistances.eventId, eventId))
        .run();
      for (const d of event.distances) {
        db.insert(schema.eventDistances).values({ id: d.id, eventId, name: d.name })
          .onConflictDoNothing().run();
      }

      db.delete(schema.participants)
        .where(eq(schema.participants.eventId, eventId))
        .run();
      for (const a of athletes) {
        db.insert(schema.participants).values({ eventId, ...a }).run();
      }
    }
  })();

  const dbBuffer = sourceDb.serialize() as Buffer;
  const encrypted = encryptBuffer(dbBuffer, keyHex);
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(DB_ENC_PATH, encrypted);
  console.log(`\n✓ data.db.enc — ${(encrypted.length / 1024 / 1024).toFixed(1)} MB`);

  closeSourceDb(sourceDb);
  console.log("\n✅ Done.");
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`🚴  Granfondo Portugal Scraper`);
  console.log(`    ${new Date().toISOString()}`);
  console.log(`    Seasons: ${YEARS.join(", ")}`);
  console.log(`    Output: ${DATA_DIR}`);
  console.log(FORCE ? "    ⚡ Force mode\n" : "\n");

  const scrapedEvents = loadScrapedEvents();
  const sourceDb = openSourceDb();

  // 1. Discover all granfondo events
  const events = await discoverGranfondos();

  // 2. Scrape each StopAndGo event
  const scraped: StoredEvent[] = [];
  const allResults = new Map<number, StoredEventResults>();
  const allParticipants = new Map<number, StoredParticipant[]>();

  for (const event of events) {
    const past = isPast(event.date);
    console.log(`${past ? "✅" : "⏳"} [${event.id}] ${event.name}`);
    const result = await scrapeEvent(event, scrapedEvents, sourceDb);
    scraped.push(result.event);
    if (result.results) allResults.set(result.event.id, result.results);
    if (result.participants) allParticipants.set(result.event.id, result.participants);
  }

  // 3. Scrape external platform events
  console.log("\n🌐 Scraping external platform events…");
  const externalScrapers: Array<{
    event: StoredEvent;
    fn: () => Promise<StoredEventResults>;
  }> = [
    { event: EXTERNAL_EVENTS[0]!, fn: scrapeFigueiraChampionsDay },
    { event: EXTERNAL_EVENTS[1]!, fn: scrapeAgitagueda },
    { event: EXTERNAL_EVENTS[2]!, fn: scrapeApedalar5Quinas },
    { event: EXTERNAL_EVENTS[3]!, fn: scrapeEtapaDaVolta },
  ];

  for (const { event, fn } of externalScrapers) {
    console.log(`✅ [${event.id}] ${event.name}`);
    const isStable = !FORCE && (String(event.id) in scrapedEvents) && sourceDb !== null;

    if (isStable) {
      const cached = loadResultsFromDb(sourceDb, event);
      if (cached) {
        event.hasResults = true;
        event.finisherCount = cached.distances.reduce((s, d) => s + d.finisherCount, 0);
        event.scrapedAt = cached.scrapedAt;
        allResults.set(event.id, cached);
        console.log(`  · cached — ${event.finisherCount} finishers`);
        scraped.push(event);
        continue;
      }
    }

    try {
      const results = await fn();
      assignGenderPositions(results.distances);
      event.hasResults = true;
      event.finisherCount = results.distances.reduce((s, d) => s + d.finisherCount, 0);
      event.scrapedAt = results.scrapedAt;
      allResults.set(event.id, results);
      console.log(
        `  ✓ ${results.distances.map((d) => `${d.name}: ${d.finisherCount}`).join(", ")}`
      );
    } catch (err) {
      console.error(`  ✗ ${err}`);
    }

    scraped.push(event);
  }

  // 3b. Add manual upcoming events (no StopAndGo ID yet)
  for (const event of MANUAL_UPCOMING_EVENTS) {
    console.log(`⏳ [${event.id}] ${event.name}`);
    scraped.push(event);
  }

  // Load athlete IDs from source DB before closing it
  const idStore = loadIdStore(sourceDb);

  // Source DB no longer needed — close before building new one
  closeSourceDb(sourceDb);

  const withResults = scraped.filter((e) => e.hasResults).length;
  console.log(`\n✓ ${scraped.length} events, ${withResults} with results`);

  // 4. Build athletes index
  console.log("🔨 Building athletes index…");
  const aliasRules = loadAthleteAliases();
  const assignments = loadResultAssignments();
  const loader = (id: number) => allResults.get(id) ?? null;

  const { index: athletesIndex, updatedIdStore, soloFlags, crossPassFlags } = buildAthletesIndex(
    scraped, loader, aliasRules, assignments, idStore
  );

  const manualSoloFlags = soloFlags.filter((f) => f.resolution === "flagged_manual");
  writeJson("solo-flags.json", manualSoloFlags);
  if (manualSoloFlags.length > 0) {
    console.warn(`⚠️  ${manualSoloFlags.length} solo collision(s) require manual review — see frontend/public/data/solo-flags.json`);
  } else {
    console.log(`✓ solo-flags.json — no unresolved collisions`);
  }

  writeJson("cross-pass-flags.json", crossPassFlags);
  if (crossPassFlags.length > 0) {
    console.warn(`⚠️  ${crossPassFlags.length} cross-pass merge(s) require manual review — see frontend/public/data/cross-pass-flags.json`);
  } else {
    console.log(`✓ cross-pass-flags.json — no ambiguous merges`);
  }

  // Build alias → canonical key map
  const idToCanonicalKey = new Map<number, string>();
  for (const [key, entry] of athletesIndex) idToCanonicalKey.set(entry.id, key);
  const keyToCanonical = new Map<string, string>();
  for (const [key, id] of updatedIdStore) {
    const canon = idToCanonicalKey.get(id);
    if (canon && canon !== key) keyToCanonical.set(key, canon);
  }

  // 5. Inject athlete IDs into in-memory results
  const resultLookup = new Map<string, number>();
  for (const entry of athletesIndex.values()) {
    for (const r of entry.results) {
      const k = `${r.eventId}|${normalizeName(entry.nameLower)}|${r.team}`;
      resultLookup.set(k, entry.id);
    }
  }

  console.log("🔑 Injecting athlete IDs into results…");
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
  console.log(`✓ updated ${injectedEvents} event result(s)`);

  // Build name-to-id lookup
  const nameToId: Record<string, number> = {};
  for (const [key, id] of updatedIdStore) nameToId[key] = id;
  for (const [key, entry] of athletesIndex) nameToId[key] = entry.id;

  const athletesArray = Array.from(athletesIndex.values()).sort((a, b) =>
    a.nameLower.localeCompare(b.nameLower)
  );
  console.log(`✓ ${athletesArray.length} athletes indexed`);

  const uniqueByYear: Record<string, number> = {};
  for (const year of YEARS) {
    uniqueByYear[String(year)] = athletesArray.filter(
      (a) => a.results.some((r) => r.eventYear === year)
    ).length;
  }
  const stats = { uniqueAthletes: athletesArray.length, uniqueByYear };

  // 6. Build aggregate ranking
  console.log("🏆 Building aggregate ranking…");
  const aggregateRanking = buildAggregateRanking(scraped, loader, athletesIndex, keyToCanonical);
  for (const [year, distances] of Object.entries(aggregateRanking)) {
    for (const [dist, genders] of Object.entries(distances)) {
      for (const [gender, athletes] of Object.entries(genders)) {
        console.log(`   ${year} ${dist} ${gender}: ${athletes.length} athletes scored`);
      }
    }
  }
  console.log(`✓ aggregate ranking built`);

  // 7. Build team ranking
  console.log("🏅 Building team ranking…");
  const teamRanking = buildTeamRanking(scraped, loader, athletesIndex, keyToCanonical);
  for (const [year, distances] of Object.entries(teamRanking)) {
    for (const [dist, teams] of Object.entries(distances)) {
      console.log(`   ${year} ${dist}: ${teams.length} teams scored`);
    }
  }
  console.log(`✓ team ranking built`);

  // 8. Build encrypted SQLite database
  await writeEncryptedDatabase(
    scraped, allResults, allParticipants, athletesIndex, nameToId,
    aggregateRanking, teamRanking, stats
  );

  console.log("\n✅ Done.");
}

(PARTICIPANTS_ONLY ? scrapeParticipants() : main()).catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
