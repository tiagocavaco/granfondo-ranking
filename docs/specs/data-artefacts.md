# Spec — data artefacts v2 (tiered, compressed, encrypted, cache-friendly)

Status: proposed, not implemented. Implements engine plan 4.1–4.3 and
frontend plan 1.1–1.4. Replaces the single `frontend/public/data/data.db.enc`.

## 1. Goals and non-goals

Goals: first content on a cold mobile load after ≤ 3 MB; return visits
served from cache; per-event data loaded on demand; scraper-only tables
never shipped; old and new clients coexist during rollout; still hosted as
static files on GitHub Pages.

Non-goals: changing the encryption model (AES-256-GCM, key in the bundle,
"not plaintext in git"); changing `@granfondo/api` signatures.

## 2. Files

All under `frontend/public/data/`. Names carry a content hash so they can be
cached forever; the manifest is the only mutable file.

| File | Purpose | Cache |
|------|---------|-------|
| `manifest.json` | Lists every artefact with hash, size, tier and the schema version | `no-cache` (revalidate) |
| `core.<hash>.db.enc` | Everything needed for home, rankings, athlete search, athlete profile summaries, team pages, predictions inputs | immutable |
| `results.<eventId>.<hash>.db.enc` | All result rows for one event | immutable |
| `participants.<eventId>.<hash>.db.enc` | Start list for one upcoming event | immutable |
| `athlete-results.<shard>.<hash>.db.enc` | Optional: `athlete_results` split into 16 shards by `athlete_id % 16`, for profile pages without loading whole events | immutable |

The scraper keeps its own full state file outside `frontend/public`:
`scraper/state.db.enc` (all tables, including overrides, lookup, licences),
committed like today. The browser never fetches it.

## 3. Table allocation

| Table | core | results.\<event\> | participants.\<event\> | athlete-results.\<shard\> | scraper state only |
|-------|:----:|:----:|:----:|:----:|:----:|
| events, event_distances | ✓ | | | | ✓ |
| athletes (id, name, name_lower, canonical_team, country) | ✓ | | | | ✓ |
| athlete_teams, athlete_categories | ✓ | | | | ✓ |
| teams, team_aliases (new table, replaces JSON column) | ✓ | | | | ✓ |
| aggregate_athletes, aggregate_results | ✓ | | | | ✓ |
| team_ranking, team_race_results, team_race_athletes | ✓ | | | | ✓ |
| stats | ✓ | | | | ✓ |
| results | | ✓ (one event) | | | ✓ |
| athlete_results | | | | ✓ (one shard) | ✓ |
| participants | | | ✓ (one event, upcoming only) | | ✓ |
| result_licences, athlete_lookup, athlete_alias_rules, result_assignments, blocked_results, __drizzle_migrations | | | | | ✓ |

`athletes.country` is a new column (most frequent country), so the core
tier does not need `athlete_results` to show a flag.

Indexes shipped: only those used by `@granfondo/api` queries on that tier.
Every artefact is `VACUUM`ed before encryption.

## 4. Binary format

```
offset  size  field
0       4     magic  "GFP2"  (ASCII)
4       1     version  0x02
5       1     compression  0x00 none | 0x01 brotli | 0x02 gzip
6       2     reserved (0)
8       12    AES-GCM iv
20      16    AES-GCM auth tag
36      N     ciphertext of ( compress( sqlite bytes ) )
```

The v1 layout (`[iv:12][tag:16][ciphertext]`) has no magic; a client
detects v1 by the absence of `GFP2` at offset 0 and treats the payload as
uncompressed. Encryption key and algorithm are unchanged.

Decrypt-then-decompress order is mandatory (the auth tag covers the
compressed bytes). Browser: `crypto.subtle.decrypt` → `DecompressionStream`
(`"gzip"` is universally supported; use brotli only where
`DecompressionStream("brotli")` exists, else fall back to gzip artefacts;
the scraper emits gzip by default until brotli support is ubiquitous).
Measured on today's data: whole DB 48.6 MB → 17.7 MB gzip, 12.8 MB brotli.

## 5. `manifest.json`

