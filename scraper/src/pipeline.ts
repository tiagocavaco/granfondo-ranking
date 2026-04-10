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
 * Persistent map of athlete name key → stable integer ID.
 * Primary key is `nameLower`; same-event collisions use `nameLower|2`, etc.
 * Stored in scraper/athlete-ids.json and never reassigned.
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

/**
 * Build the athletes index keyed by athlete name only (no team).
 *
 * Each athlete's profile accumulates results across all seasons regardless of
 * which team they raced for. Same-event name collisions (two genuinely different
 * people with the same name racing in the same event+distance) are disambiguated
 * with a numeric suffix: "joao silva", "joao silva|2", etc.
 *
 * Stable integer IDs are assigned from `idStore` (loaded from athlete-ids.json)
 * or minted fresh for new entries, and returned in `updatedIdStore` for persistence.
 */
export function buildAthletesIndex(
  events: StoredEvent[],
  loader: ResultsLoader,
  idStore: AthleteIdStore = new Map()
): {
  index: Map<string, AthleteEntry>; // nameKey → AthleteEntry
  updatedIdStore: AthleteIdStore;
} {
  const index = new Map<string, AthleteEntry>();
  const newIds = new Map<string, number>();
  let nextId = idStore.size > 0 ? Math.max(...idStore.values()) + 1 : 1;

  function getOrAssignId(nameKey: string): number {
    if (idStore.has(nameKey)) return idStore.get(nameKey)!;
    if (newIds.has(nameKey)) return newIds.get(nameKey)!;
    const id = nextId++;
    newIds.set(nameKey, id);
    return id;
  }

  for (const event of events.filter((e) => e.hasResults)) {
    const stored = loader(event.id);
    if (!stored) continue;

    for (const dist of stored.distances) {
      // Track which nameKeys are used within this event+distance for collision detection.
      // Maps nameLower → list of keys already assigned in this event+dist.
      const usedInEventDist = new Map<string, string[]>();

      for (const r of dist.results) {
        const nameLower = normalizeName(r.name);
        const existing = usedInEventDist.get(nameLower) ?? [];

        // Assign key: use base nameLower unless it's already taken in this event+dist
        let key: string;
        if (!existing.includes(nameLower)) {
          key = nameLower;
        } else {
          // Collision: two different people with the same name in the same race
          let disc = 2;
          while (existing.includes(`${nameLower}|${disc}`)) disc++;
          key = `${nameLower}|${disc}`;
        }

        if (!usedInEventDist.has(nameLower)) usedInEventDist.set(nameLower, []);
        usedInEventDist.get(nameLower)!.push(key);

        if (!index.has(key)) {
          const id = getOrAssignId(key);
          index.set(key, { id, name: r.name, nameLower, results: [] });
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
    const mostRecentTeam = entry.results[0]?.team;
    if (mostRecentTeam) {
      entry.canonicalTeam = canonicalTeam(new Map([[mostRecentTeam, 1]]));
    }
  }

  // Build updated ID store (existing + newly assigned)
  const updatedIdStore = new Map(idStore);
  for (const [key, id] of newIds) updatedIdStore.set(key, id);

  return { index, updatedIdStore };
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
 * Athletes are keyed by name only (matching the athlete index).
 * IDs are looked up from `athleteIndex`; athletes not in the index get id=0.
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
  // year → distance → gender → nameLower → AccEntry
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
          const id = athleteIndex.get(nameLower)?.id ?? 0;

          if (!distMap.has(nameLower)) {
            distMap.set(nameLower, {
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

          const entry = distMap.get(nameLower)!;
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
            id: athleteIndex.get(normalizeName(a.name))?.id ?? 0,
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
