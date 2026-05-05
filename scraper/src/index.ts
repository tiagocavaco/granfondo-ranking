import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

import {
  EXTERNAL_EVENTS,
  MANUAL_UPCOMING_EVENTS,
  scrapeFigueiraChampionsDay,
  scrapeAgitagueda,
  scrapeApedalar5Quinas,
  scrapeEtapaDaVolta,
} from "./external.js";
import { isPast } from "./normalize.js";
import {
  assignGenderPositions,
  assignCategoryPositions,
} from "./transform.js";
import { buildAthletesIndex } from "./pipeline/pipeline.js";
import { injectAthleteIds } from "./pipeline/inject.js";
import { resolveParticipantAthleteIds } from "./pipeline/participants.js";
import { buildAggregateRanking, buildTeamRanking } from "./pipeline/ranking.js";
import { YEARS, LISTA_URLS, REGISTRATIONS_URLS, APEDALAR_PARTICIPANT_URLS } from "./config.js";
import { DATA_DIR } from "./paths.js";
import { normalizeName, teamNormalKey } from "./normalize.js";
import { openSourceDb, closeSourceDb, loadResultsFromDb, loadIdStore, loadTeamAliases, loadAthleteAliases, loadResultAssignments, loadTeamIdStore } from "./db/db-loader.js";
import { discoverGranfondos } from "./scrapers/stopandgo.js";
import { loadScrapedEvents, writeEncryptedDatabase } from "./db/write-db.js";
import { type ScrapeResult, fetchEventParticipants, resolveDistances, scrapeEvent } from "./pipeline/event-pipeline.js";
import { scrapeParticipants } from "./pipeline/participants-update.js";
import { initTeamAliases } from "./normalize.js";
import type {
  StoredEvent,
  StoredEventResults,
  StoredParticipant,
} from "@granfondo/database/types";

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

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Used only for flag JSON files. */
function writeJson(filename: string, data: unknown) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(path.join(DATA_DIR, filename), JSON.stringify(data, null, 2), "utf-8");
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
    const result = await scrapeEvent(event, scrapedEvents, sourceDb, FORCE);
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
      assignCategoryPositions(results.distances);
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

  // 3b. Add manual upcoming events (no StopAndGo ID yet) + fetch their participants
  for (const event of MANUAL_UPCOMING_EVENTS) {
    console.log(`⏳ [${event.id}] ${event.name}`);
    if (LISTA_URLS[event.id] || REGISTRATIONS_URLS[event.id] || APEDALAR_PARTICIPANT_URLS[event.id]) {
      try {
        const athletes = await fetchEventParticipants(event.id);
        event.distances = resolveDistances(athletes, event.id);
        event.participantCount = athletes.length;
        allParticipants.set(event.id, athletes);
        console.log(`  ⏳ ${athletes.length} confirmed`);
      } catch (err) {
        console.error(`  ✗ ${err}`);
      }
    }
    scraped.push(event);
  }

  // Load everything needed from source DB before closing it
  const idStore     = loadIdStore(sourceDb);
  const teamAliases = loadTeamAliases(sourceDb);
  const aliasRules  = loadAthleteAliases(sourceDb);
  const assignments = loadResultAssignments(sourceDb);
  const teamIdStore = loadTeamIdStore(sourceDb);

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
  console.log("🔑 Injecting athlete IDs into results…");
  const injectedEvents = injectAthleteIds(athletesIndex, allResults);
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
  await writeEncryptedDatabase({
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
    teamIdStore,
  });

  console.log("\n✅ Done.");
}

(PARTICIPANTS_ONLY ? scrapeParticipants() : main()).catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
