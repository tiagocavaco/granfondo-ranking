# Spec — user backend beside GitHub Pages

Status: proposed, not implemented. Implements monetization Phase 2 and the
frontend features that need state: favourites, claimed profiles, push,
share cards, supporters. The public site and data stay on GitHub Pages.

## 1. Shape

- Runtime: Cloudflare Workers (Hono router), D1 (SQLite) for user state,
  R2 for generated images, Cron Trigger for daily jobs. Free tier at
  expected load (`docs/monetization/01-costs-and-audience.md`).
- Domain: `api.<site-domain>`; CORS allow-list = the Pages origin.
- The backend never holds race data. It references athletes and events by
  the ids in the public artefacts and fetches `manifest.json` when it needs
  to know the current `scrapedAt`.

## 2. Data model (D1)

```sql
users(id TEXT PK, email TEXT UNIQUE, created_at, last_seen_at, locale TEXT, supporter_until TEXT NULL, stripe_customer_id TEXT NULL)
sessions(id TEXT PK, user_id FK, expires_at)
magic_links(token_hash TEXT PK, email, expires_at, used_at NULL)
favourites(user_id, kind TEXT CHECK(kind IN ('athlete','team','event')), ref_id INTEGER, created_at, PK(user_id, kind, ref_id))
claims(user_id, athlete_id INTEGER UNIQUE, status TEXT CHECK(status IN ('pending','verified','rejected')), evidence TEXT, verified_at NULL, bio TEXT, photo_key TEXT, links TEXT)
push_subscriptions(id TEXT PK, user_id, endpoint TEXT UNIQUE, keys_json TEXT, created_at)
notifications(id TEXT PK, user_id, kind, payload_json, sent_at NULL)
share_cards(key TEXT PK, kind, ref_id, scraped_at, created_at)      -- cache index for R2 objects
audit(id INTEGER PK, user_id NULL, action, target, at)
```

No names, results or licences are stored; `athlete_id` is a foreign
reference into the public data.

## 3. Endpoints

Auth is a signed session cookie (`HttpOnly; Secure; SameSite=Lax`), set by
the magic-link callback. All `POST` require the cookie plus an `Origin`
check.

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/auth/magic-link` | `{ email }` → sends link; always 200 |
| GET | `/auth/callback?token=` | verifies, creates session, redirects to `returnTo` on the Pages origin |
| POST | `/auth/logout` | |
| GET | `/me` | user, supporter status, claim, counts |
| GET | `/me/favourites` · PUT `/me/favourites/:kind/:id` · DELETE same | favourites sync |
| POST | `/me/claim` | `{ athleteId, evidence }` → pending; verification is manual in the backoffice (a `claims` review source) |
| PATCH | `/me/claim` | bio, links; photo via `POST /me/claim/photo` (multipart → R2) |
| POST | `/me/push` · DELETE `/me/push/:id` | Web Push subscription |
| GET | `/cards/:kind/:id.png` | share card; generated on first request with Satori + resvg-wasm, cached in R2 keyed by `(kind, id, scrapedAt)`; public, cacheable |
| POST | `/billing/checkout` | creates Stripe Checkout session (monthly / yearly price ids) |
| POST | `/billing/webhook` | Stripe events → `supporter_until` |
| GET | `/billing/portal` | Stripe customer portal link |
| GET | `/public/claims` | `{ athleteId: { verified: true, bio, links, photoUrl } }` for verified claims; cached 5 min; consumed by the frontend to show badges |
| GET | `/health` | version, D1 ping, last cron |

Cron (daily 06:00 UTC, and on-demand via a signed webhook the scrape
workflow calls after a data commit): compare manifest `scrapedAt` with the
last seen; for each newly-resulted event, notify users who favourited the
event or any athlete with a result in it ("Results are in"); for claimed
athletes, notify the owner with their own result.

## 4. Frontend integration

- `VITE_API_URL` env; a tiny client with `credentials: "include"`.
- Favourites: optimistic local state in `localStorage` for anonymous users;
  merged into the account on first login.
- Badges: `/public/claims` fetched once per session.
- Share buttons link to `/cards/...png` and the page URL; OG tags on each
  page point at the same card so links unfurl.

## 5. Privacy

- Data minimisation: email is the only personal field; no analytics events
  server-side beyond the audit table.
- Delete account = delete all rows and R2 objects; endpoint `DELETE /me`.
- Claims are verified by a human (a result-day selfie with the bib, or a
  message from the organiser); the evidence text is deleted after
  verification.
- Privacy notice and terms pages live on the Pages site; the API links to
  them from the magic-link email.

## 6. Acceptance

- Cold start to `/me` under 200 ms p95 from Lisbon.
- Favourites round-trip between two devices under 2 s.
- A results commit triggers push within 10 minutes for a favourited event.
- `DELETE /me` leaves no rows and no objects (test).
- Monthly cost at 4,000 MAU stays within the free tier; alert at 80% of any quota.
