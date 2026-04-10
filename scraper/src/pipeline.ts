/**
 * Pure pipeline functions for building the athletes index, aggregate ranking,
 * and team ranking. All I/O is injected via the `ResultsLoader` callback so
 * these functions can be unit-tested without touching the filesystem.
 */
import {
  normalizeName,
  teamNormalKey,
  teamKeySimilarity,
  fixRawTeamName,
  canonicalTeam,
  posToBasePoints,
  finisherCoefficient,
  rankToTeamBasePoints,
  teamCoefficient,
  categoryTier,
  tierConflict,
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

export interface MergeRule {
  canonical: string; // slug of the profile to keep
  aliases: string[]; // slugs to merge into canonical
  note?: string;
}

/** Callback that resolves a stored event's results given its numeric ID. */
export type ResultsLoader = (id: number) => StoredEventResults | null;

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
    genderPos: 0, // filled in after all results are collected
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

/** Team names that indicate the athlete is racing without an affiliation. */
export const SOLO_TEAMS = new Set(["individual", "independente", "no team", "sem equipa", ""]);

export function isSoloTeam(team: string): boolean {
  return SOLO_TEAMS.has(teamNormalKey(team).toLowerCase()) || !team.trim();
}

/**
 * Composite dedup key: nameLower + "|" + normalised team key.
 * Solo/unaffiliated results use an empty team bucket so they can be
 * merged later into the athlete's real team, if one is identified.
 */
export function athleteKey(nameLower: string, team: string): string {
  return isSoloTeam(team) ? `${nameLower}|` : `${nameLower}|${teamNormalKey(team)}`;
}

export function buildAthletesIndex(
  events: StoredEvent[],
  loader: ResultsLoader
): {
  index: Map<string, AthleteEntry>;
  fuzzyAliases: Map<string, string>; // aliasKey → canonicalKey
} {
  const index = new Map<string, AthleteEntry>();
  const fuzzyAliases = new Map<string, string>(); // aliasKey → canonicalKey
  // Track team name occurrences per athlete for canonical resolution
  const teamOccurrences = new Map<string, Map<string, Map<string, number>>>();
  // athleteKey → normalizedTeamKey → rawTeamName → count

  for (const event of events.filter((e) => e.hasResults)) {
    const stored = loader(event.id);
    if (!stored) continue;

    for (const dist of stored.distances) {
      for (const r of dist.results) {
        // Re-normalize nameLower from r.name so cached results benefit from
        // current normalizeName (handles ´, ', #, etc. added later)
        const nameLower = normalizeName(r.name);
        const key = athleteKey(nameLower, r.team);
        if (!index.has(key)) {
          const slug = key.replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
          index.set(key, { name: r.name, nameLower, slug, results: [] });
          teamOccurrences.set(key, new Map());
        }
        if (r.team && !isSoloTeam(r.team)) {
          const tk = teamNormalKey(r.team);
          const athleteTeams = teamOccurrences.get(key)!;
          if (!athleteTeams.has(tk)) athleteTeams.set(tk, new Map());
          const rawMap = athleteTeams.get(tk)!;
          const fixedName = fixRawTeamName(r.team);
          rawMap.set(fixedName, (rawMap.get(fixedName) ?? 0) + 1);
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

  // Merge solo bucket into the biggest team bucket for that name (if exactly one team exists)
  for (const nameLowerVal of new Set([...index.keys()].map((k) => k.split("|")[0]!))) {
    const soloKey = `${nameLowerVal}|`;
    if (!index.has(soloKey)) continue;
    // Find all non-solo keys for this name
    const teamKeys = [...index.keys()].filter(
      (k) => k.startsWith(`${nameLowerVal}|`) && k !== soloKey
    );
    if (teamKeys.length === 1) {
      // Merge solo results into the one team bucket
      const canonicalKey = teamKeys[0]!;
      const target = index.get(canonicalKey)!;
      target.results.push(...index.get(soloKey)!.results);
      index.delete(soloKey);
      teamOccurrences.delete(soloKey);
      fuzzyAliases.set(soloKey, canonicalKey);
    }
    // If 0 or 2+ team buckets exist, keep solo as its own entry
  }

  // Fuzzy team merge: merge buckets for the same name whose normalised team keys
  // are similar enough (e.g. "vivavita" vs "vivavita training and social club").
  const FUZZY_THRESHOLD = 0.6;
  const allNames = new Set([...index.keys()].map((k) => k.split("|")[0]!));
  for (const nameLowerVal of allNames) {
    let changed = true;
    while (changed) {
      changed = false;
      const nameKeys = [...index.keys()].filter(
        (k) => k.startsWith(`${nameLowerVal}|`) && k !== `${nameLowerVal}|`
      );
      outer: for (let i = 0; i < nameKeys.length; i++) {
        for (let j = i + 1; j < nameKeys.length; j++) {
          const kA = nameKeys[i]!;
          const kB = nameKeys[j]!;
          const teamA = kA.slice(nameLowerVal.length + 1);
          const teamB = kB.slice(nameLowerVal.length + 1);
          if (teamKeySimilarity(teamA, teamB) >= FUZZY_THRESHOLD) {
            const eA = index.get(kA)!;
            const eB = index.get(kB)!;
            // Guard: don't merge if the two buckets have incompatible category tiers
            // in any overlapping year (e.g. Elite in 2025 vs Masters B in 2025).
            const tiersA = new Map<number, Set<ReturnType<typeof categoryTier>>>();
            const tiersB = new Map<number, Set<ReturnType<typeof categoryTier>>>();
            for (const r of eA.results) {
              const t = categoryTier(r.category);
              if (t !== "unknown") (tiersA.get(r.eventYear) ?? tiersA.set(r.eventYear, new Set()).get(r.eventYear)!).add(t);
            }
            for (const r of eB.results) {
              const t = categoryTier(r.category);
              if (t !== "unknown") (tiersB.get(r.eventYear) ?? tiersB.set(r.eventYear, new Set()).get(r.eventYear)!).add(t);
            }
            let hasTierConflict = false;
            for (const [yr, ta] of tiersA) {
              const tb = tiersB.get(yr);
              if (tb && [...ta].some(tA => [...tb].some(tB => tierConflict(tA, tB)))) {
                hasTierConflict = true;
                break;
              }
            }
            if (hasTierConflict) continue;
            // Merge smaller bucket into larger
            const [target, source, canonicalKey, sourceKey] =
              eA.results.length >= eB.results.length
                ? [eA, eB, kA, kB]
                : [eB, eA, kB, kA];
            target.results.push(...source.results);
            index.delete(sourceKey);
            teamOccurrences.delete(sourceKey);
            fuzzyAliases.set(sourceKey, canonicalKey);
            // Re-point any existing aliases that pointed to the source key
            for (const [ak, ck] of fuzzyAliases) {
              if (ck === sourceKey) fuzzyAliases.set(ak, canonicalKey);
            }
            changed = true;
            break outer;
          }
        }
      }
    }
  }

  // Sort each athlete's results by date descending and resolve canonical team
  for (const [key, entry] of index.entries()) {
    entry.results.sort(
      (a, b) => new Date(b.eventDate).getTime() - new Date(a.eventDate).getTime()
    );
    // Use the team from the most recent result as the display team
    const mostRecentTeam = entry.results[0]?.team;
    if (mostRecentTeam) {
      entry.canonicalTeam = canonicalTeam(new Map([[mostRecentTeam, 1]]));
    }
  }

  return { index, fuzzyAliases };
}

// ── Manual athlete merge ──────────────────────────────────────────────────────

/**
 * Apply manual merge rules to the athletes index.
 * Returns a map of aliasAthleteKey → canonicalAthleteKey for use in aggregate ranking.
 */
export function applyAthleteMerges(
  index: Map<string, AthleteEntry>,
  mergeRules: MergeRule[]
): {
  keyAliases: Map<string, string>;
} {
  const keyAliases = new Map<string, string>(); // aliasAthleteKey → canonicalAthleteKey

  // Build slug → athleteKey map
  const slugToKey = new Map<string, string>();
  for (const [key, entry] of index) slugToKey.set(entry.slug, key);

  for (const rule of mergeRules) {
    const canonicalKey = slugToKey.get(rule.canonical);
    if (!canonicalKey) {
      console.warn(`  ⚠ merge: canonical slug "${rule.canonical}" not found in index`);
      continue;
    }
    const canonical = index.get(canonicalKey)!;

    for (const aliasSlug of rule.aliases) {
      const aliasKey = slugToKey.get(aliasSlug);
      if (!aliasKey) {
        console.warn(`  ⚠ merge: alias slug "${aliasSlug}" not found in index`);
        continue;
      }
      const alias = index.get(aliasKey)!;
      // Guard: warn if the merge would combine incompatible category tiers in the same year
      const tiersCanon = new Map<number, Set<ReturnType<typeof categoryTier>>>();
      const tiersAlias = new Map<number, Set<ReturnType<typeof categoryTier>>>();
      for (const r of canonical.results) {
        const t = categoryTier(r.category);
        if (t !== "unknown") (tiersCanon.get(r.eventYear) ?? tiersCanon.set(r.eventYear, new Set()).get(r.eventYear)!).add(t);
      }
      for (const r of alias.results) {
        const t = categoryTier(r.category);
        if (t !== "unknown") (tiersAlias.get(r.eventYear) ?? tiersAlias.set(r.eventYear, new Set()).get(r.eventYear)!).add(t);
      }
      for (const [yr, ta] of tiersCanon) {
        const tb = tiersAlias.get(yr);
        if (tb && [...ta].some(tA => [...tb].some(tB => tierConflict(tA, tB))))
          console.warn(`  ⚠ merge: "${rule.canonical}" + "${aliasSlug}" have conflicting category tiers in ${yr} — check athlete-merges.json`);
      }
      canonical.results.push(...alias.results);
      keyAliases.set(aliasKey, canonicalKey);
      index.delete(aliasKey);
    }

    // Re-sort merged results by date descending
    canonical.results.sort(
      (a, b) => new Date(b.eventDate).getTime() - new Date(a.eventDate).getTime()
    );
  }

  return { keyAliases };
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

export function buildAggregateRanking(
  events: StoredEvent[],
  loader: ResultsLoader,
  keyAliases: Map<string, string> = new Map()
): AggregateRanking {
  // year → distance → gender → athleteKey → aggregation data
  type AccEntry = {
    name: string;
    nameLower: string;
    slug: string;
    gender: string;
    team: string;
    country: string;
    totalPoints: number;
    eventsScored: number;
    bestPos: number; // gender-specific position
    results: AggregateAthlete["results"];
  };
  const acc: Record<string, Record<string, Record<string, Map<string, AccEntry>>>> = {};
  // year → distance → gender → athleteKey → normalizedTeamKey → rawTeamName → count
  const teamOcc: Record<string, Record<string, Record<string, Map<string, Map<string, Map<string, number>>>>>> = {};

  for (const event of events.filter((e) => e.hasResults)) {
    const stored = loader(event.id);
    if (!stored) continue;

    const yearKey = String(event.year);
    if (!acc[yearKey]) acc[yearKey] = {};
    if (!teamOcc[yearKey]) teamOcc[yearKey] = {};

    for (const dist of stored.distances) {
      const distKey = normalizeDistance(dist.name);
      if (!acc[yearKey][distKey]) acc[yearKey][distKey] = {};
      if (!teamOcc[yearKey][distKey]) teamOcc[yearKey][distKey] = {};

      // Group finishers by gender, sorted by race time for gender-specific positions
      const byGender = new Map<string, StoredResult[]>();
      for (const r of dist.results) {
        if (r.dnf || r.dns || r.pos < 1) continue;
        if (!byGender.has(r.gender)) byGender.set(r.gender, []);
        byGender.get(r.gender)!.push(r);
      }

      for (const [gender, finishers] of byGender) {
        finishers.sort((a, b) => a.raceTimeSecs - b.raceTimeSecs);
        const genderFinisherCount = finishers.length;
        const coeff = finisherCoefficient(genderFinisherCount);

        if (!acc[yearKey][distKey][gender]) acc[yearKey][distKey][gender] = new Map();
        if (!teamOcc[yearKey][distKey][gender]) teamOcc[yearKey][distKey][gender] = new Map();
        const distMap = acc[yearKey][distKey][gender];
        const distTeams = teamOcc[yearKey][distKey][gender];

        finishers.forEach((r, idx) => {
          const genderPos = idx + 1;
          const basePoints = posToBasePoints(genderPos);
          if (basePoints === 0) return;
          const pts = Math.round(basePoints * coeff * 10) / 10;

          const nameLower = normalizeName(r.name);
          const rawKey = athleteKey(nameLower, r.team);
          let key = keyAliases.get(rawKey) ?? rawKey;
          // Fuzzy team match: if no exact entry yet, check if a similar team key
          // already exists for this athlete name (same logic as athletes index)
          if (!distMap.has(key)) {
            const teamPart = key.slice(nameLower.length + 1);
            for (const existingKey of distMap.keys()) {
              if (!existingKey.startsWith(`${nameLower}|`)) continue;
              const existingTeam = existingKey.slice(nameLower.length + 1);
              if (teamKeySimilarity(teamPart, existingTeam) >= 0.6) {
                key = existingKey;
                break;
              }
            }
          }
          if (!distMap.has(key)) {
            const slug = key.replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
            distMap.set(key, {
              name: r.name,
              nameLower,
              slug,
              gender: r.gender,
              team: r.team,
              country: r.country,
              totalPoints: 0,
              eventsScored: 0,
              bestPos: genderPos,
              results: [],
            });
            distTeams.set(key, new Map());
          }
          const entry = distMap.get(key)!;
          entry.totalPoints = Math.round((entry.totalPoints + pts) * 10) / 10;
          entry.eventsScored += 1;
          if (genderPos < entry.bestPos) entry.bestPos = genderPos;
          entry.country = r.country || entry.country;
          if (r.team) {
            const teamKey = teamNormalKey(r.team);
            const athleteTeams = distTeams.get(key)!;
            if (!athleteTeams.has(teamKey)) athleteTeams.set(teamKey, new Map());
            const rawMap = athleteTeams.get(teamKey)!;
            const fixedName = fixRawTeamName(r.team);
            rawMap.set(fixedName, (rawMap.get(fixedName) ?? 0) + 1);
          }
          entry.results.push({
            eventId: event.id,
            eventName: event.name,
            eventDate: event.date,
            distanceFinishers: genderFinisherCount,
            coefficient: coeff,
            pos: genderPos,
            basePoints,
            points: pts,
          });
        });
      }
    }
  }

  // Resolve canonical team and convert to sorted arrays with rank
  const ranking: AggregateRanking = {};
  for (const [year, distances] of Object.entries(acc)) {
    ranking[year] = {};
    for (const [dist, genders] of Object.entries(distances)) {
      ranking[year][dist] = {};
      for (const [gender, distMap] of Object.entries(genders)) {
        const distTeams = teamOcc[year]?.[dist]?.[gender];
        if (distTeams) {
          for (const [key, entry] of distMap) {
            const athleteTeams = distTeams.get(key);
            if (!athleteTeams || athleteTeams.size === 0) continue;
            let bestNormKey = "";
            let bestTotal = 0;
            for (const [normKey, rawMap] of athleteTeams) {
              const total = Array.from(rawMap.values()).reduce((s, n) => s + n, 0);
              if (total > bestTotal) { bestTotal = total; bestNormKey = normKey; }
            }
            entry.team = canonicalTeam(athleteTeams.get(bestNormKey)!);
          }
        }
        const sorted = Array.from(distMap.values())
          .sort((a, b) => b.totalPoints - a.totalPoints || a.bestPos - b.bestPos);
        ranking[year][dist][gender] = sorted.map((entry, i) => ({
          ...entry,
          rank: i + 1,
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

export const INDIVIDUAL_TEAM_KEYS = new Set(["individual", "independente", ""]);

export function buildTeamRanking(
  events: StoredEvent[],
  loader: ResultsLoader
): TeamRanking {
  // year → distance → teamKey → accumulated entry
  type AccTeam = {
    teamKey: string;
    // raw name occurrences for canonical display
    nameOcc: Map<string, number>;
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

      // Group finishers by normalized team
      const teamAthletes = new Map<string, Array<{ name: string; pos: number; rawTeam: string }>>();
      for (const r of dist.results) {
        if (r.dnf || r.dns || r.pos < 1 || !r.team) continue;
        const tk = teamNormalKey(r.team);
        if (INDIVIDUAL_TEAM_KEYS.has(tk)) continue;
        if (!teamAthletes.has(tk)) teamAthletes.set(tk, []);
        teamAthletes.get(tk)!.push({ name: r.name, pos: r.pos, rawTeam: fixRawTeamName(r.team) });
      }

      // Total teams present (for coefficient) — all with ≥1 finisher
      const totalTeams = teamAthletes.size;
      const coeff = teamCoefficient(totalTeams);

      // Eligible teams: ≥3 athletes — rank them by sum of top-3 positions
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
        const bestPos = top3[0]!.pos;
        const rawTeam = sorted[0]!.rawTeam;
        eligible.push({ tk, rawTeam, combinedScore, bestPos, top3 });
      }

      // Sort eligible: lower combinedScore is better; tie-break by best individual pos
      eligible.sort((a, b) =>
        a.combinedScore - b.combinedScore || a.bestPos - b.bestPos
      );

      const eligibleTeams = eligible.length;

      // Award points to top 10 eligible teams
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
          athletes: et.top3.map((a) => ({ name: a.name, pos: a.pos })),
        });
      });
    }
  }

  // Resolve canonical team name and build sorted output
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
