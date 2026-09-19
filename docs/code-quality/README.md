# Code Quality Review (19 Sep 2026)

A read-only inspection of code structure and style across all six
workspaces, aimed at one question: can a human, or an agent acting for one,
maintain and extend this code without the original author? Measurements are
in `metrics.json` and are reproducible with `tools/measure.mjs`, `jscpd` and
`eslint` (commands in the script header).

| Document | What it covers |
|----------|----------------|
| [01-findings.md](01-findings.md) | Structure and style findings per workspace, with evidence |
| [02-refactors.md](02-refactors.md) | Twelve refactor recipes: target shape, files, order, safety net, effort |
| [metrics.json](metrics.json) | Function lengths, duplication, lint, dependencies |
| [tools/measure.mjs](tools/measure.mjs) | Regenerates the shape metrics |

## Verdict

The codebase is in better shape than most solo projects of its size: strict
TypeScript, zero lint errors, zero circular imports, 3.5% duplication, a
shared schema that keeps browser and scraper types in sync, and CLAUDE.md
files that explain the non-obvious invariants. The style guide in the root
`CLAUDE.md` (meaningful names, comments only for the why, ~50-line
functions) is good and mostly followed at the statement level.

Where it falls short is at the unit-of-work level:

- **Functions are too long.** 104 of 441 functions exceed the project's own
  50-line guideline; 56 exceed 100 lines. `TeamProfile` is 530 lines,
  `TeamRankingPage` 458, the scraper `main` 442. These are the files a
  maintainer will open first and understand last.
- **Pages own everything.** Every frontend page fetches, derives, filters,
  pages and renders in one component. The same five patterns (loading
  triple, filter bar, paged table, empty state, external-link chips) are
  re-implemented per page rather than composed.
- **Three copies of category logic, two of env loading, two of DB
  opening, two of "decrypt and write to /tmp".** Small, but each is a place
  where a fix lands in one copy and not the others.
- **235 non-null assertions.** Most are defensible (`Map.get` after `has`),
  but they hide the places where a wrong assumption would throw at runtime,
  and `noUncheckedIndexedAccess` is off, so array indexing is unchecked too.
- **285 `console.*` calls** are the only logging. Fine in a CLI, but the
  scraper's observability plan needs structured output, and the frontend
  has console statements in production code.
- **Maintenance scripts (4,800 lines) are outside lint and coverage** and
  duplicate each other's boilerplate.

None of this blocks work today. All of it raises the cost of every future
change, which is the metric that matters for a project maintained in spare
time. The recipes in `02-refactors.md` are ordered by payoff per hour and
each one names the tests that make it safe.
