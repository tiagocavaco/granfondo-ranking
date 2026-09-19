# Feature spec — performance trajectory anomalies

Owner's idea (19 Sep 2026): flag athletes whose results change character
abruptly, such as many modest results followed by podiums, or the reverse.

This document turns it into two features that share one detector, and sets
the guardrails that keep it from becoming a public accusation.

## 1. What the data can and cannot say

Available per result: overall and gender position, finisher count,
category, distance, race time and gap, team, country, licence. Not
available: power, heart rate, course profile, weather, age.

So the detector can measure **relative performance within a field**
(gender position ÷ finishers, hereafter *percentile*, lower is better) and
how it moves over time. It cannot distinguish training, a new bike, a
category change, a tailwind, a mis-scanned chip, or a merged identity. Every
signal it raises is a prompt for a human, never a conclusion.

## 2. Measured prevalence (current database)

| Pattern | Definition used | Count |
|---------|-----------------|-------|
Two thresholds, decided with the owner on 19 Sep 2026:

- **Internal review queue: ≥ 4 finished results.** Low-count profiles are
  where merged identities hide, and a reviewer is looking at the evidence
  before anything happens.
- **Public form features: ≥ 10 finished results.** A badge on a public
  profile needs a baseline that is beyond doubt.

| Pattern | Definition used | ≥ 4 results (internal) | ≥ 10 results (public) |
|---------|-----------------|-----------------------:|----------------------:|
| Athletes with enough history | finished results in fields of ≥ 50 | 5,767 | 1,440 |
| Sustained improvement | best chronological split (≥ 2 each side internally, ≥ 3 publicly) where the later median percentile is ≤ 0.15 and at least 0.35 better than the earlier | 22 | 7 |
| Sustained decline | mirror of the above | 8 | 2 |
| Single-race outlier | one result ≥ 0.40 percentile points better than the athlete's own median | 115 | 34 |

Of six sampled improvers at the internal threshold, four span three or four
raw categories across four to eight results. Riders do not change age band
three times in three seasons; those profiles are almost certainly two or
more people merged by the identity pipeline. That is why the internal floor
stays low.

## 3. Use 1 — data-quality signal for the review queue (internal, build first)

**Where:** `scraper/src/pipeline/` post-pass (after `sweepCategoryEviction`),
writing `performance-flags.json` alongside the existing flag files; surfaced
in the backoffice review queue (`docs/backoffice/03-improvement-plan.md`
Phase 2.1) with the same approve/reject affordances.

**Eligibility (internal):** at least 4 finished results (DNF/DNS excluded)
in fields of at least 50 finishers. Both floors (4 internal, 10 public) are
constants in one place so they can be tuned after the first review cycle.

**Detector (per eligible athlete):**

1. Percentile per result `p = genderPos / finisherCount`.
2. Personal baseline: median `p` over all results; with ≥ 6 results also a
   rolling median over the previous 4.
3. Signals, each with a score in [0, 1]:
   - **Step change**: split results chronologically at every point with ≥ 2
     on each side; largest difference of medians between halves. Score
     scales from 0 at 0.20 to 1 at 0.45.
   - **Single outlier**: max `|p − baseline|` for one result. Score from 0 at
     0.30 to 1 at 0.50. Direction recorded (better/worse).
   - **Category incoherence**: number of distinct canonical categories per
     year > 1, or transitions failing `isValidCatTransition`. Score 1 if
     present (this already exists in `category-sweep-eviction`; reuse).
   - **Distance confound**: the outlier is on a distance the athlete has
     never ridden before. Score reduces the outlier signal by half.
   - **Team change confound**: the step coincides with a team change.
     Record, do not score; it is common for both real improvement and
     misidentification.
4. Combined score = max(step, outlier) × (1 + category incoherence) capped
   at 1. Flag when ≥ 0.6. Output the evidence: the results either side of
   the step with event, date, distance, category, percentile, and the
   confounds.

**Resolution in the queue:** "Split (misidentified)" creates the block or
assignment rules the pipeline already understands; "Genuine" whitelists the
athlete for that step so it is not re-flagged; "Unsure" leaves it.

**Why first:** it is the highest-precision new signal available for the
identity problem, it costs nothing to compute, and every resolved case
improves the public data. It also builds the evidence base for use 2.

## 4. Use 2 — public "form" features (build second, framed positively)

Never publish the words "suspicious", "anomaly" or "flag" next to a name.
The public-facing version of the same detector is about form and stories,
and only ever shows what a rider would be happy to see about themselves.

**Eligibility (public):** at least 10 finished results in fields of at
least 50, and no open identity or performance flag on the profile. Below
that, no badge, no trend label, no movers entry.

| Feature | What it shows | Source |
|---------|---------------|--------|
| **Form trend** on the athlete profile | A sparkline of percentile over the last 8 results with a one-word label: Rising, Steady, Mixed, Returning. Computed from the rolling median slope | detector baseline |
| **Breakthrough ride** badge on a result row | Shown when a result beats the athlete's previous best percentile by ≥ 0.25 with ≥ 10 prior results, **only after** the identity queue has cleared the athlete (no open flag) | single-outlier signal, positive direction only |
| **Season movers** on the home page and ranking page | "Biggest climbers since last event" and "Most improved this season" lists, ranked by percentile gain, limited to athletes with ≥ 3 results in the season | step signal, positive direction only |
| **Comeback** story | Return to a previous level after a gap ≥ 12 months | baseline vs. gap |
| **Consistency** stat | Interquartile range of percentile; shown as "Consistent / Variable" on the profile and usable as a prediction input | baseline |
| **Prediction input** | Use the recent rolling median rather than the season total when the trend is Rising, so predictions catch improving riders earlier | detector baseline feeding `predictions.ts` |

Declines are never labelled publicly. A rider who slows down because of
illness, age or life does not need a badge for it.

## 5. Guardrails

- **Defamation and GDPR.** A public label implying doping or cheating about
  an identifiable amateur is a legal risk in Portugal and elsewhere, and
  unfair given what the data can prove (section 1). The internal queue is
  for identity correction; the public features are positive-only.
- **Identity first.** No public badge is computed for an athlete with an
  open performance or identity flag; this prevents advertising a merge
  error as a "breakthrough".
- **Small fields.** Percentiles in fields under 50 are noise; exclude them
  from the detector and from public badges.
- **Category changes.** A rider moving from Masters A to Masters B does not
  change percentile within gender, so the detector is unaffected; but
  category *incoherence* within a year is the misidentification signal and
  must stay internal.
- **Explainability.** Every flag and every badge carries the two or three
  results that produced it, so a reviewer or a rider can see why.
- **Opt-out.** A rider may ask for form features to be hidden on their
  profile; honour it the same way as a removal request.

## 6. Where it fits

- Engine plan: add as **Phase 6.7** (after the golden test, since it changes
  what reviewers act on, not what the pipeline outputs).
- Backoffice plan: a queue type in **Phase 2.1**.
- Frontend plan: form trend and breakthrough badge in **Phase 5** next to
  ranking movers; prediction input in **Phase 4.5**.
- Roadmap: milestone 4, after the review queue exists.

## 7. Verification

- Unit: synthetic trajectories (flat, step up, step down, single spike,
  category chaos) produce the expected scores.
- Data: after the first run, the 22 + 8 + 115 internal profiles are in the
  queue; no public badge exists for any athlete with fewer than 10 results
  or with an open flag.
- Public: no badge is shown for any athlete with an open flag
  (`select count(*)` of badges joined to open flags is 0).
