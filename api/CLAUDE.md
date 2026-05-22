# @granfondo/api

Shared query package — all data access logic lives here. Environment-agnostic: works in-browser (sql.js) or server-side (better-sqlite3) via an injectable `getDb`.

## Injectable DB pattern

The package has no DB dependency of its own. Consumers wire it once at startup:

```typescript
import { api, setGetDb } from "@granfondo/api";
import { getDb } from "./db"; // your environment's getDb

setGetDb(getDb);
// api.getEvents(), api.getAthlete(), etc. now work
```

The frontend does this in `App.tsx`. A future REST server would do the same with a `better-sqlite3` wrapper.

## Source layout

```
src/db.ts          Injectable getDb — call setGetDb() before any api usage
src/events.ts      getEvents, getStats
src/results.ts     getResults, getParticipants
src/athletes.ts    getAthlete, initLookups, getTopAthletes, searchAthletes
src/teams.ts       getTeamById, getTeamByKey
src/rankings.ts    getAggregateRanking, getTeamRanking
src/predictions.ts getPredictions, FavoritePrediction, DistancePredictions types
src/lookups.ts     resolveTeamKey, resolveTeamId — in-memory alias caches
src/athlete.ts     mostRecentCountry, buildCountryMap helpers
src/index.ts       Assembles and exports everything
```

## Team alias resolvers — intentionally different

`resolveTeamId(name)` / `resolveTeamKey(name)` use a flat in-memory cache populated by `initLookups()`. **One hop only** — alias → canonical. Used for building navigation URLs synchronously (e.g. `<TeamLink>`).

`getTeamByKey(teamKey)` resolves the **full alias chain** via SQL (up to 10 hops). Handles auto-generated chains A→B→C→canonical. Used when loading a team profile — the URL may be any key in the chain; `getTeamByKey` always finds the canonical and all its members.

The discrepancy is intentional: `resolveTeamKey` is synchronous for navigation, `getTeamByKey` is async for authoritative lookup.

## initLookups

Must be called once at startup before any team link or athlete lookup is rendered. In the frontend this is done in `App.tsx`'s initial `useEffect`. It populates two module-level Maps used by `resolveTeamKey` and `lookupAthleteId`.
