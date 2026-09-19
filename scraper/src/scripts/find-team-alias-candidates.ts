/**
 * find-team-alias-candidates.ts
 *
 * Finds team name pairs that are likely the same club, combining two signals:
 *
 * Signal A — Athlete overlap (highest confidence):
 *   Athletes who raced under exactly two team IDs are ground-truth evidence
 *   those teams represent the same club. Emits the pair regardless of name
 *   similarity if ≥ 3 athletes share both teams, or if similarity ≥ 0.45.
 *
 * Signal B — Name similarity (catches variants with no shared athletes yet):
 *   1. Token Jaccard ≥ 0.6 — suffix/reorder variants, containment
 *   2. Compact trigram similarity ≥ 0.60 — typos, word-split/merge
 *   3. Compact equality after stripping separators — spacing-only diffs
 *   Requires ≥ 1 shared distinctive token to suppress generic-word collisions.
 *
 * Both signals are cross-checked with event overlap: events each team competed
 * at are sampled to help spot geographic mismatches (e.g. Alentejo vs Minho clubs
 * with similar acronyms).
 *
 * Usage:
 *   npm run db:find-team-aliases
 *
 * Review format:
 *   { "from": "...", "to": "...", "score": 0.85,
 *     "shared_athletes": 3, "athlete_names": [...],
 *     "shared_events": 2, "from_events": [...], "to_events": [...],
 *     "approved": null }
 *   Set approved: true  → run `npm run db:apply-team-aliases`
 *   Set approved: false → skip (persisted in rejected-team-aliases.json)
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
const outPath = path.resolve(
  import.meta.dirname,
  "../../team-alias-candidates.json",
);
const rejectedPath = path.resolve(
  import.meta.dirname,
  "../../rejected-team-aliases.json",
);

const keyHex = process.env.DATA_KEY;
if (!keyHex) {
  console.error("DATA_KEY not set");
  process.exit(1);
}

// ── Load DB ───────────────────────────────────────────────────────────────────

const tmpPath = path.join(os.tmpdir(), "granfondo_find_aliases.db");
const enc = fs.readFileSync(encPath);
fs.writeFileSync(tmpPath, decryptBuffer(enc, keyHex));
const db = new BetterSqlite3(tmpPath);

type TeamRow = { id: number; canonical_key: string; alias_keys: string };
type AthleteTeamRow = { athlete_id: number; team_id: number };
type AthleteRow = { id: number; name: string };
type ResultRow = { athlete_id: number; event_id: number };
type EventRow = { id: number; name: string; year: number };

const teamRows = db
  .prepare("SELECT id, canonical_key, alias_keys FROM teams")
  .all() as TeamRow[];
const athleteTeamRows = db
  .prepare("SELECT athlete_id, team_id FROM athlete_teams WHERE team_id != 0")
  .all() as AthleteTeamRow[];
const athleteRows = db
  .prepare("SELECT id, name FROM athletes")
  .all() as AthleteRow[];
const resultRows = db
  .prepare("SELECT DISTINCT athlete_id, event_id FROM results")
  .all() as ResultRow[];
const eventRows = db
  .prepare("SELECT id, name, year FROM events ORDER BY year DESC, id DESC")
  .all() as EventRow[];

db.close();
try {
  fs.unlinkSync(tmpPath);
} catch {}

// ── Build lookup maps ─────────────────────────────────────────────────────────

const teamById = new Map<number, TeamRow>(teamRows.map((t) => [t.id, t]));
const athleteNameById = new Map<number, string>(
  athleteRows.map((a) => [a.id, a.name]),
);
const eventNameById = new Map<number, string>(
  eventRows.map((e) => [e.id, `${e.name} ${e.year}`]),
);

// Already-aliased pairs — skip so we don't re-emit applied aliases
const aliasedPairs = new Set<string>();
const existingAliasKeys = new Set<string>(); // all keys that are aliases (not canonical)
for (const team of teamRows) {
  const aliases = JSON.parse(team.alias_keys) as string[];
  for (const alias of aliases) {
    existingAliasKeys.add(alias);
    const pairKey = [team.canonical_key, alias].sort().join("|||");
    aliasedPairs.add(pairKey);
  }
}

// team_id → set of athlete_ids
const athletesByTeam = new Map<number, Set<number>>();
for (const row of athleteTeamRows) {
  let set = athletesByTeam.get(row.team_id);
  if (!set) {
    set = new Set();
    athletesByTeam.set(row.team_id, set);
  }
  set.add(row.athlete_id);
}

// team_id → set of event_ids (via athlete → results)
const athleteEventIds = new Map<number, Set<number>>();
for (const row of resultRows) {
  if (!athleteEventIds.has(row.athlete_id)) {
    athleteEventIds.set(row.athlete_id, new Set());
  }
  athleteEventIds.get(row.athlete_id)!.add(row.event_id);
}

function teamEventIds(teamId: number): Set<number> {
  const athletes = athletesByTeam.get(teamId);
  if (!athletes) return new Set();
  const events = new Set<number>();
  for (const athleteId of athletes) {
    for (const eventId of athleteEventIds.get(athleteId) ?? []) {
      events.add(eventId);
    }
  }
  return events;
}

// Sample up to N most recent event names for a team (events already ordered DESC)
function sampleEvents(teamId: number, limit = 4): string[] {
  const eventIds = teamEventIds(teamId);
  const names: string[] = [];
  for (const event of eventRows) {
    if (eventIds.has(event.id)) {
      names.push(`${event.name} ${event.year}`);
      if (names.length >= limit) break;
    }
  }
  return names;
}

// ── Candidate type ─────────────────────────────────────────────────────────────

type Candidate = {
  from: string;
  to: string;
  score: number;
  shared_athletes: number;
  athlete_names: string[];
  shared_events: number;
  from_events: string[];
  to_events: string[];
  approved: null | boolean;
};

// ── Signal A: athlete overlap ──────────────────────────────────────────────────

// For athletes with exactly 2 team IDs, record evidence for that team pair.
const teamIdsByAthlete = new Map<number, Set<number>>();
for (const row of athleteTeamRows) {
  let set = teamIdsByAthlete.get(row.athlete_id);
  if (!set) {
    set = new Set();
    teamIdsByAthlete.set(row.athlete_id, set);
  }
  set.add(row.team_id);
}

const pairEvidence = new Map<string, number[]>(); // pairKey → athleteIds
for (const [athleteId, teamIds] of teamIdsByAthlete) {
  if (teamIds.size !== 2) continue;
  const [idA, idB] = [...teamIds].sort((x, y) => x - y) as [number, number];
  const pairKey = `${idA}|${idB}`;
  let list = pairEvidence.get(pairKey);
  if (!list) {
    list = [];
    pairEvidence.set(pairKey, list);
  }
  list.push(athleteId);
}

const athleteAnchoredCandidates = new Map<string, Candidate>();

for (const [pairKey, sharedAthleteIds] of pairEvidence) {
  const [strA, strB] = pairKey.split("|") as [string, string];
  const teamA = teamById.get(parseInt(strA, 10));
  const teamB = teamById.get(parseInt(strB, 10));
  if (!teamA || !teamB) continue;

  const keyA = teamA.canonical_key;
  const keyB = teamB.canonical_key;
  if (!keyA || !keyB || keyA === keyB) continue;

  const pairNorm = [keyA, keyB].sort().join("|||");
  if (aliasedPairs.has(pairNorm)) continue;

  const similarity = teamKeySimilarity(keyA, keyB);
  const sharedCount = sharedAthleteIds.length;
  if (similarity < 0.45 && sharedCount < 3) continue;

  const sizeA = athletesByTeam.get(teamA.id)?.size ?? 0;
  const sizeB = athletesByTeam.get(teamB.id)?.size ?? 0;
  const [fromKey, toKey, fromId, toId] =
    sizeA <= sizeB
      ? [keyA, keyB, teamA.id, teamB.id]
      : [keyB, keyA, teamB.id, teamA.id];

  const fromEvents = teamEventIds(fromId);
  const toEvents = teamEventIds(toId);
  const sharedEventCount = [...fromEvents].filter((id) =>
    toEvents.has(id),
  ).length;

  athleteAnchoredCandidates.set(pairNorm, {
    from: fromKey,
    to: toKey,
    score: Math.round(similarity * 100) / 100,
    shared_athletes: sharedCount,
    athlete_names: sharedAthleteIds
      .map((id) => athleteNameById.get(id) ?? `athlete#${id}`)
      .sort(),
    shared_events: sharedEventCount,
    from_events: sampleEvents(fromId),
    to_events: sampleEvents(toId),
    approved: null,
  });
}

// ── Signal B: name similarity ──────────────────────────────────────────────────

const allKeys = teamRows
  .map((t) => t.canonical_key)
  .filter((k) => k && k.length >= 3 && !existingAliasKeys.has(k));

const stripSeps = (s: string) => s.replace(/[\s\-\/\.]/g, "");

function significantTokens(s: string): string[] {
  return s.split(" ").filter((t) => t.length >= 3);
}

function trigramSet(s: string): Set<string> {
  const result = new Set<string>();
  for (let i = 0; i <= s.length - 3; i++) result.add(s.slice(i, i + 3));
  return result;
}

function trigramSimilarity(a: string, b: string): number {
  if (Math.abs(a.length - b.length) / Math.max(a.length, b.length) > 0.6)
    return 0;
  const ta = trigramSet(a);
  const tb = trigramSet(b);
  let intersection = 0;
  for (const t of ta) {
    if (tb.has(t)) intersection++;
  }
  const union = ta.size + tb.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

const tokenFreq = new Map<string, number>();
for (const key of allKeys) {
  for (const tok of new Set(significantTokens(key))) {
    tokenFreq.set(tok, (tokenFreq.get(tok) ?? 0) + 1);
  }
}
const maxCommonFreq = Math.ceil(allKeys.length * 0.05);
const maxDistinctiveFreq = Math.ceil(allKeys.length * 0.005);
const commonTokens = new Set(
  [...tokenFreq.entries()]
    .filter(([, freq]) => freq > maxCommonFreq)
    .map(([tok]) => tok),
);
const isDistinctive = (tok: string) =>
  (tokenFreq.get(tok) ?? 0) <= maxDistinctiveFreq;
const rareTokens = (s: string) =>
  significantTokens(s).filter((t) => !commonTokens.has(t));

// Indexes
const tokenIndex = new Map<string, string[]>();
for (const key of allKeys) {
  for (const tok of rareTokens(key)) {
    if (!tokenIndex.has(tok)) tokenIndex.set(tok, []);
    tokenIndex.get(tok)!.push(key);
  }
}
const strippedIndex = new Map<string, string[]>();
for (const key of allKeys) {
  const stripped = stripSeps(key);
  if (stripped.length >= 4) {
    if (!strippedIndex.has(stripped)) strippedIndex.set(stripped, []);
    strippedIndex.get(stripped)!.push(key);
  }
}
const fourgram = (s: string) => {
  const result: string[] = [];
  for (let i = 0; i <= s.length - 4; i++) result.push(s.slice(i, i + 4));
  return result;
};
const fourgramIndex = new Map<string, string[]>();
for (const key of allKeys) {
  const compact = stripSeps(key);
  if (compact.length < 6) continue;
  const seen4 = new Set<string>();
  for (const gram of fourgram(compact)) {
    if (seen4.has(gram)) continue;
    seen4.add(gram);
    if (!fourgramIndex.has(gram)) fourgramIndex.set(gram, []);
    fourgramIndex.get(gram)!.push(key);
  }
}

// Team key → team ID (for event cross-check on name-only candidates)
const teamIdByKey = new Map<number, number>(teamRows.map((t) => [t.id, t.id]));
const keyToTeamId = new Map<string, number>(
  teamRows.map((t) => [t.canonical_key, t.id]),
);

const seenNamePairs = new Set<string>();
const nameSimilarityCandidates: Candidate[] = [];

function emitNamePair(a: string, b: string, score: number) {
  if (a === b) return;
  const pairNorm = [a, b].sort().join("|||");
  if (seenNamePairs.has(pairNorm)) return;
  seenNamePairs.add(pairNorm);
  if (aliasedPairs.has(pairNorm)) return;
  if (athleteAnchoredCandidates.has(pairNorm)) return; // already captured by signal A

  const teamIdA = keyToTeamId.get(a);
  const teamIdB = keyToTeamId.get(b);
  const sizeA =
    teamIdA !== undefined ? (athletesByTeam.get(teamIdA)?.size ?? 0) : 0;
  const sizeB =
    teamIdB !== undefined ? (athletesByTeam.get(teamIdB)?.size ?? 0) : 0;
  const [fromKey, toKey, fromId, toId] =
    sizeA <= sizeB ? [a, b, teamIdA, teamIdB] : [b, a, teamIdB, teamIdA];

  const fromEvents =
    fromId !== undefined ? teamEventIds(fromId) : new Set<number>();
  const toEvents = toId !== undefined ? teamEventIds(toId) : new Set<number>();
  const sharedEventCount = [...fromEvents].filter((id) =>
    toEvents.has(id),
  ).length;

  nameSimilarityCandidates.push({
    from: fromKey,
    to: toKey,
    score: Math.round(score * 100) / 100,
    shared_athletes: 0,
    athlete_names: [],
    shared_events: sharedEventCount,
    from_events: fromId !== undefined ? sampleEvents(fromId) : [],
    to_events: toId !== undefined ? sampleEvents(toId) : [],
    approved: null,
  });
}

// Pass 1: token Jaccard
for (const [, group] of tokenIndex) {
  for (let i = 0; i < group.length; i++) {
    for (let j = i + 1; j < group.length; j++) {
      const a = group[i]!;
      const b = group[j]!;
      const rareA = new Set(rareTokens(a));
      const rareB = new Set(rareTokens(b));
      const sharedRare = [...rareA].filter((t) => rareB.has(t)).length;
      if (sharedRare < 1) continue;
      const sharedDistinctive = [...rareA].filter(
        (t) => rareB.has(t) && isDistinctive(t),
      ).length;
      if (sharedDistinctive < 1) continue;
      const tokSim = teamKeySimilarity(a, b);
      if (tokSim >= 1) {
        if (
          Math.min(significantTokens(a).length, significantTokens(b).length) >=
          2
        ) {
          emitNamePair(a, b, 1.0);
        }
      } else if (tokSim >= 0.6 && sharedRare >= 1) {
        emitNamePair(a, b, tokSim);
      }
    }
  }
}

// Pass 2: compact equality
for (const [, group] of strippedIndex) {
  if (group.length < 2) continue;
  for (let i = 0; i < group.length; i++) {
    for (let j = i + 1; j < group.length; j++) {
      emitNamePair(group[i]!, group[j]!, 1.0);
    }
  }
}

// Pass 3: trigram similarity
for (const [, group] of fourgramIndex) {
  if (group.length < 2 || group.length > 60) continue;
  for (let i = 0; i < group.length; i++) {
    for (let j = i + 1; j < group.length; j++) {
      const a = group[i]!;
      const b = group[j]!;
      const trgSim = trigramSimilarity(stripSeps(a), stripSeps(b));
      if (trgSim >= 0.6) emitNamePair(a, b, trgSim);
    }
  }
}

// ── Merge and sort ─────────────────────────────────────────────────────────────

// Athlete-anchored first (sorted by shared_athletes desc, score desc), then
// name-similarity only (sorted by score desc)
const anchoredSorted = [...athleteAnchoredCandidates.values()].sort(
  (x, y) => y.shared_athletes - x.shared_athletes || y.score - x.score,
);
const nameSorted = nameSimilarityCandidates.sort((x, y) => y.score - x.score);
const candidates = [...anchoredSorted, ...nameSorted];

// ── Preserve rejections ────────────────────────────────────────────────────────

let existingRejected: Array<{ from: string; to: string }> = [];
if (fs.existsSync(rejectedPath)) {
  try {
    existingRejected = JSON.parse(fs.readFileSync(rejectedPath, "utf-8"));
  } catch {}
}
let existingCandidates: Candidate[] = [];
if (fs.existsSync(outPath)) {
  try {
    existingCandidates = JSON.parse(fs.readFileSync(outPath, "utf-8"));
  } catch {}
}

const rejectedMap = new Map<string, false>([
  ...existingRejected.map((r): [string, false] => [
    `${r.from}|||${r.to}`,
    false,
  ]),
  ...existingCandidates
    .filter((c) => c.approved === false)
    .map((c): [string, false] => [`${c.from}|||${c.to}`, false]),
]);

// Also preserve any previously approved entries not yet applied
const approvedMap = new Map(
  existingCandidates
    .filter((c) => c.approved === true)
    .map((c) => [`${c.from}|||${c.to}`, true as const]),
);

for (const candidate of candidates) {
  const key = `${candidate.from}|||${candidate.to}`;
  if (rejectedMap.has(key)) candidate.approved = false;
  else if (approvedMap.has(key)) candidate.approved = true;
}

fs.writeFileSync(outPath, JSON.stringify(candidates, null, 2));

const anchored = candidates.filter((c) => c.shared_athletes > 0).length;
const nameOnly = candidates.filter((c) => c.shared_athletes === 0).length;
console.log(
  `✓ ${candidates.length} candidates written to scraper/team-alias-candidates.json`,
);
console.log(
  `  ${anchored} athlete-anchored (sorted first), ${nameOnly} name-similarity only`,
);
console.log(`  Review: set "approved": true to add, false to skip`);
console.log(`  Then run: npm run db:apply-team-aliases`);
