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
};

export type { FavoritePrediction, CategoryPredictions, DistancePredictions } from "./predictions.js";
export { ROAD_DISTANCES, predictionDistCoeff } from "./predictions.js";
export { resolveTeamId, resolveTeamKey } from "../utils/lookups.js";
