import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

import {
  EXTERNAL_EVENTS,
  MANUAL_UPCOMING_EVENTS,
  scrapeFigueiraChampionsDay,
  scrapeAgitagueda,
  scrapeApedalar5Quinas,
  scrapeApedalar5Quinas2026,
  scrapePortoGaiaGranfondo2023,
  scrapePortoGaiaGranfondo2024,
} from "./external.js";
import { isPast } from "./normalize.js";
import {
  assignGenderPositions,
  assignCategoryPositions,
  computeGaps,
} from "./transform.js";
import { buildAthletesIndex } from "./pipeline/results/results.js";
import { injectAthleteIds } from "./inject.js";
import { resolveParticipantAthleteIds } from "./pipeline/participants/participants.js";
import { buildAggregateRanking, buildTeamRanking } from "./pipeline/ranking.js";
import {
  YEARS,
  LISTA_URLS,
  REGISTRATIONS_URLS,
  APEDALAR_PARTICIPANT_URLS,
  EXCLUDED_EVENT_IDS,
  normalizeEventName,
} from "./config.js";
import { DATA_DIR, FLAGS_DIR, EVENT_SCHEDULE_PATH } from "./paths.js";
import { normalizeName, teamNormalKey, isSoloTeam } from "./normalize.js";
import {
  openSourceDb,
  closeSourceDb,
  loadResultsFromDb,
  loadIdStore,
  loadTeamAliases,
  loadAthleteAliases,
  loadResultAssignments,
  loadTeamIdStore,
} from "./db/db-loader.js";
import { discoverGranfondos } from "./scrapers/stopandgo.js";
import { loadScrapedEvents, writeEncryptedDatabase } from "./db/write-db.js";
import {
  fetchEventParticipants,
  resolveDistances,
  scrapeEvent,
} from "./pipeline/events.js";
import { scrapeParticipants } from "./pipeline/participants/participants-refresh.js";
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
      if (m) {
        process.env[m[1]] ??= m[2].trim();
      }
    }
  }
}

