# Feature spec — same-course comparison and course records

**What:** on an athlete's result row, "1:24 faster than your 2025 ride here"; on an event page, "Course record 3:12:44 (2024)" per distance; a series page listing every edition with winners, field size and the rider's own history.

**Inputs:** `series` on events (registry); `results.race_time_secs`; `athlete_results` per athlete.

**Method:** group events by `series`; for a rider, join their results across editions on the same series and distance; for records, min finisher time per series+distance across editions where the registry does not mark a course change (`distances[].km` within 10% and no `courseChanged: true`).

**Storage:** a small `series_records(series, distance, seconds, athlete_id, event_id)` table in the core tier, recomputed each scrape; personal comparisons computed client-side from the rider's results.

**UI:** delta badge on the athlete's results table (green faster, grey slower, hidden if no prior edition); records strip on the event hero; `/series/:slug` page with an editions table.

**Guardrails:** hide deltas when the course changed; label records "on the current course since <year>".

**Acceptance:** every event with a `series` and ≥ 2 editions shows records; deltas appear only for same-series, same-distance pairs.

**Depends on:** `docs/specs/event-registry.md`.
