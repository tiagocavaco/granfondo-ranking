import {
  normalizeName,
  teamNormalKey,
  normalizeDistance,
  fixRawTeamName,
  canonicalTeam,
  isSoloTeam,
} from "../normalize.js";
import {
  posToBasePoints,
  finisherCoefficient,
  rankToTeamBasePoints,
  teamCoefficient,
} from "@granfondo/utils/scoring";
import type { ResultsLoader } from "./results/results.js";
import type {
  StoredEvent,
  StoredResult,
  AthleteEntry,
  AggregateAthlete,
  AggregateRanking,
  TeamRanking,
  TeamEntry,
} from "@granfondo/database/types";

// ── Aggregate ranking ─────────────────────────────────────────────────────────

export function buildAggregateRanking(
  events: StoredEvent[],
  loader: ResultsLoader,
  athleteIndex: Map<string, AthleteEntry> = new Map(),
  keyToCanonical: Map<string, string> = new Map(),
  teamIdStore: Map<string, number> = new Map(),
): AggregateRanking {
  type AccEntry = {
    id: number;
    name: string;
    gender: string;
    team: string;
    teamDate: string;
    countryCounts: Map<string, number>;
    totalPoints: number;
    eventsScored: number;
    bestPos: number;
    results: AggregateAthlete["results"];
  };
  const idToCanonicalKey = new Map<number, string>();
  for (const [key, entry] of athleteIndex) {
    idToCanonicalKey.set(entry.id, key);
  }

  const acc: Record<
    string,
    Record<string, Record<string, Map<string, AccEntry>>>
  > = {};

  for (const event of events.filter((e) => e.hasResults)) {
    const stored = loader(event.id);
    if (!stored) {
      continue;
    }

    const yearKey = String(event.year);
    if (!acc[yearKey]) {
      acc[yearKey] = {};
    }

    for (const dist of stored.distances) {
      const distKey = normalizeDistance(dist.name);
      if (!acc[yearKey][distKey]) {
        acc[yearKey][distKey] = {};
      }

      const byGender = new Map<string, StoredResult[]>();
      for (const r of dist.results) {
        if (r.dnf || r.dns || r.pos < 1) {
          continue;
        }

        if (!byGender.has(r.gender)) {
          byGender.set(r.gender, []);
        }

        byGender.get(r.gender)!.push(r);
      }

      for (const [gender, finishers] of byGender) {
        const coeff = finisherCoefficient(finishers.length);
        if (!acc[yearKey][distKey][gender]) {
          acc[yearKey][distKey][gender] = new Map();
        }

        const distMap = acc[yearKey][distKey][gender];

        finishers.forEach((r) => {
          const genderPos = r.genderPos;
          const basePoints = posToBasePoints(genderPos);
          if (basePoints === 0) {
            return;
          }

          const pts = Math.round(basePoints * coeff * 10) / 10;
          const nameLower = normalizeName(r.name);
          const storedId = r.athleteId ?? 0;
          const teamId = isSoloTeam(r.team)
            ? 0
            : (teamIdStore.get(teamNormalKey(r.team)) ?? 0);
          const rawKey = `${nameLower}|${teamId === 0 ? "" : teamId}`;
          const aKey =
            storedId > 0 && idToCanonicalKey.has(storedId)
              ? idToCanonicalKey.get(storedId)!
              : (keyToCanonical.get(rawKey) ?? rawKey);
          const id =
            storedId > 0 ? storedId : (athleteIndex.get(aKey)?.id ?? 0);

          if (!distMap.has(aKey)) {
            distMap.set(aKey, {
              id,
              name: r.name,
              gender: r.gender,
              team: r.team,
              teamDate: event.date,
              countryCounts: new Map(),
              totalPoints: 0,
              eventsScored: 0,
              bestPos: genderPos,
              results: [],
            });
          }

          const entry = distMap.get(aKey)!;
          entry.totalPoints = Math.round((entry.totalPoints + pts) * 10) / 10;
          entry.eventsScored += 1;
          if (genderPos < entry.bestPos) {
            entry.bestPos = genderPos;
          }

          if (r.country) {
            entry.countryCounts.set(
              r.country,
              (entry.countryCounts.get(r.country) ?? 0) + 1,
            );
          }

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

  const ranking: AggregateRanking = {};
  for (const [year, distances] of Object.entries(acc)) {
    ranking[year] = {};
    for (const [dist, genders] of Object.entries(distances)) {
      ranking[year][dist] = {};
      for (const [gender, distMap] of Object.entries(genders)) {
        const sorted = Array.from(distMap.values()).sort(
          (entryA, entryB) =>
            entryB.totalPoints - entryA.totalPoints ||
            entryA.bestPos - entryB.bestPos,
        );
        ranking[year][dist][gender] = sorted.map((entry, index) => {
          const country =
            [...entry.countryCounts.entries()].sort(
              ([, countA], [, countB]) => countB - countA,
            )[0]?.[0] ?? "PT";
          return {
            rank: index + 1,
            id: entry.id,
            name: entry.name,
            gender: entry.gender,
            team: entry.team,
            country,
            totalPoints: entry.totalPoints,
            eventsScored: entry.eventsScored,
            bestPos: entry.bestPos,
            results: entry.results.sort(
              (resultA, resultB) =>
                new Date(resultB.eventDate).getTime() -
                new Date(resultA.eventDate).getTime(),
            ),
          };
        });
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
  keyToCanonical: Map<string, string> = new Map(),
  teamIdStore: Map<string, number> = new Map(),
): TeamRanking {
  type AccTeam = {
    teamKey: string;
    nameOcc: Map<string, number>;
    totalPoints: number;
    eventsScored: number;
    bestRank: number;
    results: TeamEntry["results"];
  };
  // teamKey is already the canonical key (after alias resolution via teamNormalKey)
  const acc: Record<string, Record<string, Map<string, AccTeam>>> = {};

  for (const event of events.filter((e) => e.hasResults)) {
    const stored = loader(event.id);
    if (!stored) {
      continue;
    }

    const yearKey = String(event.year);
    if (!acc[yearKey]) {
      acc[yearKey] = {};
    }

    for (const dist of stored.distances) {
      const distKey = normalizeDistance(dist.name);
      if (!acc[yearKey][distKey]) {
        acc[yearKey][distKey] = new Map();
      }

      const distMap = acc[yearKey][distKey];

      const teamAthletes = new Map<
        string,
        Array<{
          name: string;
          pos: number;
          rawTeam: string;
          athleteId: number;
          country: string;
          category: string;
        }>
      >();
      for (const result of dist.results) {
        if (result.dnf || result.dns || result.pos < 1 || !result.team) {
          continue;
        }

        const teamKey = teamNormalKey(result.team);
        if (INDIVIDUAL_TEAM_KEYS.has(teamKey)) {
          continue;
        }

        if (!teamAthletes.has(teamKey)) {
          teamAthletes.set(teamKey, []);
        }

        teamAthletes.get(teamKey)!.push({
          name: result.name,
          pos: result.pos,
          rawTeam: fixRawTeamName(result.team),
          athleteId: result.athleteId ?? 0,
          country: result.country ?? "",
          category: result.category ?? "",
        });
      }

      const totalTeams = teamAthletes.size;
      type EligibleTeam = {
        teamKey: string;
        rawTeam: string;
        combinedScore: number;
        bestPos: number;
        top3: Array<{
          name: string;
          pos: number;
          rawTeam: string;
          athleteId: number;
          country: string;
          category: string;
        }>;
        all: Array<{
          name: string;
          pos: number;
          rawTeam: string;
          athleteId: number;
          country: string;
          category: string;
        }>;
      };
      const eligible: EligibleTeam[] = [];

      for (const [teamKey, athletes] of teamAthletes) {
        if (athletes.length < 3) {
          continue;
        }

        const sorted = [...athletes].sort(
          (athleteA, athleteB) => athleteA.pos - athleteB.pos,
        );
        const top3 = sorted.slice(0, 3);
        eligible.push({
          teamKey,
          rawTeam: sorted[0]!.rawTeam,
          combinedScore: top3.reduce((sum, athlete) => sum + athlete.pos, 0),
          bestPos: top3[0]!.pos,
          top3,
          all: sorted,
        });
      }

      eligible.sort(
        (teamA, teamB) =>
          teamA.combinedScore - teamB.combinedScore ||
          teamA.bestPos - teamB.bestPos,
      );
      const eligibleTeams = eligible.length;
      const coeff = teamCoefficient(eligibleTeams);

      eligible.slice(0, 10).forEach((eligibleTeam, index) => {
        const teamRank = index + 1;
        const basePoints = rankToTeamBasePoints(teamRank);
        const points = Math.round(basePoints * coeff * 10) / 10;

        if (!distMap.has(eligibleTeam.teamKey)) {
          distMap.set(eligibleTeam.teamKey, {
            teamKey: eligibleTeam.teamKey,
            nameOcc: new Map(),
            totalPoints: 0,
            eventsScored: 0,
            bestRank: teamRank,
            results: [],
          });
        }

        const entry = distMap.get(eligibleTeam.teamKey)!;
        entry.totalPoints = Math.round((entry.totalPoints + points) * 10) / 10;
        entry.eventsScored += 1;
        if (teamRank < entry.bestRank) {
          entry.bestRank = teamRank;
        }

        entry.nameOcc.set(
          eligibleTeam.rawTeam,
          (entry.nameOcc.get(eligibleTeam.rawTeam) ?? 0) + 1,
        );
        entry.results.push({
          eventId: event.id,
          eventName: event.name,
          eventDate: event.date,
          totalTeams,
          eligibleTeams,
          coefficient: coeff,
          teamRank,
          basePoints,
          points,
          combinedScore: eligibleTeam.combinedScore,
          athletes: eligibleTeam.all.map((athlete) => {
            const resolvedId =
              athlete.athleteId > 0
                ? athlete.athleteId
                : (() => {
                    const teamId = isSoloTeam(athlete.rawTeam)
                      ? 0
                      : (teamIdStore.get(teamNormalKey(athlete.rawTeam)) ?? 0);
                    const rehomeKey = `${normalizeName(athlete.name)}|${teamId === 0 ? "" : teamId}`;
                    return (
                      athleteIndex.get(
                        keyToCanonical.get(rehomeKey) ?? rehomeKey,
                      )?.id ?? 0
                    );
                  })();
            const scoring = eligibleTeam.top3.some(
              (member) =>
                member.name === athlete.name && member.pos === athlete.pos,
            );
            return {
              id: resolvedId,
              name: athlete.name,
              pos: athlete.pos,
              scoring,
              country: athlete.country,
              category: athlete.category,
            };
          }),
        });
      });
    }
  }

  const ranking: TeamRanking = {};
  for (const [year, distances] of Object.entries(acc)) {
    ranking[year] = {};
    for (const [dist, distMap] of Object.entries(distances)) {
      const sorted = Array.from(distMap.values()).sort(
        (entryA, entryB) =>
          entryB.totalPoints - entryA.totalPoints ||
          entryA.bestRank - entryB.bestRank,
      );
      ranking[year][dist] = sorted.map((entry, index) => ({
        rank: index + 1,
        team: canonicalTeam(entry.nameOcc),
        teamKey: entry.teamKey,
        teamId: 0,
        totalPoints: entry.totalPoints,
        eventsScored: entry.eventsScored,
        bestRank: entry.bestRank,
        results: entry.results.sort(
          (resultA, resultB) =>
            new Date(resultB.eventDate).getTime() -
            new Date(resultA.eventDate).getTime(),
        ),
      }));
    }
  }

  return ranking;
}
