/**
 * participants-update.ts
 *
 * Lightweight scrape that refreshes participant lists for upcoming events in
 * the existing encrypted DB without running the full athlete pipeline.
 */

import fs from "fs";

import { openSourceDb, closeSourceDb, writeParticipantsToDb, loadExistingEventIds, loadTeamAliases, loadTeamIdStore, loadIdStore } from "../db/db-loader.js";
import { discoverGranfondos } from "../scrapers/stopandgo.js";
import { MANUAL_UPCOMING_EVENTS } from "../external.js";
import { LISTA_URLS } from "../config.js";
import { isPast, initTeamAliases } from "../normalize.js";
import { fetchEventParticipants, resolveDistances } from "./event-pipeline.js";
import { resolveParticipantAthleteIds } from "./participants.js";
import { encryptBuffer } from "../db/encrypt.js";
import { DB_ENC_PATH, DATA_DIR } from "../paths.js";
import type { StoredEvent, StoredParticipant } from "@granfondo/database/types";

/**
 * Lightweight scrape that updates participant lists for upcoming events in the
 * existing encrypted DB without running the full athlete pipeline.
 */
export async function scrapeParticipants() {
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
  const teamAliases = loadTeamAliases(sourceDb);
  const teamIdStore = loadTeamIdStore(sourceDb);
  const nameToId = Object.fromEntries(loadIdStore(sourceDb)) as Record<string, number>;
  initTeamAliases(teamAliases);

  const events = await discoverGranfondos();

  // Load all team associations per athlete for pass-4 secondary-team matching
  const athleteAllTeamIds = new Map<number, number[]>();
  for (const { athlete_id, team_id } of sourceDb.prepare("SELECT athlete_id, team_id FROM athlete_teams").all() as Array<{ athlete_id: number; team_id: number }>) {
    if (!athleteAllTeamIds.has(athlete_id)) athleteAllTeamIds.set(athlete_id, []);
    athleteAllTeamIds.get(athlete_id)!.push(team_id);
  }

  // Load all known categories per athlete for pass-2 category-based disambiguation
  const athleteCategories = new Map<number, string[]>();
  for (const { athlete_id, category } of sourceDb.prepare("SELECT athlete_id, category FROM athlete_categories").all() as Array<{ athlete_id: number; category: string }>) {
    if (!athleteCategories.has(athlete_id)) athleteCategories.set(athlete_id, []);
    athleteCategories.get(athlete_id)!.push(category);
  }

  const updatedParticipants = new Map<number, { event: StoredEvent; athletes: StoredParticipant[] }>();
  const allParticipantsForResolution = new Map<number, Array<{ name: string; team: string; category: string }>>();

  for (const event of events) {
    if (!isPast(event.date)) {
      console.log(`⏳ [${event.id}] ${event.name}`);
      try {
        const athletes = await fetchEventParticipants(event.id);
        event.distances = resolveDistances(athletes, event.id);
        event.participantCount = athletes.length;
        updatedParticipants.set(event.id, { event, athletes });
        allParticipantsForResolution.set(event.id, athletes.map((a) => ({ name: a.name, team: a.team, category: a.category })));
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
        allParticipantsForResolution.set(event.id, athletes.map((a) => ({ name: a.name, team: a.team, category: a.category })));
        console.log(`  ⏳ ${athletes.length} confirmed`);
      } catch (err) {
        console.error(`  ✗ ${err}`);
      }
    }
  }

  // Resolve participant → athlete links using the existing athlete index
  const { ids: resolvedIds, linked, passes } = resolveParticipantAthleteIds(nameToId, allParticipantsForResolution, teamIdStore, teamAliases, athleteAllTeamIds, athleteCategories);
  console.log(`  [lookup] ${linked} participants resolved (p1:${passes[0]} exact, p2:${passes[1]} solo-unique, p3:${passes[2]} fuzzy-team, p4:${passes[3]} secondary-team, p5:${passes[4]} name-variant, p6:${passes[5]} unique-name)`);

  // Apply resolved athlete IDs back into the participant objects before writing
  for (const [eventId, { athletes }] of updatedParticipants) {
    for (const a of athletes) {
      const pKey = `${eventId}:${a.name}:${a.team}`;
      a.athleteId = resolvedIds.get(pKey) ?? 0;
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
