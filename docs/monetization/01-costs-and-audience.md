# 01 — Costs, Audience and Target

## 0. Where the site stands today, and why

The site is a static SPA on GitHub Pages. The results database is committed
to the repository as an AES-GCM encrypted file so that rider data is not
plaintext in a public git history, and the key is injected at build time.
This costs €0 per month, needs no server, and deploys on every commit. The
accepted trade-off is the initial download of the whole database.

Everything below keeps that base. "A proper backend" here means a small
service **beside** GitHub Pages for the things a static site cannot do
(accounts, favourites, notifications, generated images), not a replacement
for it. Two consequences:

- The performance work in the engine plan (tiered files, compress-then-encrypt,
  content-hashed names, service worker) is entirely compatible with GitHub
  Pages and should happen regardless of monetisation. It is the fix for the
  one drawback of the current design.
- The backend can start at €0 (Cloudflare Workers + D1 free tier, with the
  static site still on Pages) and only costs money if usage grows. The
  revenue target is therefore insurance and headroom, not a bill that exists
  today.

## 1. What "a proper backend" needs

From the frontend and engine plans, the backend must provide:

- Static hosting for the SPA and the tiered data files (today: GitHub Pages, free).
- An API for accounts, favourites, claimed profiles, share-card generation and
  push subscriptions.
- A small relational store for users and their preferences (the race data
  itself stays in the scraper's SQLite output).
- A place to run the scraper on a schedule (today: GitHub Actions, free for a
  public repo, 2,000 minutes/month for a private one).
- Object storage for generated share-card images and per-event data files.
- A domain and TLS.

## 2. Monthly cost by option

Prices are September 2026 list prices, excluding VAT, for the smallest tier
that fits. Traffic assumptions: 30k page views per month average, 150k in
a race weekend, 2 GB egress after the data tiering work.

| Stack | Components | €/month | Notes |
|-------|------------|---------|-------|
| **GitHub Pages as today** | Static site + encrypted data files | 0 | Current setup. Public repo required for free Actions minutes and Pages |
| **GitHub Pages + Cloudflare Workers** | Keep Pages for the site and data; add Workers (API), D1 (SQL), R2 (images), Web Analytics | 0–5 | Smallest possible step. Free tiers cover this traffic; Workers Paid ($5) only above 100k requests/day |
| **Cloudflare-only** | Pages (static), Workers (API), D1 (SQL), R2 (files), Web Analytics, Cron Triggers | 0–5 | Same as above but moves the static site too; gains edge caching for the data files and a CDN in front of the 49 MB (or, after tiering, 3 MB) download |
| **Cloudflare + small VPS** | As above plus a Hetzner CX22 (2 vCPU, 4 GB) for the scraper and backoffice | 4–10 | Removes the GitHub Actions dependency and gives the backoffice a home |
| **Supabase + Pages** | Supabase Pro (Postgres, auth, storage) + Cloudflare Pages | 25 | Fastest way to get auth and rows; over-specified for this load |
| **Fly.io / Railway** | One small app + Postgres | 7–15 | Familiar Node deployment; scale-to-zero available |
| **Vercel / Netlify Pro** | Static + serverless functions | 19–20 | Only if the team already lives there; bandwidth pricing punishes the 49 MB file |

Fixed extras in every case:

| Item | €/year |
|------|--------|
| Domain (`.pt` or `.com`) | 10–25 |
| Transactional email (Resend/Postmark free tier up to 3k/month) | 0 |
| Push notifications (Web Push, self-signed VAPID) | 0 |
| Error monitoring (Sentry developer tier) | 0 |

**Realistic all-in: €10–40 per month, €120–500 per year**, with the
Cloudflare-only stack at the bottom of that range. The single biggest cost
driver today would be egress of the 49 MB file; the engine plan's tiering and
compression (Phase 4 there) is therefore also a cost measure.

## 3. Audience, estimated from the data

There is no analytics on the site. The following is derived from the
database and should be treated as an upper bound on the addressable
audience, not a traffic figure.

| Measure | Value | Source |
|---------|-------|--------|
| Distinct athletes with a result, all time | 23,766 | `athletes` |
| Distinct athletes per season | ~10,000 | `stats.uniqueByYear` |
| Finishers per event | 300–2,300 (median ~900) | `events.finisher_count` |
| Events per season | 20–23 | `events` |
| Registrants for the next race | 985 | `events.participant_count` for 1943 |
| Teams with three or more members in a season | ~90 per distance | `team_ranking` |

Rules of thumb for amateur results sites:

- 30–60% of finishers look up their own result within 48 hours of a race,
  and one third of those come back at least once during the season.
- A race weekend therefore produces 500–1,500 sessions for a 1,000-finisher
  event; a season produces 40,000–80,000 sessions if the site is the place
  riders already know. It is not yet, so halve that for year one.
- Conversion to a paid supporter tier on hobby sports sites is 0.5–2% of
  monthly active users when the perks are personal (your profile, your card).

Working assumptions for the plan, to be replaced by measured numbers:

| Metric | Year-one assumption |
|--------|---------------------|
| Monthly active users, off-season | 1,000 |
| Monthly active users, in-season | 4,000 |
| Page views per month, in-season | 30,000 |
| Supporter conversion | 1% of in-season MAU = 40 |

## 4. Revenue target

| Target | €/month | Why |
|--------|---------|-----|
| Break-even | 40 | Covers the top of the hosting range |
| Comfortable | 150 | Hosting plus a domain, a paid analytics tier, and a buffer for a spike month |
| Worth the operator's time | 400+ | At this level the site can pay for a few hours of contracted help a month |

The plan in document 03 aims at "comfortable" in year one from organiser
services and donations, and adds supporters in year two once the backend
exists. Everything above that is upside.

## 5. First action: measure

Before selling anything, add free analytics so the numbers above stop being
guesses. Cloudflare Web Analytics (a script tag, no cookies, no consent
banner needed) or self-hosted Umami/Plausible on the VPS. Track: sessions,
pages per session, top routes, share of mobile, and race-weekend peaks.
One month of data changes every number in this folder.
