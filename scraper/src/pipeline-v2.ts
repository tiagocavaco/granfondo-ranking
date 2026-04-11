/**
 * pipeline-v2.ts
 *
 * 6-pass athlete index builder. See ATHLETE_PIPELINE_PLAN.md for full design rationale.
 *
 * Pass 1 — Licence athletes only (authoritative)
 * Pass 2 — Unlicensed team results matched by name + team
 * Pass 3 — Solo results via explicit athlete aliases
 * Pass 5 — Remaining athletes (team: name+team grouping; solo: one profile per result)
 * Pass 6 — Manual result assignments (result-assignments.json)
 */

import {
  normalizeName,
  teamNormalKey,
  teamKeySimilarity,
  levenshteinDistance,
  isValidLicence,
  normalizeCategory,
  fixRawTeamName,
  canonicalTeam,
  posToBasePoints,
  finisherCoefficient,
  rankToTeamBasePoints,
  teamCoefficient,
} from "./normalize.js";
import type {
  StoredEvent,
  StoredEventResults,
  StoredDistanceResults,
  StoredResult,
  AthleteEntry,
  AthleteResultRef,
  AggregateAthlete,
  AggregateRanking,
  TeamRanking,
  TeamEntry,
} from "./types.js";

// ── Re-exports for compatibility ──────────────────────────────────────────────

export type { AthleteEntry };
export type ResultsLoader = (id: number) => StoredEventResults | null;
export type AthleteIdStore = Map<string, number>;

export {
  isGranfondoName,
  isKidsCamVariant,
  extractDistances,
  assignGenderPositions,
  transformResult,
  SOLO_TEAM_KEYS,
} from "./pipeline.js";

export {
  normalizeName as normalizeAthleteNameKey,
  isValidLicence,
  levenshteinDistance,
} from "./normalize.js";

// ── Category map ──────────────────────────────────────────────────────────────

const CATEGORY_MAP: Record<string, string> = {
  // Elite Male
  "ELITES M": "Elite Male", "M ELITES": "Elite Male", "Elite M.": "Elite Male",
  "Elite Masc": "Elite Male", "M Elite": "Elite Male",
  "M SUB23": "Elite Male",
  // Elite Female
  "ELITES F": "Elite Female", "F ELITES": "Elite Female", "Elite F.": "Elite Female",
  "Elites Fem": "Elite Female", "F Elite": "Elite Female",
  "F SUB23": "Elite Female",
  // Open 19-34 — ambiguous between Elite and Masters A; rules out Masters B+
  "M 19-34": "Open 19-34 Male",
  "F 19-34": "Open 19-34 Female",
  // Junior Male
  "M JUN": "Junior Male", "M Junior": "Junior Male",
  "Junior M.": "Junior Male", "Juniores Masc": "Junior Male",
  // Junior Female
  "F JUN": "Junior Female", "Junior F.": "Junior Female",
  // Cadete Male
  "M Cadete": "Cadete Male", "Cadete Masc": "Cadete Male",
  // Masters A Male
  "MASTERS A": "Masters A Male", "M Masters A": "Masters A Male",
  "Master A": "Masters A Male", "MasterA Masc": "Masters A Male",
  "MASTER 30": "Masters A Male", "MASTER 35": "Masters A Male", "M 35-39": "Masters A Male",
  // Masters B Male
  "MASTERS B": "Masters B Male", "M Masters B": "Masters B Male",
  "Master B": "Masters B Male", "MasterB Masc": "Masters B Male",
  "MASTER 40": "Masters B Male", "M 40-44": "Masters B Male",
  "MASTER 45": "Masters B Male", "M 45-49": "Masters B Male",
  // Masters C Male
  "MASTERS C": "Masters C Male", "M Masters C": "Masters C Male",
  "Master C": "Masters C Male", "MasterC Masc": "Masters C Male",
  "MASTER 50": "Masters C Male", "M 50-54": "Masters C Male",
  "MASTER 55": "Masters C Male", "M 55-59": "Masters C Male",
  // Masters D Male
  "MASTERS D": "Masters D Male", "M Masters D": "Masters D Male",
  "Master D": "Masters D Male", "MasterDM": "Masters D Male",
  "MASTER 60": "Masters D Male", "M 60-64": "Masters D Male",
  "MASTER 65": "Masters D Male", "M 65-69": "Masters D Male",
  // Masters E Male
  "MASTERS E": "Masters E Male", "M Master E": "Masters E Male",
  "Master E": "Masters E Male", "MasterEM": "Masters E Male",
  "MASTER 70": "Masters E Male", "M 70-74": "Masters E Male", "M 75-79": "Masters E Male",
  // Masters A Female
  "MASTERS A FEM": "Masters A Female", "F MASTERS A": "Masters A Female",
  "F Masters A": "Masters A Female", "Master A Fem": "Masters A Female",
  "F MASTER 30": "Masters A Female", "F MASTER 35": "Masters A Female", "F 35-39": "Masters A Female",
  // Masters B Female
  "MASTERS B FEM": "Masters B Female", "F MASTERS B": "Masters B Female",
  "F Mastres B": "Masters B Female", "Master B Fem": "Masters B Female",
  "F MASTER 40": "Masters B Female", "F 40-44": "Masters B Female",
  "F MASTER 45": "Masters B Female", "F 45-49": "Masters B Female",
  // Masters C Female
  "MASTERS C FEM": "Masters C Female", "F MASTERS C": "Masters C Female",
  "F Masters C": "Masters C Female", "Master C Fem": "Masters C Female",
  "F MASTER 50": "Masters C Female", "F 50-54": "Masters C Female",
  "F MASTER 55": "Masters C Female", "F 55-59": "Masters C Female",
  // Masters D Female
  "MASTERS D FEM": "Masters D Female", "F MASTERS D": "Masters D Female",
  "F MASTER D": "Masters D Female", "F 60-64": "Masters D Female",
  // E-Bike
  "EBIKE": "E-Bike", "E-BIKE": "E-Bike", "E-Bikes": "E-Bike",
  // Paracycling
  "PARACICLISMO": "Paracycling", "PARACICLISTA": "Paracycling", "PARACLISMO": "Paracycling",
  // Unknown / misc
  "": "Unknown", "Sem Escalão": "Unknown",
  "MASTERS F": "Masters F Male", "MASTERS F ": "Masters F Male",
};

