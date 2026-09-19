/**
 * check-existing-team-aliases.ts
 *
 * Audits all applied team aliases in the DB to spot potentially bad merges.
 * For each alias pair (aliasKey → canonicalKey), checks whether the two sides
 * have athletes that race at any of the same events. No event overlap between
 * two active groups of athletes is the main red flag.
 *
 * Uses resolved athlete IDs (athlete_lookup + athlete_results) rather than raw
 * results.team strings so that alias chains are followed correctly — an athlete
 * whose results were merged into the canonical team via an existing alias will
 * have their events attributed to that team, not to the alias key alone.
 *
 * Usage:
 *   npm run db:check-team-aliases
 */

import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import BetterSqlite3 from "better-sqlite3";
import { decryptBuffer } from "../db/encrypt.js";
import { teamKeySimilarity } from "../normalize.js";

const encPath = path.resolve(
  import.meta.dirname,
  "../../../frontend/public/data/data.db.enc",
);

const keyHex = process.env.DATA_KEY;
if (!keyHex) {
  console.error("DATA_KEY not set");
  process.exit(1);
}

const tmpPath = path.join(os.tmpdir(), "granfondo_check_aliases.db");
const enc = fs.readFileSync(encPath);
fs.writeFileSync(tmpPath, decryptBuffer(enc, keyHex));
const db = new BetterSqlite3(tmpPath);

type TeamRow = { id: number; canonical_key: string; alias_keys: string };
type LookupRow = { key: string; athlete_id: number };
type AthleteResultRow = { athlete_id: number; event_id: number };
type EventRow = { id: number; name: string; year: number };

const teamRows = db
  .prepare(
    "SELECT id, canonical_key, alias_keys FROM teams WHERE alias_keys != '[]'",
  )
  .all() as TeamRow[];

// athlete_lookup: "name|teamId" → athlete_id
// Use this to find which athlete IDs belong to each team ID.
const lookupRows = db
  .prepare("SELECT key, athlete_id FROM athlete_lookup")
  .all() as LookupRow[];

// athlete_results: resolved event participation per athlete
const athleteResultRows = db
  .prepare("SELECT DISTINCT athlete_id, event_id FROM athlete_results")
  .all() as AthleteResultRow[];

const eventRows = db
  .prepare("SELECT id, name, year FROM events ORDER BY year DESC, id DESC")
  .all() as EventRow[];

db.close();
try {
  fs.unlinkSync(tmpPath);
} catch {}

const eventNameById = new Map<number, string>(
  eventRows.map((e) => [e.id, `${e.name} ${e.year}`]),
);

// team_id → set of resolved athlete_ids (from athlete_lookup)
const athletesByTeamId = new Map<number, Set<number>>();
for (const row of lookupRows) {
  const teamId = parseInt(row.key.split("|").at(-1)!, 10);
  if (isNaN(teamId) || teamId === 0) continue;
  let set = athletesByTeamId.get(teamId);
  if (!set) {
    set = new Set();
    athletesByTeamId.set(teamId, set);
  }
  set.add(row.athlete_id);
}

// athlete_id → set of event_ids (from resolved athlete_results)
const eventsByAthleteId = new Map<number, Set<number>>();
for (const row of athleteResultRows) {
  let set = eventsByAthleteId.get(row.athlete_id);
  if (!set) {
    set = new Set();
    eventsByAthleteId.set(row.athlete_id, set);
  }
  set.add(row.event_id);
}

// team_id → union of all event_ids across its athletes
function teamEventIds(teamId: number): Set<number> {
  const athletes = athletesByTeamId.get(teamId) ?? new Set<number>();
  const events = new Set<number>();
  for (const athleteId of athletes) {
    for (const eventId of eventsByAthleteId.get(athleteId) ?? []) {
      events.add(eventId);
    }
  }
  return events;
}

// canonical_key → team id (for alias-side lookups)
const teamIdByKey = new Map<string, number>(
  teamRows.map((t) => [t.canonical_key, t.id]),
);

// For each alias pair, audit the merge
type Audit = {
  alias: string;
  canonical: string;
  score: number;
  alias_athletes: number;
  canonical_athletes: number;
  shared_events: number;
  alias_events: string[];
  canonical_events: string[];
  flag: string;
};

