/**
 * Pure pipeline functions for building the athletes index, aggregate ranking,
 * and team ranking. All I/O is injected via the `ResultsLoader` callback so
 * these functions can be unit-tested without touching the filesystem.
 */
import {
  normalizeName,
  teamNormalKey,
  fixRawTeamName,
  canonicalTeam,
  posToBasePoints,
  finisherCoefficient,
  rankToTeamBasePoints,
  teamCoefficient,
  normalizeCategory,
  formatTime,
  timeToSeconds,
} from "./normalize.js";
import type {
  ApiAthlete,
  ApiResult,
  StoredEvent,
  StoredEventResults,
  StoredDistanceResults,
  StoredResult,
  AthleteEntry,
  StoredDistance,
  AggregateAthlete,
  AggregateRanking,
  TeamRanking,
  TeamEntry,
} from "./types.js";

// ── Types ─────────────────────────────────────────────────────────────────────

/** Callback that resolves a stored event's results given its numeric ID. */
export type ResultsLoader = (id: number) => StoredEventResults | null;

/**
 * Normalize a licence number for comparison.
 * Strips whitespace, common prefixes (UCI, PT, etc.), and non-digit/letter chars
 * so that "10007733813" and "UCI 10007733813" compare as the same.
 */
export function normalizeLicence(lic: string): string {
  return lic
    .trim()
    .toUpperCase()
    .replace(/^(UCI[-\s]?|PT[-\s]?|FCP[-\s]?)/i, "") // strip common federation prefixes
    .replace(/\s+/g, "")                               // collapse internal spaces
    .replace(/^0+(?=\d{5,})/, "");                    // strip leading zeros from long numbers
}

/**
 * Persistent map of `nameLower|canonicalTeamKey` → stable integer ID.
 * Stored in scraper/athlete-ids.json and never reassigned.
 * Alias keys (from applyAthleteAliases) are remapped to the canonical ID.
 */
export type AthleteIdStore = Map<string, number>;

// ── Event name helpers ────────────────────────────────────────────────────────

export function isGranfondoName(name: string): boolean {
  const n = name.toLowerCase();
  return n.includes("granfondo") || n.includes("grandfondo");
}

export function isKidsCamVariant(name: string): boolean {
  const n = name.toLowerCase();
  return (
    n.includes("kids") ||
    n.includes("caminhada") ||
    n.includes(" vip") ||
    n.includes("kids/cam")
  );
}

// ── Distance extraction from participants ─────────────────────────────────────

export function extractDistances(athletes: ApiAthlete[]): StoredDistance[] {
  const seen = new Map<string, string>(); // id → name
  for (const a of athletes) {
    if (a.id_percursos && a.percurso && !seen.has(a.id_percursos)) {
      seen.set(a.id_percursos, a.percurso);
    }
  }
  return Array.from(seen.entries())
    .map(([id, name]) => ({ id, name }))
    .sort((a, b) => Number(a.id) - Number(b.id));
}

// ── Result row transformation ─────────────────────────────────────────────────

/** Fill in genderPos for all results in a set of distances. */
export function assignGenderPositions(distances: StoredDistanceResults[]): void {
  for (const dist of distances) {
    const genderCounters = new Map<string, number>();
    const finishers = dist.results
      .filter((r) => !r.dnf && !r.dns && r.pos > 0)
      .slice()
      .sort((a, b) => a.raceTimeSecs - b.raceTimeSecs);
    for (const r of finishers) {
      const next = (genderCounters.get(r.gender) ?? 0) + 1;
      genderCounters.set(r.gender, next);
      r.genderPos = next;
    }
  }
}

export function transformResult(r: ApiResult): StoredResult {
  const raceTimeSecs = parseFloat(r.temposeg) || 0;
  const gapSecs = timeToSeconds(r.diferenca);

  // Detect non-finishers: obs field or 0 time with pos > 1
  const obs = (r.obs ?? "").toUpperCase();
  const dnf = obs.includes("DNF") || obs.includes("ABANDONOU") || obs === "AB";
  const dns = obs.includes("DNS") || obs.includes("NÃO PARTIU");

  return {
    pos: parseInt(r.pos, 10) || 0,
    genderPos: 0,  // filled in after all results are collected
    athleteId: 0,  // filled in after athlete index is built
    bib: r.dorsal,
    name: r.nome,
    nameLower: normalizeName(r.nome),
    gender: r.sexo || "M",
    team: r.equipa ?? "",
    category: r.escalao ?? "",
    country: r.pais_nome ?? "",
    raceTime: formatTime(r.tempo),
    raceTimeSecs,
    gap: formatTime(r.diferenca),
    gapSecs,
    points: Number(r.pontos) || 0,
    licence: r.licenca1 ?? "",
    dnf,
    dns,
  };
}

