# Feature spec — finish-time estimate for registrants

**What:** on an upcoming event's participants and predictions pages, show each linked registrant an estimated finish time and a range ("around 4:10, likely 3:58–4:25").

**Why:** the single question every registrant has; needs no new data.

**Inputs (all exist):** the registrant's `athlete_results` percentiles per distance (gender position ÷ finishers); the same series' previous edition winner time and finisher-time distribution per distance (`results.race_time_secs` for the event with the same `series` and distance, previous year); the registrant's registered distance.

**Method:**
1. Rider percentile `p` = median of the last 5 results on the registered distance (fall back to any distance via `predictionDistCoeff` weighting; fall back to "no estimate" under 3 results).
2. Reference distribution = sorted finisher times of the previous edition on that distance (or, if none, the mean of the last three editions across the series).
3. Estimate = time at percentile `p` in the reference distribution; range = times at `p ± 0.10`, clamped to the distribution.
4. Store nothing; compute in `@granfondo/api` `getPredictions` extension `getFinishEstimates(eventId)` from the core tier plus one results file.

**UI:** a column on the participants table for linked riders; a line on the athlete's own predictions row; on the event page, a "your estimate" box after the rider searches their name. Never shown for riders with fewer than 3 results or for a series' first edition.

**Guardrails:** label as estimate; hide on the results page once results exist; no estimate for events whose previous edition changed course length (registry `distances[].km` differs by > 10%).

**Acceptance:** for the last three finished events, back-test: estimate computed from data before the event vs actual; median absolute error under 8% of finish time.

**Depends on:** `docs/specs/event-registry.md` (`series`), engine B10 fix (canonical participant distances).
