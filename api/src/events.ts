import { eq, desc, sql } from "drizzle-orm";
import * as schema from "@granfondo/database/schema";
import { getDb } from "./db.js";
import type { StoredEvent } from "@granfondo/database/types";

export async function getEvents(): Promise<StoredEvent[]> {
  const db = await getDb();

  const eventRows = db
    .select()
    .from(schema.events)
    .orderBy(desc(schema.events.date))
    .all();

  const distRows = db
    .select()
    .from(schema.eventDistances)
    .orderBy(sql`CAST(${schema.eventDistances.id} AS INTEGER)`)
    .all();

  const distByEvent = new Map<number, Array<{ id: string; name: string }>>();
  for (const d of distRows) {
    if (!distByEvent.has(d.eventId)) {
      distByEvent.set(d.eventId, []);
    }
    distByEvent.get(d.eventId)!.push({ id: d.id, name: d.name });
  }

  return eventRows.map((e) => ({
    id: e.id,
    name: e.name,
    year: e.year,
    date: e.date,
    location: e.location,
    officialUrl: e.officialUrl,
    resultsUrl: e.resultsUrl,
    hasResults: Boolean(e.hasResults),
    distances: distByEvent.get(e.id) ?? [],
    participantCount: e.participantCount,
    finisherCount: e.finisherCount,
    scrapedAt: e.scrapedAt ?? null,
  }));
}

export async function getStats(): Promise<{
  uniqueAthletes: number;
  uniqueByYear: Record<string, number>;
  scrapedAt: string;
}> {
  const db = await getDb();
  const row = db
    .select({ value: schema.stats.value })
    .from(schema.stats)
    .where(eq(schema.stats.key, "stats_json"))
    .get();
  if (!row) {
    return { uniqueAthletes: 0, uniqueByYear: {}, scrapedAt: "" };
  }
  return JSON.parse(row.value) as {
    uniqueAthletes: number;
    uniqueByYear: Record<string, number>;
    scrapedAt: string;
  };
}
