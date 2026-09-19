# Feature specs — features that need a claimed profile

All four depend on the user backend (`docs/specs/backend-api.md`): a rider
has logged in and a human has verified that they are athlete N. None of
them stores race data server-side; they store links and preferences.

## 1. Strava activity on a result

**What:** a claimed rider attaches their Strava activity to one of their results; the result row shows a small "view ride" link and, if the rider allows, distance, elevation and average power from the activity.

**Method:** Strava OAuth (scope `activity:read`), `POST /me/results/:eventId/:distance/strava` with the activity id; the backend fetches the activity summary once and stores `{ activityId, distanceM, elevationM, avgPower, movingTime }` in `result_links`. The public site reads `GET /public/result-links?eventId=` (cached).

**Why it matters:** the only way this project ever gets route and power data without scraping; also the seed for real course records per activity.

**Guardrails:** opt-in per result; the rider can unlink; nothing is fetched beyond the summary; no heart-rate.

**Acceptance:** linking takes under 10 s; unlinking removes the row and the badge within one page reload.

## 2. Race-day photos by bib

**What:** on a result row, "Photos" linking to the organiser's photo service search for that bib.

**Method:** a `photosUrlTemplate` per event in the registry (e.g. `https://photos.example/{eventSlug}?bib={bib}`); no scraping, no hosting. Where the organiser uses a service with a stable URL scheme, the template is reused across editions.

**Why it matters:** riders look for their photos within hours of finishing; the site becomes the place they start from.

**Acceptance:** link present for every event with a template; opens the search pre-filled.

## 3. Season recap email

**What:** one email in November per claimed rider: their share card, points and rank per distance, best result, rivals record, first-timer badge if applicable.

**Method:** cron job after the last event of the season; renders the same data as the profile page via the share-card renderer; sent through the transactional email provider; one-click unsubscribe.

**Why it matters:** highest retention per euro; brings riders back before registrations open.

**Guardrails:** only to claimed profiles with email; no marketing; links back to the site only.

**Acceptance:** send count equals claimed profiles minus unsubscribed; open rate tracked by the provider only.

## 4. Podium prediction contest

**What:** before each race, logged-in users pick the top three per gender on one distance; after results, points for exact position and for podium presence; a season leaderboard; a share card for a perfect podium.

**Method:** `picks(user_id, event_id, distance, gender, athlete_ids[3], created_at)` locked at the event's start time; scoring job on results arrival; leaderboard cached.

**Why it matters:** engagement between races; a natural supporter perk (early picks, badge); lighter than a fantasy league.

**Guardrails:** no money involved; picks are private until lock; claimed riders may pick themselves.

**Acceptance:** picks close at start time in Lisbon time; scoring runs within 10 minutes of results; leaderboard ties broken by earliest pick.
