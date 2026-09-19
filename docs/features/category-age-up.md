# Feature spec — category age-up notice

**What:** on an athlete profile, "Next season you race Masters C" with a link to the current Masters C standings on the rider's usual distance.

**Why:** riders care about where they will stand; it is a cheap reason to visit in the off-season.

**Inputs:** the athlete's canonical category per year (`athlete_categories` + `canonicalizeCategory`); the band ordering in `scraper/src/pipeline/results/helpers.ts#SOLO_CAT_RANK`.

**Method:** the site does not know birth dates. It knows the first year the rider appeared in the current band. Portuguese masters bands are five-year age groups in the source data (MASTER 30/35/40/…) collapsed to A–F in this project; when the raw category carries the 5-year band (e.g. "M 45-49"), the year of entry into that band plus 5 is the age-up year. When only the collapsed band is known, show nothing. Compute in the scraper post-pass into a nullable `athletes.next_category_year` and `next_category`.

**UI:** one line under the stats strip; hidden when unknown or when the rider is Elite.

**Guardrails:** never infer or display age; the line reads "expected to move to …" and disappears if the next season's results contradict it.

**Acceptance:** for riders whose raw categories show a band change in past data, the predicted year matches the observed change in ≥ 90% of cases (back-test on 2023→2026).
