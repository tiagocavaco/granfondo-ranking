import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

import BetterSqlite3 from "better-sqlite3";

import { fetchParticipants, fetchResults } from "./scrapers/stopandgo.js";
import {
  EXTERNAL_EVENTS,
  MANUAL_UPCOMING_EVENTS,
  scrapeFigueiraChampionsDay,
  scrapeAgitagueda,
  scrapeApedalar5Quinas,
  scrapeEtapaDaVolta,
  scrapeListaParticipants,
} from "./external.js";
import { isPast } from "./normalize.js";
import {
  extractDistances,
  assignGenderPositions,
  transformResult,
} from "./transform.js";
import { buildAthletesIndex } from "./pipeline/pipeline.js";
import { resolveParticipantAthleteIds } from "./pipeline/participants.js";
import { buildAggregateRanking, buildTeamRanking } from "./pipeline/ranking.js";
import {
  YEARS,
  DELAY_MS,
  DEFAULT_DISTANCES,
  LISTA_URLS,
} from "./config.js";
import { DATA_DIR, SCRAPED_EVENTS_PATH, DB_ENC_PATH } from "./paths.js";
import { normalizeName, teamNormalKey, teamKeySimilarity, initTeamAliases } from "./normalize.js";
import { buildDatabase, type AllScrapedData } from "@granfondo/database/db-writer";
import { encryptBuffer } from "./db/encrypt.js";
import { openSourceDb, closeSourceDb, loadResultsFromDb, loadIdStore, loadExistingEventIds, writeParticipantsToDb, loadTeamAliases, loadAthleteAliases, loadResultAssignments } from "./db/db-loader.js";
import { discoverGranfondos } from "./scrapers/stopandgo.js";
import type {
  StoredEvent,
  StoredEventResults,
  StoredDistanceResults,
  StoredParticipant,
  AthleteEntry,
  AggregateRanking,
  TeamRanking,
} from "@granfondo/database/types";
import type { ApiAthlete } from "./types.js";

// ── Config ────────────────────────────────────────────────────────────────────

// Load .env from scraper root if present (local dev). CI injects env vars directly.
{
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const envFile = path.join(__dirname, "..", ".env");
  if (fs.existsSync(envFile)) {
    for (const line of fs.readFileSync(envFile, "utf-8").split("\n")) {
      const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.+)$/);
      if (m) process.env[m[1]] ??= m[2].trim();
    }
  }
}

const FORCE = process.argv.includes("--force");
const PARTICIPANTS_ONLY = process.argv.includes("--participants");

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
    athleteId:  0,
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Used only for flag JSON files. */
function writeJson(filename: string, data: unknown) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(path.join(DATA_DIR, filename), JSON.stringify(data, null, 2), "utf-8");
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

// ── Database output ───────────────────────────────────────────────────────────

async function writeEncryptedDatabase(
  scraped: StoredEvent[],
  allResults: Map<number, StoredEventResults>,
  allParticipants: Map<number, StoredParticipant[]>,
  athletesIndex: Map<string, AthleteEntry>,
  nameToId: Record<string, number>,
  teamAliases: Record<string, string>,
  aggregateRanking: AggregateRanking,
  teamRanking: TeamRanking,
  stats: { uniqueAthletes: number; uniqueByYear: Record<string, number> },
  aliasRules: import("@granfondo/database/types").AthleteAliasRule[],
  assignments: import("@granfondo/database/types").ResultAssignment[],
  participantAthleteIds: Map<string, number>,
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
    teamAliases,
    aggregateRanking,
    teamRanking,
    stats,
    aliasRules,
    assignments,
    participantAthleteIds,
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

// ── Per-event scraping ────────────────────────────────────────────────────────

async function scrapeEvent(
  event: StoredEvent,
  scrapedEvents: Record<string, string>,
  sourceDb: BetterSqlite3.Database | null,
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

  const existingEventIds = loadExistingEventIds(sourceDb);

  const events = await discoverGranfondos();

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

  writeParticipantsToDb(sourceDb, updatedParticipants, existingEventIds);

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
  initTeamAliases(loadTeamAliases(sourceDb));

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

  // Load everything needed from source DB before closing it
  const idStore     = loadIdStore(sourceDb);
  const teamAliases = loadTeamAliases(sourceDb);
  const aliasRules  = loadAthleteAliases(sourceDb);
  const assignments = loadResultAssignments(sourceDb);

  // Source DB no longer needed — close before building new one
  closeSourceDb(sourceDb);

  const withResults = scraped.filter((e) => e.hasResults).length;
  console.log(`\n✓ ${scraped.length} events, ${withResults} with results`);

  // 4. Build athletes index
  console.log("🔨 Building athletes index…");
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

  // Add alias keys so participant registrations under alias names resolve to the canonical athlete
  for (const rule of aliasRules) {
    const canonKey = `${normalizeName(rule.name)}|${teamNormalKey(rule.canonicalTeam)}`;
    const canonId = nameToId[canonKey];
    if (canonId == null) continue;
    for (const alias of rule.aliases) {
      const aliasKey = `${normalizeName(alias.name)}|${teamNormalKey(alias.team)}`;
      if (!(aliasKey in nameToId)) nameToId[aliasKey] = canonId;
    }
  }

  const { ids: participantAthleteIds, linked: participantLinked } =
    resolveParticipantAthleteIds(nameToId, allParticipants);
  console.log(`  [lookup] ${participantLinked} participants resolved to athlete profiles`);

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
    teamAliases, aggregateRanking, teamRanking, stats, aliasRules, assignments,
    participantAthleteIds
  );

  console.log("\n✅ Done.");
}

(PARTICIPANTS_ONLY ? scrapeParticipants() : main()).catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
