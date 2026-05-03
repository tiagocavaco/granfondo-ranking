/**
 * participants-update.ts
 *
 * Lightweight scrape that refreshes participant lists for upcoming events in
 * the existing encrypted DB without running the full athlete pipeline.
 */

import fs from "fs";

import { openSourceDb, closeSourceDb, writeParticipantsToDb, loadExistingEventIds } from "../db/db-loader.js";
import { discoverGranfondos } from "../scrapers/stopandgo.js";
import { MANUAL_UPCOMING_EVENTS } from "../external.js";
import { LISTA_URLS } from "../config.js";
import { isPast } from "../normalize.js";
import { fetchEventParticipants, resolveDistances } from "./event-pipeline.js";
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
