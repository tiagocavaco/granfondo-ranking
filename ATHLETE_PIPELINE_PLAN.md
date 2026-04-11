# Athlete Data Pipeline — Consistency Plan

## Problem Statement

The current pipeline builds athlete profiles in a single pass keyed by `name|team`, then
merges by licence post-hoc. This causes:

- Solo/Individual results from different people being merged (same name, different person)
- Licence-verified athletes missing unlicensed results from their known teams
- No canonical category system — raw category strings are used directly
- No safeguard against duplicate results for the same event on the same athlete
- No escape hatch for manual corrections of solo/Individual edge cases

---

## New Pipeline: 6-Pass Approach

### Config files (inputs)

| File | Purpose |
|---|---|
| `team-aliases.json` | Normalised team key → canonical team key |
| `athlete-aliases.json` | Explicit athlete merges (team changes, name variants) |
| `result-assignments.json` | **New** — manual `(eventId, bib)` → `athleteId` overrides |

### Data shape changes

`AthleteEntry` gains two new fields:

```ts
teams: string[]                       // all normalised team keys this athlete appeared with
categories: Record<string, string[]>  // year → canonical category names
                                      // e.g. { "2025": ["Masters A Male"], "2026": ["Masters B Male"] }
```

`categories` is stored per year because an athlete ageing from Masters A to Masters B in
a new season must not be matched against Masters B athletes in prior seasons.

---

## Invalid Licence Rules

A licence is invalid (treated as no licence) if it matches any of:

```
1. Negative number:    /^-\d+$/
2. Scientific notation: /^\d+\.\d+[eE]\d+$/   (mangled 10000000000 variants)
3. 10^10 variants:     /^1000000000\d?$/
4. All-zeros:          /^0+$/                  (000, 0000, 00000 — NOT 00185)
5. Too small:          numeric, no leading zero, value < 100
6. Federation names:   starts with "FEDERAC" or "FEDERAÇ" (case-insensitive)
7. Explicit list:      "NAOFEDERADO", "11111", "12345", "23456"
```

Zero-prefixed values with non-zero digits (e.g. `00185`) are **real licences** — kept as-is.

---

## Category Resolution

For every raw category string, resolve in order:

```
1. CATEGORY_MAP[raw]        → canonical group name
2. normalizeCategory(raw)   → fallback for unknown variants following known patterns
3. "Unknown"                → if still unresolved
```

### Canonical category map

```
Elite_Male:       ELITES M, M ELITES, Elite M., Elite Masc, M Elite, M 19-34, M SUB23
Elite_Female:     ELITES F, F ELITES, Elite F., Elites Fem, F Elite, F 19-34, F SUB23
Junior_Male:      M JUN, M Junior, Junior M., Juniores Masc
Junior_Female:    F JUN, Junior F.
Cadete_Male:      M Cadete, Cadete Masc
Masters_A_Male:   MASTERS A, M Masters A, Master A, MasterA Masc, MASTER 30, MASTER 35, M 35-39
Masters_B_Male:   MASTERS B, M Masters B, Master B, MasterB Masc, MASTER 40, M 40-44, MASTER 45, M 45-49
Masters_C_Male:   MASTERS C, M Masters C, Master C, MasterC Masc, MASTER 50, M 50-54, MASTER 55, M 55-59
Masters_D_Male:   MASTERS D, M Masters D, Master D, MasterDM,     MASTER 60, M 60-64, MASTER 65, M 65-69
Masters_E_Male:   MASTERS E, M Master E,  Master E, MasterEM,     MASTER 70, M 70-74, M 75-79
Masters_A_Female: MASTERS A FEM, F MASTERS A, F Masters A, Master A Fem, F MASTER 30, F 19-34, F MASTER 35, F 35-39
Masters_B_Female: MASTERS B FEM, F MASTERS B, F Mastres B, Master B Fem, F MASTER 40, F 40-44, F MASTER 45, F 45-49
Masters_C_Female: MASTERS C FEM, F MASTERS C, F Masters C, Master C Fem, F MASTER 50, F 50-54, F MASTER 55, F 55-59
Masters_D_Female: MASTERS D FEM, F MASTERS D, F MASTER D,  F 60-64
EBike:            EBIKE, E-BIKE, E-Bikes
Paracycling:      PARACICLISMO, PARACICLISTA, PARACLISMO
Unknown:          (empty string), Sem Escalão
```