// ── Athletes index builder ────────────────────────────────────────────────────

/** Team names that indicate the athlete is racing without a club affiliation. */
export const SOLO_TEAM_KEYS = new Set(["individual", "independente", "no team", "sem equipa", ""]);

export function isSoloTeam(team: string): boolean {
  return !team.trim() || SOLO_TEAM_KEYS.has(teamNormalKey(team));
}

/**
 * Composite key: `nameLower|canonicalTeamKey` for affiliated athletes,
 * `nameLower|` for solo/unaffiliated athletes.
 * Ensures two people with the same name but different teams get separate profiles.
 */
export function athleteKey(nameLower: string, team: string): string {
  return isSoloTeam(team) ? `${nameLower}|` : `${nameLower}|${teamNormalKey(team)}`;
}

/**
 * Build the athletes index keyed by `nameLower|canonicalTeamKey`.
 *
 * Athletes are separated by team so two people sharing a name (e.g. "Jose Borges"
 * from Vivavita and "Jose Borges" from Jbracingcoach) get distinct profiles.
 * Solo/unaffiliated athletes are keyed `nameLower|` (empty team suffix).
 *
 * Stable integer IDs are assigned from `idStore` (loaded from athlete-ids.json)
 * or minted fresh for new entries, and returned in `updatedIdStore` for persistence.
 */
export function buildAthletesIndex(
  events: StoredEvent[],
  loader: ResultsLoader,
  idStore: AthleteIdStore = new Map()
): {
  index: Map<string, AthleteEntry>; // athleteKey → AthleteEntry
  updatedIdStore: AthleteIdStore;
  licenceIndex: Map<string, string[]>; // licence → list of athleteKeys (for auto-merge)
} {
  const index = new Map<string, AthleteEntry>();
  const newIds = new Map<string, number>();
  let nextId = idStore.size > 0 ? Math.max(...idStore.values()) + 1 : 1;
  // Track which athleteKeys appear with each licence (for post-build auto-merge)
  const licenceIndex = new Map<string, string[]>();

  function getOrAssignId(key: string): number {
    if (idStore.has(key)) return idStore.get(key)!;
    if (newIds.has(key)) return newIds.get(key)!;
    const id = nextId++;
    newIds.set(key, id);
    return id;
  }

  for (const event of events.filter((e) => e.hasResults)) {
    const stored = loader(event.id);
    if (!stored) continue;

    for (const dist of stored.distances) {
      for (const r of dist.results) {
        const nameLower = normalizeName(r.name);
        const key = athleteKey(nameLower, r.team);

        if (!index.has(key)) {
          const id = getOrAssignId(key);
          index.set(key, { id, name: r.name, nameLower, results: [] });
        }

        // Record licence → key mapping (deduplicated per key)
        const lic = r.licence ? normalizeLicence(r.licence) : "";
        if (lic) {
          const keys = licenceIndex.get(lic) ?? [];
          if (!keys.includes(key)) keys.push(key);
          licenceIndex.set(lic, keys);
        }

        index.get(key)!.results.push({
          eventId: event.id,
          eventName: event.name,
          eventDate: event.date,
          eventYear: event.year,
          distance: dist.name,
          pos: r.pos,
          category: normalizeCategory(r.category),
          gender: r.gender,
          team: r.team,
          country: r.country,
          raceTime: r.raceTime,
          raceTimeSecs: r.raceTimeSecs,
          gap: r.gap,
          gapSecs: r.gapSecs,
          dnf: r.dnf,
          dns: r.dns,
        });
      }
    }
  }

  // Sort results by date descending and set canonical team from most recent result
  for (const entry of index.values()) {
    entry.results.sort(
      (a, b) => new Date(b.eventDate).getTime() - new Date(a.eventDate).getTime()
    );
    // Canonical team: most-used non-solo team across all results
    const teamCounts = new Map<string, number>();
    for (const r of entry.results) {
      if (!isSoloTeam(r.team)) teamCounts.set(r.team, (teamCounts.get(r.team) ?? 0) + 1);
    }
    if (teamCounts.size > 0) {
      entry.canonicalTeam = canonicalTeam(teamCounts);
    }
  }

  // Build updated ID store (existing + newly assigned)
  const updatedIdStore = new Map(idStore);
  for (const [key, id] of newIds) updatedIdStore.set(key, id);

  return { index, updatedIdStore, licenceIndex };
}

