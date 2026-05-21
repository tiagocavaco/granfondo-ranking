// ── StopAndGo API response types (scraper-only) ───────────────────────────────

export interface ApiAthlete {
  dorsal: string;
  nome: string;
  nomecompleto: string;
  sexo: string;
  equipa: string;
  escalao: string;
  percurso: string; // distance name e.g. "Granfondo"
  id_percursos: string; // distance ID e.g. "1"
}

export interface ApiNetEvent {
  id: number;
  nome: string;
  data_inicio: string; // ISO datetime
  status: number;
  location?: string; // "City, Country"
}

export interface ApiEvent {
  id_evento: string;
  nome: string;
  local: string;
  data: string; // "YYYY/MM/DD"
  tipo: string;
  status: string;
  eventoemcurso: string;
  arquivo: string;
}

export interface ApiResult {
  pos: string;
  dorsal: string;
  nome: string;
  equipa: string;
  escalao: string;
  sexo: string;
  licenca1: string;
  licenca2?: string;
  pais_nome: string;
  pais_iso2: string;
  temposeg: string;
  tempo: string;
  diferenca: string;
  percurso: string;
  id_percursos: string;
  obs: string;
  status: string;
  pontos: string | number;
}
