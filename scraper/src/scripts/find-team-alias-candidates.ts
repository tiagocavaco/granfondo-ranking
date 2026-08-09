/**
 * find-team-alias-candidates.ts
 *
 * Scans all distinct team keys in the DB, finds pairs that are likely
 * the same club under different name variants, and writes them to
 * team-alias-candidates.json for manual review.
 *
 * Three signals used (pair is emitted if any fires):
 *   1. Token Jaccard ≥ 0.5 — catches clean suffix/reorder variants
 *   2. Compact trigram similarity ≥ 0.55 — catches typos, word-split/merge
 *   3. Compact equality after stripping separators — catches spacing-only diffs
 *
 * Usage:
 *   npm run db:find-team-aliases
 *
 * Review format:
 *   { "from": "...", "to": "...", "score": 0.85, "approved": null }
 *   Set approved: true  → run `npm run db:apply-team-aliases` to add them
 *   Set approved: false → skip
 */

import * as fs from "fs";
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

const keyHex = process.env.DATA_KEY;
if (!keyHex) {
  console.error("DATA_KEY not set");
  process.exit(1);
}

const enc = fs.readFileSync(encPath);
const plain = decryptBuffer(enc, keyHex);
fs.writeFileSync("/tmp/granfondo_candidates.db", plain);
const db = new BetterSqlite3("/tmp/granfondo_candidates.db");

// Collect all canonical team keys from the teams table.
// athlete_lookup uses name|teamId (numeric) format — not parseable as team names.
const allKeys = new Set<string>();
for (const row of db.prepare("SELECT canonical_key FROM teams").all() as {
  canonical_key: string;
}[]) {
  if (row.canonical_key && row.canonical_key.length >= 3) {
    allKeys.add(row.canonical_key);
  }
}

// Load existing aliases so we can exclude already-handled pairs
const existingAliases = new Map<string, string>();
for (const row of db
  .prepare("SELECT canonical_key, alias_keys FROM teams")
  .all() as {
  canonical_key: string;
  alias_keys: string;
}[]) {
  for (const alias of JSON.parse(row.alias_keys) as string[]) {
    existingAliases.set(alias, row.canonical_key);
  }
}

db.close();
try {
  fs.unlinkSync("/tmp/granfondo_candidates.db");
} catch {}

const keys = [...allKeys].sort();
console.log(`Comparing ${keys.length} distinct team keys...`);

// ── Helpers ───────────────────────────────────────────────────────────────────

const stripSeps = (s: string) => s.replace(/[\s\-\/\.]/g, "");

function significantTokens(s: string): string[] {
  return s.split(" ").filter((t) => t.length >= 3);
}

function trigramSet(s: string): Set<string> {
  const result = new Set<string>();
  for (let i = 0; i <= s.length - 3; i++) {
    result.add(s.slice(i, i + 3));
  }
  return result;
}

