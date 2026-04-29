import {
  normalizeName,
  teamNormalKey,
  normalizeDistance,
  fixRawTeamName,
  canonicalTeam,
} from "../normalize.js";
import {
  posToBasePoints,
  finisherCoefficient,
  rankToTeamBasePoints,
  teamCoefficient,
} from "./scoring.js";
import type { ResultsLoader } from "./pipeline.js";
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
  keyToCanonical: Map<string, string> = new Map()
): AggregateRanking {
  type AccEntry = {
    id: number; name: string; nameLower: string; gender: string;
    team: string; teamDate: string; countryCounts: Map<string, number>;
    totalPoints: number; eventsScored: number; bestPos: number;
    results: AggregateAthlete["results"];
  };
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
          const storedId = r.athleteId ?? 0;
          const rawKey = `${nameLower}|${teamNormalKey(r.team)}`;
          const aKey = (storedId > 0 && idToCanonicalKey.has(storedId))
            ? idToCanonicalKey.get(storedId)!
            : (keyToCanonical.get(rawKey) ?? rawKey);
          const id = storedId > 0 ? storedId : (athleteIndex.get(aKey)?.id ?? 0);

          if (!distMap.has(aKey)) {
            distMap.set(aKey, {
              id, name: r.name, nameLower, gender: r.gender,
              team: r.team, teamDate: event.date, countryCounts: new Map(),
              totalPoints: 0, eventsScored: 0, bestPos: genderPos, results: [],
            });
          }
          const entry = distMap.get(aKey)!;
          entry.totalPoints = Math.round((entry.totalPoints + pts) * 10) / 10;
          entry.eventsScored += 1;
          if (genderPos < entry.bestPos) entry.bestPos = genderPos;
          if (r.country) entry.countryCounts.set(r.country, (entry.countryCounts.get(r.country) ?? 0) + 1);
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
        ranking[year][dist][gender] = sorted.map((e, i) => {
          const country = [...e.countryCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "PT";
          return {
            rank: i + 1, id: e.id, name: e.name, nameLower: e.nameLower,
            gender: e.gender, team: e.team, country,
            totalPoints: e.totalPoints, eventsScored: e.eventsScored, bestPos: e.bestPos,
            results: e.results.sort(
              (a, b) => new Date(b.eventDate).getTime() - new Date(a.eventDate).getTime()
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

      const teamAthletes = new Map<string, Array<{ name: string; pos: number; rawTeam: string; athleteId: number; country: string }>>();
      for (const r of dist.results) {
        if (r.dnf || r.dns || r.pos < 1 || !r.team) continue;
        const tk = teamNormalKey(r.team);
        if (INDIVIDUAL_TEAM_KEYS.has(tk)) continue;
        if (!teamAthletes.has(tk)) teamAthletes.set(tk, []);
        teamAthletes.get(tk)!.push({ name: r.name, pos: r.pos, rawTeam: fixRawTeamName(r.team), athleteId: r.athleteId ?? 0, country: r.country ?? "", category: r.category ?? "" });
      }

      const totalTeams = teamAthletes.size;
      type EligibleTeam = {
        tk: string; rawTeam: string; combinedScore: number; bestPos: number;
        top3: Array<{ name: string; pos: number; rawTeam: string; athleteId: number; country: string; category: string }>;
        all: Array<{ name: string; pos: number; rawTeam: string; athleteId: number; country: string; category: string }>;
      };
      const eligible: EligibleTeam[] = [];

      for (const [tk, athletes] of teamAthletes) {
        if (athletes.length < 3) continue;
        const sorted = [...athletes].sort((a, b) => a.pos - b.pos);
        const top3 = sorted.slice(0, 3);
        eligible.push({
          tk, rawTeam: sorted[0]!.rawTeam,
          combinedScore: top3.reduce((s, a) => s + a.pos, 0),
          bestPos: top3[0]!.pos, top3, all: sorted,
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
          athletes: et.all.map((a) => {
            const id = a.athleteId > 0 ? a.athleteId : (() => {
              const rk = `${normalizeName(a.name)}|${teamNormalKey(a.rawTeam)}`;
              return athleteIndex.get(keyToCanonical.get(rk) ?? rk)?.id ?? 0;
            })();
            const scoring = et.top3.some((t) => t.name === a.name && t.pos === a.pos);
            return { id, name: a.name, pos: a.pos, scoring, country: a.country, category: a.category };
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
