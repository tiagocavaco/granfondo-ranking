/**
 * config.ts
 *
 * Static event configuration: supplemental IDs, official URLs, default distances,
 * and participant list URLs. Update here when adding new events.
 */

/**
 * Supplemental event IDs that are Portuguese granfondo-series events but don't
 * have "granfondo" in their StopAndGo name (different spelling, abbreviation, etc.).
 * Add entries here when the name-based filter misses an event.
 */
export const SUPPLEMENTAL_EVENT_IDS: number[] = [
  // 2025 events with non-standard names
  1621, // Aveiro Spring Classic 2025
  1553, // MONÇÃO e MELGAÇO GF 2025
  1681, // Grandfondo Médio Tejo 2025 (typo: "Grandfondo" with extra d)
  // 2026 events with non-standard names or missing "granfondo" in name
  1944, // Aveiro Spring Classic 2026
  1880, // Figueira Champions Classic 2026 (BIG DAY = Granfondo, HALF DAY = Mediofondo)
  1741, // EuroBEC Granfondo 2026 (Apr 12)
  1751, // Granfondo Torres Vedras 2026 (Apr 19)
  1766, // Love Tiles Douro Granfondo 2026 (Apr 26)
  1798, // SÃO MAMEDE GRANFONDO 2026 (Jun 7)
  1806, // Gerês Granfondo 2026 (Jun 7)
  1700, // Granfondo Serra da Estrela 2026 (Jun 28)
  1883, // Bragança Granfondo 2026 (Jul 12)
  1956, // Lousã Granfondo 2026 (Sep 13)
  1943, // Monção e Melgaço GF 2026 (Sep 20)
  1942, // TAVIRA GRANFONDO 2026 (Sep 27)
  1828, // Ourém Fatima Granfondo 2026 (Oct 18)
  1977, // Grandfondo Médio Tejo 2026 (May 24)
];

/**
 * Official organiser/event pages. Applied to all events (past and upcoming) as officialUrl.
 * For StopAndGo-native events without an entry here, officialUrl falls back to
 * https://stopandgo.net/events/{id} (which redirects to the slug-based page).
 */
export const OFFICIAL_EVENT_URLS: Record<number, string> = {
  // BikeService
  1720: "https://bikeservice.pt/event/viana-granfondo/",
  1741: "https://bikeservice.pt/event/eurobec-granfondo/",
  1766: "https://bikeservice.pt/event/douro-granfondo/",
  1806: "https://bikeservice.pt/event/geres-granfondo/",
  1883: "https://bikeservice.pt/event/braganca-granfondo/",
  1943: "https://bikeservice.pt/event/moncao-e-melgaco-granfondo/",
  1828: "https://bikeservice.pt/event/ourem-fatima-granfondo/",
  // Algarve Granfondo
  1831: "https://www.algarvegranfondo.com/",
  // Cabreira Solutions
  1751: "https://cabreirasolutions.com/evento/granfondo-torres-vedras/",
  1977: "https://cabreirasolutions.com/evento/granfondo-medio-tejo/",
  1956: "https://cabreirasolutions.com/evento/lousa-granfondo/",
  90011: "https://cabreirasolutions.com/evento/granfondo-terras-de-basto/",
  90013: "https://cabreirasolutions.com/evento/granfondo-paredes/",
  90015: "https://cabreirasolutions.com/evento/granfondo-serra-dossa/",
  90016: "https://cabreirasolutions.com/evento/granfondo-portimao/",
  // Figueira Champions Classic
  1880: "https://www.figueirachampionsclassic.com/day/regulamento/",
  // Aveiro Spring Classic
  1944: "https://cabreirasolutions.com/evento/aveiro-spring-classic/",
  // São Mamede Granfondo
  1798: "https://stopandgo.net/events/sao-mamede-granfondo-2026",
  // Tavira Granfondo
  1942: "https://stopandgo.net/events/tavira-granfondo-2026",
  // Serra da Estrela Granfondo
  1700: "https://granfondoserradaestrela.com/",
};

