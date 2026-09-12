/**
 * Canonical normalization functions shared between scraper (key generation)
 * and frontend (key lookup). Both sides must produce identical output.
 */

export function normalizeName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[´`\u00b4\u02b9\u02bc\u2018\u2019''']/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function fixRawTeamName(name: string): string {
  // Dash-only placeholders (e.g. "------" from apedalar.pt) mean no team.
  if (/^[-\s]+$/.test(name)) return "Individual";
  // Decode HTML entities that the StopAndGo API embeds in JSON strings
  // (e.g. "&amp;" → "&", double-encoded "&amp;amp;" → "&").
  let s = name;
  while (s.includes("&amp;")) {
    s = s.replace(/&amp;/g, "&");
  }
  s = s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) =>
      String.fromCharCode(parseInt(hex, 16)),
    );
  // Parallel strings: index i in PLAIN_VOWELS maps to index i in ACCENTED_VOWELS.
  // e.g. "Joa^o" → "Joâo".
  const PLAIN_VOWELS = "aeiouAEIOU";
  const ACCENTED_VOWELS = "âêîôûÂÊÎÔÛ";
  return s.replace(/([aeiouAEIOU])\^/g, (_, vowel: string) => {
    const index = PLAIN_VOWELS.indexOf(vowel);
    return index >= 0 ? ACCENTED_VOWELS[index]! : vowel + "^";
  });
}

export function normalizeTeam(name: string): string {
  let s = fixRawTeamName(name);
  s = s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  s = s.replace(/['''`´\u2018\u2019\u02bc]/g, "");
  s = s.replace(/#/g, "");
  s = s.replace(/[.,]/g, " ");
  s = s.replace(/[/|\\^&+@]/g, " ").replace(/\s*-\s*/g, " ");
  // Strip any remaining non-alphanumeric chars (catches symbols like %, €, (, ), _, ™ etc.
  // that aren't explicitly handled above). Replace with space to avoid letter merging.
  s = s.replace(/[^a-z0-9 ]/g, " ");
  s = s.replace(/\s+/g, " ").trim();
  for (let i = 0; i < 6; i++) {
    s = s.replace(/(?<![a-z])([a-z]) ([a-z])(?![a-z])/g, "$1$2");
  }

  s = s.replace(/(?<![a-z])([a-z]{1,3}) ([a-z])(?![a-z])/g, "$1$2");
  s = s.replace(/\s+/g, " ").trim();
  return s;
}

export const SOLO_TEAM_KEYS = new Set([
  "individual",
  "individoal",
  "independente",
  "no team",
  "n team",
  "sem equipa",
  "",
]);

// ── Distance normalization ────────────────────────────────────────────────────

export const DISTANCE_ALIASES: Record<string, string> = {
  granfondo: "Granfondo",
  mediofondo: "Mediofondo",
  minifondo: "Minifondo",
  "time trial": "Time Trial",
  contrarrelógio: "Time Trial",
  contrarrelogio: "Time Trial",
  // Figueira Champions Classic
  "big day": "Granfondo",
  "half day": "Mediofondo",
  // Clássica Douro Internacional (accented and unaccented variants)
  clássica: "Granfondo",
  classica: "Granfondo",
  "clássica longa": "Granfondo",
  "classica longa": "Granfondo",
  "clássica média": "Mediofondo",
  "classica média": "Mediofondo",
  "clássica curta": "Minifondo",
  "classica curta": "Minifondo",
  // Aveiro Spring Classic
  longa: "Granfondo",
  curta: "Mediofondo",
  // L'Étape Portugal by Tour de France
  "l'étape 140": "Granfondo",
  "l'étape 125": "Granfondo",
  "l'étape 100": "Mediofondo",
  "l'étape 50": "Minifondo",
  etapa: "Mediofondo",
};

export function normalizeDistance(name: string): string {
  // Normalise apostrophe variants to straight apostrophe (U+0027) before lookup.
  // Covers: ` (backtick), ´ (U+00B4 acute), ʹ (U+02B9), ʼ (U+02BC), ‘ ‘ (U+2018/2019).
  // Collapse multiple spaces and treat hyphens as spaces so "Half  Day-48 km"
  // normalises to "half day 48 km" and prefix-matches "half day".
  const lower = name
    .toLowerCase()
    .replace(/[`´ʹʼ‘’]/g, "'")
    .replace(/\s*-\s*/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (lower in DISTANCE_ALIASES) {
    return DISTANCE_ALIASES[lower]!;
  }

  // Prefix match for names with km suffixes (e.g. "big day 129km", "half day 77,3km")
  for (const [key, val] of Object.entries(DISTANCE_ALIASES)) {
    if (lower.startsWith(key + " ")) {
      return val;
    }
  }

  return name;
}

// ── Country normalization ─────────────────────────────────────────────────────

const COUNTRY_NAME_TO_ISO2: Record<string, string> = {
  Portugal: "PT",
  Spain: "ES",
  Brazil: "BR",
  "United Kingdom": "GB",
  France: "FR",
  Italy: "IT",
  Netherlands: "NL",
  Germany: "DE",
  "Russian Federation": "RU",
  Belgium: "BE",
  Ireland: "IE",
  "United States of America": "US",
  "United States": "US",
  Canada: "CA",
  Luxembourg: "LU",
  Ukraine: "UA",
  Austria: "AT",
  Switzerland: "CH",
  Poland: "PL",
  Sweden: "SE",
  Denmark: "DK",
  Norway: "NO",
  Finland: "FI",
  "Czech Republic": "CZ",
  Hungary: "HU",
  Romania: "RO",
  Australia: "AU",
  "New Zealand": "NZ",
  Japan: "JP",
  China: "CN",
  "South Africa": "ZA",
  Argentina: "AR",
  Colombia: "CO",
  Mexico: "MX",
  Angola: "AO",
  Mozambique: "MZ",
  "Cape Verde": "CV",
};

/**
 * Normalise a country value to ISO 3166-1 alpha-2.
 * Handles: empty/null (→ "PT"), ISO2 pass-through, full country names.
 * Defaults to "PT" — all events are held in Portugal.
 */
export function normalizeCountry(raw: string | undefined | null): string {
  if (!raw) {
    return "PT";
  }

  const trimmed = raw.trim();
  if (trimmed.length === 2) {
    return trimmed.toUpperCase();
  }

  return COUNTRY_NAME_TO_ISO2[trimmed] ?? "PT";
}

/** Convert an ISO 3166-1 alpha-2 code to a flag emoji. */
export function countryFlag(iso2: string): string {
  const code = normalizeCountry(iso2);
  return [...code]
    .map((c) => String.fromCodePoint(0x1f1e6 + c.charCodeAt(0) - 65))
    .join("");
}
