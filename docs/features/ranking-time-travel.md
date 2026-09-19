# Feature spec — ranking as of a date, and rank-over-season lines

**What:** a date scrubber on the ranking page ("standings after Gerês, 7 Jun") and, on athlete profiles, a line of their rank per event through the season; "Season movers" as a by-product.

**Inputs:** `aggregate_results` already stores per-event points with dates for every ranked athlete.

**Method:** cumulative sum of points by athlete in event-date order within a (year, distance, gender) slice, ranked after each event. Computed at scrape time into `ranking_snapshots(year, distance, gender, event_id, athlete_id, rank, points)`; size ≈ ranked athletes × events per season (≈ 600 × 20 per slice), acceptable in the core tier with brotli.

**UI:** ranking page gets an event selector defaulting to "latest"; rows show Δ rank since the previous event; athlete profile gets a rank line chart per season/distance; home page gets "Biggest climbers since <last event>".

**Guardrails:** snapshots follow the same tie rules as the live ranking; hide Δ for the first event of a season.

**Acceptance:** the snapshot for the last event equals the live `aggregate_athletes` ranking exactly.
