/**
 * find-athlete-anchored-team-aliases.ts
 *
 * Finds team name pairs that are probably the same club by finding athletes
 * who raced under both team IDs. An athlete appearing under two team IDs is
 * ground-truth evidence those teams represent the same club.
 *
 * Pair is emitted when:
 *   - Token Jaccard similarity on canonical keys ≥ 0.45, OR
 *   - ≥ 3 shared athletes (regardless of similarity)
 *
 * Usage:
 *   npm run db:find-athlete-anchored-aliases
 *
 * Review format:
 *   { "from": "...", "to": "...", "score": 0.73, "shared_athletes": 3,
 *     "athlete_names": [...], "approved": null }
 *   Set approved: true  → run `npm run db:apply-team-aliases` to add them
 *   Set approved: false → skip
 */

import * as fs from "fs";
import * as path from "path";
import BetterSqlite3 from "better-sqlite3";
import { decryptBuffer } from "../db/encrypt.js";

const encPath = path.resolve(
  import.meta.dirname,
  "../../../frontend/public/data/data.db.enc",
);
const outPath = path.resolve(
  import.meta.dirname,
  "../../athlete-anchored-team-aliases.json",
);

const keyHex = process.env.DATA_KEY;
if (!keyHex) {
  console.error("DATA_KEY not set");
  process.exit(1);
}

const enc = fs.readFileSync(encPath);
const plain = decryptBuffer(enc, keyHex);
fs.writeFileSync("/tmp/granfondo_athlete_anchored.db", plain);
const db = new BetterSqlite3("/tmp/granfondo_athlete_anchored.db");

// ── Load DB data ──────────────────────────────────────────────────────────────

type AthleteTeamRow = { athlete_id: number; team_id: number };
type TeamRow = { id: number; canonical_key: string; alias_keys: string };
type AthleteRow = { id: number; name: string };
type TeamSizeRow = { team_id: number; athlete_count: number };

const athleteTeamRows = db
  .prepare("SELECT athlete_id, team_id FROM athlete_teams WHERE team_id != 0")
  .all() as AthleteTeamRow[];

const teamRows = db
  .prepare("SELECT id, canonical_key, alias_keys FROM teams")
  .all() as TeamRow[];

const athleteRows = db
  .prepare("SELECT id, name FROM athletes")
  .all() as AthleteRow[];

const teamSizeRows = db
  .prepare(
    "SELECT team_id, COUNT(*) as athlete_count FROM athlete_teams WHERE team_id != 0 GROUP BY team_id",
  )
  .all() as TeamSizeRow[];

db.close();
try {
  fs.unlinkSync("/tmp/granfondo_athlete_anchored.db");
} catch {}

// ── Build lookup maps ─────────────────────────────────────────────────────────

const teamById = new Map<number, TeamRow>();
for (const team of teamRows) {
  teamById.set(team.id, team);
}

const athleteNameById = new Map<number, string>();
for (const athlete of athleteRows) {
  athleteNameById.set(athlete.id, athlete.name);
}

const teamSizeById = new Map<number, number>();
for (const row of teamSizeRows) {
  teamSizeById.set(row.team_id, row.athlete_count);
}

// Build the alias membership set: all canonical_keys that are already an alias
// of another team, keyed by canonical_key → set of its aliases.
const aliasesOf = new Map<string, Set<string>>();
for (const team of teamRows) {
  const aliases = JSON.parse(team.alias_keys) as string[];
  if (aliases.length > 0) {
    aliasesOf.set(team.canonical_key, new Set(aliases));
  }
}

function isAlreadyAliased(keyA: string, keyB: string): boolean {
  const aliasesOfA = aliasesOf.get(keyA);
  if (aliasesOfA?.has(keyB)) return true;
  const aliasesOfB = aliasesOf.get(keyB);
  if (aliasesOfB?.has(keyA)) return true;
  return false;
}

// ── Collect team IDs per athlete ──────────────────────────────────────────────

const teamIdsByAthlete = new Map<number, Set<number>>();
for (const row of athleteTeamRows) {
  let teamSet = teamIdsByAthlete.get(row.athlete_id);
  if (!teamSet) {
    teamSet = new Set();
    teamIdsByAthlete.set(row.athlete_id, teamSet);
  }
  teamSet.add(row.team_id);
}

// ── Accumulate evidence for team pairs ───────────────────────────────────────

// Map from sorted "teamIdA|teamIdB" → list of athlete IDs who raced under both.
const pairEvidence = new Map<string, number[]>();

