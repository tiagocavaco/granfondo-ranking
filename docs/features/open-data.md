# Feature spec — open data exports

**What:** a "Download CSV" on every event's results and on each season ranking; a `/data` page describing the columns, update cadence, source attribution and licence.

**Inputs:** the per-event results file and `aggregate_athletes` already loaded in the browser.

**Method:** client-side CSV generation from the loaded rows (no server); columns are the public `StoredResult` fields plus `athlete_id` and event metadata; UTF-8 with BOM for Excel; filename `<series>-<year>-<distance>.csv`. Aggregate rankings likewise. No bulk "all athletes" export (privacy, `docs/monetization/03-plan.md` legal hygiene).

**Licence:** state clearly that results originate from the organisers and timing providers and are reproduced for personal, non-commercial use; link to each event's `resultsUrl`.

**UI:** a download icon next to the results filters and the ranking header; the `/data` page linked from the footer.

**Guardrails:** only data already visible on the page; rate-limit nothing (it is client-side); attribution line inside the CSV header comment.

**Acceptance:** opening the CSV in Excel/Numbers shows correct accents and columns; row count equals the filtered table.
