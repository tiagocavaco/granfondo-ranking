import { getEvents, getStats } from "./events.js";
import { getResults, getParticipants } from "./results.js";
import {
  getAthlete,
  initLookups,
  getTopAthletes,
  searchAthletes,
} from "./athletes.js";
import { getTeamById, getTeamByKey } from "./teams.js";
import { getAggregateRanking, getTeamRanking } from "./rankings.js";
import { getPredictions } from "./predictions.js";
import {
  getAthleteAliasRulesForAthlete,
  getResultAssignmentsForAthlete,
  getAthleteAliasRules,
  getResultAssignments,
  getTeamAliases,
  getRawAthlete,
  getRawTeam,
  getRawEvent,
  listRawAthletes,
  listRawTeams,
  listRawEvents,
  searchRawNames,
  searchTeams,
  searchEvents,
} from "./admin.js";

export { setGetDb } from "./db.js";
export { resolveTeamId, resolveTeamKey } from "./lookups.js";
export { mostRecentCountry } from "./athlete.js";
export type {
  FavoritePrediction,
  CategoryPredictions,
  DistancePredictions,
} from "./predictions.js";
export { ROAD_DISTANCES, predictionDistCoeff } from "./predictions.js";
export type {
  AthleteAliasRule,
  ResultAssignment,
  TeamAliasEntry,
  RawAthlete,
  RawTeam,
  RawTeamSummary,
  RawEvent,
  RawNameMatch,
  EventMatch,
} from "./admin.js";

export const api = {
  getEvents,
  getStats,
  getResults,
  getParticipants,
  getAthlete,
  initLookups,
  getTopAthletes,
  searchAthletes,
  getTeamById,
  getTeamByKey,
  getAggregateRanking,
  getTeamRanking,
  getPredictions,
  getAthleteAliasRulesForAthlete,
  getResultAssignmentsForAthlete,
  getAthleteAliasRules,
  getResultAssignments,
  getTeamAliases,
  getRawAthlete,
  getRawTeam,
  getRawEvent,
  listRawAthletes,
  listRawTeams,
  listRawEvents,
  searchRawNames,
  searchTeams,
  searchEvents,
};
