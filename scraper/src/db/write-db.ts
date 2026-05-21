/**
 * write-db.ts
 *
 * Functions for persisting the scraped-events index and writing the encrypted
 * SQLite database that powers the frontend.
 */

import fs from "fs";

import BetterSqlite3 from "better-sqlite3";

import {
  buildDatabase,
  type AllScrapedData,
} from "@granfondo/database/db-writer";
import { encryptBuffer } from "./encrypt.js";
import {
  SCRAPED_EVENTS_PATH,
  DB_ENC_PATH,
  DATA_DIR,
  TMP_DB_PATH,
} from "../paths.js";

// ── Scraped-events index ──────────────────────────────────────────────────────

export function loadScrapedEvents(
  filePath = SCRAPED_EVENTS_PATH,
): Record<string, string> {
  if (!fs.existsSync(filePath)) {
    return {};
  }

  return JSON.parse(fs.readFileSync(filePath, "utf-8")) as Record<
    string,
    string
  >;
}

export function saveScrapedEvents(
  index: Record<string, string>,
  filePath = SCRAPED_EVENTS_PATH,
): void {
  fs.writeFileSync(filePath, JSON.stringify(index, null, 2), "utf-8");
}

// ── Database output ───────────────────────────────────────────────────────────

export async function writeEncryptedDatabase(
  data: AllScrapedData,
): Promise<void> {
  const keyHex = process.env.DATA_KEY;
  if (!keyHex) {
    console.warn("⚠️  DATA_KEY not set — skipping data.db.enc");
    return;
  }

  console.log("🗄  Building encrypted SQLite database…");

  const dbBuffer = buildDatabase(data);

  // Sanity-check the DB before encrypting — catch silent data-loss early
  const verifyPath = TMP_DB_PATH + ".verify";
  fs.writeFileSync(verifyPath, dbBuffer);
  const verifyDb = new BetterSqlite3(verifyPath);
  const counts = {
    athletes: (
      verifyDb.prepare("SELECT COUNT(*) AS n FROM athletes").get() as {
        n: number;
      }
    ).n,
    results: (
      verifyDb.prepare("SELECT COUNT(*) AS n FROM results").get() as {
        n: number;
      }
    ).n,
    participants: (
      verifyDb.prepare("SELECT COUNT(*) AS n FROM participants").get() as {
        n: number;
      }
    ).n,
  };
  verifyDb.close();
  try {
    fs.unlinkSync(verifyPath);
  } catch {}

  console.log(
    `   DB counts — athletes: ${counts.athletes}, results: ${counts.results}, participants: ${counts.participants}`,
  );
  const MINIMUMS = { athletes: 9_000, results: 25_000, participants: 0 };
  for (const [table, min] of Object.entries(MINIMUMS)) {
    if ((counts as Record<string, number>)[table] < min) {
      throw new Error(
        `Sanity check failed: ${table} has ${(counts as Record<string, number>)[table]} rows (expected ≥ ${min})`,
      );
    }
  }

  const encrypted = encryptBuffer(dbBuffer, keyHex);
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(DB_ENC_PATH, encrypted);
  console.log(
    `✓ data.db.enc — ${(encrypted.length / 1024 / 1024).toFixed(1)} MB`,
  );

  const scrapedEvents = loadScrapedEvents();
  const now = new Date().toISOString();
  for (const event of data.events.filter((e) => e.hasResults)) {
    scrapedEvents[String(event.id)] = event.scrapedAt ?? now;
  }

  saveScrapedEvents(scrapedEvents);
  console.log(
    `✓ scraped-events.json — ${Object.keys(scrapedEvents).length} stable events`,
  );
}
