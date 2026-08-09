/**
 * find-split-candidates.ts
 *
 * Scans the DB for same-name athlete pairs that may be fragmented profiles,
 * scores each pair on category/percentile/year/licence signals, and writes
 * results to split-candidates.json for manual review.
 *
 * Usage:
 *   npm run db:find-splits                  # all candidates
 *   npm run db:find-splits -- --top 10      # only pairs with a top-10 finish
 *   npm run db:find-splits -- --top 20      # only pairs with a top-20 finish
 *
 * Review:
 *   Open scraper/split-candidates.json
 *   Set "approved": true to merge, false to skip
 *   Then run: npm run db:apply-splits
 */

import * as fs from "fs";
import * as path from "path";
import BetterSqlite3 from "better-sqlite3";
import { decryptBuffer } from "../db/encrypt.js";
import { normalizeName } from "../normalize.js";

const encPath = path.resolve(
  import.meta.dirname,
  "../../../frontend/public/data/data.db.enc",
);
const outPath = path.resolve(
  import.meta.dirname,
  "../../split-candidates.json",
);
const BASE_URL =
  process.env.RANKING_BASE_URL ?? "http://localhost:5173/granfondo-ranking";

// --top N: filter to pairs where at least one athlete has a finish ≤ N
const topArg = process.argv.indexOf("--top");
const TOP_N = topArg !== -1 ? parseInt(process.argv[topArg + 1]!, 10) : null;
if (TOP_N !== null && (isNaN(TOP_N) || TOP_N < 1)) {
  console.error("--top requires a positive integer, e.g. --top 10");
  process.exit(1);
}

const keyHex = process.env.DATA_KEY;
if (!keyHex) {
  console.error("DATA_KEY not set");
  process.exit(1);
}

const enc = fs.readFileSync(encPath);
const plain = decryptBuffer(enc, keyHex);
const db = new BetterSqlite3(plain);

// ── Load same-name groups ─────────────────────────────────────────────────────

const splitNameFilter = `
  SELECT name_lower FROM athletes GROUP BY name_lower HAVING COUNT(*) >= 2
`;

const athleteRows = db
  .prepare(
    `
  SELECT id, name, canonical_team
  FROM athletes
  WHERE name_lower IN (${splitNameFilter})
  ORDER BY id
`,
  )
  .all() as { id: number; name: string; canonical_team: string | null }[];

if (athleteRows.length === 0) {
  console.log("No same-name groups found.");
  db.close();
  process.exit(0);
}

const athleteMap = new Map(athleteRows.map((a) => [a.id, a]));

// Group athlete IDs by name_lower
const nameGroupRows = db
  .prepare(
    `
  SELECT name_lower, GROUP_CONCAT(id ORDER BY id) as ids
  FROM athletes
  WHERE name_lower IN (${splitNameFilter})
  GROUP BY name_lower
`,
  )
  .all() as { name_lower: string; ids: string }[];

// ── Load results (batch query via subquery) ───────────────────────────────────

type ResultRow = {
  athlete_id: number;
  event_year: number;
  pos: number;
  finisher_count: number;
  category: string;
  distance: string;
  dnf: number;
  dns: number;
  event_id: number;
};

const resultRows = db
  .prepare(
    `
  SELECT ar.athlete_id, ar.event_year, ar.pos, ar.finisher_count,
         ar.category, ar.distance, ar.dnf, ar.dns, ar.event_id
  FROM athlete_results ar
  JOIN athletes a ON a.id = ar.athlete_id
  WHERE a.name_lower IN (${splitNameFilter})
`,
  )
  .all() as ResultRow[];

const resultsByAthlete = new Map<number, ResultRow[]>();
for (const r of resultRows) {
  if (!resultsByAthlete.has(r.athlete_id)) {
    resultsByAthlete.set(r.athlete_id, []);
  }

  resultsByAthlete.get(r.athlete_id)!.push(r);
}

// ── Load licences (batch query via subquery) ──────────────────────────────────

const licenceRows = db
  .prepare(
    `
  SELECT DISTINCT r.athlete_id, rl.licence
  FROM results r
  JOIN result_licences rl ON r.id = rl.result_id
  JOIN athletes a ON a.id = r.athlete_id
  WHERE r.athlete_id != 0
    AND a.name_lower IN (${splitNameFilter})
    AND rl.licence NOT LIKE '%e%'
    AND rl.licence NOT LIKE '%E%'
    AND rl.licence NOT LIKE 'federa%'
    AND CAST(rl.licence AS INTEGER) >= 100
`,
  )
  .all() as { athlete_id: number; licence: string }[];

