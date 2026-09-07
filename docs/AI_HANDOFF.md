# AI Handoff Brief — Barkie

**If you are an AI assistant picking up this project cold, read this file
first.** It orients you fast; it is not the full reference. Once you have
repo access, read the spec/plan docs referenced below for full detail —
this file exists so you don't have to read all of them before knowing
where to start or what not to break.

---

## What this is

A multi-tenant SaaS platform for small 3D-printing businesses (customers,
printers, filament, labour, consumables, job costing, quotes/invoices).
"Barkie" is a working title — final name/domain not yet confirmed (SRS
§10). Single owner (Johan Barkhuizen), building with AI-assisted tooling
(Claude Code), no team.

**Repo:** `github.com/jbarkhuizen/Lapanza3dMNGT`, branch `master` (no PR
workflow so far — merges go straight in, via git worktrees + subagent-driven
task review during development)
**Live site:** https://barkie.co.za — the `landing/` coming-soon page is
now live (deployed 2026-09-07). `platform/api/` is still not deployed
anywhere.
**Backlog board:** https://claude.ai/code/artifact/43333269-4f57-4dd3-8e44-c72367c2525d
— live, shared, database-backed. Add items here as you find them, the same
way lapanza3d's admin Todo/Backlog page works (this board's categories/
statuses/priorities deliberately match it: `Bug`/`Feature`/`Enhancement`/
`Tech Debt`; `Backlog`/`In Progress`/`Done`/`Won't Fix`/`Claude Fix`/
`Discarded`/`Deferred`; `Critical`/`High`/`Medium`/`Low`).

## Start here, in order