export function canonicalizeCategory(raw: string): string {
  if (raw in CATEGORY_MAP) return CATEGORY_MAP[raw]!;
  const fallback = normalizeCategory(raw);
  return fallback !== raw ? fallback : "Unknown";
}

// ── Team helpers ──────────────────────────────────────────────────────────────

export const SOLO_TEAM_NAMES = new Set([
  "individual", "independente", "no team", "sem equipa", "",
]);

export function isSoloTeam(team: string): boolean {
  return !team.trim() || SOLO_TEAM_NAMES.has(teamNormalKey(team));
}

export function teamsMatch(a: string, b: string): boolean {
  const ka = teamNormalKey(a);
  const kb = teamNormalKey(b);
  if (ka === kb) return true;
  return teamKeySimilarity(ka, kb) === 1;
}

export const DISTANCE_ALIASES: Record<string, string> = {
  granfondo: "Granfondo", mediofondo: "Mediofondo", minifondo: "Minifondo",
  "time trial": "Time Trial", "big day": "Granfondo", "half day": "Mediofondo",
  "clássica": "Granfondo", "classica": "Granfondo", "etapa": "Mediofondo",
};

export function normalizeDistance(name: string): string {
  return DISTANCE_ALIASES[name.toLowerCase()] ?? name;
}

// ── Alias types ───────────────────────────────────────────────────────────────

export interface AthleteAliasRule {
  name: string;
  canonicalTeam: string;
  aliases: Array<{ name: string; team: string }>;
  note?: string;
}

export interface ResultAssignment {
  eventId: number;
  bib: string;
  athleteId: number;
  note?: string;
}

/**
 * Returns true if two canonical categories are compatible for the same athlete.
 * Open 19-34 is ambiguous between Elite and Masters A — compatible with both,
 * incompatible with Masters B and above.
 */
