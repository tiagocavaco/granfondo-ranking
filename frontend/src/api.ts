import type { StoredEvent, StoredEventResults, ApiAthlete, AggregateRanking, TeamRanking, AthleteEntry } from "./types";

/** Strip accents and lowercase — matches scraper's normalizeName(). */
function normalizeName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[´`\u00b4\u02b9\u02bc\u2018\u2019''']/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

// Loaded once at startup from /data/name-to-id.json.
// Falls back to empty map — navigation degrades gracefully if not yet fetched.
let nameToId: Record<string, number> = {};

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

  getStats(): Promise<{ uniqueAthletes: number; uniqueByYear: Record<string, number> }> {
    return getJson<{ uniqueAthletes: number; uniqueByYear: Record<string, number> }>("/stats.json");
  },

  getAthlete(id: number): Promise<AthleteEntry> {
    return getJson<AthleteEntry>(`/athlete/${id}.json`);
  },

  /** Look up athlete ID from a display name. Returns null if not found. */
  lookupAthleteId(name: string): number | null {
    const id = nameToId[normalizeName(name)];
    return id ?? null;
  },

  async initNameToId(): Promise<void> {
    try {
      nameToId = await getJson<Record<string, number>>("/name-to-id.json");
    } catch {
      // non-fatal: athlete navigation won't work but page still loads
    }
  },
};
