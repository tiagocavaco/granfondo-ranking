# docs/

Analysis, plans, specs and operational guides for the whole monorepo.
Start at `docs/README.md`. Conventions that apply to every file here:

- References are repo-relative paths in backticks, optionally `#symbol`.
  Never line numbers. Run `node docs/tools/check-refs.mjs` before committing
  a docs change; add proposed-but-unbuilt paths to `docs/tools/planned-paths.txt`.
- Severity P0–P3 and effort S/M/L as defined in `docs/README.md`.
- No personal data: counts and athlete IDs, never names or licence numbers,
  in text, JSON or screenshots.
- Numbers must be reproducible: cite the script or query
  (`docs/engine/tools/db-metrics.mjs`, `docs/frontend/tools/audit.mjs`, or
  SQL in a handoff guide).
- When an issue is fixed, mark it in its `02-issues-found.md` with the commit
  hash rather than deleting it, and update `docs/README.md` "Working-tree
  state" if the baseline moved.
- Plans reference each other by phase number (E-4.2, F-2.3, B-1.1, M-Phase 2);
  `docs/roadmap.md` is the only place that orders them in time.