function categoriesCompatible(a: string, b: string): boolean {
  if (a === b) return true;
  const OPEN_M = "Open 19-34 Male";
  const OPEN_F = "Open 19-34 Female";
  if (a === OPEN_M) return b === "Elite Male" || b === "Masters A Male" || b === OPEN_M;
  if (b === OPEN_M) return a === "Elite Male" || a === "Masters A Male" || a === OPEN_M;
  if (a === OPEN_F) return b === "Elite Female" || b === "Masters A Female" || b === OPEN_F;
  if (b === OPEN_F) return a === "Elite Female" || a === "Masters A Female" || a === OPEN_F;
  return false;
}

// ── Duplicate flag ────────────────────────────────────────────────────────────

export interface DuplicateFlag {
  athleteId: number;
  eventId: number;
  eventName: string;
  existing: { category: string; team: string };
  incoming: { category: string; team: string };
  resolution: "kept_licenced" | "kept_by_category" | "flagged_manual";
}

// ── Internal helpers ──────────────────────────────────────────────────────────

function resultKey(eventId: number, distName: string, bib: string): string {
  return `${eventId}|${distName}|${bib}`;
}

function newEntry(id: number, name: string, nameLower: string): AthleteEntry {
  return { id, name, nameLower, teams: [], categories: {}, results: [] };
}

function addToTeamsAndCategories(entry: AthleteEntry, result: AthleteResultRef): void {
  const tk = teamNormalKey(result.team);
  if (tk && !isSoloTeam(result.team) && !entry.teams.includes(tk)) {
    entry.teams.push(tk);
  }
  // Store original raw category string — canonical map is used only for dedup internally
  const rawCat = result.category;
  const year = String(result.eventYear);
  if (!entry.categories[year]) entry.categories[year] = [];
  if (rawCat && !entry.categories[year]!.includes(rawCat)) {
    entry.categories[year]!.push(rawCat);
  }
}

function addResult(
  entry: AthleteEntry,
  result: AthleteResultRef,
  hasLicence: boolean,
  flags: DuplicateFlag[]
): void {
  const existing = entry.results.find((r) => r.eventId === result.eventId);
  if (!existing) {
    entry.results.push(result);
    addToTeamsAndCategories(entry, result);
    return;
  }

  const existingCat = canonicalizeCategory(existing.category);
  const incomingCat = canonicalizeCategory(result.category);

  // Same or compatible canonical category — treat as duplicate, keep licenced result
  if (categoriesCompatible(existingCat, incomingCat)) {
    if (hasLicence) {
      entry.results.splice(entry.results.indexOf(existing), 1, result);
    }
    return;
  }

  // Different categories — use athlete's known categories for this year to decide
  const year = String(result.eventYear);
  // Canonicalize stored raw categories on-the-fly for comparison
  const knownCanon = (entry.categories[year] ?? []).map(canonicalizeCategory);
  const existingMatches = knownCanon.some((c) => categoriesCompatible(c, existingCat));
  const incomingMatches = knownCanon.some((c) => categoriesCompatible(c, incomingCat));

  if (existingMatches && !incomingMatches) return;
  if (incomingMatches && !existingMatches) {
    entry.results.splice(entry.results.indexOf(existing), 1, result);
    addToTeamsAndCategories(entry, result);
    return;
  }

  flags.push({
    athleteId: entry.id,
    eventId: result.eventId,
    eventName: result.eventName,
    existing: { category: existing.category, team: existing.team },
    incoming: { category: result.category, team: result.team },
    resolution: "flagged_manual",
  });
  entry.results.push(result);
  addToTeamsAndCategories(entry, result);
}

function deriveCanonicalTeam(entry: AthleteEntry): void {
  const mostRecent = [...entry.results]
    .sort((a, b) => new Date(b.eventDate).getTime() - new Date(a.eventDate).getTime())
    .find((r) => !isSoloTeam(r.team));
  if (mostRecent) entry.canonicalTeam = mostRecent.team;
}

function toRef(r: StoredResult, event: StoredEvent, distName: string): AthleteResultRef {
  return {
    eventId: event.id,
    eventName: event.name,
    eventDate: event.date,
    eventYear: event.year,
    distance: distName,
    pos: r.pos,
    category: r.category,
    gender: r.gender,
    team: r.team,
    country: r.country,
    raceTime: r.raceTime,
    raceTimeSecs: r.raceTimeSecs,
    gap: r.gap,
    gapSecs: r.gapSecs,
    dnf: r.dnf,
    dns: r.dns,
  };
}

