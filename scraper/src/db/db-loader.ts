/**
 * db-loader.ts
 *
 * Helpers for opening, reading from, and closing the encrypted source DB.
 * Used at scraper startup to seed athlete IDs and load cached results.
 */

import fs from "fs";

import BetterSqlite3 from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { eq, inArray } from "drizzle-orm";
import * as schema from "@granfondo/database/schema";

import { decryptBuffer } from "./encrypt.js";
import { DB_ENC_PATH, TMP_DB_PATH } from "../paths.js";
import type { AthleteIdStore } from "../pipeline/pipeline.js";
import type {
  StoredEvent,
  StoredEventResults,
  StoredDistanceResults,
  StoredParticipant,
  AthleteAliasRule,
  ResultAssignment,
} from "@granfondo/database/types";

export function openSourceDb(): BetterSqlite3.Database | null {
  if (!fs.existsSync(DB_ENC_PATH)) return null;
  const keyHex = process.env.DATA_KEY;
  if (!keyHex) return null;
  try {
    const enc = fs.readFileSync(DB_ENC_PATH);
    const plain = decryptBuffer(enc, keyHex);
    fs.writeFileSync(TMP_DB_PATH, plain);
    return new BetterSqlite3(TMP_DB_PATH);
  } catch (err) {
    console.warn("⚠️  Could not open source DB:", err);
    return null;
  }
}

export function closeSourceDb(db: BetterSqlite3.Database | null): void {
  db?.close();
  try { if (fs.existsSync(TMP_DB_PATH)) fs.unlinkSync(TMP_DB_PATH); } catch {}
}

/** Reconstruct StoredEventResults for one event from an open source DB. */
export function loadResultsFromDb(
  sourceDb: BetterSqlite3.Database,
  event: StoredEvent,
): StoredEventResults | null {
  const db = drizzle(sourceDb, { schema });

  const rows = db.select().from(schema.results)
    .where(eq(schema.results.eventId, event.id))
    .orderBy(schema.results.distanceId, schema.results.pos, schema.results.name)
    .all();

  if (rows.length === 0) return null;

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
      catPos:       row.catPos,
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

export function loadIdStore(sourceDb: BetterSqlite3.Database | null): AthleteIdStore {
  if (!sourceDb) return new Map();
  try {
    const rows = drizzle(sourceDb, { schema }).select().from(schema.athleteLookup).all();
    const result = new Map<string, number>();
    for (const r of rows) result.set(r.key, r.athleteId);
    return result;
  } catch {
    return new Map();
  }
}

export function loadExistingEventIds(sourceDb: BetterSqlite3.Database): Set<number> {
  const rows = drizzle(sourceDb, { schema }).select({ id: schema.events.id }).from(schema.events).all();
  return new Set(rows.map((r) => r.id));
}

export function writeParticipantsToDb(
  sourceDb: BetterSqlite3.Database,
  updates: Map<number, { event: StoredEvent; athletes: StoredParticipant[] }>,
  existingEventIds: Set<number>,
): void {
  const db = drizzle(sourceDb, { schema });
  sourceDb.transaction(() => {
    for (const [eventId, { event, athletes }] of updates) {
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
}

export function loadTeamAliases(sourceDb: BetterSqlite3.Database | null): Record<string, string> {
  if (!sourceDb) return {};
  try {
    const rows = drizzle(sourceDb, { schema }).select().from(schema.teamAliases).all();
    return Object.fromEntries(rows.map((r) => [r.aliasKey, r.canonicalKey]));
  } catch { return {}; }
}

export function loadAthleteAliases(sourceDb: BetterSqlite3.Database | null): AthleteAliasRule[] {
  if (!sourceDb) return [];
  try {
    return drizzle(sourceDb, { schema }).select().from(schema.athleteAliasRules).all().map((r) => ({
      name:          r.name,
      canonicalTeam: r.canonicalTeam,
      aliases:       JSON.parse(r.aliasesJson) as Array<{ name: string; team: string }>,
      note:          r.note ?? undefined,
    }));
  } catch { return []; }
}

export function loadResultAssignments(sourceDb: BetterSqlite3.Database | null): ResultAssignment[] {
  if (!sourceDb) return [];
  try {
    return drizzle(sourceDb, { schema }).select().from(schema.resultAssignments).all().map((r) => ({
      eventId:   r.eventId,
      bib:       r.bib,
      athleteId: r.athleteId,
      note:      r.note ?? undefined,
    }));
  } catch { return []; }
}
