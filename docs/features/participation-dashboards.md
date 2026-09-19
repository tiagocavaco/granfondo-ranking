# Feature spec — participation dashboards

**What:** a `/stats` page and a per-event "field" panel: finishers by year, women's share, nationality mix, category distribution, DNF rate, first-timers vs returning riders, teams with 3+ finishers. Also the organiser report's data source (`docs/monetization/04-organiser-offer.md`).

**Inputs:** `results`, `athlete_results`, `events`, `participants` (for DNS = registered minus finished when both exist).

**Method:** all aggregates computed at scrape time into `event_stats(event_id, distance, finishers, women, countries_json, categories_json, dnf, first_timers, returning, teams_3plus)` and `series_stats` by year; the frontend renders from the core tier. First-timer = athlete whose earliest result is this event.

**UI:** small-multiple bar charts using the shared `ChartFrame` (`docs/code-quality/02-refactors.md` R3); per-event panel below the results table; `/stats` with series-wide trends and an organiser filter.

**Guardrails:** aggregates only, no per-rider rows; nationality shown for groups of ≥ 5 riders, smaller groups bucketed as "other".

**Acceptance:** numbers reconcile with the results table (finishers sum matches `events.finisher_count`); page renders from the core tier without fetching results files.
