# Barkie — public marketing site

The public marketing site for barkie.co.za: a 3-page static site (Home,
Pricing, Materials Guide) served by a small Express app, plus one API
endpoint for the "notify me" email signup (SQLite, no external deps).

- `public/index.html` — Home. Hero, feature highlights, and a live usage
  stats strip.
- `public/pricing.html` — Pricing. Three plan cards (R25/R45/R70) loaded
  live from the API.
- `public/materials.html` — Materials Guide. A 3-tab page (Selector,
  All materials, Head to head) built on a hand-curated, static
  28-material dataset in `public/js/materials-data.js` — no API call.

Home and Pricing are **not fully self-contained**: they call two public,
read-only endpoints on `platform/api` at runtime —
`GET /api/public/stats` (Home's stats strip) and `GET /api/public/plans`
(Pricing's plan cards). This `landing/` server does not proxy those
calls, so running `landing/` alone in dev will show the stats strip
hidden and the pricing grid showing its "couldn't load" fallback — that
is expected graceful degradation, not a bug. In production both sides
must be deployed together (see "Deploying to the VPS" below).

## Run locally

```
npm install
cp env.sample .env   # optional — defaults to PORT=4100 if skipped
npm start
```

Visit http://localhost:4100. To see live stats/pricing data instead of
the fallback states, also run `platform/api` locally (see its own
README) — the two servers are independent processes and this one does
not proxy to it.

## Deploying to the VPS

This is a separate, independent process from lapanza3d — it does not read
or write anything in that codebase. Drop this folder into its own
directory on the VPS (sibling to lapanza3d, not inside it), then:

```
npm install --omit=dev
PORT=4100 node server.js
```

Run it under whatever process manager the VPS already uses for lapanza3d's
admin process (pm2, systemd, etc.) so it survives reboots, then point the
barkie.co.za Nginx/reverse-proxy vhost at `http://127.0.0.1:4100` (or
whichever port you choose). Because Home and Pricing depend on
`platform/api`'s two public endpoints, deploy `platform/api` alongside
this site — deploying only one side leaves the other showing broken or
hidden state.

Signups are stored in `data/signups.db` (SQLite, gitignored) — copy that
file off the server periodically if you want a backup outside of it.

## What this is not

This is the real public marketing site, not the authenticated Barkie SaaS
app itself (that lives in `platform/frontend`, served under `/app`). See
`docs/superpowers/specs/2026-09-09-public-site-design.md` in the parent
repo for scope and design notes.
