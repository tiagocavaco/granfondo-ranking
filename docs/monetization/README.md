# Monetization Plan (18 Sep 2026)

Goal as stated by the owner: earn enough from the site to cover the hosting
of a proper backend, so features like accounts, favourites, notifications and
a smaller download become possible. This is not a plan to build a business.
It is a plan to make the project self-funding with margin, in a way that does
not damage the trust of the riders whose names are on it.

| Document | What it covers |
|----------|----------------|
| [01-costs-and-audience.md](01-costs-and-audience.md) | What a proper backend costs per month, what the audience realistically is, and the revenue target that follows |
| [02-revenue-options.md](02-revenue-options.md) | Every plausible income source, scored on fit, effort, expected yield and risk, with the ones to avoid |
| [03-plan.md](03-plan.md) | Four phases, what to build for each, KPIs, and the legal and tax hygiene that comes with the first euro |
| [04-organiser-offer.md](04-organiser-offer.md) | The one-page offer to send to race organisers and timing companies, the most realistic revenue line |

## What the evidence is based on

- Database facts from `docs/engine/metrics.json`: 88 events over four seasons,
  74,663 finishers, 23,766 distinct athletes, 4,557 teams, ~20 events per
  season with 300–2,300 registrants each.
- The event registry in `scraper/src/config.ts`: a small number of organisers
  (BikeService, Cabreira Solutions, the Coimbra, Algarve, Figueira and
  Serra da Estrela organisations) and one dominant timing platform (StopAndGo).
- No web analytics exist on the site. Every traffic figure below is an
  estimate from the athlete counts and must be replaced by measurement
  within the first month (Phase 0).

## Headline

The site costs €0 today on GitHub Pages, and the plans keep it there. A
backend beside it that does everything the frontend plan needs costs **€0–40
per month** depending on stack and usage. The realistic income sources, in order of expected yield per hour of
effort, are:

1. **Organiser services** (a per-event fee for an embeddable results and
   ranking widget, pre-race favourites content, and a post-race report).
   Five to ten organisers at €50–150 per event covers the target several times
   over and is the only line that scales with the series.
2. **Supporter membership** at €2–3/month or €20/year for riders who want
   favourites, a claimed profile, share cards and no sponsor banner. Needs the
   backend first, so it funds the second year, not the first.
3. **A single sponsor slot** for a bike shop or brand already involved in the
   series, €50–150/month.
4. **Donations** as a floor, not a plan.

Display advertising is the wrong fit for a site whose main design goal is
"luxury": low yield in Portugal and it undoes the visual work. It is listed
in document 02 for completeness with the numbers that argue against it.
