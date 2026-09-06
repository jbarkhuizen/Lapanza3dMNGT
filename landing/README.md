# Barkie — temp landing page

Self-contained holding page for barkie.co.za. Static content + one small
API endpoint for the "notify me" email signup (SQLite, no external deps).

## Run locally

```
npm install
cp env.sample .env   # optional — defaults to PORT=4100 if skipped
npm start
```

Visit http://localhost:4100.

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
whichever port you choose).

Signups are stored in `data/signups.db` (SQLite, gitignored) — copy that
file off the server periodically if you want a backup outside of it.

## What this is not

This is the temporary "coming soon" page only — not the Barkie SaaS
platform itself. See `docs/superpowers/specs/2026-09-06-barkie-landing-page-design.md`
in the parent repo for scope and design notes.