1. [`README.md`](../README.md) — repo map (what's in each folder)
2. [`docs/superpowers/specs/2026-09-06-barkie-platform-phase1-design.md`](superpowers/specs/2026-09-06-barkie-platform-phase1-design.md) — the architecture: stack, multi-tenancy model, Phase 1 data model, phase roadmap
3. [`docs/superpowers/plans/2026-09-06-platform-foundation.md`](superpowers/plans/2026-09-06-platform-foundation.md) — exactly what was built so far, task by task (useful for understanding *why* the code looks the way it does)
4. [`platform/api/README.md`](../platform/api/README.md) — local dev setup for the API
5. [`landing/README.md`](../landing/README.md) — local dev + deploy notes for the temp landing page
6. The backlog board (link above) — what's known-incomplete, prioritized

## Current state (as of this handoff, 2026-09-07)

| Item | State |
|---|---|
| **barkie.co.za (live domain)** | Live: `landing/` coming-soon page, deployed 2026-09-07. Runs as systemd service `barkie-landing.service` on the VPS (`/opt/barkie/app`, `node server.js`, port 4100, `User=deploy`, `Restart=on-failure`), nginx reverse-proxies `barkie.co.za`/`www.barkie.co.za` to it (`/etc/nginx/conf.d/barkie.conf`) — same pattern as `lapanza-admin.service`. Existing Certbot SSL cert untouched. Old placeholder backed up at `/opt/barkie/backup-2026-09-07/` on the VPS. |
| **`landing/`** | Deployed and verified end-to-end in production (page renders, dark mode, `/api/notify` signup tested live then cleaned up). Deploy access: `ssh -i ~/.ssh/lapanza_vps_deploy deploy@41.222.36.147` (same key as lapanza3d; `deploy` has passwordless sudo on this box). To redeploy after a code change: `tar` the `landing/` folder (excluding `node_modules`/`data`/`.env`), `scp` it up, extract into `/opt/barkie/app`, `npm install --omit=dev`, `sudo systemctl restart barkie-landing`. |
| **`platform/api/`** | Foundation + Reference Data Modules both merged to `master`, pushed to GitHub. Auth (register/verify/login/logout/session), tenant isolation (`tenantScope`), Customer/Printer/PrinterPreset/PrinterMaintenanceLog/Filament/LabourStep/Consumable CRUD, rate limiting. 58 tests passing, `tsc --noEmit` clean. **Not deployed anywhere** — only exists as source + whatever's running on the local dev machine. |
| **Frontend** | Does not exist yet. The API has no UI to log into outside of raw HTTP calls / the test suite. This is the next real gap — see backlog item "Phase 1: Subscriber dashboard frontend". |
| **Database** | PostgreSQL 18, local dev only (`barkie_dev`/`barkie_test`, role `barkie`). No production database exists. |
| **Domain modules** | `Customer`, `Printer` (+ `PrinterPreset`, `PrinterMaintenanceLog`), `Filament`, `LabourStep`, `Consumable` all exist and are tenant-isolated. Costing engine and quotes/invoices — not started (SRS §8.3's "non-negotiable core", next up). |
| **Billing/subscription** | Phase 2, not started. Needs PayFast + PayPal merchant credentials as a dependency. |

## Non-obvious things that will bite you if you don't know them

- **The SRS's stated stack (PHP/Laravel+MySQL) was superseded before any code was written.** It was chosen only because a cPanel screenshot showed no Node option — the real infra is a VPS with full root control, already running lapanza3d's own Node/Express app. The Phase 1 design spec explicitly documents this supersession. If you're ever asked to "follow the SRS exactly" on tech stack, flag this — functional requirements (SRS §3-5, §9) are still authoritative; §6 (tech stack) is not.
- **This is a separate repo/codebase from lapanza3d, on purpose, sharing only the same VPS.** `landing/`'s design tokens (Fraunces/DM Sans, terracotta/charcoal/cream, neubrutalist offset shadows) were deliberately copied from `lapanza-3d-fullsite`'s `src/styles/main.css`, not imported/shared — editing one never touches the other. Never read from or write to the lapanza3d project's own repo/directory when working on Barkie; it's a completely different business's codebase that happens to live on the same machine (`D:\Projects\Lapanza 3d Creations\lapanza-3d-fullsite V1 - Martin`) and, eventually, the same VPS.
- **`prisma migrate dev` needs the `barkie` Postgres role to have `CREATEDB`** (for its shadow database). This was missing initially, granted mid-build (`ALTER ROLE barkie CREATEDB;`) — if you're on a fresh machine and hit Prisma error P3014, that's why. `platform/api/README.md` covers the one-time setup.
- **`node_modules/.bin/prisma` is a POSIX shell shim, not JavaScript — running it via `node` directly fails on Windows** (where this project is developed). Use the `migrate:test` npm script (calls `node_modules/prisma/build/index.js` directly) instead of hand-rolling a `node node_modules/.bin/prisma ...` command.
- **`npm test` needs Node 21.7+/22+** — its `--test` glob support for `tests/**/*.test.ts` isn't in Node 20. The glob is quoted in `package.json` specifically so a POSIX shell without `globstar` can't partially pre-expand it before Node's own expansion runs (a latent trap: an unquoted glob would silently narrow what runs if a `tests/helpers/*.test.ts` file were ever added).
- **Every tenant-scoped table must be queried ONLY through `tenantScope()`** (`platform/api/src/db/scoped.ts`), never the raw Prisma client. This is the whole isolation model for a multi-tenant app with one login per subscriber (Phase 1) — bypassing it for convenience in a new route is how cross-tenant data leaks happen. `tenantScope` itself throws on a falsy `tenantId`, so a route that forgets `requireTenantAuth` fails loudly instead of silently returning every tenant's data.
- **Login enforces email verification** (`emailVerifiedAt` must be set, else 403) — this was built, then initially NOT wired up (caught in final review, fixed before merge). If you're extending auth (e.g. a platform-admin login), don't copy the pre-fix version of the login handler from git history by mistake — copy the current `platform/api/src/routes/auth.ts`.
- **A security-warning hook blocks any Write/Edit whose content contains the literal substring `innerHTML`**, even safely-escaped usage. Build dynamic DOM content with `createElement`/`textContent`/`appendChild` from the start (see the backlog artifact's own script for the pattern) rather than template-string + `innerHTML` assignment.
- **`.env` and `.env.test` are never committed** (`platform/api/.gitignore`) — copy `env.sample`/`env.test.sample` yourself per the API README. A fresh `git clone` + `npm install` needs `npx prisma generate` run explicitly if `npm install`'s postinstall scripts get blocked by `npm`'s `allow-scripts` gate (approve `@prisma/client`, `@prisma/engines`, `esbuild`, `prisma` — already recorded in `platform/api/package.json`'s `allowScripts` field for a fresh clone, but a different npm version/config might still prompt).
- **The backlog board is a Claude Artifact, not a page inside this codebase.** It has its own database (separate from Postgres), lives at the URL in this doc and the root README, and updates immediately for every viewer. Add real backlog items there when you find something worth tracking rather than only mentioning it in chat — same working pattern as lapanza3d's `/api/todos` admin page.

## What to do next (roughly, per the backlog's priorities)

1. Build the costing engine and quotes/invoices — SRS §8.3 calls this the non-negotiable core, and all its inputs (filament, printers, labour, consumables) now exist.
2. Decide on and build the subscriber dashboard frontend (nothing exists yet — first real UI work; the API has no UI to log into outside raw HTTP calls / tests).
3. Eventually deploy `platform/api/` to the VPS alongside the landing page, once there's a frontend worth serving.

## Reusable pattern for adding a new tenant-scoped resource

The "Reference Data Modules" plan (printers, filament, labour, consumables)
established the repeatable shape for a new tenant-scoped CRUD resource:

1. Prisma model with `tenantId` (and, for anything nested under another
   resource like a printer, that parent's id too) — every `DateTime` field
   gets `@db.Timestamptz(3)` from the start.
2. A resource group added to `tenantScope()` in `src/db/scoped.ts` —
   `findMany`/`findById`/`create`/`update`, `update()` always stripping
   `tenantId` (and any parent id) from `data` before the Prisma call.
3. A route file behind `requireTenantAuth` — for a nested resource, a
   `requireOwnedPrinter`-style helper (verify the parent belongs to the
   calling tenant) called FIRST in every handler, before body validation.
4. `requireTenantAuth` is idempotent (`if (req.tenantId) return next();`)
   — every tenant-scoped router still mounts it, but it only does the real
   DB session lookup once per request regardless of how many routers a
   request falls through. When writing a new resource's "requires auth"
   test, build a minimal single-router app (just `express.json()` +
   `cookieParser()` + the one router) rather than the full `buildApp()` —
   otherwise the test can pass even if that router's own auth check is
   deleted, satisfied by an earlier-mounted router instead.
5. Add the table to `resetTestDatabase()` in FK-safe order (children
   before parents).
6. Add a wrapper-level cross-tenant isolation test to
   `tests/tenant-isolation.test.ts`, not just a route-level 404 test —
   the wrapper needs to be provably safe on its own, since the costing
   engine (next up) will call these wrappers directly, not just through
   HTTP routes.

Full detail on all of the above — and everything else not urgent enough to
put here — lives in the backlog board, not this file. Check it before
assuming something is undocumented.