const audits: Audit[] = [];

for (const team of teamRows) {
  const aliases: string[] = JSON.parse(team.alias_keys);
  const canonTeamId = team.id;
  const canonAthletesSet =
    athletesByTeamId.get(canonTeamId) ?? new Set<number>();
  const canonEventsSet = teamEventIds(canonTeamId);

  for (const aliasKey of aliases) {
    // After an alias is applied, athlete_lookup keys for the alias-side athletes
    // are rewritten to point to the canonical team ID. So aliasKey will no longer
    // appear in athlete_lookup — we need to look up its former team ID via teams table.
    const aliasTeamId = teamIdByKey.get(aliasKey);
    const aliasAthletesSet = aliasTeamId
      ? (athletesByTeamId.get(aliasTeamId) ?? new Set<number>())
      : new Set<number>();
    const aliasEventsSet = aliasTeamId
      ? teamEventIds(aliasTeamId)
      : new Set<number>();

    const sharedEvents = [...aliasEventsSet].filter((id) =>
      canonEventsSet.has(id),
    ).length;
    const similarity = teamKeySimilarity(aliasKey, team.canonical_key);

    // An alias with no distinct athlete_lookup entries on its own side means all its
    // athletes have already been merged into the canonical team ID — no separate
    // population to compare against. These are expected and should not be flagged.
    const aliasActive = aliasAthletesSet.size;
    const canonActive = canonAthletesSet.size;

    // Flag only when BOTH sides still have a distinct population of athletes
    // AND they show no event overlap. After a valid alias merge the alias side
    // will typically be empty (athletes rewritten to canonical) — if it's still
    // populated it means something may have gone wrong.
    const bothActive = aliasActive >= 2 && canonActive >= 2;
    const aliasEventCount = aliasEventsSet.size;

    if (!bothActive) continue;
    if (sharedEvents > 0) continue;
    if (aliasEventCount < 2) continue;

    const flags: string[] = [
      `alias=${aliasActive} athletes / ${aliasEventCount} events, canonical=${canonActive} athletes — no shared events`,
    ];
    if (similarity < 0.25) {
      flags.push(`low name similarity (${Math.round(similarity * 100)}%)`);
    }

    // Sample most recent events for each side
    const sampleAliasEvents: string[] = [];
    const sampleCanonEvents: string[] = [];
    for (const event of eventRows) {
      if (aliasEventsSet.has(event.id) && sampleAliasEvents.length < 3) {
        sampleAliasEvents.push(eventNameById.get(event.id)!);
      }
      if (canonEventsSet.has(event.id) && sampleCanonEvents.length < 3) {
        sampleCanonEvents.push(eventNameById.get(event.id)!);
      }
      if (sampleAliasEvents.length >= 3 && sampleCanonEvents.length >= 3) break;
    }

    audits.push({
      alias: aliasKey,
      canonical: team.canonical_key,
      score: Math.round(similarity * 100) / 100,
      alias_athletes: aliasAthletesSet.size,
      canonical_athletes: canonAthletesSet.size,
      shared_events: sharedEvents,
      alias_events: sampleAliasEvents,
      canonical_events: sampleCanonEvents,
      flag: flags.join("; "),
    });
  }
}

// Sort by most suspicious: lowest event overlap first, then lowest name similarity
audits.sort((x, y) => x.shared_events - y.shared_events || x.score - y.score);

if (audits.length === 0) {
  console.log("✓ All applied aliases look clean — no flags raised.");
  process.exit(0);
}

console.log(`⚠  ${audits.length} alias(es) flagged for review:\n`);
for (const audit of audits) {
  console.log(`  "${audit.alias}" → "${audit.canonical}"`);
  console.log(`    flag: ${audit.flag}`);
  console.log(
    `    athletes: alias=${audit.alias_athletes}, canonical=${audit.canonical_athletes}`,
  );
  if (audit.alias_events.length > 0) {
    console.log(`    alias races:     ${audit.alias_events.join(" | ")}`);
  }
  if (audit.canonical_events.length > 0) {
    console.log(`    canonical races: ${audit.canonical_events.join(" | ")}`);
  }
  console.log();
}
