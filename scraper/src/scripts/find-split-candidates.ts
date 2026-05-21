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

const encPath = path.resolve(
  import.meta.dirname,
  "../../../frontend/public/data/data.db.enc",
);
const outPath = path.resolve(
  import.meta.dirname,
  "../../split-candidates.json",
);
const BASE_URL =
  process.env.RANKING_BASE_URL ?? "http://localhost:5174/granfondo-ranking";

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

for (const group of nameGroupRows) {
  const ids = group.ids.split(",").map(Number);

  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      const idA = ids[i]!;
      const idB = ids[j]!;
      const resultsA = resultsByAthlete.get(idA) ?? [];
      const resultsB = resultsByAthlete.get(idB) ?? [];
      const licsA = licencesByAthlete.get(idA) ?? new Set<string>();
      const licsB = licencesByAthlete.get(idB) ?? new Set<string>();

      // Hard exclude: appeared in the same race — definitely different athletes
      const eventsA = new Set(resultsA.map((r) => r.event_id));
      if (resultsB.some((r) => eventsA.has(r.event_id))) {
        continue;
      }

      // Hard exclude: both have non-empty disjoint licence sets — different people
      if (licsA.size > 0 && licsB.size > 0) {
        const shared = [...licsA].some((l) => licsB.has(l));
        if (!shared) {
          continue;
        }
        // Shared licence: should self-heal via Pass 1, but if they're split now they may need
        // a manual alias. Fall through to score normally — sharedLicence flag marks these.
      }

      // Hard exclude: incompatible categories in any year both athletes raced.
      // Two athletes can't be the same person if they're in different master tiers at the
      // same event-year (even across different events).
      {
        const yearsA = new Set(resultsA.map((r) => r.event_year));
        const sharedYears = [
          ...new Set(resultsB.map((r) => r.event_year)),
        ].filter((y) => yearsA.has(y));
        let incompatCat = false;
        for (const yr of sharedYears) {
          const catsA = resultsA
            .filter((r) => r.event_year === yr && r.category)
            .map((r) => r.category);
          const catsB = resultsB
            .filter((r) => r.event_year === yr && r.category)
            .map((r) => r.category);
          if (catsA.length > 0 && catsB.length > 0) {
            // Same year → categories must be identical after normalisation; adjacent is not enough.
            const anySame = catsA.some((ca) =>
              catsB.some((cb) => categoryCompatibility(ca, cb) === "same"),
            );
            if (!anySame) {
              incompatCat = true;
              break;
            }
          }
        }

        if (incompatCat) {
          continue;
        }
      }

      // Hard exclude: adjacent categories moving in the wrong aging direction across non-overlapping years.
      // Valid:   Elite in 2024 → Master A in 2025 (ladder index increases over time — normal aging).
      // Invalid: Master A in 2024 → Elite in 2026 (impossible regression to a younger category).
      // Only fires when both categories are on the master ladder and year ranges don't overlap.
      {
        const catA = primaryCategory(resultsA);
        const catB = primaryCategory(resultsB);
        if (catA && catB && categoryCompatibility(catA, catB) === "adjacent") {
          const iaA = catLadderIndex(normalizeCat(catA));
          const iaB = catLadderIndex(normalizeCat(catB));
          const rangeA = yearRange(resultsA);
          const rangeB = yearRange(resultsB);
          if (iaA >= 0 && iaB >= 0 && rangeA && rangeB) {
            const overlaps =
              rangeA.min <= rangeB.max && rangeB.min <= rangeA.max;
            if (!overlaps) {
              const aIsEarlier = rangeA.max < rangeB.min;
              const aIsOlder = iaA > iaB;
              // Wrong direction: earlier period has the more senior (higher) category
              if (aIsEarlier === aIsOlder) {
                continue;
              }
            }
          }
        }
      }

      // Hard exclude: percentile difference > 10%.
      // A genuine split races at similar ability levels across all their appearances.
      {
        const pA = medianPercentile(resultsA);
        const pB = medianPercentile(resultsB);
        if (pA !== null && pB !== null && Math.abs(pA - pB) > 0.1) {
          continue;
        }
      }

      const athleteA = athleteMap.get(idA)!;
      const athleteB = athleteMap.get(idB)!;

      // keep = more results, absorb = fewer
      const [
        keepId,
        absorbId,
        keepRow,
        absorbRow,
        keepRes,
        absorbRes,
        keepLics,
        absorbLics,
      ] =
        resultsA.length >= resultsB.length
          ? [idA, idB, athleteA, athleteB, resultsA, resultsB, licsA, licsB]
          : [idB, idA, athleteB, athleteA, resultsB, resultsA, licsB, licsA];

      const hasSharedLicence =
        licsA.size > 0 &&
        licsB.size > 0 &&
        [...licsA].some((l) => licsB.has(l));
      let score = 0;
      const reasons: string[] = [];

      // Shared licence — definitive identity signal
      if (hasSharedLicence) {
        score += 0.6;
        const sharedLics = [...licsA].filter((l) => licsB.has(l));
        reasons.push(`shared licence (${sharedLics.join(", ")})`);
      }

      // Fragment signal
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

      // Category compatibility
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

      // Percentile similarity
      const pKeep = medianPercentile(keepRes);
      const pAbsorb = medianPercentile(absorbRes);
      if (pKeep !== null && pAbsorb !== null) {
        const diff = Math.abs(pKeep - pAbsorb);
        if (diff <= 0.1) {
          score += 0.15;
          reasons.push(
            `similar percentile (${Math.round(pKeep * 100)}% vs ${Math.round(pAbsorb * 100)}%)`,
          );
        } else if (diff <= 0.2) {
          score += 0.07;
          reasons.push(
            `close percentile (${Math.round(pKeep * 100)}% vs ${Math.round(pAbsorb * 100)}%)`,
          );
        } else if (diff > 0.35) {
          score -= 0.1;
          reasons.push(
            `different percentile (${Math.round(pKeep * 100)}% vs ${Math.round(pAbsorb * 100)}%)`,
          );
        } else {
          reasons.push(
            `percentile ${Math.round(pKeep * 100)}% vs ${Math.round(pAbsorb * 100)}%`,
          );
        }
      }

      // Year relationship
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
        } else if (!overlaps) {
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
      const isHighPriority = pairBestPos <= 30;
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

      if (hasSharedLicence) {
        entry.sharedLicence = true;
      }

      if (isHighPriority) {
        entry.priority = true;
      }

      candidates.push(entry);
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
const modeTag = TOP_N !== null ? ` [--top ${TOP_N}]` : "";
console.log(
  `✓ ${pendingCount} pending pair(s)${modeTag} → scraper/split-candidates.json`,
);
if (pendingCount > 0) {
  console.log(
    `  ${highPriority} high-priority / top-30${sharedLicCount > 0 ? `, ${sharedLicCount} shared-licence` : ""}`,
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