const FORCE = process.argv.includes("--force");
const PARTICIPANTS_ONLY = process.argv.includes("--participants");

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Used only for flag JSON files. */
function writeJson(filename: string, data: unknown) {
  fs.mkdirSync(FLAGS_DIR, { recursive: true });
  fs.writeFileSync(
    path.join(FLAGS_DIR, filename),
    JSON.stringify(data, null, 2),
    "utf-8",
  );
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

  // Warn if any manual upcoming event is now covered by a discovered StopAndGo event
  const discoveredDates = new Set(events.map((event) => event.date));
  for (const manual of MANUAL_UPCOMING_EVENTS) {
    if (discoveredDates.has(manual.date)) {
      const match = events.find((event) => event.date === manual.date);
      console.warn(
        `⚠️  Manual upcoming event [${manual.id}] "${manual.name}" (${manual.date}) is now covered by StopAndGo [${match!.id}] "${match!.name}" — remove it from MANUAL_UPCOMING_EVENTS`,
      );
    }
  }

  // 2. Scrape each StopAndGo event
  const scraped: StoredEvent[] = [];
  const allResults = new Map<number, StoredEventResults>();
  const allParticipants = new Map<number, StoredParticipant[]>();

  for (const event of events.filter((e) => !EXCLUDED_EVENT_IDS.has(e.id))) {
    const past = isPast(event.date);
    console.log(`${past ? "✅" : "⏳"} [${event.id}] ${event.name}`);
    const result = await scrapeEvent(event, scrapedEvents, sourceDb, FORCE);
    scraped.push(result.event);
    if (result.results) {
      allResults.set(result.event.id, result.results);
    }

    if (result.participants) {
      allParticipants.set(result.event.id, result.participants);
    }
  }

  // 3. Scrape external platform events
  console.log("\n🌐 Scraping external platform events…");
  const externalScraperFns = new Map<number, () => Promise<StoredEventResults>>(
    [
      [90001, scrapeFigueiraChampionsDay],
      [90002, scrapeAgitagueda],
      [90003, scrapeApedalar5Quinas],
      [90012, scrapeApedalar5Quinas2026],
      [90005, scrapePortoGaiaGranfondo2023],
      [90004, scrapePortoGaiaGranfondo2024],
    ],
  );
  const externalScrapers = EXTERNAL_EVENTS.map((event) => ({
    event,
    fn: externalScraperFns.get(event.id),
  })).filter(
    (e): e is { event: StoredEvent; fn: () => Promise<StoredEventResults> } =>
      !!e.fn,
  );

  for (const { event, fn } of externalScrapers) {
    console.log(`✅ [${event.id}] ${event.name}`);
    const isStable =
      !FORCE && String(event.id) in scrapedEvents && sourceDb !== null;

    if (isStable) {
      const cached = loadResultsFromDb(sourceDb, event);
      if (cached) {
        event.hasResults = true;
        event.finisherCount = cached.distances.reduce(
          (s, d) => s + d.finisherCount,
          0,
        );
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
      event.finisherCount = results.distances.reduce(
        (s, d) => s + d.finisherCount,
        0,
      );
      event.scrapedAt = results.scrapedAt;
      allResults.set(event.id, results);
      console.log(
        `  ✓ ${results.distances.map((d) => `${d.name}: ${d.finisherCount}`).join(", ")}`,
      );
      if (sourceDb) {
        const prev =
          (
            sourceDb
              .prepare("SELECT finisher_count FROM events WHERE id = ?")
              .get(event.id) as { finisher_count: number } | undefined
          )?.finisher_count ?? 0;
        if (prev > 0 && event.finisherCount < prev * 0.5) {
          console.warn(
            `⚠️  Regression: ${event.name} finishers dropped ${prev} → ${event.finisherCount} (>${Math.round((1 - event.finisherCount / prev) * 100)}% drop)`,
          );
        }
      }
    } catch (err) {
      console.error(`  ✗ ${err}`);
    }

    scraped.push(event);
  }

  // 3b. Add manual upcoming events (no StopAndGo ID yet) + fetch their participants
  for (const event of MANUAL_UPCOMING_EVENTS) {
    console.log(`⏳ [${event.id}] ${event.name}`);
    if (
      LISTA_URLS[event.id] ||
      REGISTRATIONS_URLS[event.id] ||
      APEDALAR_PARTICIPANT_URLS[event.id]
    ) {
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
  const idStore = loadIdStore(sourceDb);
  const teamAliases = loadTeamAliases(sourceDb);
  const aliasRules = loadAthleteAliases(sourceDb);
  const assignments = loadResultAssignments(sourceDb);
  const teamIdStore = loadTeamIdStore(sourceDb);

  // Source DB no longer needed — close before building new one
  closeSourceDb(sourceDb);

  const withResults = scraped.filter((e) => e.hasResults).length;
  console.log(`\n✓ ${scraped.length} events, ${withResults} with results`);

  // Normalise event names and fill missing gaps — applied to all events including
  // cached ones so the DB is consistent regardless of which events were re-scraped.
  for (const event of scraped) {
    event.name = normalizeEventName(event.id, event.name);
  }

  for (const [eventId, evResults] of allResults) {
    evResults.eventName = normalizeEventName(eventId, evResults.eventName);
    computeGaps(evResults.distances);
  }

  // Write event schedule for CI window checks (plain JSON — no PII, just dates).
  // Written after name normalization so names match what's stored in the DB.
  // Only include events from yesterday onward — older ones never match any check window.
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const cutoffDate = yesterday.toISOString().slice(0, 10);
  const schedule = scraped
    .filter((event) => event.date >= cutoffDate)
    .map((event) => ({ id: event.id, name: event.name, date: event.date }));
  fs.writeFileSync(
    EVENT_SCHEDULE_PATH,
    JSON.stringify(schedule, null, 2) + "\n",
    "utf-8",
  );

  // 4. Build athletes index
  console.log("🔨 Building athletes index…");
  const loader = (id: number) => allResults.get(id) ?? null;

  // Extend teamIdStore with IDs for teams not yet in the DB so the pipeline has
  // stable numeric IDs for all teams it will encounter (new teams get fresh IDs
  // continuing from the current max; the db-writer receives the same store).
  const extendedTeamIdStore = new Map(teamIdStore);
  {
    const maxId = teamIdStore.size > 0 ? Math.max(...teamIdStore.values()) : 0;
    let nextTeamId = maxId + 1;
    for (const [, results] of allResults) {
      for (const dist of results.distances) {
        for (const r of dist.results) {
          if (!isSoloTeam(r.team)) {
            const canonKey = teamNormalKey(r.team);
            if (canonKey && !extendedTeamIdStore.has(canonKey)) {
              extendedTeamIdStore.set(canonKey, nextTeamId++);
            }
          }
        }
      }
    }
  }

  const {
    index: athletesIndex,
    updatedIdStore,
    soloFlags,
    crossPassFlags,
  } = buildAthletesIndex(
    scraped,
    loader,
    aliasRules,
    assignments,
    idStore,
    extendedTeamIdStore,
  );

  const manualSoloFlags = soloFlags.filter(
    (f) => f.resolution === "flagged_manual",
  );
  writeJson("solo-flags.json", manualSoloFlags);
  if (manualSoloFlags.length > 0) {
    console.warn(
      `⚠️  ${manualSoloFlags.length} solo collision(s) require manual review — see scraper/solo-flags.json`,
    );
  } else {
    console.log(`✓ solo-flags.json — no unresolved collisions`);
  }

  writeJson("cross-pass-flags.json", crossPassFlags);
  if (crossPassFlags.length > 0) {
    console.warn(
      `⚠️  ${crossPassFlags.length} cross-pass merge(s) require manual review — see scraper/cross-pass-flags.json`,
    );
  } else {
    console.log(`✓ cross-pass-flags.json — no ambiguous merges`);
  }

  // Build alias → canonical key map
  const idToCanonicalKey = new Map<number, string>();
  for (const [key, entry] of athletesIndex) {
    idToCanonicalKey.set(entry.id, key);
  }

  const keyToCanonical = new Map<string, string>();
  for (const [key, id] of updatedIdStore) {
    const canon = idToCanonicalKey.get(id);
    if (canon && canon !== key) {
      keyToCanonical.set(key, canon);
    }
  }

  // 5. Inject athlete IDs into in-memory results
  console.log("🔑 Injecting athlete IDs into results…");
  const injectedEvents = injectAthleteIds(athletesIndex, allResults);
  console.log(`✓ updated ${injectedEvents} event result(s)`);

  // Build name-to-id lookup
  const nameToId: Record<string, number> = {};
  for (const [key, id] of updatedIdStore) {
    nameToId[key] = id;
  }

  for (const [key, entry] of athletesIndex) {
    nameToId[key] = entry.id;
  }

  // Add alias keys so participant registrations under alias names resolve to the canonical athlete
  for (const rule of aliasRules) {
    const canonTeamId =
      extendedTeamIdStore.get(teamNormalKey(rule.canonicalTeam)) ?? 0;
    const canonKey = `${normalizeName(rule.name)}|${canonTeamId}`;
    const canonId = nameToId[canonKey];
    if (canonId == null) {
      continue;
    }

    for (const alias of rule.aliases) {
      const aliasTeamId =
        extendedTeamIdStore.get(teamNormalKey(alias.team)) ?? 0;
      const aliasKey = `${normalizeName(alias.name)}|${aliasTeamId}`;
      if (!(aliasKey in nameToId)) {
        nameToId[aliasKey] = canonId;
      }
    }
  }

  // Build athleteId → all team IDs for pass-4 secondary-team matching
  const athleteAllTeamIds = new Map<number, number[]>();
  for (const [, entry] of athletesIndex) {
    const teamIds = entry.teams
      .map((teamKey) => extendedTeamIdStore.get(teamKey) ?? 0)
      .filter((id) => id > 0);
    if (teamIds.length > 0) {
      athleteAllTeamIds.set(entry.id, teamIds);
    }
  }

  // Build athleteId → all known categories for pass-2 category-based disambiguation
  const athleteCategories = new Map<number, string[]>();
  for (const [, entry] of athletesIndex) {
    const cats = Object.values(entry.categories ?? {}).flat();
    if (cats.length > 0) {
      athleteCategories.set(entry.id, cats);
    }
  }

  const {
    ids: participantAthleteIds,
    linked: participantLinked,
    passes: participantPasses,
  } = resolveParticipantAthleteIds(
    nameToId,
    allParticipants,
    extendedTeamIdStore,
    teamAliases,
    athleteAllTeamIds,
    athleteCategories,
  );
  console.log(
    `  [lookup] ${participantLinked} participants resolved (p1:${participantPasses[0]} exact, p2:${participantPasses[1]} solo-unique, p3:${participantPasses[2]} fuzzy-team, p4:${participantPasses[3]} secondary-team, p5:${participantPasses[4]} name-variant, p6:${participantPasses[5]} unique-name)`,
  );

  const athletesArray = Array.from(athletesIndex.values()).sort((a, b) =>
    a.nameLower.localeCompare(b.nameLower),
  );
  console.log(`✓ ${athletesArray.length} athletes indexed`);

  const uniqueByYear: Record<string, number> = {};
  for (const year of YEARS) {
    uniqueByYear[String(year)] = athletesArray.filter((a) =>
      a.results.some((r) => r.eventYear === year),
    ).length;
  }

  const stats = {
    uniqueAthletes: athletesArray.filter((a) => a.results.length > 0).length,
    uniqueByYear,
    scrapedAt: new Date().toISOString(),
  };

  // 6. Build aggregate ranking
  console.log("🏆 Building aggregate ranking…");
  const aggregateRanking = buildAggregateRanking(
    scraped,
    loader,
    athletesIndex,
    keyToCanonical,
    extendedTeamIdStore,
  );
  for (const [year, distances] of Object.entries(aggregateRanking)) {
    for (const [dist, genders] of Object.entries(distances)) {
      for (const [gender, athletes] of Object.entries(genders)) {
        console.log(
          `   ${year} ${dist} ${gender}: ${athletes.length} athletes scored`,
        );
      }
    }
  }

  console.log(`✓ aggregate ranking built`);

  // 7. Build team ranking
  console.log("🏅 Building team ranking…");
  const teamRanking = buildTeamRanking(
    scraped,
    loader,
    athletesIndex,
    keyToCanonical,
    extendedTeamIdStore,
  );
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
    teamIdStore: extendedTeamIdStore,
  });

  console.log("\n✅ Done.");
}

(PARTICIPANTS_ONLY ? scrapeParticipants() : main()).catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
