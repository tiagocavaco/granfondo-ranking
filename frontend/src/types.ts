// ── Stored event types (match scraper output) ─────────────────────────────────

export interface StoredDistance {
  id: string;
  name: string;
}

export interface StoredEvent {
  id: number;
  name: string;
  year: number;
  date: string; // "YYYY-MM-DD"
  location: string;
  officialUrl?: string;
  resultsUrl: string;
  hasResults: boolean;
  distances: StoredDistance[];
  participantCount: number;
  finisherCount: number;
  scrapedAt: string | null;
}

export interface StoredResult {
  pos: number;       // overall finish position
  genderPos: number; // position among own gender
  athleteId: number; // stable athlete ID (0 if unknown)
  bib: string;
  name: string;
  nameLower: string;
  gender: string;
  team: string;
  category: string;
  country: string;
  raceTime: string;
  raceTimeSecs: number;
  gap: string;
  gapSecs: number;
  points: number;
  licence: string;
  dnf: boolean;
  dns: boolean;
}

export interface StoredDistanceResults {
  id: string;
  name: string;
  finisherCount: number;
  results: StoredResult[];
}

export interface StoredEventResults {
  eventId: number;
  eventName: string;
  eventDate: string;
  eventYear: number;
  scrapedAt: string;
  distances: StoredDistanceResults[];
}

// ── Athlete profile ───────────────────────────────────────────────────────────

export interface AthleteResultRef {
  eventId: number;
  eventName: string;
  eventDate: string;
  eventYear: number;
  distance: string;
  pos: number;
  category: string;
  gender: string;
  team: string;
  country: string;
  raceTime: string;
  raceTimeSecs: number;
  gap: string;
  gapSecs: number;
  dnf: boolean;
  dns: boolean;
}

export interface AthleteEntry {
  id: number;
  name: string;
  nameLower: string;
  canonicalTeam?: string;
  results: AthleteResultRef[];
}

// ── Participants (raw from scraper) ────────────────────────────────────────────

export interface ApiAthlete {
  dorsal: string;
  nome: string;
  nomecompleto: string;
  sexo: string;
  equipa: string;
  escalao: string;
  percurso: string;
  id_percursos: string;
  pais_nome: string | null;
  licenca1: string | null;
}

// ── Aggregate ranking ──────────────────────────────────────────────────────────

export interface AggregateResult {
  eventId: number;
  eventName: string;
  eventDate: string;
  distanceFinishers: number;
  coefficient: number;
  pos: number;
  basePoints: number;
  points: number;
}

export interface AggregateAthlete {
  rank: number;
  id: number;
  name: string;
  nameLower: string;
  gender: string;
  team: string;
  country: string;
  totalPoints: number;
  eventsScored: number;
  bestPos: number;
  results: AggregateResult[];
}

export type AggregateRanking = {
  [year: string]: {
    [distance: string]: {
      [gender: string]: AggregateAthlete[]; // "M" | "F"
    };
  };
};

// ── Team ranking ──────────────────────────────────────────────────────────────

export interface TeamRaceAthlete {
  id: number;
  name: string;
  pos: number;
}

export interface TeamRaceResult {
  eventId: number;
  eventName: string;
  eventDate: string;
  totalTeams: number;
  eligibleTeams: number;
  coefficient: number;
  teamRank: number;
  basePoints: number;
  points: number;
  combinedScore: number;
  athletes: TeamRaceAthlete[];
}

export interface TeamEntry {
  rank: number;
  team: string;
  totalPoints: number;
  eventsScored: number;
  bestRank: number;
  results: TeamRaceResult[];
}

export type TeamRanking = {
  [year: string]: {
    [distance: string]: TeamEntry[];
  };
};
