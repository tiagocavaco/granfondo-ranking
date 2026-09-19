# Spec — unified review queue

Status: proposed, not implemented. Implements backoffice plan Phase 2.1–2.3
and engine plan 2.2, and is the home for `features/performance-anomalies.md`.

## 1. Problem

Seven producers write seven JSON shapes (`docs/backoffice/04-handoff-guide.md`
§4). Decisions are recorded by editing `approved` by hand and running two
different apply scripts. The backoffice can display two of the seven.

## 2. One item format

Every producer emits items into `scraper/review/<source>.json` as an array of:

```ts
interface ReviewItem {
  id: string;            // stable: `${source}:${sha1(subjectKeys.join('|'))}`
  source: "solo-collision" | "cross-pass" | "split" | "licence-split"
        | "team-alias" | "anchored-team-alias" | "performance";
  createdAt: string;     // ISO, first time this id was emitted
  confidence: number;    // 0–1
  reason: string;        // one sentence, no PII beyond what subjects carry
  subjects: Subject[];   // 2..n profiles or team keys involved
  evidence: Evidence;    // source-specific, rendered generically
  suggestedAction: Action;
}
interface Subject { kind: "athlete" | "team"; id?: number; key?: string; label: string; }
type Evidence = {
  results?: Array<{ subject: number; eventId: number; eventName: string; date: string; distance: string; category: string; genderPos: number; finishers: number; bib: string }>;
  checks?: Array<{ name: string; passed: boolean; detail: string }>;   // e.g. category transition, percentile gap, licences
  shared?: { athletes?: number; events?: number };
};
type Action =
  | { type: "athlete-alias"; canonical: { name: string; team: string }; alias: { name: string; team: string } }
  | { type: "result-assignment"; eventId: number; bib: string; athleteId: number }
  | { type: "block"; eventId: number; bib: string; athleteId: number }
  | { type: "team-alias"; from: string; to: string }
  | { type: "whitelist"; subjectId: number; scope: string }   // e.g. performance step, do not re-flag
  | { type: "none" };
```

Producers keep their scoring logic; they only change their output shape.
Athlete `label` is the display name (needed to review); the files stay
gitignored, as today.

## 3. Decisions file

`scraper/review/decisions.json`, **committed** (it is the durable record;
contains ids and actions only, no names):

```ts
interface Decision {
  id: string;                  // ReviewItem.id
  decision: "approve" | "reject" | "defer";
  action?: Action;             // may differ from suggestedAction
  decidedAt: string;
  decidedBy: string;           // git user.name or backoffice user
  note?: string;
}
```

Ids are stable across ID compaction because they hash name|team keys, not
numeric ids (same principle as today's split skip-lists).

## 4. Apply semantics

`npm run review:apply` (replaces `db:apply-splits` and `db:apply-team-aliases`):

1. Load decisions; for each `approve` whose action is not yet materialised,
   call the in-process override functions (`scraper/src/db/overrides.ts`,
   backoffice plan 1.1) to write the alias / assignment / block / team alias
   into the DB, and mark the decision `applied: true` with the resulting row id.
2. `reject` and `whitelist` are read by producers on their next run so the
   item is not re-emitted (producers receive the decisions map).
3. Then `npm run scrape`, `db:check`, commit.

## 5. Backoffice API

Served by the standalone server (backoffice plan 1.3):

| Method | Path | Body / result |
|--------|------|---------------|
| GET | `/api/review?source=&status=&minConfidence=&q=&page=` | `{ items: ReviewItem[], total }`; status derived by joining decisions |
| GET | `/api/review/:id` | item + decision + live subject summaries (current rows from the DB) |
| POST | `/api/review/:id/decision` | `Decision` minus `decidedAt/By`; returns the stored decision |
| POST | `/api/review/:id/preview` | runs the checks in `evidence.checks` again with the proposed action and returns pass/fail per check (merge preview) |
| GET | `/api/review/summary` | counts by source and status; feeds the health panel |

## 6. UI

One page. Left: filter by source (chips with counts), status, min
confidence, text. Centre: list sorted by confidence desc, top-10 involvement
first. Right: item detail with subjects side by side and the evidence rows;
buttons Approve / Reject / Defer; keyboard `j k a r d enter`. Approving with
a different action than suggested opens the corresponding form prefilled.

## 7. Producers to migrate

| Today | Source value | Notes |
|-------|--------------|-------|
| `solo-flags.json` | `solo-collision` | one item per flagged group; subjects = the bib-keyed profiles |
| `cross-pass-flags.json` | `cross-pass` | subjects = solo profile + candidates |
| `split-candidates*.json` | `split` | existing applied/rejected lists convert to decisions once |
| `licence-split-candidates.json` | `licence-split` | |
| `team-alias-candidates.json` | `team-alias` | subjects are teams |
| `athlete-anchored-team-aliases.json` | `anchored-team-alias` | evidence.shared.athletes |
| new | `performance` | per `features/performance-anomalies.md` |

## 8. Acceptance

- Every current file converts without loss; item count equals today's counts (59, 803, 78, 141, 80, plus split history).
- Approving a split item writes the same rows `db:apply-splits` would have.
- A decision survives `db:compact-ids` (id unchanged).
- The review page loads with zero items when no producer has run, and says so.