/**
 * Default distances for upcoming events where StopAndGo returns no participants yet.
 * Format: { id: string (1-based), name: string }
 */
export const DEFAULT_DISTANCES: Record<number, Array<{ id: string; name: string }>> = {
  // BikeService events (GF + MF + Mini)
  1741: [{ id: "1", name: "Granfondo" }, { id: "2", name: "Mediofondo" }, { id: "3", name: "Minifondo" }],
  1766: [{ id: "1", name: "Granfondo" }, { id: "2", name: "Mediofondo" }, { id: "3", name: "Minifondo" }],
  1806: [{ id: "1", name: "Granfondo" }, { id: "2", name: "Mediofondo" }, { id: "3", name: "Minifondo" }],
  1883: [{ id: "1", name: "Granfondo" }, { id: "2", name: "Mediofondo" }, { id: "3", name: "Minifondo" }],
  1943: [{ id: "1", name: "Granfondo" }, { id: "2", name: "Mediofondo" }, { id: "3", name: "Minifondo" }],
  1828: [{ id: "1", name: "Granfondo" }, { id: "2", name: "Mediofondo" }, { id: "3", name: "Minifondo" }],
  // Cabreira Solutions events (GF + MF + Mini)
  1751: [{ id: "1", name: "Granfondo" }, { id: "2", name: "Mediofondo" }, { id: "3", name: "Minifondo" }],
  1977: [{ id: "1", name: "Granfondo" }, { id: "2", name: "Mediofondo" }, { id: "3", name: "Minifondo" }],
  1956: [{ id: "1", name: "Granfondo" }, { id: "2", name: "Mediofondo" }, { id: "3", name: "Minifondo" }],
  // Figueira Champions Classic (BIG DAY = GF, HALF DAY = MF)
  1880: [{ id: "1", name: "Granfondo" }, { id: "2", name: "Mediofondo" }],
  // Aveiro Spring Classic (GF + MF)
  1944: [{ id: "1", name: "Granfondo" }, { id: "2", name: "Mediofondo" }],
  // São Mamede, Tavira, Serra da Estrela (GF + MF + Mini)
  1798: [{ id: "1", name: "Granfondo" }, { id: "2", name: "Mediofondo" }, { id: "3", name: "Minifondo" }],
  1942: [{ id: "1", name: "Granfondo" }, { id: "2", name: "Mediofondo" }, { id: "3", name: "Minifondo" }],
  1700: [{ id: "1", name: "Granfondo" }, { id: "2", name: "Mediofondo" }, { id: "3", name: "Minifondo" }],
};

/**
 * Events that publish their participant list on stopandgo.net/lista/{slug}/.
 * Used instead of the xcrono atletas.php API (which returns empty for upcoming events).
 * Only confirmed participants (status=1) are included.
 */
export const LISTA_URLS: Record<number, string> = {
  // stopandgo.net/lista/ — BikeService events
  1741: "https://stopandgo.net/lista/eurobecgf26/",
  1766: "https://stopandgo.net/lista/douro_granfondo25/",
  1806: "https://stopandgo.net/lista/geres_granfondo2026/",
  1883: "https://stopandgo.net/lista/braganca_gf_26/",
  1943: "https://stopandgo.net/lista/moncao_melgaco_gf26/",
  1956: "https://stopandgo.net/lista/lousagf_26/",
  1828: "https://stopandgo.net/lista/ourem_25/",
  // inscricoes.cabreirasolutions.com/listas/ — same HTML table format
  1751: "https://inscricoes.cabreirasolutions.com/listas/gf-torres-vedras-2026",
  1977: "https://inscricoes.cabreirasolutions.com/listas/grandfondo-m-dio-tejo-2026",
  90011: "https://inscricoes.cabreirasolutions.com/listas/granfondo-terras-de-basto-2026",
  90013: "https://inscricoes.cabreirasolutions.com/listas/granfondo-paredes-2026",
  90015: "https://inscricoes.cabreirasolutions.com/listas/granfondo-serra-d-ossa-2026",
  90016: "https://inscricoes.cabreirasolutions.com/listas/grandfondo-portim-o-2026",
};
