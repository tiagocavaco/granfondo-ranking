import type { StoredEvent, StoredEventResults, ApiAthlete, AggregateRanking, TeamRanking, AthleteEntry } from "./types";

export function athleteSlug(nameLower: string): string {
  return nameLower.replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

const BASE = `${import.meta.env.BASE_URL}data`;

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`);
  if (!res.ok) throw new Error(`Not found: ${path}`);
  return res.json() as Promise<T>;
}

export const api = {
  getEvents(): Promise<StoredEvent[]> {
    return getJson<StoredEvent[]>("/events.json");
  },

  getParticipants(id: number): Promise<ApiAthlete[]> {
    return getJson<ApiAthlete[]>(`/${id}_participants.json`);
  },

  getResults(id: number): Promise<StoredEventResults> {
    return getJson<StoredEventResults>(`/${id}_results.json`);
  },

  getAggregateRanking(): Promise<AggregateRanking> {
    return getJson<AggregateRanking>("/aggregate_ranking.json");
  },

  getTeamRanking(): Promise<TeamRanking> {
    return getJson<TeamRanking>("/team_ranking.json");
  },

  getStats(): Promise<{ uniqueAthletes: number }> {
    return getJson<{ uniqueAthletes: number }>("/stats.json");
  },

  getAthlete(nameLower: string): Promise<AthleteEntry> {
    return getJson<AthleteEntry>(`/athlete/${athleteSlug(nameLower)}.json`);
  },
};