---

## Team Matching

Two team keys are considered the same if:

```
teamNormalKey(a) === teamNormalKey(b)          // exact after normalisation + aliases
OR teamKeySimilarity(teamNormalKey(a), teamNormalKey(b)) === 1
```

`teamKeySimilarity === 1` covers:
- Compaction variants: `"dbl bike"` = `"dblbike"`
- Prefix/containment: `"zoss vog"` ⊂ `"zoss vog cacb"` (≥60% coverage, ≥4 chars)
- Full token containment: `"anna cycling"` ⊂ `"anna cycling team"`

Partial Jaccard (shared tokens but not full containment) returns < 1 and is **rejected**.

---

## Name Matching

`normalizeName` handles accent stripping and lowercasing (deterministic, not fuzzy).

For **Pass 1 licence conflict resolution only**: if the same licence appears under two
different names, check `levenshteinDistance(a, b) <= 2` on the normalised strings before
declaring a conflict. Catches encoding artifacts (`"gon?alves"` = `"goncalves"`) and
single-character typos (`"guerrreiro"` = `"guerreiro"`). If within threshold, merge under
the longer/more complete name and log a notice.

---

## Pass 1 — Licence Athletes

**Goal:** build the authoritative set of athlete profiles from licence-verified results only.

1. Iterate every event result.
2. Skip results where **all** licences fail `isValidLicence`.
3. For each valid licence, group by `(normalisedLicence, normalisedName)`.
   - Same licence + different name AND `levenshteinDistance > 2` → log warning, skip that
     licence entirely (treat both entries as unlicenced).
   - Same licence + different name AND `levenshteinDistance <= 2` → treat as same person,
     use the more complete name, log a notice.
4. Build one `AthleteEntry` per `(licence, name)` pair.
5. Assign stable IDs from `idStore` (keyed by `nameLower|canonicalTeamKey` for backwards
   compatibility with existing athlete-ids.json).
6. After all results collected, populate `teams` and `categories` (keyed by year).

**Output:** clean set of licence-verified profiles, each with full team and category history.

---

## Pass 2 — Unlicensed Results Matched by Name + Team

**Goal:** attach unlicenced results to existing Pass 1 profiles where the team matches.

Rules:
- Solo/Individual results are **excluded from this pass entirely**.
- For each unlicenced non-solo result:
  1. Normalise name and team (applying team aliases).
  2. Find all Pass 1 athletes whose `nameLower` matches exactly.
  3. Among candidates, check if the result's team matches any key in the athlete's `teams`
     set (using team matching rules above).
  4. **Exactly one candidate** → add result, update `teams` and `categories[year]`.
  5. **Multiple candidates** → log warning, leave for Pass 5.
  6. **Zero candidates** → leave for Pass 5.

---

## Pass 3 — Solo Results via Explicit Athlete Aliases

**Goal:** attach solo/Individual results to licence athletes where explicitly configured.

