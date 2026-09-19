# Granfondo Portugal Ranking

[![CI](https://github.com/tiagocavaco/granfondo-ranking/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/tiagocavaco/granfondo-ranking/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

Unofficial season ranking tracker for the Portuguese granfondo cycling series. The series runs several road cycling events per year across Portugal (Granfondo, Mediofondo, Minifondo distances) but publishes no cross-event standings — this site scrapes each event's results and computes athlete and team rankings for the full season.

**[tiagocavaco.github.io/granfondo-ranking](https://tiagocavaco.github.io/granfondo-ranking/)**

## Features

- Season athlete and team standings
- Per-event results with search and distance/gender filters
- Athlete profiles with career history and performance chart
- Team profiles with member list and season breakdown
- Head-to-head athlete comparison
- Start lists and finish predictions for upcoming events

## Tech stack

![React](https://img.shields.io/badge/React-20232A?style=flat&logo=react&logoColor=61DAFB)
![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=flat&logo=typescript&logoColor=white)
![Vite](https://img.shields.io/badge/Vite-646CFF?style=flat&logo=vite&logoColor=white)
![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-06B6D4?style=flat&logo=tailwindcss&logoColor=white)
![SQLite](https://img.shields.io/badge/SQLite_WASM-003B57?style=flat&logo=sqlite&logoColor=white)
![GitHub Pages](https://img.shields.io/badge/GitHub_Pages-222222?style=flat&logo=github&logoColor=white)

Results are scraped into an AES-256-GCM encrypted SQLite database committed to git. The frontend decrypts and queries it in the browser via WASM (sql.js + Web Crypto) — no backend.

## Setup

```bash
npm install
```

Add `frontend/.env.local` (key from repo owner):

```
VITE_DATA_KEY=<64 hex chars>
```

## Scripts

| Command | What it does |
|---------|-------------|
| `npm run dev` | Frontend dev server at `localhost:5173/granfondo-ranking/` |
| `npm run build` | Production build into `frontend/dist/` (needs `VITE_DATA_KEY`) |
| `npm test` | Unit tests across all packages |
| `npm run scrape` | Fetch and rebuild the database (`scraper/.env` needs `DATA_KEY`) |

## E2E tests

```bash
cd frontend
VITE_DATA_KEY=<key> npm run build
npm run test:e2e -- --project=desktop
npm run test:e2e -- --project=mobile
```

## Packages

| Package | Purpose |
|---------|---------|
| `database` | Schema, types, normalisation |
| `utils` | Scoring formulas |
| `api` | Query logic, environment-agnostic |
| `scraper` | Scrapes results, builds and encrypts the DB |
| `frontend` | React + Vite SPA |

## Docs

[`docs/`](docs/) has architecture analysis, issue tracker, improvement plans, and feature specs.

## License

[MIT](LICENSE). Race results are public data from StopAndGo and apedalar.pt.