function makeIdManager(idStore: AthleteIdStore) {
  const minted = new Map<string, number>();
  const existing = [...idStore.values()];
  let nextId = existing.length > 0 ? Math.max(...existing) + 1 : 1;
  return {
    get(key: string): number {
      if (idStore.has(key)) return idStore.get(key)!;
      if (minted.has(key)) return minted.get(key)!;
      const id = nextId++;
      minted.set(key, id);
      return id;
    },
    getMinted() { return minted; },
  };
}

// ── Main builder ──────────────────────────────────────────────────────────────

export function buildAthletesIndexV2(
  events: StoredEvent[],
  loader: ResultsLoader,
  aliasRules: AthleteAliasRule[],
  assignments: ResultAssignment[],
  idStore: AthleteIdStore = new Map()
): {
  index: Map<string, AthleteEntry>;
  updatedIdStore: AthleteIdStore;
  flags: DuplicateFlag[];
} {
  const flags: DuplicateFlag[] = [];
  const ids = makeIdManager(idStore);
  const index = new Map<string, AthleteEntry>();
  const assigned = new Set<string>(); // resultKey → assigned

  // Preload all results
  const allResults: Array<{
    event: StoredEvent;
    dist: StoredDistanceResults;
    r: StoredResult;
    rKey: string;
  }> = [];

  for (const event of events.filter((e) => e.hasResults)) {
    const stored = loader(event.id);
    if (!stored) continue;
    for (const dist of stored.distances) {
      for (const r of dist.results) {
        allResults.push({ event, dist, r, rKey: resultKey(event.id, dist.name, r.bib) });
      }
    }
  }

  // ── Pass 1: licence athletes ──────────────────────────────────────────────

  // Collect results per licence
  const licenceToResults = new Map<string, Array<{ event: StoredEvent; dist: StoredDistanceResults; r: StoredResult }>>();
  const licenceToNames = new Map<string, Set<string>>();

  for (const { event, dist, r } of allResults) {
    const validLicences = r.licences.filter(isValidLicence);
    if (validLicences.length === 0) continue;
    const nameLower = normalizeName(r.name);
    for (const lic of validLicences) {
      if (!licenceToNames.has(lic)) licenceToNames.set(lic, new Set());
      if (!licenceToResults.has(lic)) licenceToResults.set(lic, []);
      licenceToNames.get(lic)!.add(nameLower);
      licenceToResults.get(lic)!.push({ event, dist, r });
    }
  }

  // Resolve name conflicts per licence
  const licenceToCanonicalName = new Map<string, string>();
  for (const [lic, names] of licenceToNames) {
    const arr = [...names].sort((a, b) => b.length - a.length);
    if (arr.length === 1) {
      licenceToCanonicalName.set(lic, arr[0]!);
    } else {
      const canonical = arr[0]!;
      const allClose = arr.slice(1).every((n) => levenshteinDistance(canonical, n) <= 2);
      if (allClose) {
        licenceToCanonicalName.set(lic, canonical);
        console.log(`  [pass1] licence ${lic}: merged name variants: ${arr.join(", ")} → "${canonical}"`);
      } else {
        console.warn(`  [pass1] licence ${lic}: SKIPPED — distinct names: ${arr.join(", ")}`);
      }
    }
  }

  // Build one entry per (canonName, bestTeamKey) — no re-keying
  for (const [lic, canonName] of licenceToCanonicalName) {
    const results = licenceToResults.get(lic)!;

    // Best team: most-recent non-solo result for this licence's results
    const teamResult = results
      .filter((x) => !isSoloTeam(x.r.team))
      .sort((a, b) => new Date(b.event.date).getTime() - new Date(a.event.date).getTime())[0];
    const teamKey = teamResult ? teamNormalKey(teamResult.r.team) : "";
    const key = `${canonName}|${teamKey}`;

    if (!index.has(key)) {
      const displayName = results.reduce(
        (best, x) => (x.r.name.length > best.length ? x.r.name : best), ""
      );
      index.set(key, newEntry(ids.get(key), displayName, canonName));
    }
    const entry = index.get(key)!;

    for (const { event, dist, r } of results) {
      const rk = resultKey(event.id, dist.name, r.bib);
      if (assigned.has(rk)) continue;
      assigned.add(rk);
      addResult(entry, toRef(r, event, dist.name), true, flags);
    }
  }

  console.log(`  [pass1] ${index.size} licence-verified athletes built`);

  // Name lookup: nameLower → list of index keys
  function buildNameLookup(): Map<string, string[]> {
    const map = new Map<string, string[]>();
    for (const [key, entry] of index) {
      if (!map.has(entry.nameLower)) map.set(entry.nameLower, []);
      map.get(entry.nameLower)!.push(key);
    }
    return map;
  }

  // ── Pass 2: unlicensed team results by name + team ────────────────────────

  let pass2 = 0;
  const nameLookup = buildNameLookup();

  for (const { event, dist, r, rKey } of allResults) {
    if (assigned.has(rKey)) continue;
    if (isSoloTeam(r.team)) continue;
    if (r.licences.some(isValidLicence)) continue;

    const nameLower = normalizeName(r.name);
    const candidates = (nameLookup.get(nameLower) ?? []).filter((key) =>
      index.get(key)!.teams.some((tk) => teamsMatch(tk, r.team))
    );

    if (candidates.length === 1) {
      assigned.add(rKey);
      addResult(index.get(candidates[0]!)!, toRef(r, event, dist.name), false, flags);
      pass2++;
    } else if (candidates.length > 1) {
      console.warn(
        `  [pass2] ambiguous: "${r.name}" / "${r.team}" @ event ${event.id} — ${candidates.length} matches — left for pass5`
      );
    }
  }

  console.log(`  [pass2] ${pass2} unlicensed results matched by name+team`);

  // ── Pass 3: solo results via explicit athlete aliases ─────────────────────

  let pass3 = 0;
  const nameLookupP3 = buildNameLookup();

  for (const rule of aliasRules) {
    const canonNameLower = normalizeName(rule.name);
    const canonKey = `${canonNameLower}|${teamNormalKey(rule.canonicalTeam)}`;
    const canonEntry = index.get(canonKey);
    if (!canonEntry) continue;

    for (const alias of rule.aliases) {
      if (alias.team !== "") continue;
      const aliasNameLower = normalizeName(alias.name);

      for (const { event, dist, r, rKey } of allResults) {
        if (assigned.has(rKey)) continue;
        if (!isSoloTeam(r.team)) continue;
        if (normalizeName(r.name) !== aliasNameLower) continue;
        assigned.add(rKey);
        addResult(canonEntry, toRef(r, event, dist.name), false, flags);
        pass3++;
      }
    }
    deriveCanonicalTeam(canonEntry);
  }

  console.log(`  [pass3] ${pass3} solo results absorbed via athlete aliases`);

  // ── Pass 5: remaining athletes ────────────────────────────────────────────

  let pass5Team = 0;
  let pass5Solo = 0;

  // 5a: team results — group by (nameLower, canonicalTeamKey) with fuzzy matching
  for (const { event, dist, r, rKey } of allResults) {
    if (assigned.has(rKey)) continue;
    if (isSoloTeam(r.team)) continue;

    const nameLower = normalizeName(r.name);
    const tk = teamNormalKey(r.team);
    const exactKey = `${nameLower}|${tk}`;

    let matchKey: string | undefined;
    if (index.has(exactKey)) {
      matchKey = exactKey;
    } else {
      // Fuzzy scan: same name, similar team
      for (const [k, e] of index) {
        if (e.nameLower !== nameLower) continue;
        const kTeam = k.includes("|") ? k.slice(k.indexOf("|") + 1) : "";
        if (teamKeySimilarity(tk, kTeam) === 1) { matchKey = k; break; }
      }
    }

    assigned.add(rKey);
    if (matchKey) {
      addResult(index.get(matchKey)!, toRef(r, event, dist.name), false, flags);
    } else {
      index.set(exactKey, newEntry(ids.get(exactKey), r.name, nameLower));
      addResult(index.get(exactKey)!, toRef(r, event, dist.name), false, flags);
      pass5Team++;
    }
  }

  // 5b: apply team-based athlete aliases to pass-5 profiles
  for (const rule of aliasRules) {
    const canonNameLower = normalizeName(rule.name);
    const canonKey = `${canonNameLower}|${teamNormalKey(rule.canonicalTeam)}`;
    const canonEntry = index.get(canonKey);
    if (!canonEntry) continue;

    for (const alias of rule.aliases) {
      if (alias.team === "") continue;
      const aliasKey = `${normalizeName(alias.name)}|${teamNormalKey(alias.team)}`;
      if (aliasKey === canonKey) continue;
      const aliasEntry = index.get(aliasKey);
      if (!aliasEntry) continue;
      for (const result of aliasEntry.results) addResult(canonEntry, result, false, flags);
      index.delete(aliasKey);
    }
    deriveCanonicalTeam(canonEntry);
  }

  // 5c: solo — one standalone profile per unassigned result (no auto-merging)
  for (const { event, dist, r, rKey } of allResults) {
    if (assigned.has(rKey)) continue;
    assigned.add(rKey);
    const nameLower = normalizeName(r.name);
    const cat = canonicalizeCategory(r.category).toLowerCase().replace(/\s+/g, "-");
    const soloKey = `${nameLower}|solo:${cat}:${event.year}:${r.bib}`;
    index.set(soloKey, newEntry(ids.get(soloKey), r.name, nameLower));
    addResult(index.get(soloKey)!, toRef(r, event, dist.name), false, flags);
    pass5Solo++;
  }

  console.log(`  [pass5] ${pass5Team} new team profiles, ${pass5Solo} solo profiles`);

  // ── Final: sort results, derive canonical teams ───────────────────────────

  for (const entry of index.values()) {
    entry.results.sort(
      (a, b) => new Date(b.eventDate).getTime() - new Date(a.eventDate).getTime()
    );
    deriveCanonicalTeam(entry);
  }

  // ── Pass 6: manual result assignments ────────────────────────────────────

  // Build (eventId, bib) → { key, resultIdx } for fast lookup
  // We need to scan result files for bib numbers since AthleteResultRef doesn't store bib
  let pass6 = 0;
  for (const assignment of assignments) {
    const target = [...index.values()].find((e) => e.id === assignment.athleteId);
    if (!target) {
      console.error(`  [pass6] ERROR: athleteId ${assignment.athleteId} not found — skipping`);
      continue;
    }
    // Find result by (eventId, source bib) — search all entries
    let moved = false;
    outer: for (const [key, entry] of index) {
      for (let i = 0; i < entry.results.length; i++) {
        const r = entry.results[i]!;
        if (r.eventId !== assignment.eventId) continue;
        if (entry === target) break outer; // already on target
        target.results.push(r);
        addToTeamsAndCategories(target, r);
        entry.results.splice(i, 1);
        if (entry.results.length === 0) index.delete(key);
        pass6++;
        moved = true;
        break outer;
      }
    }
    if (!moved) console.warn(`  [pass6] eventId=${assignment.eventId} bib=${assignment.bib} not found`);
  }

  if (pass6 > 0) {
    for (const entry of index.values()) {
      entry.results.sort(
        (a, b) => new Date(b.eventDate).getTime() - new Date(a.eventDate).getTime()
      );
    }
    console.log(`  [pass6] ${pass6} manual result(s) applied`);
  }

  // ── Build updated ID store ────────────────────────────────────────────────

  const updatedIdStore = new Map(idStore);
  for (const [key, id] of ids.getMinted()) updatedIdStore.set(key, id);
  for (const [key, entry] of index) updatedIdStore.set(key, entry.id);

  return { index, updatedIdStore, flags };
}