/**
 * An athlete aliases rule: the canonical athlete absorbs results from alias entries.
 * Use when the same real person raced under different teams across events.
 */
export interface AthleteAliasRule {
  /** Display name (used to normalize). */
  name: string;
  /** Raw team name for the canonical profile entry. */
  canonicalTeam: string;
  /** Other name+team combinations that belong to the same person. */
  aliases: Array<{ name: string; team: string }>;
  note?: string;
}

/**
 * Apply athlete alias rules to the index in-place.
 * For each rule, the canonical entry absorbs all results from alias entries,
 * alias entries are removed, and alias ID-store keys are remapped to the canonical ID.
 */
export function applyAthleteAliases(
  index: Map<string, AthleteEntry>,
  idStore: AthleteIdStore,
  rules: AthleteAliasRule[]
): void {
  for (const rule of rules) {
    const canonKey = athleteKey(normalizeName(rule.name), rule.canonicalTeam);
    const canonical = index.get(canonKey);
    if (!canonical) {
      // Canonical entry doesn't exist yet — skip (no results for that combination)
      continue;
    }

    for (const alias of rule.aliases) {
      const aliasKey = athleteKey(normalizeName(alias.name), alias.team);
      if (aliasKey === canonKey) continue;
      const aliasEntry = index.get(aliasKey);
      if (!aliasEntry) continue;

      // Merge alias results into canonical
      canonical.results.push(...aliasEntry.results);
      // Remap the alias ID to the canonical ID in the store (so URLs don't break)
      if (aliasEntry.id !== canonical.id) {
        idStore.set(aliasKey, canonical.id);
      }
      index.delete(aliasKey);
    }

    // Re-sort after merging
    canonical.results.sort(
      (a, b) => new Date(b.eventDate).getTime() - new Date(a.eventDate).getTime()
    );
    // Re-derive canonical team after merging
    const teamCounts = new Map<string, number>();
    for (const r of canonical.results) {
      if (!isSoloTeam(r.team)) teamCounts.set(r.team, (teamCounts.get(r.team) ?? 0) + 1);
    }
    if (teamCounts.size > 0) {
      canonical.canonicalTeam = canonicalTeam(teamCounts);
    }
  }
}

/**
 * Auto-merge athletes that share the same non-empty licence number and the
 * same normalised name. This handles two cases automatically:
 *
 *   1. Same athlete, team name written differently across events
 *      (e.g. "C.B.Almodôvar/Banco Primus/Swick" vs "Casa Benfica Almodôvar")
 *   2. Same athlete who genuinely changed teams between seasons
 *
 * Licences that appear under different names are skipped (likely data error).
 * Returns the number of licences that triggered a merge.
 */
export function mergeByLicence(
  index: Map<string, AthleteEntry>,
  idStore: AthleteIdStore,
  licenceIndex: Map<string, string[]>
): number {
  let mergedCount = 0;

  for (const [_lic, keys] of licenceIndex) {
    if (keys.length < 2) continue;

    // Only merge if all keys share the same nameLower (same person, different teams)
    const names = new Set(keys.map((k) => index.get(k)?.nameLower ?? "").filter(Boolean));
    if (names.size !== 1) continue; // different names → skip (data error or typo)

    // Canonical entry: the one with the most results (most-represented team)
    const entries = keys.map((k) => ({ key: k, entry: index.get(k)! })).filter((x) => x.entry);
    if (entries.length < 2) continue;
    entries.sort((a, b) => b.entry.results.length - a.entry.results.length || a.key.localeCompare(b.key));
    const { key: canonKey, entry: canonical } = entries[0]!;

    let merged = false;
    for (const { key: aliasKey, entry: aliasEntry } of entries.slice(1)) {
      canonical.results.push(...aliasEntry.results);
      if (aliasEntry.id !== canonical.id) idStore.set(aliasKey, canonical.id);
      index.delete(aliasKey);
      merged = true;
    }

    if (merged) {
      canonical.results.sort(
        (a, b) => new Date(b.eventDate).getTime() - new Date(a.eventDate).getTime()
      );
      const teamCounts = new Map<string, number>();
      for (const r of canonical.results) {
        if (!isSoloTeam(r.team)) teamCounts.set(r.team, (teamCounts.get(r.team) ?? 0) + 1);
      }
      if (teamCounts.size > 0) canonical.canonicalTeam = canonicalTeam(teamCounts);
      mergedCount++;
    }
  }

  return mergedCount;
}

