import { eq, and, inArray, asc, max, sql } from "drizzle-orm";
import * as schema from "@granfondo/database/schema";
import { getDb } from "./db.js";
import type {
  StoredEventResults,
  StoredDistanceResults,
  StoredResult,
  StoredParticipant,
} from "@granfondo/database/types";

export async function getResults(id: number): Promise<StoredEventResults> {
  const db = await getDb();

  const eventRow = db
    .select()
    .from(schema.events)
    .where(eq(schema.events.id, id))
    .get();
  if (!eventRow) {
    throw new Error(`Event ${id} not found`);
  }

  const distRows = db
    .select({
      distanceId: schema.results.distanceId,
      distanceName: schema.results.distanceName,
      finisherCount: max(schema.results.finisherCount).as("finisher_count"),
    })
    .from(schema.results)
    .where(eq(schema.results.eventId, id))
    .groupBy(schema.results.distanceId, schema.results.distanceName)
    .orderBy(sql`CAST(${schema.results.distanceId} AS INTEGER)`)
    .all();

  const distances: StoredDistanceResults[] = [];

  for (const dist of distRows) {
    const resultRows = db
      .select()
      .from(schema.results)
      .where(
        and(
          eq(schema.results.eventId, id),
          eq(schema.results.distanceId, dist.distanceId),
        ),
      )
      .orderBy(
        sql`CASE WHEN ${schema.results.dnf} = 1 OR ${schema.results.dns} = 1 THEN 1 ELSE 0 END`,
        asc(schema.results.pos),
      )
      .all();

    const resultIds = resultRows.map((r) => r.id);
    const licenceRows =
      resultIds.length > 0
        ? db
            .select()
            .from(schema.resultLicences)
            .where(inArray(schema.resultLicences.resultId, resultIds))
            .all()
        : [];

    const licencesByResultId = new Map<number, string[]>();
    for (const lr of licenceRows) {
      if (!licencesByResultId.has(lr.resultId)) {
        licencesByResultId.set(lr.resultId, []);
      }
      licencesByResultId.get(lr.resultId)!.push(lr.licence);
    }

    const results: StoredResult[] = resultRows.map((r) => ({
      pos: r.pos,
      genderPos: r.genderPos,
      catPos: r.catPos,
      athleteId: r.athleteId,
      bib: r.bib,
      name: r.name,
      gender: r.gender,
      team: r.team,
      category: r.category,
      country: r.country,
      raceTime: r.raceTime,
      raceTimeSecs: r.raceTimeSecs,
      gap: r.gap,
      gapSecs: r.gapSecs,
      points: r.points,
      licences: licencesByResultId.get(r.id) ?? [],
      dnf: Boolean(r.dnf),
      dns: Boolean(r.dns),
    }));

    distances.push({
      id: dist.distanceId,
      name: dist.distanceName,
      finisherCount: dist.finisherCount ?? 0,
      results,
    });
  }

  return {
    eventId: eventRow.id,
    eventName: eventRow.name,
    eventDate: eventRow.date,
    eventYear: eventRow.year,
    scrapedAt: eventRow.scrapedAt ?? "",
    distances,
  };
}

export async function getParticipants(id: number): Promise<StoredParticipant[]> {
  const db = await getDb();
  const rows = db
    .select()
    .from(schema.participants)
    .where(eq(schema.participants.eventId, id))
    .orderBy(
      sql`CASE WHEN ${schema.participants.bib} = '' THEN 1 ELSE 0 END`,
      sql`CAST(${schema.participants.bib} AS INTEGER)`,
    )
    .all();
  return rows.map(({ id: _id, eventId: _eventId, ...rest }) => rest);
}