- Apply `athlete-aliases.json` rules where `alias.team === ""`.
- For each rule, find the canonical Pass 1 profile (skip if it doesn't exist).
- Absorb all solo results for that name into the canonical profile.
- **No automatic matching** — explicit alias entry required. This is intentional: two
  different people with the same name both racing as Individual cannot be distinguished
  automatically.

After Pass 3, all licence athletes are complete.

---

## Pass 5 — Remaining Athletes

**Goal:** build profiles for athletes who have no licence and were not matched in Passes 2–3.

### Team athletes (non-solo results)
- Group by `(normalisedName, canonicalTeamKey)` using team matching rules.
- Apply team-based `athlete-aliases.json` rules.
- Assign new IDs from `idStore`.

### Solo athletes (solo/Individual results)
- **No auto-merging.** Each unmatched solo result becomes its own standalone profile.
- The only way two solo results are merged is via an explicit `athlete-aliases.json` entry
  or a `result-assignments.json` entry (Pass 6).

---

## Pass 6 — Manual Result Assignments

**Goal:** surgical override for edge cases that no automatic logic can handle safely.

Config file: `result-assignments.json`

```json
[
  {
    "eventId": 1831,
    "bib": "123",
    "athleteId": 3766,
    "note": "João Silva racing as Individual, confirmed same person as ID 3766"
  }
]
```

For each entry:
1. Find result by `(eventId, bib)` in the current index.
2. Move it from its current profile into the target `athleteId` profile.
3. If the source profile has no remaining results → delete it.
4. If `athleteId` doesn't exist → log error, skip.

---

## Duplicate Event Safeguard

Applied when adding any result to a profile (all passes):

Check if the athlete already has a result for the same `eventId`:

1. **Same canonical category** → keep the licenced one, discard the other.
2. **Different canonical categories** → use `categories[year]` to decide which matches
   the athlete's established category for that year.
3. **Still ambiguous** → emit `FLAG(athleteId, eventId, category_a, category_b)`, keep
   both entries for manual review. Never silently discard.

---

## What Stays Unchanged

- `transformResult`, `extractDistances`, `assignGenderPositions`
- `buildAggregateRanking`, `buildTeamRanking`
- `idStore` persistence (athlete-ids.json) — IDs remain stable
- `team-aliases.json` and `athlete-aliases.json` — still the manual override mechanism
- `teamKeySimilarity`, `normalizeName`, `teamNormalKey` — unchanged, just wired in

---

## Implementation Strategy

1. Build as `pipeline-v2.ts` alongside existing `pipeline.ts` — no breaking changes.
2. Run both pipelines, diff: athlete count, result count per athlete, flagged duplicates.
3. Review FLAGS output — these are data quality issues surfaced cleanly.
4. Switch `index.ts` to use `pipeline-v2.ts` once output is validated.
5. Delete `pipeline.ts` (old).

---

## Honest Assessment

### What this solves (high confidence)

| Problem | Solution |
|---|---|
| Solo athletes merged incorrectly | Pass 5 never auto-merges solo results |
| Athlete missing results from team name variants | `teamKeySimilarity` in Pass 2 |
| Different category spellings treated as different categories | `CATEGORY_MAP` |
| Dummy licences causing false merges | `isValidLicence` blocklist |
| No escape hatch for manual corrections | `result-assignments.json` |
| Athletes ageing into new category breaking dedup | `categories` stored by year |

### What this does NOT fully solve

| Limitation | Reason |
|---|---|
| ~89 licence conflicts with different names | Only resolved if `levenshteinDistance <= 2`. Genuine data errors (two people with same licence) remain as split profiles — requires manual `athlete-aliases.json` |
| Two solo athletes with same name + category + year | Indistinguishable without a licence or team. Requires `result-assignments.json` |
| Unlicenced athlete who changed teams between events | Pass 2 only sees their Pass 1 team history; if all results are unlicenced they fall to Pass 5 and may split across teams |

The remaining 1 point is the inherent source data quality ceiling — no pipeline can safely
merge two solo athletes with the same name without external confirmation. The FLAG system
and `result-assignments.json` handle these cases cleanly instead of hiding them.

### Rating: 9/10

The plan reliably fixes the core problems (false solo merges, missing results, category
chaos, dummy licences) and provides clean manual escape hatches for what remains. The
remaining limitations are inherent to the source data quality — no pipeline can safely
merge two solo athletes with the same name without external confirmation. The FLAG system
surfaces these cases instead of hiding them, which is the right trade-off.

The site is not yet live, so `athlete-ids.json` can be deleted and regenerated from
scratch by the new pipeline. There is no migration risk.
