/**
 * find-team-alias-candidates.ts
 *
 * Scans all distinct team keys in the DB, finds pairs that fuzzy-match
 * (similarity = 1.0) but aren't already aliased, and writes them to
 * team-alias-candidates.json for manual review.
 *
 * Usage:
 *   npm run db:find-team-aliases
 *
 * Review format:
 *   { "a": "...", "b": "...", "approved": null }
 *   Set approved: true  → run `npm run db:apply-team-aliases` to add them
 *   Set approved: false → skip
 */

import * as fs from "fs";
import * as path from "path";
import BetterSqlite3 from "better-sqlite3";
import { decryptBuffer } from "../db/encrypt.js";
import { teamKeySimilarity } from "../normalize.js";

const encPath = path.resolve(import.meta.dirname, "../../../frontend/public/data/data.db.enc");
const outPath = path.resolve(import.meta.dirname, "../../team-alias-candidates.json");

const keyHex = process.env.DATA_KEY;
if (!keyHex) { console.error("DATA_KEY not set"); process.exit(1); }

const enc = fs.readFileSync(encPath);
const plain = decryptBuffer(enc, keyHex);
fs.writeFileSync("/tmp/granfondo_candidates.db", plain);
const db = new BetterSqlite3("/tmp/granfondo_candidates.db");

// Collect all distinct normalized team keys from athlete_lookup
const allKeys = new Set<string>();
for (const row of db.prepare("SELECT key FROM athlete_lookup").all() as { key: string }[]) {
  const parts = row.key.split("|");
  const teamKey = parts[1];
  if (teamKey && teamKey.length >= 3 && !teamKey.startsWith("solo:")) allKeys.add(teamKey);
}

// Also collect from results (catches teams not in lookup)
for (const row of db.prepare("SELECT DISTINCT team FROM results WHERE length(team) >= 3").all() as { team: string }[]) {
  // team column is already display-normalized; get the key via normalizeTeam equivalent
  // We only have the display form here — skip, athlete_lookup keys are sufficient
  void row;
}

// Load existing aliases so we can exclude already-handled pairs
const existingAliases = new Map<string, string>();
for (const row of db.prepare("SELECT canonical_key, alias_keys FROM teams").all() as { canonical_key: string; alias_keys: string }[]) {
  for (const alias of JSON.parse(row.alias_keys) as string[]) existingAliases.set(alias, row.canonical_key);
}

db.close();
try { fs.unlinkSync("/tmp/granfondo_candidates.db"); } catch {}

const keys = [...allKeys].sort();
console.log(`Comparing ${keys.length} distinct team keys...`);

// Strip all separators (spaces, hyphens, slashes, dots) for compact comparison
const stripSeps = (s: string) => s.replace(/[\s\-\/\.]/g, "");

// Group keys by significant tokens for efficiency — only compare keys sharing ≥1 token
const sigTok = (s: string) => s.split(" ").filter((t) => t.length >= 3);

// Compute token frequencies; exclude tokens that appear in >5% of teams (too generic)
const tokenFreq = new Map<string, number>();
for (const key of keys) {
  for (const tok of new Set(sigTok(key))) {
    tokenFreq.set(tok, (tokenFreq.get(tok) ?? 0) + 1);
  }
}
const maxFreq = Math.ceil(keys.length * 0.05);
const commonTokens = new Set([...tokenFreq.entries()]
  .filter(([, freq]) => freq > maxFreq)
  .map(([tok]) => tok));

const sigTokFiltered = (s: string) =>
  sigTok(s).filter((t) => !commonTokens.has(t));

const tokenIndex = new Map<string, string[]>();
for (const key of keys) {
  for (const tok of sigTokFiltered(key)) {
    if (!tokenIndex.has(tok)) tokenIndex.set(tok, []);
    tokenIndex.get(tok)!.push(key);
  }
}

// Also group by stripped form — catches "bikematinal" ↔ "bike matinal" where the
// compound word shares no tokens with the spaced version
const strippedIndex = new Map<string, string[]>();
for (const key of keys) {
  const stripped = stripSeps(key);
  if (stripped.length >= 4) {
    if (!strippedIndex.has(stripped)) strippedIndex.set(stripped, []);
    strippedIndex.get(stripped)!.push(key);
  }
}

// Find candidate pairs
const seen = new Set<string>();
const candidates: Array<{ from: string; to: string; approved: null | boolean }> = [];

function emitPair(a: string, b: string, requireSharedTokens: boolean) {
  if (a === b) return;
  const pairKey = a < b ? `${a}|||${b}` : `${b}|||${a}`;
  if (seen.has(pairKey)) return;
  seen.add(pairKey);

  if (existingAliases.has(a) || existingAliases.has(b)) return;

  if (requireSharedTokens) {
    const toksA = new Set(sigTokFiltered(a));
    const toksB = new Set(sigTokFiltered(b));
    const shared = [...toksA].filter((t) => toksB.has(t));
    if (shared.length < 2) return;
  }

  const sim = teamKeySimilarity(a, b);
  if (sim < 1) return;

  const [from, to] = a.length >= b.length ? [a, b] : [b, a];
  candidates.push({ from, to, approved: null });
}

// Pass 1: token-based grouping (finds word-order swaps, suffix diffs, etc.)
for (const [, group] of tokenIndex) {
  for (let i = 0; i < group.length; i++) {
    for (let j = i + 1; j < group.length; j++) {
      emitPair(group[i]!, group[j]!, true);
    }
  }
}

// Pass 2: stripped-form grouping (finds separator-only differences like "bikematinal" ↔ "bike matinal")
for (const [, group] of strippedIndex) {
  if (group.length < 2) continue;
  for (let i = 0; i < group.length; i++) {
    for (let j = i + 1; j < group.length; j++) {
      emitPair(group[i]!, group[j]!, false);
    }
  }
}

// Sort alphabetically by the alias (from) key
candidates.sort((x, y) => x.from.localeCompare(y.from));

// Preserve only false rejections from the previous file (approved ones are already applied)
let existing: typeof candidates = [];
if (fs.existsSync(outPath)) {
  try { existing = JSON.parse(fs.readFileSync(outPath, "utf-8")); } catch {}
}
const rejectedMap = new Map(existing.filter((c) => c.approved === false).map((c) => [`${c.from}|||${c.to}`, false as const]));
for (const c of candidates) {
  const key = `${c.from}|||${c.to}`;
  if (rejectedMap.has(key)) c.approved = false;
}

fs.writeFileSync(outPath, JSON.stringify(candidates, null, 2));
console.log(`✓ ${candidates.length} candidates written to scraper/team-alias-candidates.json`);
console.log(`  Set "approved": true for pairs to add, false to skip`);
console.log(`  Then run: npm run db:apply-team-aliases`);