// ── Aggregate ranking builder ─────────────────────────────────────────────────

export const DISTANCE_ALIASES: Record<string, string> = {
  granfondo: "Granfondo",
  mediofondo: "Mediofondo",
  minifondo: "Minifondo",
  "time trial": "Time Trial",
  // Figueira Champions Classic uses "BIG DAY" / "HALF DAY" branding
  "big day": "Granfondo",
  "half day": "Mediofondo",
  // Aveiro Spring Classic uses "CLÁSSICA" / "Classica" branding
  "clássica": "Granfondo",
  "classica": "Granfondo",
  // Etapa da Volta uses "Etapa" branding
  "etapa": "Mediofondo",
};

export function normalizeDistance(name: string): string {
  return DISTANCE_ALIASES[name.toLowerCase()] ?? name;
}

/**
 * Build the aggregate ranking across all past events.
 * Athletes are keyed by `athleteKey(nameLower, team)` so two people sharing
 * a name but racing for different teams score separately.
 */
export function buildAggregateRanking(
  events: StoredEvent[],
  loader: ResultsLoader,
  athleteIndex: Map<string, AthleteEntry> = new Map()
): AggregateRanking {
  type AccEntry = {
    id: number;
    name: string;
    nameLower: string;
    gender: string;
    team: string;
    teamDate: string; // date of most recently seen team
    country: string;
    totalPoints: number;
    eventsScored: number;
    bestPos: number;
    results: AggregateAthlete["results"];
  };
  // year → distance → gender → athleteKey → AccEntry
  const acc: Record<string, Record<string, Record<string, Map<string, AccEntry>>>> = {};

  for (const event of events.filter((e) => e.hasResults)) {
    const stored = loader(event.id);
    if (!stored) continue;

    const yearKey = String(event.year);
    if (!acc[yearKey]) acc[yearKey] = {};

    for (const dist of stored.distances) {
      const distKey = normalizeDistance(dist.name);
      if (!acc[yearKey][distKey]) acc[yearKey][distKey] = {};

      // Group finishers by gender, sorted by race time
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
          const aKey = athleteKey(nameLower, r.team);
          const id = athleteIndex.get(aKey)?.id ?? 0;

          if (!distMap.has(aKey)) {
            distMap.set(aKey, {
              id,
              name: r.name,
              nameLower,
              gender: r.gender,
              team: r.team,
              teamDate: event.date,
              country: r.country,
              totalPoints: 0,
              eventsScored: 0,
              bestPos: genderPos,
              results: [],
            });
          }

          const entry = distMap.get(aKey)!;
          entry.totalPoints = Math.round((entry.totalPoints + pts) * 10) / 10;
          entry.eventsScored += 1;
          if (genderPos < entry.bestPos) entry.bestPos = genderPos;
          entry.country = r.country || entry.country;
          // Keep team from the most recent event
          if (event.date >= entry.teamDate && r.team) {
            entry.team = r.team;
            entry.teamDate = event.date;
          }
          entry.results.push({
            eventId: event.id,
            eventName: event.name,
            eventDate: event.date,
            distanceFinishers: finishers.length,
            coefficient: coeff,
            pos: genderPos,
            basePoints,
            points: pts,
          });
        });
      }
    }
  }

  // Convert to sorted arrays
  const ranking: AggregateRanking = {};
  for (const [year, distances] of Object.entries(acc)) {
    ranking[year] = {};
    for (const [dist, genders] of Object.entries(distances)) {
      ranking[year][dist] = {};
      for (const [gender, distMap] of Object.entries(genders)) {
        const sorted = Array.from(distMap.values())
          .sort((a, b) => b.totalPoints - a.totalPoints || a.bestPos - b.bestPos);
        ranking[year][dist][gender] = sorted.map((entry, i) => ({
          rank: i + 1,
          id: entry.id,
          name: entry.name,
          nameLower: entry.nameLower,
          gender: entry.gender,
          team: entry.team,
          country: entry.country,
          totalPoints: entry.totalPoints,
          eventsScored: entry.eventsScored,
          bestPos: entry.bestPos,
          results: entry.results.sort((a, b) =>
            new Date(b.eventDate).getTime() - new Date(a.eventDate).getTime()
          ),
        }));
      }
    }
  }

  return ranking;
}