function trigramSimilarity(a: string, b: string): number {
  if (Math.abs(a.length - b.length) / Math.max(a.length, b.length) > 0.6) {
    return 0;
  }
  const ta = trigramSet(a);
  const tb = trigramSet(b);
  let intersection = 0;
  for (const t of ta) {
    if (tb.has(t)) intersection++;
  }
  const union = ta.size + tb.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

// ── Token frequency tiers ─────────────────────────────────────────────────────
// common    > 5% of teams: too generic to be useful ("team", "cycling", etc.)
// rare      1%–5%: domain words ("ciclismo", "academia") — informative but not specific
// distinctive ≤ 1%: brand/org names that uniquely identify a club ("saertex", "gaiabike")
//
// For pair emission we require ≥ 1 *distinctive* shared token so that domain words
// alone (e.g. "castelo branco" or "academia ciclismo") don't create false positives
// between two different clubs that happen to share a geographic or category label.

const tokenFreq = new Map<string, number>();
for (const key of keys) {
  for (const tok of new Set(significantTokens(key))) {
    tokenFreq.set(tok, (tokenFreq.get(tok) ?? 0) + 1);
  }
}

const maxCommonFreq = Math.ceil(keys.length * 0.05);
const maxDistinctiveFreq = Math.ceil(keys.length * 0.005);

const commonTokens = new Set(
  [...tokenFreq.entries()]
    .filter(([, freq]) => freq > maxCommonFreq)
    .map(([tok]) => tok),
);

const isDistinctive = (tok: string) =>
  (tokenFreq.get(tok) ?? 0) <= maxDistinctiveFreq;

const rareTokens = (s: string) =>
  significantTokens(s).filter((t) => !commonTokens.has(t));

// ── Indexes ───────────────────────────────────────────────────────────────────

// Token index — groups keys sharing at least one rare significant token
const tokenIndex = new Map<string, string[]>();
for (const key of keys) {
  for (const tok of rareTokens(key)) {
    if (!tokenIndex.has(tok)) tokenIndex.set(tok, []);
    tokenIndex.get(tok)!.push(key);
  }
}

// Compact-form index — groups by exact stripped form (separator-only diffs)
const strippedIndex = new Map<string, string[]>();
for (const key of keys) {
  const stripped = stripSeps(key);
  if (stripped.length >= 4) {
    if (!strippedIndex.has(stripped)) strippedIndex.set(stripped, []);
    strippedIndex.get(stripped)!.push(key);
  }
}

// 4-gram compact index — groups by shared 4-grams of the compact form;
// candidate pairs within the same group are checked with trigram similarity
const fourgram = (s: string): string[] => {
  const result: string[] = [];
  for (let i = 0; i <= s.length - 4; i++) result.push(s.slice(i, i + 4));
  return result;
};

const fourgramIndex = new Map<string, string[]>();
for (const key of keys) {
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

// ── Candidate emission ────────────────────────────────────────────────────────

const seen = new Set<string>();
const candidates: Array<{
  from: string;
  to: string;
  score: number;
  approved: null | boolean;
}> = [];

function emitPair(a: string, b: string, score: number) {
  if (a === b) return;

  const pairKey = a < b ? `${a}|||${b}` : `${b}|||${a}`;
  if (seen.has(pairKey)) return;
  seen.add(pairKey);

  if (existingAliases.has(a) || existingAliases.has(b)) return;

  const rounded = Math.round(score * 100) / 100;
  const [from, to] = a.length >= b.length ? [a, b] : [b, a];
  candidates.push({ from, to, score: rounded, approved: null });
}

// Pass 1: shared rare token grouping + token Jaccard
// Two sub-cases with different constraints to control false positives:
//
// Containment (score=1.0): all tokens of shorter set appear in longer set.
//   Requires the shorter key has ≥ 2 significant tokens to prevent single-word keys
//   like "gr 100" from matching every team that contains "100".
//
// Jaccard (0.5–0.99): partial overlap.
//   Requires ≥ 2 shared RARE tokens so generic words like "cycling" or "team" don't
//   create spurious matches between completely unrelated clubs.
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
        // Containment: guard against single-token short keys (e.g. "gr 100"
        // matching every team whose name contains "100")
        const minSigTokens = Math.min(
          significantTokens(a).length,
          significantTokens(b).length,
        );
        if (minSigTokens >= 2) emitPair(a, b, 1.0);
      } else if (tokSim >= 0.6 && sharedRare >= 1) {
        // Jaccard ≥ 0.6: pairs at 0.5 are typically reached via containment chains
        // (e.g. "saertex portugal criazinvent" links to "saertex portugal" at score=1.0,
        //  which links to "saertex portugal edaetech" at score=1.0).
        emitPair(a, b, tokSim);
      }
    }
  }
}

// Pass 2: compact equality — separator-only differences ("bikematinal" ↔ "bike matinal")
for (const [, group] of strippedIndex) {
  if (group.length < 2) continue;
  for (let i = 0; i < group.length; i++) {
    for (let j = i + 1; j < group.length; j++) {
      emitPair(group[i]!, group[j]!, 1.0);
    }
  }
}

// Pass 3: 4-gram compact grouping + trigram similarity ≥ 0.60
// Catches character-level variants: typos, word-split/merge, single-char substitutions
// (e.g. "roadtraningcentre" ↔ "roadtrainingcentre", "psi bikestem" ↔ "psi bikes team",
//  "polimark" ↔ "polymark", "monicipio" ↔ "municipio")
// No shared-token requirement — character similarity is the sole signal here.
for (const [, group] of fourgramIndex) {
  if (group.length < 2 || group.length > 60) continue;
  for (let i = 0; i < group.length; i++) {
    for (let j = i + 1; j < group.length; j++) {
      const a = group[i]!;
      const b = group[j]!;
      const trgSim = trigramSimilarity(stripSeps(a), stripSeps(b));
      if (trgSim >= 0.60) emitPair(a, b, trgSim);
    }
  }
}

// Sort by descending score — high-confidence pairs are easy to review first
candidates.sort((x, y) => y.score - x.score || x.from.localeCompare(y.from));

// Preserve false rejections from the previous file
let existing: typeof candidates = [];
if (fs.existsSync(outPath)) {
  try {
    existing = JSON.parse(fs.readFileSync(outPath, "utf-8"));
  } catch {}
}

const rejectedMap = new Map(
  existing
    .filter((c) => c.approved === false)
    .map((c) => [`${c.from}|||${c.to}`, false as const]),
);
for (const candidate of candidates) {
  const key = `${candidate.from}|||${candidate.to}`;
  if (rejectedMap.has(key)) {
    candidate.approved = false;
  }
}

fs.writeFileSync(outPath, JSON.stringify(candidates, null, 2));
console.log(
  `✓ ${candidates.length} candidates written to scraper/team-alias-candidates.json`,
);
console.log(`  (sorted by score — review top entries first)`);
console.log(`  Set "approved": true for pairs to add, false to skip`);
console.log(`  Then run: npm run db:apply-team-aliases`);
