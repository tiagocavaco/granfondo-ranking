# Granfondo Portugal — Engine Analysis (18 Sep 2026)

Read-only review of the four packages that produce the data: `scraper`,
`database`, `utils` and `api`. Together they are 28,068 lines of TypeScript,
664 tests, ten schema migrations and 75 commits over 30 distinct days between
19 Apr and 12 Sep 2026. Nothing was changed.

| Document | What it covers |
|----------|----------------|
| [01-architecture-analysis.md](01-architecture-analysis.md) | How the engine works end to end, what is genuinely strong, measured quality of its output, scorecard |
| [02-issues-found.md](02-issues-found.md) | Every defect and weakness, ranked P0–P3, with evidence from code and from the live database |
| [03-improvement-plan.md](03-improvement-plan.md) | Phased plan: correctness fixes, reliability, observability, identity-pipeline gains, data model, and the features the engine must grow to support the frontend plan |
| [metrics.json](metrics.json) | Raw numbers computed from the current `data.db.enc` and from the test runs |

## How the evidence was gathered

- Every non-test source file in the four packages was read in full: the
  orchestrator, all twelve identity-pipeline passes, both normalisers, the
  ranking and prediction engines, participant linking, the six scraper
  adapters, DB writer/loader/encryption, the alias tooling, the CLI, both
  scheduled workflows, and the headers of all fourteen maintenance scripts.
- All four test suites were run with coverage (668 tests pass in about 5 s).
- The encrypted database was decrypted in memory (key from `scraper/.env`)
  to compute data-quality metrics. No plaintext was written to disk.
- The review-flag JSON files were parsed to quantify the manual-review backlog.
- Two hypotheses raised by code reading were verified against the live data
  before being reported as issues (ranking coefficient semantics, participant
  parser).

## Headline verdict

This is the most valuable part of the repository and it shows. The athlete
identity pipeline is a serious piece of engineering: licence-anchored
profiles, name-variant folding for Portuguese and Spanish naming conventions,
category-progression physics, percentile sanity checks, manual override
tables that survive rebuilds, ID stability across scrapes, and a
review-then-apply workflow for the ambiguous cases. On the current database
only 113 of 74,663 finishing results (0.15%) lack an athlete link, and zero
athlete profiles contain a duplicate (event, distance) slot.

What holds it back is not the algorithm. It is:

1. **Two scheduling gaps**: Sunday races get exactly one chance to have
   results scraped (fine so far because organisers have published on race
   night; a Monday publication would be skipped for good), and Saturday races
   never get a participant refresh.
2. **Three participant-ingestion gaps**: the newest registrations layout turns
   most registrants into single-letter names; walk/kids distances are ingested
   as if they were races; and participant distances are stored un-normalised,
   so a `GranFondo` spelling makes the prediction coefficient return zero for
   every rider on that distance (Monção 2026 today).
3. **A documented-versus-implemented mismatch** in the ranking formula
   (coefficient is per gender field, the info page says per distance), which
   makes women's points roughly a fifth of men's for the same placing.
4. **Near-zero test coverage on the code that talks to the outside world**
   (event pipeline 3%, StopAndGo adapter 14%, DB loader 8%), so the failures
   above cannot be caught before they reach production.
5. **No observability**: the 862 review flags the pipeline generates on every
   CI run are written to gitignored files nobody sees.
6. **Per-season manual configuration** (supplemental IDs, official URLs,
   default distances, participant URLs) that has to be hand-curated every
   year and is the reason events go missing.

The plan in document 03 fixes the correctness items in a day, then
invests in tests, observability and a declarative event registry before
touching the pipeline itself.