const licencesByAthlete = new Map<number, Set<string>>();
for (const r of licenceRows) {
  if (!licencesByAthlete.has(r.athlete_id)) {
    licencesByAthlete.set(r.athlete_id, new Set());
  }

  licencesByAthlete.get(r.athlete_id)!.add(r.licence);
}

// ── Load all athletes for accent-normalization (P3) and same-team prefix (P4) passes ──

type AthleteWithNameLower = {
  id: number;
  name: string;
  name_lower: string;
  canonical_team: string | null;
};

const allAthletes = db
  .prepare(
    `SELECT id, name, name_lower, canonical_team FROM athletes ORDER BY id`,
  )
  .all() as AthleteWithNameLower[];

// Augment athleteMap so scorePairEntry can look up any athlete
for (const athlete of allAthletes) {
  if (!athleteMap.has(athlete.id)) {
    athleteMap.set(athlete.id, athlete);
  }
}

// P3 groups: athletes with the same normalizeName but different name_lower
const byNormalizedName = new Map<string, AthleteWithNameLower[]>();
for (const athlete of allAthletes) {
  const normalizedName = normalizeName(athlete.name);
  if (!byNormalizedName.has(normalizedName)) {
    byNormalizedName.set(normalizedName, []);
  }

  byNormalizedName.get(normalizedName)!.push(athlete);
}

// P4 groups: athletes on the same team for prefix/truncation matching
const byTeam = new Map<string, AthleteWithNameLower[]>();
for (const athlete of allAthletes) {
  if (!athlete.canonical_team) continue;
  if (!byTeam.has(athlete.canonical_team)) {
    byTeam.set(athlete.canonical_team, []);
  }

  byTeam.get(athlete.canonical_team)!.push(athlete);
}

// Determine which IDs need results/licences loaded for P3/P4 (not covered by same-name pass)
const extraAthleteIds = new Set<number>();

for (const [, group] of byNormalizedName) {
  if (group.length < 2) continue;
  const uniqueNameLowers = new Set(group.map((athlete) => athlete.name_lower));
  if (uniqueNameLowers.size < 2) continue;
  for (const athlete of group) extraAthleteIds.add(athlete.id);
}

for (const [, group] of byTeam) {
  if (group.length < 2) continue;
  for (let i = 0; i < group.length; i++) {
    for (let j = i + 1; j < group.length; j++) {
      const nameA = group[i]!.name_lower;
      const nameB = group[j]!.name_lower;
      if (nameA !== nameB && isPrefixOrTrailingTruncation(nameA, nameB)) {
        extraAthleteIds.add(group[i]!.id);
        extraAthleteIds.add(group[j]!.id);
      }
    }
  }
}

const unloadedIds = [...extraAthleteIds].filter(
  (athleteId) => !resultsByAthlete.has(athleteId),
);

if (unloadedIds.length > 0) {
  const placeholders = unloadedIds.map(() => "?").join(",");

  const extraResultRows = db
    .prepare(
      `
    SELECT ar.athlete_id, ar.event_year, ar.pos, ar.finisher_count,
           ar.category, ar.distance, ar.dnf, ar.dns, ar.event_id
    FROM athlete_results ar
    WHERE ar.athlete_id IN (${placeholders})
  `,
    )
    .all(...unloadedIds) as ResultRow[];

  for (const row of extraResultRows) {
    if (!resultsByAthlete.has(row.athlete_id)) {
      resultsByAthlete.set(row.athlete_id, []);
    }

    resultsByAthlete.get(row.athlete_id)!.push(row);
  }

  const extraLicenceRows = db
    .prepare(
      `
    SELECT DISTINCT r.athlete_id, rl.licence
    FROM results r
    JOIN result_licences rl ON r.id = rl.result_id
    WHERE r.athlete_id IN (${placeholders})
      AND r.athlete_id != 0
      AND rl.licence NOT LIKE '%e%'
      AND rl.licence NOT LIKE '%E%'
      AND rl.licence NOT LIKE 'federa%'
      AND CAST(rl.licence AS INTEGER) >= 100
  `,
    )
    .all(...unloadedIds) as { athlete_id: number; licence: string }[];

  for (const row of extraLicenceRows) {
    if (!licencesByAthlete.has(row.athlete_id)) {
      licencesByAthlete.set(row.athlete_id, new Set());
    }

    licencesByAthlete.get(row.athlete_id)!.add(row.licence);
  }
}

