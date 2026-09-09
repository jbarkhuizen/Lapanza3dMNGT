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
**Live site:** https://barkie.co.za — `landing/` (coming-soon page, at `/`),
`platform/api/` (at `/api/`), and `platform/frontend/` (at `/app/`) are all
deployed and live as of 2026-09-07, sharing one nginx server block and
Certbot cert, path-routed (no subdomains).
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
5. [`landing/README.md`](../landing/README.md) — local dev + deploy notes for the public marketing site
6. The backlog board (link above) — what's known-incomplete, prioritized

## Current state (as of this handoff, 2026-09-09)

| Item | State |
|---|---|
| **barkie.co.za (live domain)** | **Live as of 2026-09-09**: the real 3-page public marketing site (Home, Pricing, Materials Guide) replacing the old coming-soon page — deployed and smoke-tested in production (see `docs/superpowers/specs/2026-09-09-public-site-design.md` for the design). Same infrastructure as before: systemd `barkie-landing.service` on the VPS (`/opt/barkie/app`, `node server.js`, port 4100, `User=deploy`, `Restart=on-failure`), nginx reverse-proxy (`/etc/nginx/conf.d/barkie.conf`, `barkie.co.za`/`www.barkie.co.za` → it) — only the static content changed. Existing Certbot SSL cert untouched. |
| **`landing/`** | **Live in production.** 3 pages: `public/index.html` (Home — hero + live usage stats strip, confirmed showing real counts from `barkie_prod`), `public/pricing.html` (Pricing — 3 plan cards, live R25/R45/R70 from the DB), `public/materials.html` (Materials Guide — 3-tab Selector/All materials/Head-to-head, 28-material browsable library, Selector tab confirmed live with the corrected all-toggles-off default). Home and Pricing are **not self-contained** — they fetch `platform/api`'s two public, read-only endpoints at runtime (`GET /api/public/stats`, `GET /api/public/plans`, both deployed and verified live); if you ever deploy `landing/` alone without `platform/api` also being current, the stats strip/pricing grid show hidden/fallback state instead of erroring. Materials Guide has no such dependency — its dataset is static, hand-curated content in `landing/public/js/materials-data.js` (28 materials, South African retail prices) that will need re-verification if filament prices drift meaningfully over time; it is not sourced from any API or database. Deploy access: `ssh -i ~/.ssh/lapanza_vps_deploy deploy@41.222.36.147` (same key as lapanza3d; `deploy` has passwordless sudo on this box). To redeploy after a code change: `tar` the `landing/` folder (excluding `node_modules`/`data`/`.env`), `scp` it up, extract into `/opt/barkie/app`, `npm install --omit=dev`, `sudo systemctl restart barkie-landing`. |
| **`platform/api/`** | Foundation + Reference Data Modules + Costing Engine + Company Profile + Quotes + Invoices + PDF generation + **real email sending** all merged to `master`, pushed to GitHub, **and deployed live** at `https://barkie.co.za/api/` (systemd `barkie-api.service`, port 4200, not directly internet-reachable — only via the nginx reverse proxy). Auth, tenant isolation (`tenantScope`), Customer/Printer/PrinterPreset/PrinterMaintenanceLog/Filament/LabourStep/Consumable CRUD, `CostingTemplate` (money-correct, Decimal-based), Company Profile (VAT/banking/address/numbering config), Quotes (draft/sent/accepted/expired), Invoices (unpaid/partially_paid/paid/overdue, quote-to-invoice conversion), `POST /api/quotes/:id/send` + `POST /api/invoices/:id/send` (pdfkit-generated PDF, attached to a real email), rate limiting. 161 tests passing, `tsc --noEmit` clean. **Email is live in production as of 2026-09-08** — see "Real SMTP email sending" below. |
| **Frontend** | **`platform/frontend/` exists and is deployed live** at `https://barkie.co.za/app/` (React + Vite + TS + Tailwind + React Router + React Query SPA, static build served by nginx). **Every module now has a full UI**, and every planned Phase 1 frontend capability is built — auth, app shell, every reference-data module, Costing Templates, Quotes + Invoices (status-transition workflows, dual-mode line items, quote-to-invoice conversion, invoice payment recording), and a **"Send to Customer" button** on both detail pages (downloads the generated PDF, shows a dev-mode-aware confirmation). 178 tests passing. **Read the "Frontend form-data gotcha" note below before building any more forms** — this discipline has caught 8 real bugs across 6 phases, including a real accounting bug in invoice payment recording (see below). |
| **Database** | PostgreSQL 16, both local dev (`barkie_dev`/`barkie_test` on this machine, role `barkie`) **and production** (`barkie_prod` on the VPS, PostgreSQL installed 2026-09-07, role `barkie`, password in `/opt/barkie/api/.env` on the VPS only — never committed). All 13 migrations applied to production (no schema change in the PDF+email phase). |
| **Domain modules** | `Customer`, `Printer` (+ `PrinterPreset`, `PrinterMaintenanceLog`), `Filament`, `LabourStep`, `Consumable`, `CostingTemplate` (+ `CostingLabourLine`, `CostingConsumableLine`), `Quote` (+ `QuoteLineItem`), `Invoice` (+ `InvoiceLineItem`), `TenantSequence` (numbering) all exist and are tenant-isolated. SRS §8.3's non-negotiable core is now fully built, **with PDF/email — the entire Phase 1 platform (per the original phased design spec) is now live end to end.** |
| **PDF generation** | `platform/api/src/documents/generateDocumentPdf.ts` (pdfkit). No logo embedding (deliberate — `logoUrl` is an external tenant-supplied URL with no upload pipeline behind it; fetching it server-side would be an SSRF surface for no real benefit). No tenant email in the header either (deliberate — `companyProfile.email` is actually `Tenant.email`, the login identifier; printing it on customer-facing documents would leak half a credential pair). VAT is always the hardcoded label `"VAT (15%)"`, never a stored rate. This file went through **4 review cycles** on pagination alone (wrapped line-item descriptions, the totals-block "Balance Due" label wrapping in too narrow a column, and a regression where fixing the totals column narrowed the Qty column enough to reopen the same bug) — if you touch the column-width constants (`LEFT`/`RIGHT`/`COL_QTY`/`COL_UNIT_PRICE`/`COL_TOTAL`) or the manual `doc.y` reassignment in `drawTableRow`/`drawTotalsLine`, re-read that history in `docs/superpowers/plans/2026-09-08-pdf-email.md` first — it's a genuinely easy bug class to reintroduce. Known residual gaps (non-blocking, filed to backlog #55): the Total/line-total column doesn't measure its own wrap risk for the Decimal(12,2) ceiling value; `computeRowContentHeight` only measures the description cell, not all four. |
| **Real SMTP email sending** | **Live in production as of 2026-09-08.** `platform/api/src/lib/mailer.ts` wraps `nodemailer`'s Gmail transport behind a small, testable `{ isConfigured(), sendMail() }` interface — exported as a plain object (not raw functions) specifically so tests can `mock.method()` its properties, since ESM named function exports are live bindings and can't be monkey-patched. `sendVerificationEmail()` (`src/auth/email.ts`) and `sendDocumentEmail()` (`src/documents/sendDocumentEmail.ts`) both gate purely on whether `SMTP_USER`/`SMTP_APP_PASSWORD` are set (`mailer.isConfigured()`) — **never** an `NODE_ENV` check. Unset in local dev/`.env.test`/CI always (so nothing there ever risks a real send); set only in the VPS's `/opt/barkie/api/.env` (never committed): `SMTP_USER=lapanzaonline@gmail.com`, `SMTP_APP_PASSWORD=<app password>`, `SMTP_FROM_NAME=Barkie`. Sending account is a Gmail App Password (same Google account used elsewhere by this owner), not a dedicated transactional provider — fine at current volume, revisit if that changes. `POST /api/quotes|invoices/:id/send`'s `devMode` response field now reflects reality (`!mailer.isConfigured()`) instead of a hardcoded `true`; **the frontend reads it** (`QuoteDetailPage.tsx`/`InvoiceDetailPage.tsx`) to show the real "Emailed to X." message instead of dev-mode wording once SMTP is configured — if you ever see dev-mode wording in production, check the VPS `.env` first. Document emails set `Reply-To` to the tenant's own account email and include the tenant's business name in the subject/body, so a customer's reply reaches the print shop, not the platform's Gmail. `POST /api/auth/register` wraps its verification-email send in try/catch (tenant row is already committed by that point) — a transient SMTP failure logs server-side and still returns `201`, rather than 500ing and stranding an unverifiable account. **`POST /api/auth/resend-verification` now exists** (backlog item #001, closed 2026-09-08) — mints a fresh token + fresh 24h expiry (invalidating the old one), 404 for an unknown email, 400 if already verified. `LoginPage` shows a "Resend verification email" button when login fails with the existing 403 "not verified" error. Smoke-tested live 2026-09-08: a real quote (with PDF attachment) sent successfully to a real inbox, confirmed received; separately, a tenant's token was deliberately back-dated to simulate a real expired link, confirmed rejected, resent, and the fresh token verified successfully — the actual backlog scenario, proven end to end. |
| **Billing/subscription** | Phase 2, **code complete, reviewed, merged, deployed live, and credentials configured** as of 2026-09-09 — see "Billing/subscription" section below. **PayFast is smoke-tested end to end** (checkout → webhook → active, cancel → provider-side cancel, trial-expiry self-heal — all 3 checks passed, one real Critical bug found and fixed live in the process, see below). **PayPal has credentials configured but has NOT been smoke-tested** — do that before trusting it. `requireActiveSubscription` is live in production, gating every write (POST/PATCH/DELETE) on every resource router behind an active subscription — GETs are unaffected. The one existing prod tenant (`lapanzaonline@gmail.com`) has no subscription row and is therefore currently **read-only** in production (deliberate — the owner chose to check out for real rather than get a manually-granted subscription). |
| **Admin center** | **Code complete, reviewed 2026-09-09 — implements backlog #26, now closed.** Server-rendered admin panel inside `platform/api`, mounted at `/api/admin` (path-scoped, deliberately mounted right after `createAuthRouter()` — see the mount-order note below). First real use of the `PlatformAdmin` model and `Session.subjectType = 'platform_admin'`, both unused scaffolding since the very first migration. Pages: tenant list, tenant detail (edit business/contact/email; view-only quotes/invoices; grant/adjust/cancel subscription — admin-granted rows use `paymentProvider: 'manual'`/`providerSubscriptionId: null`, which `billing.ts`'s existing tenant-facing cancel route already handles safely with zero code changes), and Plan management (edit price/name/sortOrder/active, create new). Links out to `landing/`'s existing Basic-Auth-gated `/admin/signups` view rather than duplicating it. No client JS anywhere — plain forms, POST-then-redirect. Smoke-tested locally end to end (login, tenant list/detail, full grant→adjust→cancel round-trip, plan edit/create) against the real dev DB before merge. **Not yet deployed to the VPS** — see "Deploying" below for the one-time bootstrap step required after the first deploy. |

## Billing/subscription (Phase 2 — deployed 2026-09-09, credentials not yet configured)

Three plan tiers (Tier 1 = R25, Tier 2 = R45, Tier 3 = R70/month), stored in
the `Plan` table (not hardcoded — editable at `/api/admin/plans` now that
the admin center exists, no more direct DB `UPDATE` needed; `prisma/seed.ts`
is deliberately create-only so it never overwrites a manual price edit on
re-run). 14-day free trial, card
required upfront at signup, auto-charged at trial end — no usage-limit
enforcement yet (tiers are pricing/marketing only for now, per the design
spec's explicit scope cut). Two payment providers, PayFast and PayPal,
behind a shared `PaymentProvider` interface (`platform/api/src/billing/`).

**Build history worth knowing about, if you're ever asked to touch this
code:** this feature went through an unusually deep review cycle —
7 tasks, then a 3-task addendum after the first whole-branch review found 3
Critical financial-correctness bugs invisible to any single task's review
(webhooks not persisting the provider's subscription id; cancel never
reaching the provider; trial expiry never enforced), then TWO further
whole-branch reviews after that, each finding more cross-task-interaction
bugs (a stale/delayed PayFast webhook could hijack a resubscribed tenant's
row; PayFast's ITN signature verification used the wrong rule and would
have rejected every real webhook; PayFast was charging the full month
immediately instead of R0 for the trial). All fixed and re-verified. The
lesson that generalizes: **provider-adapter code (anything calling a
third-party payment API) needs its exact contract confirmed against real
documentation or reference source, not inferred from prose** — every one of
the serious late-stage bugs was a wrong assumption about PayFast's API
shape, not a logic error in Barkie's own code. If you extend either
adapter, verify claims about the provider's API via WebSearch against
official docs/SDKs before writing code, the way `payfastEncode`'s
PHP-`urlencode`-parity fix and the ITN-vs-checkout signature-rule split
were both verified against PayFast's own `payfast-php-sdk` source, not
guessed.

**What's live vs. not:**
- Code, schema, migrations, and the `Plan` seed are all deployed to
  `barkie_prod` (migrations `20260908163249_add_billing_plan_subscription`
  and `20260909091821_add_subscription_past_due_since` applied 2026-09-09).
- `requireActiveSubscription` middleware is wired into all 11 resource
  routers — this is LIVE now, not a future switch to flip. Any tenant with
  no subscription (or a `lapsed`/`canceled`/grace-expired `past_due` one)
  gets 402 on any non-GET request. GETs are always allowed regardless.
- **PayFast/PayPal credentials are NOT set on the VPS** — `PAYFAST_MERCHANT_ID`,
  `PAYFAST_MERCHANT_KEY`, `PAYFAST_PASSPHRASE`, `PAYPAL_CLIENT_ID`,
  `PAYPAL_CLIENT_SECRET`, `PAYPAL_WEBHOOK_ID`, and `PAYMENTS_LIVE` are all
  unset in `/opt/barkie/api/.env`. `env.ts` treats them as optional (the
  service boots fine without them), but `POST /api/billing/checkout` will
  error against an empty PayFast merchant ID until they're added.
- **Next step to make billing actually usable**: get real credentials from
  the owner (sandbox first, recommended — do the full sandbox smoke test
  below before flipping `PAYMENTS_LIVE=true`), add them to
  `/opt/barkie/api/.env` on the VPS, `sudo systemctl restart barkie-api`,
  then run the three checks below before trusting it with real money.
- For PayPal specifically, `PAYPAL_WEBHOOK_ID` requires a one-time manual
  step in PayPal's own developer dashboard (register the webhook URL —
  `https://barkie.co.za/api/webhooks/paypal` — and copy the ID it assigns)
  before the credential set is complete.

**Sandbox smoke test — run 2026-09-09, PayFast side, all 3 checks passed**
(nothing in the automated test suite can substitute for this — it's the
only way to regression-test the webhook-correlation/cancel/trial-expiry
fixes against a real provider). PayFast sandbox credentials and PayPal
sandbox credentials (client ID/secret + `PAYPAL_WEBHOOK_ID`) are all
configured in `/opt/barkie/api/.env` now. The three checks:
1. Complete a real sandbox checkout end to end and confirm the webhook
   lands — `Subscription.status` becomes `active` and
   `providerSubscriptionId` gets populated in the DB. **Passed for PayFast.**
   Real finding: PayFast's R0 initial-payment ITN is a genuine `COMPLETE`
   event, so status jumps straight from nothing to `active` — it never
   passes through `trialing` for PayFast. (PayPal's checkout was NOT yet
   smoke-tested — do this before trusting the PayPal path.)
2. Cancel from Barkie and confirm the sandbox provider shows the
   subscription as canceled on ITS side too, not just locally.
   **Found a real Critical bug on the first attempt**: `cancelSubscription`
   got a genuine `401 Merchant authorization failed` from PayFast's
   sandbox — the code was signing PayFast's subscription-management API
   (cancel/pause/update/fetch) with the CHECKOUT signature rule (skip
   blanks, append passphrase last, no `version` field signed, no
   timezone offset on the timestamp), which is the wrong rule for that
   API family. Fixed against PayFast's official `payfast-php-sdk` source
   (`lib/Auth.php`'s `generateApiSignature`, `lib/Request.php`) — the
   management API sorts ALL fields alphabetically including the
   passphrase, signs `merchant-id` + `version` + `timestamp` together,
   and needs an offset-bearing timestamp (`+0200` for SAST, PHP's
   `date("Y-m-d\TH:i:sO")`). Fixed, independently reviewed, redeployed,
   re-tested — cancel now succeeds. **This is exactly the kind of bug this
   3-check smoke test exists to catch — no amount of code review or unit
   testing against a mocked `fetch` would have surfaced it**, since the
   mock never validates the request against PayFast's real backend.
3. Manually back-date a `trialing` subscription's `trialEndsAt` into the
   past, confirm the next mutating request 402s and the row flips to
   `lapsed` in the database. **Passed** (simulated directly in the DB,
   since a real PayFast checkout never produces a `trialing` row per the
   finding in check 1 — this check exercises Barkie's own middleware
   logic, not provider behavior, so DB simulation is the correct test).

**Still to do**: the same 3-check smoke test against PayPal specifically
(never run) — PayPal's checkout/activation/cancel code paths are
independently reviewed and unit-tested but have NOT been proven against a
real PayPal sandbox call the way PayFast's now has, and PayFast's own
cancel bug shows that class of gap is real. Do this before trusting
PayPal in production. Also worth deciding: given PayFast's ITN skips
`trialing` entirely and goes straight to `active`, is the frontend's
trial-countdown banner ever actually shown to a PayFast tenant, and does
that matter (see backlog #061's related note)?

**Known non-blocking gaps** (filed to the backlog board as items #060-064):
PayPal doesn't validate `subscription.id` exists in the checkout response
(#060); the AppShell trial/past-due/lapsed banner has zero test coverage
(#061); a resurrected-orphan risk when a PayFast trial's first ITN is lost
and the tenant resubscribes before it ever arrives — the old subscription
becomes permanently uncancelable from Barkie, needs a product decision on
whether to block that resubscribe path or accept the risk (#062); no
update-payment-method flow exists (a `past_due` tenant's only recovery is
cancel-then-resubscribe, which the banner/error copy doesn't make clear)
(#063); a grab-bag of 7 small hygiene items — dead constant, unguarded
lookup, inconsistent fetch injection between adapters, no unique index on
`providerSubscriptionId`, PayPal signature verification against a
re-serialized body instead of raw bytes, `payfastEncode`'s test missing
2 of 6 special characters, an overstated code comment (#064).

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
- **`tenantScope()` is bypassed in exactly one place on purpose: `POST /api/quotes/:id/convert-to-invoice`** (`platform/api/src/routes/quotes.ts`). It needs two dependent atomic writes (a `TenantSequence` increment + an `Invoice` create) inside one `prisma.$transaction`, which the per-call `tenantScope()` closures can't wrap together — so that one handler calls `prisma` directly, with every query inside the transaction filtering by `tenantId` explicitly by hand. If you add another multi-step atomic write, follow this pattern rather than inventing a new one, and double-check every `tx.*` call still carries `tenantId`.
- **Minting a `TenantSequence` number before validating the rest of the request body burns the number on any later validation failure** (no gap gets reused — Postgres sequences and this integer counter both only go up). `POST /api/quotes` and `POST /api/invoices` validate the full request (including date fields) via zod *before* calling `tenantSequences.next()`, specifically to avoid this. If you add a new number-minting endpoint, validate everything first, or wrap the mint + create in a transaction like `convert-to-invoice` does.
- **The backlog board is a Claude Artifact, not a page inside this codebase.** It has its own database (separate from Postgres), lives at the URL in this doc and the root README, and updates immediately for every viewer. Add real backlog items there when you find something worth tracking rather than only mentioning it in chat — same working pattern as lapanza3d's `/api/todos` admin page.

## What to do next (roughly, per the backlog's priorities)

**Phase 1 (per the original phased design spec) is complete end to end.**
**Phase 2 (billing/subscription) is code-complete and deployed, but not yet
usable** — the blocking dependency is real PayFast/PayPal credentials from
the owner. What remains:

1. **Run the PayPal half of the sandbox smoke test** (see the
   "Billing/subscription" section above) — PayFast's is done and passed
   (after fixing a real cancel-signature bug found live); PayPal's
   checkout/webhook/cancel path has real credentials configured but has
   never actually been exercised against PayPal's sandbox.
2. Decide what to do about the one existing prod tenant
   (`lapanzaonline@gmail.com`), which is currently read-only (no
   subscription row) — either have it check out for real once credentials
   exist, or manually grant it a subscription if it's meant to stay a
   free/test account.
3. The backlog board's accumulated items: 6 from the billing phase
   (#060-064, all Low/Medium — see the "Billing/subscription" section
   above) plus 1 from the public-site phase (#065 — materials-guide
   pricing verification for 9 unspot-checked entries, missing resin
   variants, Head-to-head dropdown/keyboard polish). None urgent.
4. Redeploy both API and frontend after any future code change (see
   "Deploying" below) — migrations apply automatically to `barkie_prod` via
   `prisma migrate deploy` whenever a future change adds one. **Also run
   `npx prisma generate` on the VPS after any schema change** — `npm
   install` alone does not reliably regenerate the Prisma client if
   `package.json` didn't change, which silently breaks anything touching a
   new model/column until the client is regenerated (bit this exact
   deployment on 2026-09-09, both locally and on the VPS).

## Deploying (established 2026-09-07 — VPS now runs the API and frontend, not just the landing page)

**Production infrastructure on the VPS** (`deploy@41.222.36.147`, key `~/.ssh/lapanza_vps_deploy`, passwordless sudo):
- **PostgreSQL 16** (`dnf install postgresql-server postgresql-contrib`, AlmaLinux 10) — installed fresh 2026-09-07, wasn't there before. `barkie_prod` database, `barkie` role. `listen_addresses` explicitly includes `127.0.0.1` (the VPS's `/etc/hosts` maps `127.0.0.1` to a custom hostname, not `localhost` — plain `listen_addresses = 'localhost'` alone silently only bound the IPv6 loopback `::1`, not `127.0.0.1`, which is why `DATABASE_URL` and this note both use `127.0.0.1` explicitly, not `localhost`). `pg_hba.conf`'s `host` lines for `127.0.0.1/32`/`::1/128` were changed from the AlmaLinux default `ident` to `scram-sha-256` so password auth works over TCP (a backup of the original is at `/var/lib/pgsql/data/pg_hba.conf.bak-<timestamp>`).
- **`barkie-api.service`** (systemd, mirrors `barkie-landing.service`'s pattern) — `WorkingDirectory=/opt/barkie/api`, `ExecStart=/usr/bin/npx tsx src/server.ts`, port 4200, `.env` on the VPS only (never committed) with `DATABASE_URL` pointing at `barkie_prod`, `FRONTEND_ORIGIN=https://barkie.co.za`, `FRONTEND_BASE_PATH=/app`, `TRUST_PROXY=true`. Port 4200 is NOT directly internet-reachable (confirmed by curling it externally) — only reachable via nginx, same posture as the landing page's 4100. **Billing env vars set as of 2026-09-09** (sandbox credentials): `PAYFAST_MERCHANT_ID`, `PAYFAST_MERCHANT_KEY`, `PAYFAST_PASSPHRASE`, `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, `PAYPAL_WEBHOOK_ID` are all populated. `PAYMENTS_LIVE` is still unset (sandbox/`false`) — set it to the literal string `true` only once real (non-sandbox) PayFast/PayPal credentials replace the sandbox ones AND both providers have been smoke-tested.
- **`/opt/barkie/frontend/`** — the frontend's static `dist/` build, no process of its own; nginx serves it directly.
- **nginx** (`/etc/nginx/conf.d/barkie.conf`, one server block, shared cert) — `location /` (unchanged, → landing on 4100), `location /api/` (→ `proxy_pass http://127.0.0.1:4200;`, no trailing path on purpose — the API's routes already include the `/api/...` prefix themselves, so the full incoming URI must pass through unchanged), `location /app/` (→ `alias /opt/barkie/frontend/; try_files $uri $uri/ /app/index.html;` for SPA fallback).

**Redeploying the API after a code change:**
```bash
cd platform/api && tar --exclude=node_modules --exclude=.env --exclude=.env.test --exclude='*.tsbuildinfo' -czf /tmp/barkie-api.tar.gz .
scp -i ~/.ssh/lapanza_vps_deploy /tmp/barkie-api.tar.gz deploy@41.222.36.147:/tmp/
ssh -i ~/.ssh/lapanza_vps_deploy deploy@41.222.36.147 "tar -xzf /tmp/barkie-api.tar.gz -C /opt/barkie/api && cd /opt/barkie/api && npm install && npx prisma generate && npx prisma migrate deploy && sudo systemctl restart barkie-api"
```
**`npx prisma generate` is required whenever the schema changed**, even
though it's not in the original version of this command — `npm install`
alone does NOT reliably regenerate `node_modules/@prisma/client` if
`package.json`'s dependencies didn't change, so a schema-only change (a
new model, a new column) silently ships a stale client that throws
`Cannot read properties of undefined` on the new model at runtime. This
bit the 2026-09-09 billing deploy on both the local main checkout (merging
a worktree branch doesn't regenerate the client either — worktrees don't
share `node_modules`) and the VPS. Always run it after any migration,
whether or not `npm install` reported any changes.

**Redeploying the frontend after a code change:**
```bash
cd platform/frontend && npm run build
tar -czf /tmp/barkie-frontend-dist.tar.gz -C dist .
scp -i ~/.ssh/lapanza_vps_deploy /tmp/barkie-frontend-dist.tar.gz deploy@41.222.36.147:/tmp/
ssh -i ~/.ssh/lapanza_vps_deploy deploy@41.222.36.147 "rm -rf /opt/barkie/frontend/* && tar -xzf /tmp/barkie-frontend-dist.tar.gz -C /opt/barkie/frontend"
```
No nginx/systemd changes needed for routine redeploys — only if adding a genuinely new top-level route or service.

**Bootstrapping the admin center's first login (one-time, after this deploy ships):**
```bash
ssh -i ~/.ssh/lapanza_vps_deploy deploy@41.222.36.147 "cd /opt/barkie/api && npx tsx scripts/create-admin.ts <real email> <real password>"
```
Run this once, directly on the VPS over SSH — never as an HTTP endpoint,
there isn't one. It hashes the password with the same `hashPassword` helper
tenant accounts use and inserts a `PlatformAdmin` row directly via Prisma.
After that, log in at `https://barkie.co.za/api/admin/login`. No nginx
change needed — the existing `location /api/` block already proxies
`/api/admin/...` to port 4200 like every other `/api/...` route.

## Money math: the Decimal convention (read this before touching any cost field)

The costing engine (`src/costing/calculate.ts`, `src/routes/costing-templates.ts`)
is the only place in the codebase doing real financial arithmetic, and it
went through three rounds of final-review fixes — all real, live-reproduced
bugs, all in the same family. The pattern that emerged, and that any future
money-handling code (quotes/invoices) should follow:

1. **Data layer (`scoped.ts`) always returns a live `Prisma.Decimal`** for
   any Decimal-typed column — never format, never coerce to a string,
   never touch it. `Prisma.Decimal`'s default `toString()`/JSON
   serialization does NOT preserve column scale (`new Decimal('2.5000').toString()`
   gives `'2.5'`, not `'2.5000'`) — this is genuinely non-obvious and bit
   this plan twice before the pattern below was established.
2. **Formatting for display happens only at the HTTP response boundary**,
   via a small `serializeX()` helper in the route file (see
   `serializePrinter()` in `routes/printers.ts`, `serializeCostingTemplate()`
   in `routes/costing-templates.ts`) — `.toFixed(n)` at each field's actual
   `@db.Decimal(p, s)` scale, applied only at the response points, never
   inside `scoped.ts`.
3. **Round every RATE before deriving a COST from it, not after.** If a
   per-unit rate (a snapshot, a per-gram cost, a per-hour depreciation
   figure) is going to be persisted alongside a cost computed from it,
   round the rate first (to its own column's scale) and compute the cost
   from the *rounded* rate — otherwise the persisted rate and the
   persisted cost are two independent roundings of the same underlying
   number, and a customer re-multiplying the rate by the quantity on a
   saved template won't get the number that's actually there. This bit
   `costPerGram`/`depreciationPerHour` first, then — after that fix looked
   complete — `hourlyRateSnapshot`/`costPerUnitSnapshot`/`markupPercent`
   turned out to have the identical bug, missed by the first fix because
   nobody had swept every Decimal column in the schema for the same
   pattern. If you add a new rate-then-cost pair anywhere, apply this from
   the start.
4. **Round line-item costs before summing them into a total**, not after —
   otherwise the persisted total can disagree with the sum of the
   persisted line items a customer sees on the invoice.
5. **A regression test that re-derives its own expected value from the
   code under test proves nothing.** The first attempt at testing "do the
   components sum to the total" asserted `componentSum === totalCost`
   where `totalCost` is *defined* as that sum — true by construction for
   any implementation, buggy or not. Pin concrete, independently
   hand-computable expected values instead.

## Frontend form-data gotcha: `null` vs `''` vs omitted (read before building any more CRUD forms)

The Company Profile page (`platform/frontend/src/pages/CompanyProfilePage.tsx`) shipped in a state where **every save failed** for a real tenant, caught only by a whole-branch review, not by the (green) test suite. The bug and its fix are the pattern every remaining CRUD form (Printers, Filaments, Labour Steps, Consumables, Costing Templates, Quotes, Invoices) needs to get right from the start:

1. **A fresh/optional column is `null` from the API, never `''`.** If a page does `setForm(apiResponse)` directly, every blank optional field lands in form state as `null`, not `''`. React's controlled `<input value={null}>` doesn't crash, but the moment that `null` is round-tripped straight back into a PATCH/POST body, most zod schemas' `z.string().optional()` reject it — `.optional()` only exempts a MISSING key (`undefined`), not a `null` value. **Always build form state explicitly from the API response, mapping `null → ''`** (or `null → undefined` for a nullable number) — never spread the raw response into form state. See `CompanyProfilePage.tsx`'s `useEffect` for the corrected pattern.
2. **A blank field the user never touched is `''` in form state, not `undefined`** — so if you always submit the whole form object, a never-touched optional field goes out as `''`. Some backend fields reject `''` (`.email()`, `.min(1)`, or a hand-written non-blank check like company-profile's VAT-registered guard) and some accept it (plain `.optional()` string columns, where `''` is exactly how you clear the field). **Don't blanket-strip every blank field before sending** — that was tried first and it silently broke "clear this field back to blank" for every ordinary field while reporting "Saved." Instead, maintain an explicit list of the specific fields that reject `''` (check the actual backend zod schema, don't guess) and omit only those when blank, via `src/lib/omitBlankFields.ts`'s `omitBlankFields(form, ['fieldsThatRejectBlank'])`. Fields you deliberately omit-when-blank can then never be cleared back to blank from the UI — that's a known, accepted limitation (backlog item 040), not a bug, unless the backend schema changes to accept `''` and map it to `null`.
3. **A `useQuery`/`useMutation` page needs `isLoading` AND `isError` handled, not just `isLoading`.** A missing `isError` branch means a failed GET either hangs on "Loading…" forever (if the page's loading guard is `if (isLoading || !form)`) or renders a blank success-shaped page with no data and no explanation.
4. **A `useEffect` that pre-populates form state "once" from a query result needs to guard on the right key.** A boolean ref (`hasPopulated.current = true`) only prevents re-population within one component MOUNT — React Router does NOT remount a component on a param-only route change (e.g. `/customers/1` → `/customers/2` via an in-app link), so a boolean guard leaves stale customer-1 data in the form while it's armed to save under customer 2's id. Key the guard to the actual id (`populatedForIdRef.current !== id`) instead.

None of this needed a new dependency or a different library — `@tanstack/react-query` already gives you `isLoading`/`isError` for free; the discipline is entirely in how each page's own `useEffect`/submit logic is written. Write the payload-construction and pre-population logic explicitly for each new form, don't copy-paste a shortcut that skips the `null`/`''`/omit distinction.

**Two more instances of this same discipline, found in the Filaments/Labour Steps/Consumables phase:**

5. **Every module's backend zod schema must be read fresh, per field, before deciding whether that field needs `omitBlankFields` treatment (`src/lib/omitBlankFields.ts`) — never assume "the last module didn't need it, so this one won't either."** Filaments' `purchaseDate` uses `z.string().refine(...)` (a date-format check) that rejects `''` exactly like Customer's `.email()` does — a real gap the plan's own brief missed, caught only because the implementer read `platform/api/src/routes/filaments.ts` directly instead of trusting the plan. Labour Steps and Consumables were then correctly found to need NO `omitBlankFields` calls at all — but only because each was independently re-verified against its own real route file, not because the pattern was assumed to generalize.
6. **A REQUIRED numeric field's "cleared" state must become `undefined`, never `0`.** `Number('') === 0` in JavaScript — so a naive `onChange={(e) => set('hourlyRate', Number(e.target.value))}` on a required rate/cost field silently turns "user cleared the box, meaning to retype" into "save a real, meaningful zero," and HTML's `required` attribute does NOT catch this because the input is no longer empty by the time it's checked. Every required numeric field needs a local form-state type that allows `number | undefined` during editing (see `LabourStepFormPage.tsx`'s `LabourStepFormState` / `ConsumableFormPage.tsx`'s `ConsumableFormState` for the fixed pattern), with the `undefined` case then genuinely blocked by `required` before it ever reaches a submit.
7. **`<input type="number">` defaults to `step="1"`, which REJECTS decimal input in a real browser** — entering `0.2` (a layer height) or `2.5` (an electricity rate) fails HTML constraint validation and silently blocks form submission, and **jsdom (the test environment) does not enforce this**, so the whole suite stays green while the bug ships. Found in the Printers phase, fixed once in `FormField.tsx` (defaults every `type="number"` input to `step="any"` unless the caller passes an explicit `step`) rather than per-field — this is exactly the kind of bug class that a shared component fixes for every module at once, so when you find one like it, fix the shared component, don't patch each page.
8. **A dynamic "add row" button for a picker sourced from another module must disable when that list is loaded-but-EMPTY, not just while loading.** Found in Costing Templates: a brand-new tenant with zero labour steps/consumables could add a line item with no id selected (an empty `<select>`), and the resulting 400 named none of the fields the user actually needed to fix. `disabled={isLoading}` alone isn't enough — it needs `disabled={isLoading || !list?.length}`, plus a hint pointing at where to go create the missing reference data first.
9. **A form input editing a field the backend SETS absolutely (not increments) must be pre-filled with the field's CURRENT value, never start blank — and its label must make the "absolute total, not a delta" semantics unambiguous.** Found in Invoices: `PATCH .../status`'s `amountPaid` is the cumulative total paid to date, set outright by every call. The first cut of the payment UI started the amount input blank and reset it to blank after every submit, while a separate read-only summary row showed the SAME label ("Amount paid") with the real current value — so a user recording a *second* partial payment would type what they thought was "the additional amount," and silently overwrite (usually reduce) the real total. Caught only in a whole-branch review, not by the (168-green) test suite, because the tests mocked the API boundary and never modeled two sequential payments against the same invoice. Before writing any "record a running total" input: pre-fill from the current server value, re-sync it after every mutation via a value-keyed effect (not an object-identity-keyed one, which would false-fire on every unrelated refetch), and give the input and any adjacent read-only display of the same field genuinely different labels.
10. **A status-action button whose payload depends on other state (not the button's own click) must compute that payload from the loaded record, never from a form field the user might not have touched.** Same Invoices bug: "Mark as Paid" read the (usually-untouched, defaulting to `Number('') === 0`) amount input instead of just sending `invoice.total` directly — so the single most common action in the whole module always 400'd on the happy path. If an action's correct value is knowable from data already on screen, compute it from that data; don't route it through an editable field that's semantically for a *different* action (recording a partial payment).

**Money display convention (established in the Costing Templates phase):** `CostingTemplate`/`Quote`/`Invoice` all return money fields as API-pre-formatted STRINGS at the correct decimal scale (e.g. `"190.00"`, `"0.300000"`) — never re-parse these to a `Number` for display. Render every one of them through the shared `formatCurrency(value: string, currency?: string)` helper (`src/lib/formatCurrency.ts`), never a per-page `"R " + value` string. `Quote`/`Invoice` serializers use the identical `.toFixed(2)`-string contract, so this helper needs no changes for those phases. One known gap to close BEFORE building the Invoices page: `serializeInvoice` (`platform/api/src/routes/invoices.ts`) exposes `total` and `amountPaid` but no balance-due field — add a server-side `Prisma.Decimal` subtraction now rather than let the frontend compute `Number(total) - Number(amountPaid)` in JS floats (backlog item 048).

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
