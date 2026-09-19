# Spec — event registry (`scraper/events.yaml`)

Status: proposed, not implemented. Implements engine plan Phase 3. Replaces
`SUPPLEMENTAL_EVENT_IDS`, `EXCLUDED_EVENT_IDS`, `CANONICAL_EVENT_NAMES`,
`OFFICIAL_EVENT_URLS`, `DEFAULT_DISTANCES`, `LISTA_URLS`,
`REGISTRATIONS_URLS`, `APEDALAR_PARTICIPANT_URLS` in `scraper/src/config.ts`
and `EXTERNAL_EVENTS` / `MANUAL_UPCOMING_EVENTS` in `scraper/src/external.ts`.

## 1. Schema

One YAML document, a list of events, validated at scraper start with a JSON
schema (`scraper/events.schema.json`). Unknown keys are an error.

```yaml
- id: 1956                       # integer; StopAndGo id, or 90001+ for external sources
  series: lousa                  # slug linking editions across years; required
  name: Lousã Granfondo 2026     # display name; required; replaces CANONICAL_EVENT_NAMES
  date: 2026-09-13               # ISO date; required
  location:
    name: Serra da Lousã         # required
    lat: 40.103                  # optional
    lng: -8.241                  # optional
  status: active                 # active | excluded | postponed ; default active
  officialUrl: https://cabreirasolutions.com/evento/lousa-granfondo/   # optional
  results:
    source: stopandgo            # stopandgo | lap2go | waitastart | apedalar | timerspeed | classificacoes | none
    url: https://results.stopandgo.pro/1956                            # display link; optional
    params: {}                   # source-specific: e.g. lap2go { alias, races: [...] }, classificacoes { resultsId }
  participants:
    source: lista                # xcrono | lista | registrations | apedalar | none
    url: https://stopandgo.net/lista/lousagf_26/
  distances:                     # optional; defaults when the source returns none
    - { id: "1", name: Granfondo, km: 145, elevationM: 2900, gpx: routes/lousa-2026-gf.gpx }
    - { id: "2", name: Mediofondo }
    - { id: "3", name: Minifondo }
  notes: "Results published Monday in 2025"   # free text, optional
```

Constraints enforced by validation:

- `id` unique; `series` + `date.year` unique.
- `distances[].name` must be one of `DISTANCES` after `normalizeDistance`.
- `results.source` ≠ `none` requires the adapter to exist in `scrapers/`.
- `participants.url` required unless `participants.source` is `xcrono` or `none`.
- `status: excluded` events are kept in the file with a `notes` reason (replaces `EXCLUDED_EVENT_IDS`).

## 2. Adapter interface

```ts
// scraper/src/scrapers/adapter.ts
export interface ResultsAdapter {
  readonly source: string;
  scrapeResults(event: RegistryEvent): Promise<StoredEventResults>;
}
export interface ParticipantsAdapter {
  readonly source: string;
  scrapeParticipants(event: RegistryEvent): Promise<StoredParticipant[]>;
}
```

Existing functions become adapters: `stopandgo` (xcrono results;
lista/registrations/xcrono participants), `lap2go`, `waitastart`,
`apedalar`, `timerspeed`, `classificacoes` (parameterised by
`params.resultsId`). `index.ts` loops the registry and dispatches by source;
the six hand-wired external calls disappear.

## 3. Discovery becomes a proposal

`discoverGranfondos()` still queries StopAndGo. Instead of deciding, it
diffs against the registry and writes `scraper/registry-proposals.yaml`
with new events (id, raw name, date, location, guessed `series` by fuzzy
match on name) and events whose date changed. A workflow step opens a PR
with that file's contents appended to `events.yaml` for human review. The
scheduled scrape only processes events already in the registry.

## 4. Derived data

- `event-schedule.json` (used by the CI window checks) is generated from
  the registry, not from the scrape output.
- `series` powers the frontend's event-history page and lets the name be
  `${seriesDisplayName} ${year}` when `name` is omitted.
- `distances[].km/elevationM/gpx` feed the race-guide feature (engine plan
  Phase 5); GPX files live under `scraper/routes/` and are parsed at scrape
  time into `event_routes` (polyline, profile).

## 5. Migration from `config.ts`

A one-off script `scraper/src/scripts/export-registry.ts` reads the current
maps and `EXTERNAL_EVENTS`, joins them with `events` rows from the current
DB (for names, dates, locations), and writes the first `events.yaml`. Review
it by eye once; after that the maps are deleted. Keep `PLACEHOLDER_NAMES`
and `DELAY_MS` in `config.ts`; they are not per-event.

## 6. Acceptance

- `npm run scrape` with the registry produces a DB identical (row counts,
  ranking top-3 per slice) to the one produced from `config.ts` on the same
  cached inputs.
- Adding a 2027 event is a diff to `events.yaml` only.
- Validation rejects: duplicate id, unknown source, non-canonical distance
  name, missing participants URL for `lista`.