db.close();

// ── Helpers ───────────────────────────────────────────────────────────────────

function medianPercentile(results: ResultRow[]): number | null {
  const finished = results.filter(
    (r) => !r.dnf && !r.dns && r.finisher_count > 0 && r.pos > 0,
  );
  if (finished.length === 0) {
    return null;
  }

  const percentiles = finished
    .map((r) => r.pos / r.finisher_count)
    .sort((a, b) => a - b);
  const mid = Math.floor(percentiles.length / 2);
  return percentiles.length % 2 === 0
    ? (percentiles[mid - 1]! + percentiles[mid]!) / 2
    : percentiles[mid]!;
}

function primaryCategory(results: ResultRow[]): string | null {
  const freq = new Map<string, number>();
  for (const r of results) {
    if (r.category) {
      freq.set(r.category, (freq.get(r.category) ?? 0) + 1);
    }
  }

  if (freq.size === 0) {
    return null;
  }

  let best = "";
  let bestCount = 0;
  for (const [cat, count] of freq) {
    if (count > bestCount) {
      best = cat;
      bestCount = count;
    }
  }

  return best || null;
}

// Normalise a raw category string to a canonical form for comparison.
// Strips gender tokens (M, F, Masc, Fem, …) and normalises common spellings.
// "ELITES M", "M ELITES", "Elites M." all become "elite".
// "Masters B Masc", "MasterB M", "MASTERS B" all become "master b".
function normalizeCat(cat: string): string {
  let c = cat.trim().toLowerCase();
  // Strip leading gender token
  c = c.replace(/^(masculino|feminino|masc\.?|fem\.?|[mf])\s+/, "");
  // Strip trailing gender token
  c = c.replace(/\s+(masculino|feminino|masc\.?|fem\.?|[mf]\.?)$/, "");
  // Normalise plural / variant spellings
  c = c.replace(/\belites?\b/g, "elite");
  c = c.replace(/\bjuniors?|juniores?\b/g, "junior");
  c = c.replace(/\bsub[-\s]?23\b/g, "sub23");
  c = c.replace(/\bjuvenis\b/g, "juvenil");
  // "masters? B", "masterb" → "master b"
  c = c.replace(/\bmasters?\s*([a-f])\b/g, (_, g) => `master ${g}`);
  return c.trim();
}

// Ordered master progression for adjacency check (uses normalised names)
const MASTER_LADDER = [
  "elite",
  "master a",
  "master b",
  "master c",
  "master d",
  "master e",
  "master f",
];

function catLadderIndex(normalizedCat: string): number {
  return MASTER_LADDER.findIndex(
    (m) => normalizedCat === m || normalizedCat.startsWith(m + " "),
  );
}

function categoryCompatibility(
  catA: string | null,
  catB: string | null,
): "same" | "adjacent" | "different" {
  if (!catA || !catB) {
    return "different";
  }

  const a = normalizeCat(catA);
  const b = normalizeCat(catB);
  if (a === b) {
    return "same";
  }

  const ia = catLadderIndex(a);
  const ib = catLadderIndex(b);
  if (ia >= 0 && ib >= 0 && Math.abs(ia - ib) === 1) {
    return "adjacent";
  }

  return "different";
}

function yearRange(results: ResultRow[]): { min: number; max: number } | null {
  const years = results.map((r) => r.event_year).filter((y) => y > 0);
  if (years.length === 0) {
    return null;
  }

  return { min: Math.min(...years), max: Math.max(...years) };
}

function bestFinish(results: ResultRow[]): number {
  const positions = results
    .filter((r) => !r.dnf && !r.dns && r.pos > 0)
    .map((r) => r.pos);
  return positions.length > 0 ? Math.min(...positions) : Infinity;
}

// Same team, one name is a prefix of the other or they differ only in the last 1-2 chars.
// Minimum length 8 to avoid spurious matches on short first names.
function isPrefixOrTrailingTruncation(nameA: string, nameB: string): boolean {
  if (nameA.length < 8 || nameB.length < 8) return false;
  if (nameA.startsWith(nameB) || nameB.startsWith(nameA)) return true;
  const minLen = Math.min(nameA.length, nameB.length);
  const maxLen = Math.max(nameA.length, nameB.length);
  return (
    maxLen - minLen <= 2 && nameA.slice(0, minLen - 1) === nameB.slice(0, minLen - 1)
  );
}