// ── Team ranking builder ──────────────────────────────────────────────────────

const INDIVIDUAL_TEAM_KEYS = new Set(["individual", "independente", ""]);

/**
 * Build the team ranking across all past events.
 * Teams are grouped by their normalised name (with aliases applied for display
 * normalisation — e.g. different abbreviations of the same club count together).
 * Athlete IDs are looked up from `athleteIndex` by name.
 */
export function buildTeamRanking(
  events: StoredEvent[],
  loader: ResultsLoader,
  athleteIndex: Map<string, AthleteEntry> = new Map()
): TeamRanking {
  type AccTeam = {
    teamKey: string;
    nameOcc: Map<string, number>; // raw name → count (for canonical display)
    totalPoints: number;
    eventsScored: number;
    bestRank: number;
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

      // Group finishers by normalised team key
      const teamAthletes = new Map<string, Array<{ name: string; pos: number; rawTeam: string }>>();
      for (const r of dist.results) {
        if (r.dnf || r.dns || r.pos < 1 || !r.team) continue;
        const tk = teamNormalKey(r.team);
        if (INDIVIDUAL_TEAM_KEYS.has(tk)) continue;
        if (!teamAthletes.has(tk)) teamAthletes.set(tk, []);
        teamAthletes.get(tk)!.push({ name: r.name, pos: r.pos, rawTeam: fixRawTeamName(r.team) });
      }

      const totalTeams = teamAthletes.size;
      const coeff = teamCoefficient(totalTeams);

      type EligibleTeam = {
        tk: string;
        rawTeam: string;
        combinedScore: number;
        bestPos: number;
        top3: Array<{ name: string; pos: number }>;
      };
      const eligible: EligibleTeam[] = [];

      for (const [tk, athletes] of teamAthletes) {
        if (athletes.length < 3) continue;
        const sorted = [...athletes].sort((a, b) => a.pos - b.pos);
        const top3 = sorted.slice(0, 3);
        const combinedScore = top3.reduce((s, a) => s + a.pos, 0);
        eligible.push({ tk, rawTeam: sorted[0]!.rawTeam, combinedScore, bestPos: top3[0]!.pos, top3 });
      }

      eligible.sort((a, b) => a.combinedScore - b.combinedScore || a.bestPos - b.bestPos);
      const eligibleTeams = eligible.length;

      eligible.slice(0, 10).forEach((et, i) => {
        const teamRank = i + 1;
        const basePoints = rankToTeamBasePoints(teamRank);
        const pts = Math.round(basePoints * coeff * 10) / 10;

        if (!distMap.has(et.tk)) {
          distMap.set(et.tk, {
            teamKey: et.tk,
            nameOcc: new Map(),
            totalPoints: 0,
            eventsScored: 0,
            bestRank: teamRank,
            results: [],
          });
        }
        const entry = distMap.get(et.tk)!;
        entry.totalPoints = Math.round((entry.totalPoints + pts) * 10) / 10;
        entry.eventsScored += 1;
        if (teamRank < entry.bestRank) entry.bestRank = teamRank;
        entry.nameOcc.set(et.rawTeam, (entry.nameOcc.get(et.rawTeam) ?? 0) + 1);

        entry.results.push({
          eventId: event.id,
          eventName: event.name,
          eventDate: event.date,
          totalTeams,
          eligibleTeams,
          coefficient: coeff,
          teamRank,
          basePoints,
          points: pts,
          combinedScore: et.combinedScore,
          athletes: et.top3.map((a) => ({
            id: athleteIndex.get(athleteKey(normalizeName(a.name), a.rawTeam))?.id ?? 0,
            name: a.name,
            pos: a.pos,
          })),
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
        rank: i + 1,
        team: canonicalTeam(entry.nameOcc),
        totalPoints: entry.totalPoints,
        eventsScored: entry.eventsScored,
        bestRank: entry.bestRank,
        results: entry.results.sort(
          (a, b) => new Date(b.eventDate).getTime() - new Date(a.eventDate).getTime()
        ),
      }));
    }
  }

  return ranking;
}

// ── Helpers re-exported for external use ──────────────────────────────────────

export { normalizeName as normalizeAthleteNameKey };