// ── Aggregate ranking ─────────────────────────────────────────────────────────

export function buildAggregateRanking(
  events: StoredEvent[],
  loader: ResultsLoader,
  athleteIndex: Map<string, AthleteEntry> = new Map(),
  keyToCanonical: Map<string, string> = new Map()
): AggregateRanking {
  type AccEntry = {
    id: number; name: string; nameLower: string; gender: string;
    team: string; teamDate: string; country: string;
    totalPoints: number; eventsScored: number; bestPos: number;
    results: AggregateAthlete["results"];
  };
  // Build id → canonical key map so stored athleteId can resolve directly
  const idToCanonicalKey = new Map<number, string>();
  for (const [key, entry] of athleteIndex) idToCanonicalKey.set(entry.id, key);

  const acc: Record<string, Record<string, Record<string, Map<string, AccEntry>>>> = {};

  for (const event of events.filter((e) => e.hasResults)) {
    const stored = loader(event.id);
    if (!stored) continue;
    const yearKey = String(event.year);
    if (!acc[yearKey]) acc[yearKey] = {};

    for (const dist of stored.distances) {
      const distKey = normalizeDistance(dist.name);
      if (!acc[yearKey][distKey]) acc[yearKey][distKey] = {};

      const byGender = new Map<string, StoredResult[]>();
      for (const r of dist.results) {
        if (r.dnf || r.dns || r.pos < 1) continue;
        if (!byGender.has(r.gender)) byGender.set(r.gender, []);
        byGender.get(r.gender)!.push(r);
      }

      for (const [gender, finishers] of byGender) {
        finishers.sort((a, b) => a.raceTimeSecs - b.raceTimeSecs);
        const coeff = finisherCoefficient(finishers.length);
        if (!acc[yearKey][distKey][gender]) acc[yearKey][distKey][gender] = new Map();
        const distMap = acc[yearKey][distKey][gender];

        finishers.forEach((r, idx) => {
          const genderPos = idx + 1;
          const basePoints = posToBasePoints(genderPos);
          if (basePoints === 0) return;
          const pts = Math.round(basePoints * coeff * 10) / 10;
          const nameLower = normalizeName(r.name);
          // Prefer stored athleteId from injected result files; fall back to name+team key
          const storedId = r.athleteId ?? 0;
          const rawKey = `${nameLower}|${teamNormalKey(r.team)}`;
          const aKey = (storedId > 0 && idToCanonicalKey.has(storedId))
            ? idToCanonicalKey.get(storedId)!
            : (keyToCanonical.get(rawKey) ?? rawKey);
          const id = storedId > 0 ? storedId : (athleteIndex.get(aKey)?.id ?? 0);

          if (!distMap.has(aKey)) {
            distMap.set(aKey, {
              id, name: r.name, nameLower, gender: r.gender,
              team: r.team, teamDate: event.date, country: r.country,
              totalPoints: 0, eventsScored: 0, bestPos: genderPos, results: [],
            });
          }
          const entry = distMap.get(aKey)!;
          entry.totalPoints = Math.round((entry.totalPoints + pts) * 10) / 10;
          entry.eventsScored += 1;
          if (genderPos < entry.bestPos) entry.bestPos = genderPos;
          entry.country = r.country || entry.country;
          if (event.date >= entry.teamDate && r.team) {
            entry.team = r.team; entry.teamDate = event.date;
          }
          entry.results.push({
            eventId: event.id, eventName: event.name, eventDate: event.date,
            distanceFinishers: finishers.length, coefficient: coeff,
            pos: genderPos, basePoints, points: pts,
          });
        });
      }
    }
  }

  const ranking: AggregateRanking = {};
  for (const [year, distances] of Object.entries(acc)) {
    ranking[year] = {};
    for (const [dist, genders] of Object.entries(distances)) {
      ranking[year][dist] = {};
      for (const [gender, distMap] of Object.entries(genders)) {
        const sorted = Array.from(distMap.values())
          .sort((a, b) => b.totalPoints - a.totalPoints || a.bestPos - b.bestPos);
        ranking[year][dist][gender] = sorted.map((e, i) => ({
          rank: i + 1, id: e.id, name: e.name, nameLower: e.nameLower,
          gender: e.gender, team: e.team, country: e.country,
          totalPoints: e.totalPoints, eventsScored: e.eventsScored, bestPos: e.bestPos,
          results: e.results.sort(
            (a, b) => new Date(b.eventDate).getTime() - new Date(a.eventDate).getTime()
          ),
        }));
      }
    }
  }
  return ranking;
}