// Hard-exclude checks + scoring for a single athlete pair.
// extraReasons are prepended to the reason string; baseScore is added before signal scoring.
// Returns null if the pair is hard-excluded.
function scorePairEntry(
  idA: number,
  idB: number,
  extraReasons: string[],
  baseScore: number,
): CandidateEntry | null {
  const resultsA = resultsByAthlete.get(idA) ?? [];
  const resultsB = resultsByAthlete.get(idB) ?? [];
  const licsA = licencesByAthlete.get(idA) ?? new Set<string>();
  const licsB = licencesByAthlete.get(idB) ?? new Set<string>();

  // Hard exclude: appeared in the same race — definitely different athletes
  const eventsA = new Set(resultsA.map((result) => result.event_id));
  if (resultsB.some((result) => eventsA.has(result.event_id))) return null;

  // Hard exclude: both have non-empty disjoint licence sets — different people
  if (licsA.size > 0 && licsB.size > 0) {
    if (![...licsA].some((licence) => licsB.has(licence))) return null;
  }

  // Hard exclude: incompatible categories in any year both athletes raced
  {
    const yearsA = new Set(resultsA.map((result) => result.event_year));
    const sharedYears = [...new Set(resultsB.map((result) => result.event_year))].filter(
      (year) => yearsA.has(year),
    );
    for (const year of sharedYears) {
      const catsA = resultsA
        .filter((result) => result.event_year === year && result.category)
        .map((result) => result.category);
      const catsB = resultsB
        .filter((result) => result.event_year === year && result.category)
        .map((result) => result.category);
      if (catsA.length > 0 && catsB.length > 0) {
        const anySame = catsA.some((catA) =>
          catsB.some((catB) => categoryCompatibility(catA, catB) === "same"),
        );
        if (!anySame) return null;
      }
    }
  }

  // Hard exclude: adjacent categories moving in the wrong aging direction
  {
    const catA = primaryCategory(resultsA);
    const catB = primaryCategory(resultsB);
    if (catA && catB && categoryCompatibility(catA, catB) === "adjacent") {
      const ladderA = catLadderIndex(normalizeCat(catA));
      const ladderB = catLadderIndex(normalizeCat(catB));
      const rangeA = yearRange(resultsA);
      const rangeB = yearRange(resultsB);
      if (ladderA >= 0 && ladderB >= 0 && rangeA && rangeB) {
        const overlaps = rangeA.min <= rangeB.max && rangeB.min <= rangeA.max;
        if (!overlaps) {
          const aIsEarlier = rangeA.max < rangeB.min;
          const aIsOlder = ladderA > ladderB;
          if (aIsEarlier === aIsOlder) return null;
        }
      }
    }
  }

  // Hard exclude: percentile difference > 10%
  {
    const percentileA = medianPercentile(resultsA);
    const percentileB = medianPercentile(resultsB);
    if (
      percentileA !== null &&
      percentileB !== null &&
      Math.abs(percentileA - percentileB) > 0.1
    )
      return null;
  }

  const athleteA = athleteMap.get(idA)!;
  const athleteB = athleteMap.get(idB)!;

  const [keepId, absorbId, keepRow, absorbRow, keepRes, absorbRes, keepLics, absorbLics] =
    resultsA.length >= resultsB.length
      ? [idA, idB, athleteA, athleteB, resultsA, resultsB, licsA, licsB]
      : [idB, idA, athleteB, athleteA, resultsB, resultsA, licsB, licsA];

  const hasSharedLicence =
    licsA.size > 0 &&
    licsB.size > 0 &&
    [...licsA].some((licence) => licsB.has(licence));

  let score = baseScore;
  const reasons: string[] = [...extraReasons];

  if (hasSharedLicence) {
    score += 0.6;
    const sharedLics = [...licsA].filter((licence) => licsB.has(licence));
    reasons.push(`shared licence (${sharedLics.join(", ")})`);
  }

  const fragCount = absorbRes.length;
  if (fragCount <= 1) {
    score += 0.35;
    reasons.push(`fragment (${fragCount} result)`);
  } else if (fragCount <= 3) {
    score += 0.25;
    reasons.push(`fragment (${fragCount} results)`);
  } else if (fragCount <= 5) {
    score += 0.1;
    reasons.push(`small profile (${fragCount} results)`);
  }

  const catKeep = primaryCategory(keepRes);
  const catAbsorb = primaryCategory(absorbRes);
  const catCompat = categoryCompatibility(catKeep, catAbsorb);
  if (catCompat === "same") {
    score += 0.15;
    reasons.push(`same category (${catKeep})`);
  } else if (catCompat === "adjacent") {
    score += 0.07;
    reasons.push(`adjacent categories (${catKeep} / ${catAbsorb})`);
  } else if (catKeep && catAbsorb) {
    score -= 0.05;
  }

  const percentileKeep = medianPercentile(keepRes);
  const percentileAbsorb = medianPercentile(absorbRes);
  if (percentileKeep !== null && percentileAbsorb !== null) {
    const diff = Math.abs(percentileKeep - percentileAbsorb);
    if (diff <= 0.1) {
      score += 0.15;
      reasons.push(
        `similar percentile (${Math.round(percentileKeep * 100)}% vs ${Math.round(percentileAbsorb * 100)}%)`,
      );
    } else if (diff <= 0.2) {
      score += 0.07;
      reasons.push(
        `close percentile (${Math.round(percentileKeep * 100)}% vs ${Math.round(percentileAbsorb * 100)}%)`,
      );
    } else if (diff > 0.35) {
      score -= 0.1;
      reasons.push(
        `different percentile (${Math.round(percentileKeep * 100)}% vs ${Math.round(percentileAbsorb * 100)}%)`,
      );
    } else {
      reasons.push(
        `percentile ${Math.round(percentileKeep * 100)}% vs ${Math.round(percentileAbsorb * 100)}%`,
      );
    }
  }

  const rangeKeep = yearRange(keepRes);
  const rangeAbsorb = yearRange(absorbRes);
  if (rangeKeep && rangeAbsorb) {
    const overlaps =
      rangeKeep.min <= rangeAbsorb.max && rangeAbsorb.min <= rangeKeep.max;
    if (overlaps) {
      score -= 0.15;
      reasons.push(
        `overlapping years (${rangeKeep.min}–${rangeKeep.max} / ${rangeAbsorb.min}–${rangeAbsorb.max})`,
      );
    } else {
      const gap = Math.min(
        Math.abs(rangeKeep.min - rangeAbsorb.max),
        Math.abs(rangeAbsorb.min - rangeKeep.max),
      );
      if (gap <= 1) {
        score += 0.1;
        reasons.push(
          `adjacent years (${rangeKeep.min}–${rangeKeep.max} / ${rangeAbsorb.min}–${rangeAbsorb.max})`,
        );
      } else {
        reasons.push(
          `separate years (${rangeKeep.min}–${rangeKeep.max} / ${rangeAbsorb.min}–${rangeAbsorb.max})`,
        );
      }
    }
  }

  score = Math.max(0, Math.min(0.99, score));

  const pairBestPos = Math.min(bestFinish(keepRes), bestFinish(absorbRes));
  const yKeep = rangeKeep
    ? rangeKeep.min === rangeKeep.max
      ? `${rangeKeep.min}`
      : `${rangeKeep.min}–${rangeKeep.max}`
    : "?";
  const yAbsorb = rangeAbsorb
    ? rangeAbsorb.min === rangeAbsorb.max
      ? `${rangeAbsorb.min}`
      : `${rangeAbsorb.min}–${rangeAbsorb.max}`
    : "?";

  const entry: CandidateEntry = {
    confidence: Math.round(score * 100) / 100,
    reason: reasons.join(", ") || "same name",
    bestPos: pairBestPos === Infinity ? 9999 : pairBestPos,
    keep: {
      id: keepId,
      name: keepRow.name,
      team: keepRow.canonical_team ?? "",
      licences: [...keepLics],
      results: keepRes.length,
      category: catKeep,
      years: yKeep,
      url: `${BASE_URL}/athlete/${keepId}`,
    },
    absorb: {
      id: absorbId,
      name: absorbRow.name,
      team: absorbRow.canonical_team ?? "",
      licences: [...absorbLics],
      results: absorbRes.length,
      category: catAbsorb,
      years: yAbsorb,
      url: `${BASE_URL}/athlete/${absorbId}`,
    },
    approved: null,
  };

  if (hasSharedLicence) entry.sharedLicence = true;
  if (pairBestPos <= 30) entry.priority = true;

  return entry;
}

