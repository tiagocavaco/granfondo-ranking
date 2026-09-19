# 04 — Organiser Offer

A one-page offer for race organisers and timing companies. Written in
English here; send in Portuguese. Replace the bracketed parts. Keep the email
under 200 words and put the live link in the first paragraph.

---

## Email

**Subject:** [Race name] — favourites and rankings for your riders

Olá [name],

I run Granfondo Portugal ([site URL]), an independent site that turns the
results of the Portuguese granfondo series into season rankings, athlete
profiles and pre-race predictions. Your [race name] is already on it:
[link to the event page], and here are the favourites for [date]:
[link to predictions page].

I would like to offer you three things for [race name]:

1. **Favourites pack**, 48 hours before the race: images of the top
   favourites per category and distance, ready for Instagram and Facebook.
2. **Results widget** for your site: the live category podiums and the series
   ranking after the race, in your colours, one line of HTML.
3. **Post-race report**: podiums, records, participation by region and
   nationality, year-on-year growth. PDF and images, within 24 hours of
   official results.

The first race is free in exchange for a link from your event page. After
that it is €[100] per event or €[400] per season for all your events.

Everything is built from your official results; nothing is published before
you publish. Happy to show you a mock with your branding this week.

Cumprimentos,
[name]
[phone]

---

## One-page attachment

**Granfondo Portugal — services for organisers**

*What the site is*
An independent results and ranking platform for the Portuguese granfondo
series. 88 events since 2023, 23,000 athletes, 74,000 results, season
rankings per distance and gender, team rankings, athlete profiles with
career history, head-to-head comparison, and pre-race predictions.

*Why it helps you*
Riders check their result and their standing after every race. When your
event page links to its ranking and predictions, that traffic and attention
attach to your race. The predictions give your social channels content in
the week before the race, when registrations close.

*Packages*

| Package | What you get | Price |
|---------|--------------|-------|
| Favourites | Pre-race favourites images per distance and category, 48 h before | €[50] / event |
| Widget | Embeddable series ranking and category podiums, your colours, updated after each race | €[30] / month or €[50] / event |
| Report | Post-race PDF and images: podiums, records, participation breakdown, growth | €[100] / event |
| Season | All of the above for every one of your events, plus a data-quality check of your start list (name and team inconsistencies) | €[400] / season |

*Trial*
First event free in exchange for a link from your event page to its ranking.

*How it works*
No integration needed. Send the start list link two weeks before; results are
taken from your timing provider's official publication. Widgets are a single
HTML line. Images are delivered by email or a shared folder.

*Data*
Only official, already-published results are used. Riders can request a
correction or removal at any time. No advertising on the widget.

*Contact*
[name] · [email] · [phone] · [site URL]

---

## Who to send it to first

From `scraper/src/config.ts` `OFFICIAL_EVENT_URLS`, ordered by events per season:

| Organiser | Events on the calendar | Timing |
|-----------|------------------------|--------|
| Cabreira Solutions | Torres Vedras, Médio Tejo, Lousã, Terras de Basto, Paredes, Serra d'Ossa, Portimão, Aveiro Spring Classic | StopAndGo + own registration lists |
| BikeService | Viana, EuroBEC, Gerês, Bragança, Monção e Melgaço, Ourém-Fátima, Douro | StopAndGo |
| Figueira Champions Classic | one event, largest field in the series | StopAndGo |
| Granfondo Coimbra Region | two events (road + time trial) | StopAndGo |
| Algarve Granfondo, Serra da Estrela, Tavira, São Mamede, 5 Quinas | one event each | StopAndGo / apedalar |

StopAndGo itself is a separate conversation: a partnership where the site
consumes a stable API instead of scraping, in exchange for a "results by
StopAndGo" credit, removes the biggest operational risk in the engine plan.
