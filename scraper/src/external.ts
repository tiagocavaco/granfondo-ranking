/**
 * External event definitions and scraper re-exports.
 *
 * EXTERNAL_EVENTS — past events hosted on non-StopAndGo platforms.
 * MANUAL_UPCOMING_EVENTS — future events with no StopAndGo ID yet.
 */

import type { StoredEvent } from "@granfondo/database/types";

export const EXTERNAL_EVENTS: StoredEvent[] = [
  {
    id: 90001,
    name: "Figueira Champions Day 2025",
    year: 2025,
    date: "2025-02-15",
    location: "Figueira da Foz",
    resultsUrl:
      "https://lap2go.com/pt/event/figueira-champions-day-2025/timetable",
    officialUrl: "https://www.figueirachampionsclassic.com",
    hasResults: false,
    distances: [
      { id: "1", name: "Granfondo" },
      { id: "2", name: "Mediofondo" },
    ],
    participantCount: 0,
    finisherCount: 0,
    scrapedAt: null,
  },
  {
    id: 90002,
    name: "Granfondo Agitágueda 2025",
    year: 2025,
    date: "2025-07-27",
    location: "Águeda",
    resultsUrl: "https://www.waitastart.com/events/granfondo-agitagueda-2025",
    officialUrl: null,
    hasResults: false,
    distances: [
      { id: "1", name: "Granfondo" },
      { id: "2", name: "Mediofondo" },
      { id: "3", name: "Minifondo" },
    ],
    participantCount: 0,
    finisherCount: 0,
    scrapedAt: null,
  },
  {
    id: 90003,
    name: "Granfondo 5 Quinas Sabugal 2025",
    year: 2025,
    date: "2025-06-01",
    location: "Sabugal",
    resultsUrl: "https://apedalar.pt/eventos/3818/resultados",
    officialUrl: null,
    hasResults: false,
    distances: [
      { id: "1", name: "Granfondo" },
      { id: "2", name: "Mediofondo" },
    ],
    participantCount: 0,
    finisherCount: 0,
    scrapedAt: null,
  },
  {
    id: 90004,
    name: "Porto Gaia Granfondo 2024",
    year: 2024,
    date: "2024-04-14",
    location: "Porto",
    resultsUrl:
      "https://timerspeed.com/live/g-live.html?f=events/2024/pggf_2024.clax",
    officialUrl: "https://portogaiagranfondo.com",
    hasResults: true,
    distances: [
      { id: "1", name: "Granfondo" },
      { id: "2", name: "Mediofondo" },
      { id: "3", name: "Minifondo" },
    ],
    participantCount: 0,
    finisherCount: 0,
    scrapedAt: null,
  },
];

/** Upcoming events with no StopAndGo ID yet — shown in the events list but not scraped. */
export const MANUAL_UPCOMING_EVENTS: StoredEvent[] = [
  {
    id: 90011,
    name: "Granfondo Terras de Basto 2026",
    year: 2026,
    date: "2026-06-21",
    location: "Mondim de Basto",
    resultsUrl:
      "https://cabreirasolutions.com/evento/granfondo-terras-de-basto/",
    officialUrl: null,
    hasResults: false,
    distances: [
      { id: "1", name: "Granfondo" },
      { id: "2", name: "Mediofondo" },
      { id: "3", name: "Minifondo" },
    ],
    participantCount: 0,
    finisherCount: 0,
    scrapedAt: null,
  },
  {
    id: 90012,
    name: "Granfondo 5 Quinas Sabugal 2026",
    year: 2026,
    date: "2026-07-05",
    location: "Sabugal",
    resultsUrl: "https://apedalar.pt/eventos/4197/info",
    officialUrl: null,
    hasResults: false,
    distances: [
      { id: "1", name: "Granfondo" },
      { id: "2", name: "Mediofondo" },
    ],
    participantCount: 0,
    finisherCount: 0,
    scrapedAt: null,
  },
  {
    id: 90013,
    name: "Granfondo Paredes 2026",
    year: 2026,
    date: "2026-07-26",
    location: "Paredes",
    resultsUrl: "https://cabreirasolutions.com/evento/granfondo-paredes/",
    officialUrl: null,
    hasResults: false,
    distances: [
      { id: "1", name: "Granfondo" },
      { id: "2", name: "Mediofondo" },
      { id: "3", name: "Minifondo" },
    ],
    participantCount: 0,
    finisherCount: 0,
    scrapedAt: null,
  },
  {
    id: 90015,
    name: "Granfondo Serra d'Ossa 2026",
    year: 2026,
    date: "2026-10-04",
    location: "Estremoz",
    resultsUrl: "https://cabreirasolutions.com/evento/granfondo-serra-dossa/",
    officialUrl: null,
    hasResults: false,
    distances: [
      { id: "1", name: "Granfondo" },
      { id: "2", name: "Mediofondo" },
      { id: "3", name: "Minifondo" },
    ],
    participantCount: 0,
    finisherCount: 0,
    scrapedAt: null,
  },
  {
    id: 90016,
    name: "Granfondo Portimão 2026",
    year: 2026,
    date: "2026-11-08",
    location: "Portimão",
    resultsUrl: "https://cabreirasolutions.com/evento/granfondo-portimao/",
    officialUrl: null,
    hasResults: false,
    distances: [
      { id: "1", name: "Granfondo" },
      { id: "2", name: "Mediofondo" },
      { id: "3", name: "Minifondo" },
    ],
    participantCount: 0,
    finisherCount: 0,
    scrapedAt: null,
  },
];

export { scrapeFigueiraChampionsDay } from "./scrapers/lap2go.js";
export { scrapeAgitagueda } from "./scrapers/waitastart.js";
export {
  scrapeApedalar5Quinas,
  scrapeApedalarParticipants,
  extractEscalaoOptions,
  escalaoToGender,
} from "./scrapers/apedalar.js";
export { scrapeListaParticipants } from "./scrapers/stopandgo.js";
export { scrapePortoGaiaGranfondo2024 } from "./scrapers/timerspeed.js";