// ── Score pairs ───────────────────────────────────────────────────────────────

interface CandidateEntry {
  confidence: number;
  reason: string;
  bestPos: number;
  sharedLicence?: true;
  priority?: true;
  keep: {
    id: number;
    name: string;
    team: string;
    licences: string[];
    results: number;
    category: string | null;
    years: string;
    url: string;
  };
  absorb: {
    id: number;
    name: string;
    team: string;
    licences: string[];
    results: number;
    category: string | null;
    years: string;
    url: string;
  };
  approved: boolean | null;
}

const candidates: CandidateEntry[] = [];

// ── Pass 1: same name_lower (exact name duplicates) ───────────────────────────

for (const group of nameGroupRows) {
  const ids = group.ids.split(",").map(Number);
  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      const entry = scorePairEntry(ids[i]!, ids[j]!, [], 0);
      if (entry) candidates.push(entry);
    }
  }
}

// ── Pass 3: accent-normalization pairs (João ↔ Joao) ─────────────────────────

for (const [, group] of byNormalizedName) {
  if (group.length < 2) continue;
  const uniqueNameLowers = new Set(group.map((athlete) => athlete.name_lower));
  if (uniqueNameLowers.size < 2) continue;
  for (let i = 0; i < group.length; i++) {
    for (let j = i + 1; j < group.length; j++) {
      const athleteA = group[i]!;
      const athleteB = group[j]!;
      // Same name_lower pairs are handled by Pass 1
      if (athleteA.name_lower === athleteB.name_lower) continue;
      const entry = scorePairEntry(athleteA.id, athleteB.id, ["accent variant"], 0.1);
      if (entry) candidates.push(entry);
    }
  }
}