// ── Team ranking ──────────────────────────────────────────────────────────────

const INDIVIDUAL_TEAM_KEYS = new Set(["individual", "independente", ""]);

export function buildTeamRanking(
  events: StoredEvent[],
  loader: ResultsLoader,
  athleteIndex: Map<string, AthleteEntry> = new Map(),
  keyToCanonical: Map<string, string> = new Map()
): TeamRanking {
  type AccTeam = {
    teamKey: string; nameOcc: Map<string, number>;
    totalPoints: number; eventsScored: number; bestRank: number;
    results: TeamEntry["results"];
  };
  const acc: Record<string, Record<string, Map<string, AccTeam>>> = {};

  for (const event of events.filter((e) => e.hasResults)) {
    const stored = loader(event.id);
    if (!stored) continue;
    const yearKey = String(event.year);
    if (!acc[yearKey]) acc[yearKey] = {};

    for (const dist of stored.distances) {
      const distKey = normalizeDistance(dist.name);
      if (!acc[yearKey][distKey]) acc[yearKey][distKey] = new Map();
      const distMap = acc[yearKey][distKey];

      const teamAthletes = new Map<string, Array<{ name: string; pos: number; rawTeam: string }>>();
      for (const r of dist.results) {
        if (r.dnf || r.dns || r.pos < 1 || !r.team) continue;
        const tk = teamNormalKey(r.team);
        if (INDIVIDUAL_TEAM_KEYS.has(tk)) continue;
        if (!teamAthletes.has(tk)) teamAthletes.set(tk, []);
        teamAthletes.get(tk)!.push({ name: r.name, pos: r.pos, rawTeam: fixRawTeamName(r.team) });
      }

      const totalTeams = teamAthletes.size;
      type EligibleTeam = {
        tk: string; rawTeam: string; combinedScore: number; bestPos: number;
        top3: Array<{ name: string; pos: number; rawTeam: string }>;
      };
      const eligible: EligibleTeam[] = [];

      for (const [tk, athletes] of teamAthletes) {
        if (athletes.length < 3) continue;
        const sorted = [...athletes].sort((a, b) => a.pos - b.pos);
        const top3 = sorted.slice(0, 3);
        eligible.push({
          tk, rawTeam: sorted[0]!.rawTeam,
          combinedScore: top3.reduce((s, a) => s + a.pos, 0),
          bestPos: top3[0]!.pos, top3,
        });
      }

      eligible.sort((a, b) => a.combinedScore - b.combinedScore || a.bestPos - b.bestPos);
      const eligibleTeams = eligible.length;
      const coeff = teamCoefficient(eligibleTeams);

      eligible.slice(0, 10).forEach((et, i) => {
        const teamRank = i + 1;
        const basePoints = rankToTeamBasePoints(teamRank);
        const pts = Math.round(basePoints * coeff * 10) / 10;

        if (!distMap.has(et.tk)) {
          distMap.set(et.tk, {
            teamKey: et.tk, nameOcc: new Map(),
            totalPoints: 0, eventsScored: 0, bestRank: teamRank, results: [],
          });
        }
        const entry = distMap.get(et.tk)!;
        entry.totalPoints = Math.round((entry.totalPoints + pts) * 10) / 10;
        entry.eventsScored += 1;
        if (teamRank < entry.bestRank) entry.bestRank = teamRank;
        entry.nameOcc.set(et.rawTeam, (entry.nameOcc.get(et.rawTeam) ?? 0) + 1);
        entry.results.push({
          eventId: event.id, eventName: event.name, eventDate: event.date,
          totalTeams, eligibleTeams, coefficient: coeff,
          teamRank, basePoints, points: pts, combinedScore: et.combinedScore,
          athletes: et.top3.map((a) => {
            const rk = `${normalizeName(a.name)}|${teamNormalKey(a.rawTeam)}`;
            const canonRk = keyToCanonical.get(rk) ?? rk;
            return { id: athleteIndex.get(canonRk)?.id ?? 0, name: a.name, pos: a.pos };
          }),
        });
      });
    }
  }

  const ranking: TeamRanking = {};
  for (const [year, distances] of Object.entries(acc)) {
    ranking[year] = {};
    for (const [dist, distMap] of Object.entries(distances)) {
      const sorted = Array.from(distMap.values())
        .sort((a, b) => b.totalPoints - a.totalPoints || a.bestRank - b.bestRank);
      ranking[year][dist] = sorted.map((entry, i) => ({
        rank: i + 1, team: canonicalTeam(entry.nameOcc),
        totalPoints: entry.totalPoints, eventsScored: entry.eventsScored, bestRank: entry.bestRank,
        results: entry.results.sort(
          (a, b) => new Date(b.eventDate).getTime() - new Date(a.eventDate).getTime()
        ),
      }));
    }
  }
  return ranking;
}
