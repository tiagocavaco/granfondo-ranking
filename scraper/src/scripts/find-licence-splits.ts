/**
 * find-licence-splits.ts
 *
 * Finds athlete profiles that should be merged because they share a licence
 * number — the strongest identity signal available.
 *
 * Unlike find-split-candidates.ts (same-name grouping), this script groups
 * by licence and then validates each pair with name similarity + standard
 * scoring signals. Shared licence is the filter criterion, not a scoring bonus.
 *
 * Usage:
 *   npm run db:find-licence-splits
 *
 * Review:
 *   Open scraper/licence-split-candidates.json
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
  "../../licence-split-candidates.json",
);
const BASE_URL =
  process.env.RANKING_BASE_URL ?? "http://localhost:5173/granfondo-ranking";

const keyHex = process.env.DATA_KEY;
if (!keyHex) {
  console.error("DATA_KEY not set");
  process.exit(1);
}

const enc = fs.readFileSync(encPath);
const plain = decryptBuffer(enc, keyHex);
const db = new BetterSqlite3(plain);

// ── Licence validity filter ───────────────────────────────────────────────────

const LICENCE_REGEX = /^\d{4,12}$/;
const PLACEHOLDER_LICENCES = new Set([
  "0",
  "00000",
  "10000000000",
  "10000000001",
  "99999",
  "11111",
  "12345",
  "-1",
]);

function isValidLicence(licence: string): boolean {
  if (PLACEHOLDER_LICENCES.has(licence)) return false;
  return LICENCE_REGEX.test(licence);
}

// ── Load all (licence, athlete_id) pairs ─────────────────────────────────────

type LicenceRow = { licence: string; athlete_id: number };

const allLicenceRows = db
  .prepare(
    `
  SELECT DISTINCT rl.licence, r.athlete_id
  FROM result_licences rl
  JOIN results r ON r.id = rl.result_id
  WHERE r.athlete_id != 0
`,
  )
  .all() as LicenceRow[];

db.close();

// Filter junk licences
const validLicenceRows = allLicenceRows.filter((row) =>
  isValidLicence(row.licence),
);

// Group athlete IDs by licence
const athletesByLicence = new Map<string, Set<number>>();
for (const row of validLicenceRows) {
  if (!athletesByLicence.has(row.licence)) {
    athletesByLicence.set(row.licence, new Set());
  }

  athletesByLicence.get(row.licence)!.add(row.athlete_id);
}

// Keep only licences with 2+ distinct athletes
const splitLicences = new Map<string, number[]>();
for (const [licence, athleteIds] of athletesByLicence) {
  if (athleteIds.size >= 2) {
    splitLicences.set(
      licence,
      [...athleteIds].sort((a, b) => a - b),
    );
  }
}

const uniqueLicenceCount = splitLicences.size;

if (uniqueLicenceCount === 0) {
  console.log("No licence splits found.");
  console.log("  0 candidate(s) → scraper/licence-split-candidates.json");
  console.log("  0 with same-event clash excluded");
  console.log("  0 unique licences with splits");
  fs.writeFileSync(outPath, JSON.stringify([], null, 2));
  process.exit(0);
}

// ── Collect all affected athlete IDs ─────────────────────────────────────────

const affectedAthleteIds = new Set<number>();
for (const athleteIds of splitLicences.values()) {
  for (const id of athleteIds) affectedAthleteIds.add(id);
}

const affectedIdsArray = [...affectedAthleteIds];
const idPlaceholders = affectedIdsArray.map(() => "?").join(",");

// ── Re-open DB for joined queries ─────────────────────────────────────────────

const enc2 = fs.readFileSync(encPath);
const plain2 = decryptBuffer(enc2, keyHex);
const db2 = new BetterSqlite3(plain2);

// Athlete info
const athleteRows = db2
  .prepare(
    `
  SELECT id, name, canonical_team
  FROM athletes
  WHERE id IN (${idPlaceholders})
`,
  )
  .all(...affectedIdsArray) as {
  id: number;
  name: string;
  canonical_team: string | null;
}[];

const athleteMap = new Map(athleteRows.map((athlete) => [athlete.id, athlete]));

// Results
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

const resultRows = db2
  .prepare(
    `
  SELECT ar.athlete_id, ar.event_year, ar.pos, ar.finisher_count,
         ar.category, ar.distance, ar.dnf, ar.dns, ar.event_id
  FROM athlete_results ar
  WHERE ar.athlete_id IN (${idPlaceholders})
`,
  )
  .all(...affectedIdsArray) as ResultRow[];

const resultsByAthlete = new Map<number, ResultRow[]>();
for (const result of resultRows) {
  if (!resultsByAthlete.has(result.athlete_id)) {
    resultsByAthlete.set(result.athlete_id, []);
  }

  resultsByAthlete.get(result.athlete_id)!.push(result);
}

// All licences for affected athletes (for disjoint-other-licence check)
const athleteLicenceRows = db2
  .prepare(
    `
  SELECT DISTINCT r.athlete_id, rl.licence
  FROM results r
  JOIN result_licences rl ON r.id = rl.result_id
  WHERE r.athlete_id IN (${idPlaceholders})
    AND r.athlete_id != 0
`,
  )
  .all(...affectedIdsArray) as { athlete_id: number; licence: string }[];

db2.close();

// Build athlete → all valid licences map
const licencesByAthlete = new Map<number, Set<string>>();
for (const row of athleteLicenceRows) {
  if (!isValidLicence(row.licence)) continue;
  if (!licencesByAthlete.has(row.athlete_id)) {
    licencesByAthlete.set(row.athlete_id, new Set());
  }

  licencesByAthlete.get(row.athlete_id)!.add(row.licence);
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function tokenSimilarity(nameA: string, nameB: string): number {
  const tokensA = new Set(nameA.toLowerCase().split(/\s+/).filter(Boolean));
  const tokensB = new Set(nameB.toLowerCase().split(/\s+/).filter(Boolean));
  if (tokensA.size === 0 || tokensB.size === 0) return 0;
  const intersection = [...tokensA].filter((token) =>
    tokensB.has(token),
  ).length;
  const union = new Set([...tokensA, ...tokensB]).size;
  return intersection / union;
}

function medianPercentile(results: ResultRow[]): number | null {
  const finished = results.filter(
    (result) =>
      !result.dnf && !result.dns && result.finisher_count > 0 && result.pos > 0,
  );
  if (finished.length === 0) return null;

  const percentiles = finished
    .map((result) => result.pos / result.finisher_count)
    .sort((a, b) => a - b);
  const mid = Math.floor(percentiles.length / 2);
  return percentiles.length % 2 === 0
    ? (percentiles[mid - 1]! + percentiles[mid]!) / 2
    : percentiles[mid]!;
}

function primaryCategory(results: ResultRow[]): string | null {
  const frequency = new Map<string, number>();
  for (const result of results) {
    if (result.category) {
      frequency.set(result.category, (frequency.get(result.category) ?? 0) + 1);
    }
  }

  if (frequency.size === 0) return null;

  let bestCategory = "";
  let bestCount = 0;
  for (const [category, count] of frequency) {
    if (count > bestCount) {
      bestCategory = category;
      bestCount = count;
    }
  }

  return bestCategory || null;
}

function normalizeCat(category: string): string {
  let normalized = category.trim().toLowerCase();
  normalized = normalized.replace(
    /^(masculino|feminino|masc\.?|fem\.?|[mf])\s+/,
    "",
  );
  normalized = normalized.replace(
    /\s+(masculino|feminino|masc\.?|fem\.?|[mf]\.?)$/,
    "",
  );
  normalized = normalized.replace(/\belites?\b/g, "elite");
  normalized = normalized.replace(/\bjuniors?|juniores?\b/g, "junior");
  normalized = normalized.replace(/\bsub[-\s]?23\b/g, "sub23");
  normalized = normalized.replace(/\bjuvenis\b/g, "juvenil");
  normalized = normalized.replace(
    /\bmasters?\s*([a-f])\b/g,
    (_, group) => `master ${group}`,
  );
  return normalized.trim();
}

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
    (tier) => normalizedCat === tier || normalizedCat.startsWith(tier + " "),
  );
}

function categoryCompatibility(
  catA: string | null,
  catB: string | null,
): "same" | "adjacent" | "different" {
  if (!catA || !catB) return "different";
  const normA = normalizeCat(catA);
  const normB = normalizeCat(catB);
  if (normA === normB) return "same";
  const indexA = catLadderIndex(normA);
  const indexB = catLadderIndex(normB);
  if (indexA >= 0 && indexB >= 0 && Math.abs(indexA - indexB) === 1) {
    return "adjacent";
  }

  return "different";
}

function yearRange(results: ResultRow[]): { min: number; max: number } | null {
  const years = results
    .map((result) => result.event_year)
    .filter((year) => year > 0);
  if (years.length === 0) return null;
  return { min: Math.min(...years), max: Math.max(...years) };
}

function bestFinish(results: ResultRow[]): number {
  const positions = results
    .filter((result) => !result.dnf && !result.dns && result.pos > 0)
    .map((result) => result.pos);
  return positions.length > 0 ? Math.min(...positions) : Infinity;
}

// ── Score pairs ───────────────────────────────────────────────────────────────

interface CandidateEntry {
  confidence: number;
  reason: string;
  bestPos: number;
  sharedLicence: true;
  licence: string;
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
let sameEventClashCount = 0;

for (const [licence, athleteIds] of splitLicences) {
  for (let i = 0; i < athleteIds.length; i++) {
    for (let j = i + 1; j < athleteIds.length; j++) {
      const idA = athleteIds[i]!;
      const idB = athleteIds[j]!;
      const resultsA = resultsByAthlete.get(idA) ?? [];
      const resultsB = resultsByAthlete.get(idB) ?? [];
      const allLicencesA = licencesByAthlete.get(idA) ?? new Set<string>();
      const allLicencesB = licencesByAthlete.get(idB) ?? new Set<string>();

      // Hard exclude: appeared in the same event — definitely different athletes
      const eventsA = new Set(resultsA.map((result) => result.event_id));
      if (resultsB.some((result) => eventsA.has(result.event_id))) {
        sameEventClashCount++;
        continue;
      }

      // Hard exclude: both have non-empty OTHER licence sets that are disjoint.
      // If athlete A's other licences and B's other licences share nothing, they
      // are different people who happen to share one licence number.
      const otherLicencesA = new Set(
        [...allLicencesA].filter((lic) => lic !== licence),
      );
      const otherLicencesB = new Set(
        [...allLicencesB].filter((lic) => lic !== licence),
      );
      if (otherLicencesA.size > 0 && otherLicencesB.size > 0) {
        const hasOtherShared = [...otherLicencesA].some((lic) =>
          otherLicencesB.has(lic),
        );
        if (!hasOtherShared) continue;
      }

      // keep = more results, absorb = fewer
      const [
        keepId,
        absorbId,
        keepRow,
        absorbRow,
        keepResults,
        absorbResults,
        keepLicences,
        absorbLicences,
      ] =
        resultsA.length >= resultsB.length
          ? [
              idA,
              idB,
              athleteMap.get(idA)!,
              athleteMap.get(idB)!,
              resultsA,
              resultsB,
              allLicencesA,
              allLicencesB,
            ]
          : [
              idB,
              idA,
              athleteMap.get(idB)!,
              athleteMap.get(idA)!,
              resultsB,
              resultsA,
              allLicencesB,
              allLicencesA,
            ];

      if (!keepRow || !absorbRow) continue;

      // Gate: only emit if names are plausibly the same person.
      // Licence conflicts from bad registration data (wrong number entered) are
      // silently discarded here — they'd score near-zero on name signals anyway.
      const nameSimilarity = tokenSimilarity(keepRow.name, absorbRow.name);
      const nameA = keepRow.name.toLowerCase().replace(/\s+/g, " ").trim();
      const nameB = absorbRow.name.toLowerCase().replace(/\s+/g, " ").trim();
      const isSubstring = nameA.includes(nameB) || nameB.includes(nameA);
      if (nameSimilarity < 0.4 && !isSubstring) continue;

      let score = 0;
      const reasons: string[] = [`shared licence (${licence})`];

      // Token name similarity — Jaccard on name tokens
      if (nameSimilarity >= 0.8) {
        score += 0.4;
        reasons.push(
          `name match (${Math.round(nameSimilarity * 100)}% token overlap)`,
        );
      } else if (nameSimilarity >= 0.5) {
        score += 0.2;
        reasons.push(
          `partial name match (${Math.round(nameSimilarity * 100)}% token overlap)`,
        );
      } else if (nameSimilarity < 0.3) {
        score -= 0.15;
        reasons.push(
          `weak name match (${Math.round(nameSimilarity * 100)}% token overlap)`,
        );
      }

      // Fragment signal — fewer results on the absorb profile → more likely a fragment
      const fragmentCount = absorbResults.length;
      if (fragmentCount <= 1) {
        score += 0.35;
        reasons.push(`fragment (${fragmentCount} result)`);
      } else if (fragmentCount <= 3) {
        score += 0.25;
        reasons.push(`fragment (${fragmentCount} results)`);
      } else if (fragmentCount <= 5) {
        score += 0.1;
        reasons.push(`small profile (${fragmentCount} results)`);
      }

      // Category compatibility
      const catKeep = primaryCategory(keepResults);
      const catAbsorb = primaryCategory(absorbResults);
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
      const percentileKeep = medianPercentile(keepResults);
      const percentileAbsorb = medianPercentile(absorbResults);
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

      // Year relationship
      const rangeKeep = yearRange(keepResults);
      const rangeAbsorb = yearRange(absorbResults);
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

      const pairBestPos = Math.min(
        bestFinish(keepResults),
        bestFinish(absorbResults),
      );
      const yearsKeep = rangeKeep
        ? rangeKeep.min === rangeKeep.max
          ? `${rangeKeep.min}`
          : `${rangeKeep.min}–${rangeKeep.max}`
        : "?";
      const yearsAbsorb = rangeAbsorb
        ? rangeAbsorb.min === rangeAbsorb.max
          ? `${rangeAbsorb.min}`
          : `${rangeAbsorb.min}–${rangeAbsorb.max}`
        : "?";

      candidates.push({
        confidence: Math.round(score * 100) / 100,
        reason: reasons.join(", "),
        bestPos: pairBestPos === Infinity ? 9999 : pairBestPos,
        sharedLicence: true,
        licence,
        keep: {
          id: keepId,
          name: keepRow.name,
          team: keepRow.canonical_team ?? "",
          licences: [...keepLicences],
          results: keepResults.length,
          category: catKeep,
          years: yearsKeep,
          url: `${BASE_URL}/athlete/${keepId}`,
        },
        absorb: {
          id: absorbId,
          name: absorbRow.name,
          team: absorbRow.canonical_team ?? "",
          licences: [...absorbLicences],
          results: absorbResults.length,
          category: catAbsorb,
          years: yearsAbsorb,
          url: `${BASE_URL}/athlete/${absorbId}`,
        },
        approved: null,
      });
    }
  }
}

// ── Preserve approved:false decisions from previous run ───────────────────────

// Pair identity: licence + sorted id pair
function pairKey(entry: CandidateEntry): string {
  const ids = [entry.keep.id, entry.absorb.id].sort((a, b) => a - b);
  return `${entry.licence}|${ids[0]}:${ids[1]}`;
}

let previouslyRejected = new Set<string>();
if (fs.existsSync(outPath)) {
  try {
    const previous = JSON.parse(
      fs.readFileSync(outPath, "utf-8"),
    ) as CandidateEntry[];
    previouslyRejected = new Set(
      previous.filter((entry) => entry.approved === false).map(pairKey),
    );
  } catch {}
}

// Carry forward approved:false on matching candidates
for (const candidate of candidates) {
  if (previouslyRejected.has(pairKey(candidate))) {
    candidate.approved = false;
  }
}

// ── Sort by confidence descending ────────────────────────────────────────────

candidates.sort((a, b) => b.confidence - a.confidence);

// ── Write output ──────────────────────────────────────────────────────────────

fs.writeFileSync(outPath, JSON.stringify(candidates, null, 2));

console.log(
  `✓ ${candidates.length} candidate(s) → scraper/licence-split-candidates.json`,
);
console.log(`  ${sameEventClashCount} with same-event clash excluded`);
console.log(`  ${uniqueLicenceCount} unique licences with splits`);