// ── Pass 4: same-team prefix/truncation pairs (Rafael Sanchez ↔ Rafael Sanche) ─

for (const [, group] of byTeam) {
  if (group.length < 2) continue;
  for (let i = 0; i < group.length; i++) {
    for (let j = i + 1; j < group.length; j++) {
      const athleteA = group[i]!;
      const athleteB = group[j]!;
      // Pass 1 handles same name_lower; Pass 3 handles accent variants
      if (athleteA.name_lower === athleteB.name_lower) continue;
      if (normalizeName(athleteA.name) === normalizeName(athleteB.name)) continue;
      if (!isPrefixOrTrailingTruncation(athleteA.name_lower, athleteB.name_lower)) continue;
      const entry = scorePairEntry(athleteA.id, athleteB.id, ["same-team prefix"], 0.15);
      if (entry) candidates.push(entry);
    }
  }
}

// ── Load decided pairs (persistent skip-lists) ────────────────────────────────

const rejPath = path.resolve(
  import.meta.dirname,
  "../../split-candidates-rejected.json",
);
const appliedPath = path.resolve(
  import.meta.dirname,
  "../../split-candidates-applied.json",
);

// Pair identity: prefer stable name+team key (survives ID remapping); fall back to id:id.
function pairNameKey(c: CandidateEntry): string {
  const [a, b] = [c.keep, c.absorb].sort(
    (x, y) => x.name.localeCompare(y.name) || x.team.localeCompare(y.team),
  );
  return `${a!.name}|${a!.team}||${b!.name}|${b!.team}`;
}

function pairIdKey(c: CandidateEntry): string {
  return `${c.keep.id}:${c.absorb.id}`;
}

let rejectedEntries: CandidateEntry[] = [];
if (fs.existsSync(rejPath)) {
  try {
    rejectedEntries = JSON.parse(fs.readFileSync(rejPath, "utf-8"));
  } catch {}
}

const rejectedIdKeys = new Set(rejectedEntries.map(pairIdKey));
const rejectedNameKeys = new Set(rejectedEntries.map(pairNameKey));

let appliedEntries: CandidateEntry[] = [];
if (fs.existsSync(appliedPath)) {
  try {
    appliedEntries = JSON.parse(fs.readFileSync(appliedPath, "utf-8"));
  } catch {}
}

const appliedIdKeys = new Set(appliedEntries.map(pairIdKey));
const appliedNameKeys = new Set(appliedEntries.map(pairNameKey));

