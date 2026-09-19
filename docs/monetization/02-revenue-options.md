# 02 — Revenue Options

Each option is scored 1–5 on **fit** (does it suit a premium, community
results site), **effort** (1 = an afternoon, 5 = weeks plus ongoing work),
**yield** (expected euros per month at year-one audience) and **risk**
(legal, reputational, or dependency). Numbers are estimates; see 01 for the
assumptions behind them.

## A. Organiser and timing-company services — recommended first

| | |
|---|---|
| Fit | 5 |
| Effort | 3 |
| Yield | €200–800/month in season (5–10 events × €50–150), €0 off-season |
| Risk | 2 |

The series has a handful of organisers (`OFFICIAL_EVENT_URLS` shows
BikeService, Cabreira Solutions, Figueira Champions, Coimbra Region, Algarve,
Serra da Estrela, Monção e Melgaço) and one dominant timing provider
(StopAndGo). They already produce start lists and results; what they do not
have is the layer this site built: cross-event identity, season rankings,
predictions, head-to-head. Things they would pay for:

1. **Embeddable widgets** for their own site: live series ranking, "favourites
   for this race", top-10 per category after the race. One `<iframe>` or
   `<script>` tag, branded with their colours. €50–100 per event or €30/month.
2. **Pre-race content pack**: the predictions page rendered as social-media
   images (favourites per category, returning champions, biggest fields) sent
   48 hours before the race. Organisers post it; the site gets the link. €50–100 per event.
3. **Post-race report**: category podiums, records broken, participation by
   region and nationality, year-on-year growth. PDF plus images. €100–150 per event.
4. **Data-quality service**: the start-list link rate the engine already
   computes tells an organiser how many registrants have inconsistent names,
   missing categories or team spellings before race day. Delivered as a CSV. Bundled with 2.
5. **"Official ranking partner"** badge and link exchange: free, in return for
   a link from the organiser's page, which is what makes the audience grow.

Why first: it needs no accounts, no payments UI, and no backend beyond what
exists. It is invoiced work, three to five emails per season. Document 04 is
the offer.

## B. Supporter membership — recommended second

| | |
|---|---|
| Fit | 5 |
| Effort | 4 (needs auth, payments, the perks themselves) |
| Yield | 40 supporters × €2.50 = €100/month; scales with audience |
| Risk | 2 |

Price at €2–3/month or €20/year, through Stripe (or Ko-fi/Buy Me a Coffee
memberships if avoiding Stripe onboarding at first). Perks must be personal
and cheap to serve:

- Claimed profile with a verified badge and a short bio, photo, social links.
- Favourites synced across devices, "my riders" strip on the home page.
- Share cards for every result, podium and season summary (also great marketing).
- Results-are-in push notification for followed events and riders.
- Season certificate PDF with a personal points breakdown.
- No sponsor banner.
- Early access to predictions (48 h before public).

Everything except the badge is on the frontend feature list already; the
membership is the reason to build the backend.

## C. Single sponsor slot — recommended, opportunistic

| | |
|---|---|
| Fit | 4 (if limited to one tasteful placement) |
| Effort | 2 |
| Yield | €50–150/month |
| Risk | 2 |

One "Presented by" line in the footer and on the ranking page, one sponsor
per season, sold to a bike shop, a component brand already sponsoring events
(KTM and Trek names appear in event titles), a nutrition brand or a cycling
insurance product. Sell it as reach into a verified audience of the series'
own riders, with the analytics from 01 as proof. Keep it to one, keep it
static, no tracking pixels.

## D. Donations — floor

| | |
|---|---|
| Fit | 4 |
| Effort | 1 |
| Yield | €10–50/month |
| Risk | 1 |

Ko-fi, Buy Me a Coffee or GitHub Sponsors link on a "Support the site" page
that states the monthly cost plainly and shows what has been funded. Do it
in Phase 0; it costs nothing and gives an early signal of goodwill.

## E. Merchandise and one-off products

| | |
|---|---|
| Fit | 3 |
| Effort | 3 |
| Yield | €20–100/month |
| Risk | 2 |

Personalised season poster or "race passport" (every result, every podium,
printed) via a print-on-demand service, €15–30 with a €5–10 margin. Team
posters for clubs. Works once share cards exist, because the poster is the
same renderer at higher resolution. Do not hold stock.

## F. Data access for teams, coaches and media

| | |
|---|---|
| Fit | 3 |
| Effort | 3 |
| Yield | €0–100/month |
| Risk | 3 (GDPR: personal data of identifiable individuals) |

A team dashboard (all members' results and points in one place, exportable)
at €5–10/month per club is plausible; there are ~90 teams per distance in the
ranking. A raw API for media is a nice idea with almost no buyers. If offered,
limit exports to the team's own members and keep individual profiles out of
bulk downloads.

## G. Affiliate links

| | |
|---|---|
| Fit | 2 |
| Effort | 2 |
| Yield | €5–30/month |
| Risk | 2 |

Gear links on event pages (Tradeinn/Bikeinn, Decathlon, Amazon.es) or an
"official kit" link per event. Low yield, mild clutter. Only as part of an
organiser or sponsor package, never as standalone banners.

## H. Display advertising — not recommended

| | |
|---|---|
| Fit | 1 |
| Effort | 2 |
| Yield | €20–60/month at 30k page views (Portuguese RPM €1–2) |
| Risk | 3 (consent banner, layout damage, brand) |

AdSense on 30k monthly page views yields roughly what one organiser pays for
one widget, and it costs a cookie banner, a slower page, and the premium
look the frontend plan is built around. Revisit only above 500k page views a
month, which this series cannot produce.

## I. Paywalling results — never

Results are public information produced by organisers and timing companies;
riders expect to find their own time for free. Charging for it invites the
audience to go back to StopAndGo and damages the organiser relationship that
option A depends on. Paywall personalisation and convenience, never the data.

## Summary

| Option | Fit | Effort | Yield €/mo | Risk | Verdict |
|--------|-----|--------|-----------|------|---------|
| A Organiser services | 5 | 3 | 200–800 (season) | 2 | First |
| B Supporter membership | 5 | 4 | 100+ | 2 | Second, funds year two |
| C Sponsor slot | 4 | 2 | 50–150 | 2 | Opportunistic |
| D Donations | 4 | 1 | 10–50 | 1 | Now |
| E Merch / posters | 3 | 3 | 20–100 | 2 | After share cards |
| F Team dashboards | 3 | 3 | 0–100 | 3 | Year two |
| G Affiliate | 2 | 2 | 5–30 | 2 | Bundle only |
| H Display ads | 1 | 2 | 20–60 | 3 | No |
| I Paywall results | 0 | – | – | 5 | Never |