```json
{
  "schemaVersion": 2,
  "generatedAt": "2026-09-19T20:12:35Z",
  "scrapedAt": "2026-09-19T20:10:01Z",
  "format": { "magic": "GFP2", "compression": "gzip" },
  "core": { "path": "core.3f9a…c1.db.enc", "bytes": 2874112, "sha256": "…" },
  "events": {
    "1956": {
      "results":      { "path": "results.1956.9b2e….db.enc", "bytes": 84120, "sha256": "…" },
      "participants": null
    },
    "1943": {
      "results": null,
      "participants": { "path": "participants.1943.77d1….db.enc", "bytes": 41010, "sha256": "…" }
    }
  },
  "athleteResultShards": 16,
  "athleteResults": { "0": { "path": "athlete-results.0.ab12….db.enc", "bytes": 210331, "sha256": "…" }, "…": {} }
}
```

Rules: `path` is relative to `data/`; `sha256` is of the encrypted file;
`bytes` is the encrypted size (for progress bars); an event with results
has `participants: null` unless it is upcoming; the manifest is written last
so a partially uploaded deploy never references a missing file.

## 6. Client loading contract (`@granfondo/database/db-client`)

```ts
interface DataClient {
  ready(): Promise<CoreDb>;                         // fetch manifest, load core
  withEventResults(eventId: number): Promise<Db>;   // ATTACH results.<id> as r<id>, idempotent
  withParticipants(eventId: number): Promise<Db>;   // ATTACH participants.<id>
  withAthleteResults(athleteId: number): Promise<Db>; // ATTACH shard athleteId % 16
  progress: EventTarget;                            // "progress" events { file, loaded, total }
}
```

- sql.js supports `ATTACH DATABASE` on in-memory databases created from
  buffers; each tier is opened as its own `SQL.Database` and attached to the
  core connection under a fixed schema name, so `@granfondo/api` queries
  reference `r1956.results` through a small helper that rewrites the table
  name. Simpler alternative if ATTACH proves awkward in sql.js: copy the
  tier's rows into the core connection with `INSERT INTO results SELECT *`
  once per event (results tables are small).
- `getResults(id)` calls `withEventResults(id)` first; `getAthlete(id)`
  calls `withAthleteResults(id)`; `getParticipants` and `getPredictions` call
  `withParticipants`. No other API function changes.
- Decrypt and parse run in a Web Worker; the main thread receives a
  `MessagePort` and query calls are proxied. Progress events drive the
  loading screen.

## 7. Caching

- Service worker (Workbox `CacheFirst`) for every `*.db.enc` and the WASM;
  `NetworkFirst` with 3 s timeout for `manifest.json`.
- On manifest change: new hashed files are fetched lazily; old entries are
  purged when the cache exceeds 60 MB or after 30 days.
- Offline: if the manifest fetch fails and a cached manifest exists, use it
  and show "Data from <scrapedAt>" in the footer.

## 8. Scraper side

`buildDatabase` returns a `Map<string, Buffer>` of artefacts instead of one
buffer; `writeEncryptedDatabase` compresses, encrypts, hashes, writes files,
then writes the manifest. `scraped-events.json` unchanged. The verify step
opens `core` and one `results` artefact and checks row counts against the
previous manifest (relative sanity checks, engine plan 1.3).

## 9. Rollout

1. Ship the scraper change writing both v1 `data.db.enc` and v2 artefacts.
2. Ship the frontend reading v2 when `manifest.json` exists, else v1.
3. After one successful scheduled scrape and deploy, stop writing v1.
4. Delete `data.db.enc` from the tree; the history-cleanup workflow already
   exists for shrinking the repository.

## 10. Acceptance

- `core` ≤ 3 MB encrypted; largest `results` file ≤ 500 KB.
- Home page renders with only manifest + core fetched (verify in DevTools).
- Event page fetches exactly one `results` file; athlete page exactly one shard.
- Second load with an unchanged manifest makes zero `*.db.enc` requests.
- `docs/frontend/tools/audit.mjs` reports `data.db.enc` absent and total transfer < 4 MB on `/`.
