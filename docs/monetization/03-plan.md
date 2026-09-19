# 03 — Phased Plan

Each phase has a revenue goal, the minimum product work it needs, and the
KPI that says whether to continue. Product work references the frontend and
engine plans by phase number rather than repeating them.

---

## Phase 0 — Measure and open the door (this month, no backend)

**Goal:** know the audience; accept money.

| Do | Detail |
|----|--------|
| Analytics | Cloudflare Web Analytics or self-hosted Umami. Track sessions, top pages, mobile share, race-weekend peaks. No cookies, no banner. |
| Support page | `/support`: what the site is, what it costs per month (real number), what the money buys next (list the frontend plan's Phase 1 items), one donation link (Ko-fi or GitHub Sponsors), one line inviting organisers and sponsors to write. |
| Footer line | "Independent project. Support it →". Nothing else. |
| Contact | A contact address on the support page and in `index.html` meta. |
| Privacy page | Required before any money or accounts. Draft in `docs/legal/privacy-notice.md` (PT + EN); terms in `docs/legal/terms.md`. Lawyer review first. |

**KPI:** monthly active users and race-weekend sessions after 30 days;
donations received (any amount counts as signal).

---

## Phase 1 — Organiser pilot (this season's remaining races)

**Goal:** €150+/month in season from two or three organisers.

| Do | Detail |
|----|--------|
| Pick targets | The organisers with the most events in the registry: BikeService (Viana, EuroBEC, Gerês, Bragança, Monção, Ourém) and Cabreira Solutions (Torres Vedras, Médio Tejo, Lousã, Terras de Basto, Paredes, Serra d'Ossa, Portimão). Two emails reach half the calendar. |
| Offer | Document 04, sent two weeks before their next race, with a live example: this site's predictions page for that race, and a mock of the widget with their colours. |
| Deliverable v1 | Predictions and results **images**, rendered by hand or with a script from the existing pages (the share-card work in the frontend plan Phase 5 makes this automatic later). Deliver by email 48 h before and 24 h after the race. |
| Deliverable v2 | Embeddable ranking widget: a static HTML page per organiser under `/embed/…` that they iframe. No backend needed; it reads the same data files. |
| Terms | Per-event invoice, paid on delivery. Free for the first race as a trial if needed, in exchange for a link. |

**KPI:** two paying organisers by season end; a link from each organiser
site (watch referral traffic in analytics).

**Dependencies:** none technical. The engine's participant fixes (B1, B9,
B10) must land first or the predictions deliverable is embarrassing for the
affected events.

---

## Phase 2 — Backend and supporters (off-season, Nov–Feb)

**Goal:** the backend exists and pays for itself from month one.

| Do | Detail |
|----|--------|
| Backend | Cloudflare-only stack from 01 (or VPS variant). Auth with magic links (no passwords). Tables: users, favourites, claims, push subscriptions, supporters. |
| Data tiering | Engine plan Phase 4: core tier plus per-event files, compressed. Cuts egress and unlocks instant loads, which is the pitch to supporters. |
| Membership | Stripe Checkout with two prices (€2.50/month, €20/year). Webhook sets `supporter_until` on the user. Perks per document 02 B, starting with claimed profile, favourites sync and share cards. |
| Share cards | Frontend plan Phase 5; also the engine for organiser images (Phase 1 above becomes automatic). |
| Launch | Announce at the first race of the new season; organisers post it (that is part of their package). |

**KPI:** 30 supporters within 60 days of launch; churn under 10%/month;
backend cost under €40/month.

---

## Phase 3 — Sponsor and scale (season two)

**Goal:** €400+/month in season; €150+ off-season.

| Do | Detail |
|----|--------|
| Sponsor | One presenting sponsor for the season, sold with the analytics from Phase 0–2 as the audience proof. Placement: footer line and ranking page header. |
| Organiser tier | Move organisers from per-event to a season subscription (€300–600 per organiser per season) covering all their events, with the widget, images and post-race reports automated. |
| Team dashboards | Document 02 F, €5–10/month per club, built on the team profile that already exists. |
| Posters | Document 02 E via print-on-demand, using the share-card renderer. |
| Series relationship | If a federation or series body exists or forms, offer to be its official ranking in exchange for a fee or a data-sharing agreement that replaces scraping. |

**KPI:** revenue covers hosting five times over; at least one income line is
recurring rather than per-event.

---

## Legal, tax and trust hygiene

These come with the first euro, and most are cheap.

| Topic | What to do |
|-------|------------|
| GDPR (personal data) | The site already publishes names, teams, categories and times of identifiable people. Publication of race results is generally accepted as legitimate interest with a public source, but a paid site attracts more scrutiny. Publish a privacy notice; provide a correction/removal request path (an email is enough at this scale) and honour it within 30 days; never sell or export individual profiles; keep the claimed-profile data (bio, photo) separate and deletable. |
| Data source terms | Results come from timing platforms' public pages and APIs. Read StopAndGo's terms before selling anything derived from their data, and prefer to convert the relationship into a data-sharing agreement (Phase 3). Organiser packages make this easier because the organiser is the data owner. |
| Cookies and consent | Avoid needing a banner: no third-party trackers, cookieless analytics, first-party auth cookie only for logged-in users (strictly necessary, no consent needed). |
| Payments | Stripe handles VAT collection for EU consumers if configured with Stripe Tax; invoices to organisers are B2B. |
| Tax status in Portugal | Any regular income needs a fiscal framework: either open activity as an independent worker (recibos verdes, simplified regime, VAT exemption under the article 53 threshold) or run it through an existing company. Speak to an accountant before the first invoice; donations via Ko-fi are still income. |
| Terms of service | Short page: what the site is, that results are indicative and the organiser's publication is authoritative, membership terms, refund policy (pro-rata or none for monthly). |
| Brand | Check the name "Granfondo Portugal" is not a registered mark of an organiser or the federation before putting it on invoices and sponsor decks. If it is, choose a project name now, before it has customers. |
| Transparency | A public "costs and funding" line on the support page. Riders fund things they can see. |

## What not to do

- Do not add display ads or a consent banner to get €30/month.
- Do not paywall any result, ranking or prediction.
- Do not sell bulk athlete data to anyone.
- Do not build accounts before analytics show the audience exists.
- Do not accept a sponsor whose placement needs a tracking pixel.
