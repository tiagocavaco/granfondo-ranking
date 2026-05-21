Implementation plan for building Athlete data with consistency:

When we are mapping the athlete data we need to follow the next order:

Pass 1 — Licence athletes (authoritative)
  Only process results that carry a valid licence number. A licence uniquely identifies an athlete,
  so these results are the most reliable. For each licence, collect all results across all events,
  resolve any name variants (merge if Levenshtein ≤ 2, skip if clearly different people), and build
  one index entry per (canonicalName, mostRecentTeamKey). Each entry accumulates: the list of results,
  the set of teams the athlete has raced for, and the categories per year.

Pass 2 — Unlicensed team results matched by name + team
  After all licensed athletes are indexed, take every remaining result that has no valid licence and
  is NOT a solo/individual result. Try to match it to an existing indexed athlete by name (exact
  normalised match) AND team (exact or fuzzy key match, also using team_aliases for manual overrides).
  If exactly one candidate matches, assign the result to that athlete. If zero or 2+ match, leave for
  later passes.

Pass 3 — Solo results via explicit athlete aliases (solo aliases only)
  For each entry in athlete-aliases.json that declares an alias with team="" (solo/individual), find
  all unassigned solo results matching that alias name and assign them to the canonical athlete entry.
  This is the only way solo results for licensed athletes are ever merged automatically.

Pass 5a — Remaining team results: group by (name, team)
  All still-unassigned team (non-solo) results are grouped by (normalised name, normalised team key).
  If an existing index entry already has the exact key, the result is added to it. Otherwise a fuzzy
  scan checks if any same-name entry has a sufficiently similar team key (full containment or high
  Jaccard similarity). If a match is found, the result is added to that entry. If not, a new entry
  is created. This handles athletes who never had a licence across all events.

Pass 5b — Team-based athlete aliases
  For each entry in athlete-aliases.json that declares an alias with a non-empty team, find both the
  canonical entry and the alias entry in the current index and merge all results from the alias into
  the canonical. The alias entry is then deleted. This handles cases like an athlete who registered
  with a full legal name at one event but a shorter display name at all others.

Pass 5c — Solo same-year: group by (name, canonicalCategory, year)
  Remaining unassigned solo/individual results are grouped by (normalised name, canonical category,
  race year). Intra-group collisions (same athlete name appearing twice in the same event, same
  category) are resolved by: distance (athletes tend to race the same distance), then result
  percentile (athletes tend to finish in a consistent percentile range). If a collision cannot be
  resolved automatically it is flagged for manual review. Non-collision results are merged into a
  single solo profile per group key.

Pass 5d — Cross-year solo merge
  Solo profiles created in 5c that share the same name are merged across years if:
    - their year ranges do not overlap,
    - the category progression is valid year-over-year (categories only go up: Elite → Masters A →
      Masters B → … → Masters E; Open 19-34 bridges Elite and Masters A),
    - consecutive profiles share at least one race distance,
    - their median finish percentile (genderPos / finisherCount) does not differ by more than 0.25.
  Profiles failing any check remain separate.

Pass 5e — Cross-pass team ↔ solo merge
  Identifies athletes who have both a team profile (from Passes 1/5a) and a solo profile (from 5c/5d)
  — the same person raced with their team at some events and as "Individual" at others.
  For each solo profile, candidate team profiles with the same normalised name are filtered through:
    1. Golden rule: no shared eventId (different events only).
    2. Distance sanity: solo and team profiles must share at least one race distance.
    3. Percentile sanity: median finish percentile must not differ by more than 0.25 (when both sides
       have ≥ 2 valid results).
    4. Country sanity: conflicting non-null countries → reject.
    5. Category compatibility: per-year category transitions must be valid.
  If exactly one candidate survives all filters, the solo profile is merged into the team profile and
  the solo key is deleted. If 2+ survive, a cross-pass flag is emitted for manual review.

Pass 5f — Cross-year team-change merge
  Identifies athletes who changed teams between seasons. Team profiles with the same name and
  non-overlapping year ranges are merged if:
    - category progression across the year boundary is valid,
    - consecutive profiles share at least one race distance,
    - median finish percentile does not differ by more than 0.25 (when both sides have ≥ 2 results),
    - non-null countries do not conflict.
  All later-year profiles are merged into the earliest-year profile.

Pass 6 — Manual result assignments (result-assignments.json)
  For edge cases that cannot be resolved automatically, a result can be manually reassigned to a
  specific athlete by (eventId, athleteId). The result is moved from whichever index entry currently
  holds it to the target athlete's entry.

Post-pass: year-category consistency sweep
  After all passes, each athlete must have at most one canonical category per year (the most frequent
  one across their results for that year). Any result whose category is incompatible with the year's
  canonical AND where the canonical clearly dominates (more canonical results than outliers) is
  flagged and removed as a source-data error. Results with no category data or unrecognised categories
  are never treated as outliers — absence of data cannot contradict known data.


General important safeguards:
  - An athlete cannot have two result entries for the same eventId. When a duplicate is detected,
    the licenced result takes priority; otherwise compatible categories are silently deduplicated and
    conflicting categories are flagged for manual review.
  - Categories only go up over time: Elite → Masters A → Masters B → Masters C → Masters D → Masters E.
    Open 19-34 is treated as ambiguous between Elite and Masters A (compatible with both, incompatible
    with Masters B+).

Invalid licences:
  1. Negative:         /^-\d+$/
  2. Sci notation:     /^\d+\.\d+[eE]\d+$/
  3. 10^10 variants:   /^1000000000\d?$/
  4. All-zeros:        /^0+$/
  5. Too small:        numeric, no leading zero, value < 100
  6. Federation:       starts with "FEDERAC" or "FEDERAÇ" (case-insensitive)
  7. Explicit list:    "NAOFEDERADO", "11111", "12345", "23456"