function isDecided(
  c: CandidateEntry,
  idKeys: Set<string>,
  nameKeys: Set<string>,
): boolean {
  return idKeys.has(pairIdKey(c)) || nameKeys.has(pairNameKey(c));
}

// ── Migrate decided entries out of the main file ──────────────────────────────

let existing: CandidateEntry[] = [];
if (fs.existsSync(outPath)) {
  try {
    existing = JSON.parse(fs.readFileSync(outPath, "utf-8"));
  } catch {}
}

const newlyRejected = existing.filter(
  (c) =>
    c.approved === false && !isDecided(c, rejectedIdKeys, rejectedNameKeys),
);
if (newlyRejected.length > 0) {
  rejectedEntries.push(...newlyRejected);
  for (const c of newlyRejected) {
    rejectedIdKeys.add(pairIdKey(c));
    rejectedNameKeys.add(pairNameKey(c));
  }

  fs.writeFileSync(rejPath, JSON.stringify(rejectedEntries, null, 2));
}

const newlyApplied = existing.filter(
  (c) => c.approved === true && !isDecided(c, appliedIdKeys, appliedNameKeys),
);
if (newlyApplied.length > 0) {
  appliedEntries.push(...newlyApplied);
  for (const c of newlyApplied) {
    appliedIdKeys.add(pairIdKey(c));
    appliedNameKeys.add(pairNameKey(c));
  }

  fs.writeFileSync(appliedPath, JSON.stringify(appliedEntries, null, 2));
}

// Remove all decided pairs — main file only ever contains pending (null) entries
const pending = candidates.filter(
  (c) =>
    !isDecided(c, rejectedIdKeys, rejectedNameKeys) &&
    !isDecided(c, appliedIdKeys, appliedNameKeys),
);

// ── Filter by --top N if specified ───────────────────────────────────────────

// In --top N mode require a minimum confidence to suppress low-signal noise.
// Incompatible-category and extreme-percentile pairs are already hard-excluded above;
// this removes the remaining marginal cases where signals are too weak to trust.
const MIN_CONF_TOP_N = 0.25;

const output =
  TOP_N !== null
    ? pending.filter(
        (c) => c.bestPos <= TOP_N && c.confidence >= MIN_CONF_TOP_N,
      )
    : pending;

// ── Sort ──────────────────────────────────────────────────────────────────────
// --top mode: best finish position, then confidence
// default mode: confidence descending

output.sort((a, b) => {
  if (TOP_N !== null) {
    if (a.bestPos !== b.bestPos) {
      return a.bestPos - b.bestPos;
    }
  }

  return b.confidence - a.confidence;
});

fs.writeFileSync(outPath, JSON.stringify(output, null, 2));

const pendingCount = output.length;
const highPriority = output.filter((c) => c.priority).length;
const sharedLicCount = output.filter((c) => c.sharedLicence).length;
const accentCount = output.filter((c) => c.reason.startsWith("accent variant")).length;
const prefixCount = output.filter((c) => c.reason.startsWith("same-team prefix")).length;
const modeTag = TOP_N !== null ? ` [--top ${TOP_N}]` : "";
console.log(
  `✓ ${pendingCount} pending pair(s)${modeTag} → scraper/split-candidates.json`,
);
if (pendingCount > 0) {
  const breakdownParts = [
    `${pendingCount - accentCount - prefixCount} exact-name`,
    ...(accentCount > 0 ? [`${accentCount} accent-variant`] : []),
    ...(prefixCount > 0 ? [`${prefixCount} same-team-prefix`] : []),
  ];
  console.log(
    `  ${highPriority} high-priority / top-30${sharedLicCount > 0 ? `, ${sharedLicCount} shared-licence` : ""} (${breakdownParts.join(", ")})`,
  );
}

if (newlyRejected.length > 0) {
  console.log(
    `  ${newlyRejected.length} false decision(s) migrated → scraper/split-candidates-rejected.json`,
  );
}

if (newlyApplied.length > 0) {
  console.log(
    `  ${newlyApplied.length} approved decision(s) migrated → scraper/split-candidates-applied.json`,
  );
}

console.log(
  `  Skip-lists: ${rejectedEntries.length} rejected, ${appliedEntries.length} applied`,
);
console.log(`  Set "approved": true to merge, false to skip`);
console.log(`  Then run: npm run db:apply-splits`);
