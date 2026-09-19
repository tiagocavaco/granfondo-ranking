# Feature spec — rivals

**What:** on an athlete profile, "Your rivals": up to five riders who finished within a small margin of this rider in three or more shared events, with the head-to-head score and a one-tap compare link.

**Inputs:** `athlete_results` (event, distance, race_time_secs, gender_pos).

**Method:** for each pair sharing ≥ 3 (event, distance): margin = median |Δ time| as a fraction of finish time; rival if margin ≤ 2% (or ≤ 5 gender positions), same gender. Score = wins/losses. Computed at scrape time into `rivals(athlete_id, rival_id, shared, wins, losses, median_gap_secs)`, limited to the top 5 per athlete by shared count then margin; symmetric rows written once and read both ways.

**UI:** a card under Career Highlights; each rival links to `/compare?a=&b=`; the compare page pre-fills from it.

**Guardrails:** same-gender only; require ≥ 3 shared events so a single race does not create a "rival"; riders may opt out of appearing on others' profiles (claimed-profile setting).

**Acceptance:** the pair table size is bounded (≤ 5 × athletes); every listed pair has ≥ 3 shared events in `athlete_results`.