for (const [athleteId, teamIds] of teamIdsByAthlete) {
  if (teamIds.size !== 2) continue;

  const [teamIdA, teamIdB] = [...teamIds].sort((x, y) => x - y) as [
    number,
    number,
  ];
  const pairKey = `${teamIdA}|${teamIdB}`;

  let athleteList = pairEvidence.get(pairKey);
  if (!athleteList) {
    athleteList = [];
    pairEvidence.set(pairKey, athleteList);
  }
  athleteList.push(athleteId);
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function significantTokens(key: string): string[] {
  return key.split(" ").filter((token) => token.length >= 3);
}

function tokenJaccard(keyA: string, keyB: string): number {
  const tokensA = new Set(significantTokens(keyA));
  const tokensB = new Set(significantTokens(keyB));
  if (tokensA.size === 0 && tokensB.size === 0) return 0;

  let intersectionSize = 0;
  for (const token of tokensA) {
    if (tokensB.has(token)) intersectionSize++;
  }
  const unionSize = tokensA.size + tokensB.size - intersectionSize;
  return unionSize === 0 ? 0 : intersectionSize / unionSize;
}

// ── Emit candidates ───────────────────────────────────────────────────────────

type Candidate = {
  from: string;
  to: string;
  score: number;
  shared_athletes: number;
  athlete_names: string[];
  approved: null | boolean;
};

const candidates: Candidate[] = [];

for (const [pairKey, sharedAthleteIds] of pairEvidence) {
  const [teamIdAStr, teamIdBStr] = pairKey.split("|") as [string, string];
  const teamIdA = parseInt(teamIdAStr, 10);
  const teamIdB = parseInt(teamIdBStr, 10);

  const teamA = teamById.get(teamIdA);
  const teamB = teamById.get(teamIdB);
  if (!teamA || !teamB) continue;

  const canonicalKeyA = teamA.canonical_key;
  const canonicalKeyB = teamB.canonical_key;
  if (!canonicalKeyA || !canonicalKeyB) continue;
  if (canonicalKeyA === canonicalKeyB) continue;

  if (isAlreadyAliased(canonicalKeyA, canonicalKeyB)) continue;

  const similarity = tokenJaccard(canonicalKeyA, canonicalKeyB);
  const sharedCount = sharedAthleteIds.length;

  if (similarity < 0.45 && sharedCount < 3) continue;

  const score = Math.round(similarity * 100) / 100;

  const sizeA = teamSizeById.get(teamIdA) ?? 0;
  const sizeB = teamSizeById.get(teamIdB) ?? 0;

  // from = smaller team (alias), to = larger team (canonical)
  const [fromKey, toKey] =
    sizeA <= sizeB
      ? [canonicalKeyA, canonicalKeyB]
      : [canonicalKeyB, canonicalKeyA];

  const athleteNames = sharedAthleteIds
    .map((athleteId) => athleteNameById.get(athleteId) ?? `athlete#${athleteId}`)
    .sort();

  candidates.push({
    from: fromKey,
    to: toKey,
    score,
    shared_athletes: sharedCount,
    athlete_names: athleteNames,
    approved: null,
  });
}

// Sort descending by shared_athletes, then descending by score
candidates.sort(
  (candidateX, candidateY) =>
    candidateY.shared_athletes - candidateX.shared_athletes ||
    candidateY.score - candidateX.score,
);

// ── Preserve false rejections from existing file ──────────────────────────────

let existingCandidates: Candidate[] = [];
if (fs.existsSync(outPath)) {
  try {
    existingCandidates = JSON.parse(fs.readFileSync(outPath, "utf-8"));
  } catch {}
}

const rejectedPairs = new Map(
  existingCandidates
    .filter((candidate) => candidate.approved === false)
    .map((candidate) => [
      `${candidate.from}|||${candidate.to}`,
      false as const,
    ]),
);

for (const candidate of candidates) {
  const key = `${candidate.from}|||${candidate.to}`;
  if (rejectedPairs.has(key)) {
    candidate.approved = false;
  }
}

fs.writeFileSync(outPath, JSON.stringify(candidates, null, 2));

console.log(
  `✓ ${candidates.length} candidates written to scraper/athlete-anchored-team-aliases.json`,
);
console.log(`  (sorted by shared_athletes desc, then score desc)`);
console.log(`  Set "approved": true for pairs to add, false to skip`);
console.log(`  Then run: npm run db:apply-team-aliases`);
