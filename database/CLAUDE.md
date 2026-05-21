# @granfondo/database

Shared package used by both `scraper` and `frontend`. No runtime of its own.

## Exports

| Path | Purpose |
|------|---------|
| `./schema` | Drizzle ORM table definitions (SQLite) |
| `./types` | TypeScript types shared across packages |
| `./normalize` | `normalizeTeam`, `normalizeName`, `SOLO_TEAM_KEYS`, etc. |
| `./db-writer` | `buildDatabase(data)` — builds an in-memory better-sqlite3 DB from scraped data |
| `./db-client` | `getDb()` — lazy sql.js singleton for the frontend |

## Scripts

```bash
npm run generate-schema  # regenerate migrations from schema.ts changes
```

## Key normalisation rules (`normalize.ts`)

- `normalizeTeam(name)` — lowercases, strips diacritics, collapses abbreviations (1–3 letter tokens separated by spaces are merged). The result is used as the team key throughout the system.
- `SOLO_TEAM_KEYS` — set of keys that mean "no team" (`individual`, `independente`, `no team`, `n team`, `sem equipa`, `""`). Never create team profile links for these. `"n team"` covers the Scandinavian placeholder `"Nøteam"` (ø is stripped to a space by `normalizeTeam`).
- `normalizeName(name)` — used for athlete identity matching.

## Schema highlights (`schema.ts`)

- `results` — all race results across all events and distances.
- `athleteTeams` — one row per (athlete, team_id) pair; team_id references `teams.id`.
- `teams` — canonical team rows with alias keys stored as a JSON array column.
- `aggregateAthletes` / `teamRanking` — pre-computed ranking rows. Per-event details live in `aggregate_results` and `team_race_results` / `team_race_athletes` (FK'd, cascade-delete).

## Notes

- `db-writer.ts` is only used by the scraper (depends on `better-sqlite3`).
- `db-client.ts` is only used by the frontend (depends on `sql.js`).
- Both are listed as optional peer dependencies so the package stays importable from either side.
