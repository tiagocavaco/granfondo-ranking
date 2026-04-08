// ── Raw API response types ───────────────────────────────────────────────────

export interface ApiNetEvent {
  id: number;
  nome: string;
  data_inicio: string; // ISO datetime
  status: number;      // 1 = upcoming, 2 = finished (or similar)
  location?: string;   // "City, Country"
}

export interface ApiEvent {
  id_evento: string;
  nome: string;
  local: string;
  data: string;       // "YYYY/MM/DD"
  tipo: string;       // "Granfondo", "Ciclismo", "BTT", etc.
  status: string;     // "2" = finished, "1" = upcoming
  eventoemcurso: string; // "Y" | "N"
  arquivo: string;    // "true" | "false"
}

export interface ApiAthlete {
  dorsal: string;
  nome: string;
  nomecompleto: string;
  sexo: string;
  equipa: string;
  escalao: string;
  percurso: string;     // distance name e.g. "Granfondo"
  id_percursos: string; // distance ID e.g. "1"
  pais_nome: string | null;
  pais_iso2: string | null;
  licenca: string | null;
  licenca1: string | null;
}

export interface ApiResult {
  pos: string;
  dorsal: string;
  nome: string;
  equipa: string;
  escalao: string;
  sexo: string;
  licenca1: string;
  pais_nome: string;
  pais_iso2: string;
  temposeg: string;   // decimal seconds as string e.g. "12266.493"
  tempo: string;      // "HH:MM:SS.mmm"
  diferenca: string;  // "HH:MM:SS.mmm"
  percurso: string;   // distance name (when filtered by id_percursos)
  id_percursos: string;
  obs: string;
  status: string;
  pontos: string | number;
}

// ── Stored / output types ────────────────────────────────────────────────────

export interface StoredDistance {
  id: string;
  name: string;
}

export interface StoredEvent {
  id: number;
  name: string;
  year: number;
  date: string;         // "YYYY-MM-DD"
  location: string;
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
  bib: string;
  name: string;
  nameLower: string;    // accent-stripped lowercase for search
  gender: string;       // "M" | "F"
  team: string;
  category: string;
  country: string;
  raceTime: string;     // "HH:MM:SS"
  raceTimeSecs: number;
  gap: string;          // "HH:MM:SS" | ""
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

// ── Athletes index ────────────────────────────────────────────────────────────

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
  name: string;
  nameLower: string;
  canonicalTeam?: string; // most frequent team name (fuzzy-deduplicated)
  results: AthleteResultRef[];
}

// ── Aggregate ranking ─────────────────────────────────────────────────────────

export interface AggregateResult {
  eventId: number;
  eventName: string;
  eventDate: string;
  distanceFinishers: number; // finisher count for this distance in this event
  coefficient: number;       // sqrt(finishers/300) rounded to 2dp
  pos: number;
  basePoints: number;        // raw points from the table
  points: number;            // basePoints * coefficient, rounded to 1dp
}

export interface AggregateAthlete {
  rank: number;
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

export interface AggregateRanking {
  // year → distanceName → gender ("M" | "F") → athletes sorted by totalPoints desc
  [year: string]: {
    [distance: string]: {
      [gender: string]: AggregateAthlete[];
    };
  };
}

// ── Team ranking ──────────────────────────────────────────────────────────────

export interface TeamRaceAthlete {
  name: string;
  pos: number;
}

export interface TeamRaceResult {
  eventId: number;
  eventName: string;
  eventDate: string;
  totalTeams: number;     // all teams with ≥1 athlete (used for coefficient)
  eligibleTeams: number;  // teams with ≥3 athletes (eligible for ranking)
  coefficient: number;
  teamRank: number;
  basePoints: number;
  points: number;
  combinedScore: number;  // sum of top-3 positions (lower = better)
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

export interface TeamRanking {
  [year: string]: {
    [distance: string]: TeamEntry[];
  };
}
