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
5. [`landing/README.md`](../landing/README.md) — local dev + deploy notes for the temp landing page
6. The backlog board (link above) — what's known-incomplete, prioritized

## Current state (as of this handoff, 2026-09-07)

| Item | State |
|---|---|
| **barkie.co.za (live domain)** | Live: `landing/` coming-soon page, deployed 2026-09-07. Runs as systemd service `barkie-landing.service` on the VPS (`/opt/barkie/app`, `node server.js`, port 4100, `User=deploy`, `Restart=on-failure`), nginx reverse-proxies `barkie.co.za`/`www.barkie.co.za` to it (`/etc/nginx/conf.d/barkie.conf`) — same pattern as `lapanza-admin.service`. Existing Certbot SSL cert untouched. Old placeholder backed up at `/opt/barkie/backup-2026-09-07/` on the VPS. |
| **`landing/`** | Deployed and verified end-to-end in production (page renders, dark mode, `/api/notify` signup tested live then cleaned up). Deploy access: `ssh -i ~/.ssh/lapanza_vps_deploy deploy@41.222.36.147` (same key as lapanza3d; `deploy` has passwordless sudo on this box). To redeploy after a code change: `tar` the `landing/` folder (excluding `node_modules`/`data`/`.env`), `scp` it up, extract into `/opt/barkie/app`, `npm install --omit=dev`, `sudo systemctl restart barkie-landing`. |
| **`platform/api/`** | Foundation + Reference Data Modules + Costing Engine + Company Profile + Quotes + Invoices all merged to `master`, pushed to GitHub, **and deployed live** at `https://barkie.co.za/api/` (systemd `barkie-api.service`, port 4200, not directly internet-reachable — only via the nginx reverse proxy). Auth, tenant isolation (`tenantScope`), Customer/Printer/PrinterPreset/PrinterMaintenanceLog/Filament/LabourStep/Consumable CRUD, `CostingTemplate` (money-correct, Decimal-based), Company Profile (VAT/banking/address/numbering config), Quotes (draft/sent/accepted/expired), Invoices (unpaid/partially_paid/paid/overdue, quote-to-invoice conversion), rate limiting. 133 tests passing, `tsc --noEmit` clean. No PDF generation or real email sending yet (dev-mode email only — logs to `journalctl -u barkie-api`, doesn't send). |
| **Frontend** | **`platform/frontend/` exists and is deployed live** at `https://barkie.co.za/app/` (React + Vite + TS + Tailwind + React Router + React Query SPA, static build served by nginx). **Every module now has a full UI** — auth, app shell, every reference-data module, Costing Templates, and **Quotes + Invoices** (status-transition workflows, dual-mode line items, quote-to-invoice conversion, invoice payment recording). 168 tests passing. What's left: **PDF generation + email sending** (deliberately deferred — dev-mode email only). **Read the "Frontend form-data gotcha" note below before building any more forms** — this discipline has caught 8 real bugs across 6 phases, including a real accounting bug in invoice payment recording (see below). |
| **Database** | PostgreSQL 16, both local dev (`barkie_dev`/`barkie_test` on this machine, role `barkie`) **and production** (`barkie_prod` on the VPS, PostgreSQL installed 2026-09-07, role `barkie`, password in `/opt/barkie/api/.env` on the VPS only — never committed). All 13 migrations applied to production. |
| **Domain modules** | `Customer`, `Printer` (+ `PrinterPreset`, `PrinterMaintenanceLog`), `Filament`, `LabourStep`, `Consumable`, `CostingTemplate` (+ `CostingLabourLine`, `CostingConsumableLine`), `Quote` (+ `QuoteLineItem`), `Invoice` (+ `InvoiceLineItem`), `TenantSequence` (numbering) all exist and are tenant-isolated. SRS §8.3's non-negotiable core is now fully built. |
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
- **`tenantScope()` is bypassed in exactly one place on purpose: `POST /api/quotes/:id/convert-to-invoice`** (`platform/api/src/routes/quotes.ts`). It needs two dependent atomic writes (a `TenantSequence` increment + an `Invoice` create) inside one `prisma.$transaction`, which the per-call `tenantScope()` closures can't wrap together — so that one handler calls `prisma` directly, with every query inside the transaction filtering by `tenantId` explicitly by hand. If you add another multi-step atomic write, follow this pattern rather than inventing a new one, and double-check every `tx.*` call still carries `tenantId`.
- **Minting a `TenantSequence` number before validating the rest of the request body burns the number on any later validation failure** (no gap gets reused — Postgres sequences and this integer counter both only go up). `POST /api/quotes` and `POST /api/invoices` validate the full request (including date fields) via zod *before* calling `tenantSequences.next()`, specifically to avoid this. If you add a new number-minting endpoint, validate everything first, or wrap the mint + create in a transaction like `convert-to-invoice` does.
- **The backlog board is a Claude Artifact, not a page inside this codebase.** It has its own database (separate from Postgres), lives at the URL in this doc and the root README, and updates immediately for every viewer. Add real backlog items there when you find something worth tracking rather than only mentioning it in chat — same working pattern as lapanza3d's `/api/todos` admin page.

## What to do next (roughly, per the backlog's priorities)

1. Build out the remaining frontend module pages (Company Profile, Customers, Printers, Filaments, Labour Steps, Consumables, Costing Templates, Quotes, Invoices) — see `docs/superpowers/specs/2026-09-07-frontend-deploy-design.md`'s phased execution order. Frontend Foundation (auth pages, shell, routing) is done and deployed; nothing else has a UI yet.
2. PDF generation + email sending for quotes/invoices — still deliberately deferred (dev-mode email only). A frontend now exists to trigger it from, but no SMTP credentials exist yet.
3. Redeploy the frontend after each new module's pages land (see "Deploying" below) — the API redeploy story is already established from Reference Data Modules onward; migrations apply automatically to `barkie_prod` via the same `prisma migrate deploy` step.

## Deploying (established 2026-09-07 — VPS now runs the API and frontend, not just the landing page)

**Production infrastructure on the VPS** (`deploy@41.222.36.147`, key `~/.ssh/lapanza_vps_deploy`, passwordless sudo):
- **PostgreSQL 16** (`dnf install postgresql-server postgresql-contrib`, AlmaLinux 10) — installed fresh 2026-09-07, wasn't there before. `barkie_prod` database, `barkie` role. `listen_addresses` explicitly includes `127.0.0.1` (the VPS's `/etc/hosts` maps `127.0.0.1` to a custom hostname, not `localhost` — plain `listen_addresses = 'localhost'` alone silently only bound the IPv6 loopback `::1`, not `127.0.0.1`, which is why `DATABASE_URL` and this note both use `127.0.0.1` explicitly, not `localhost`). `pg_hba.conf`'s `host` lines for `127.0.0.1/32`/`::1/128` were changed from the AlmaLinux default `ident` to `scram-sha-256` so password auth works over TCP (a backup of the original is at `/var/lib/pgsql/data/pg_hba.conf.bak-<timestamp>`).
- **`barkie-api.service`** (systemd, mirrors `barkie-landing.service`'s pattern) — `WorkingDirectory=/opt/barkie/api`, `ExecStart=/usr/bin/npx tsx src/server.ts`, port 4200, `.env` on the VPS only (never committed) with `DATABASE_URL` pointing at `barkie_prod`, `FRONTEND_ORIGIN=https://barkie.co.za`, `FRONTEND_BASE_PATH=/app`, `TRUST_PROXY=true`. Port 4200 is NOT directly internet-reachable (confirmed by curling it externally) — only reachable via nginx, same posture as the landing page's 4100.
- **`/opt/barkie/frontend/`** — the frontend's static `dist/` build, no process of its own; nginx serves it directly.
- **nginx** (`/etc/nginx/conf.d/barkie.conf`, one server block, shared cert) — `location /` (unchanged, → landing on 4100), `location /api/` (→ `proxy_pass http://127.0.0.1:4200;`, no trailing path on purpose — the API's routes already include the `/api/...` prefix themselves, so the full incoming URI must pass through unchanged), `location /app/` (→ `alias /opt/barkie/frontend/; try_files $uri $uri/ /app/index.html;` for SPA fallback).

**Redeploying the API after a code change:**
```bash
cd platform/api && tar --exclude=node_modules --exclude=.env --exclude=.env.test --exclude='*.tsbuildinfo' -czf /tmp/barkie-api.tar.gz .
scp -i ~/.ssh/lapanza_vps_deploy /tmp/barkie-api.tar.gz deploy@41.222.36.147:/tmp/
ssh -i ~/.ssh/lapanza_vps_deploy deploy@41.222.36.147 "tar -xzf /tmp/barkie-api.tar.gz -C /opt/barkie/api && cd /opt/barkie/api && npm install && npx prisma migrate deploy && sudo systemctl restart barkie-api"
```

**Redeploying the frontend after a code change:**
```bash
cd platform/frontend && npm run build
tar -czf /tmp/barkie-frontend-dist.tar.gz -C dist .
scp -i ~/.ssh/lapanza_vps_deploy /tmp/barkie-frontend-dist.tar.gz deploy@41.222.36.147:/tmp/
ssh -i ~/.ssh/lapanza_vps_deploy deploy@41.222.36.147 "rm -rf /opt/barkie/frontend/* && tar -xzf /tmp/barkie-frontend-dist.tar.gz -C /opt/barkie/frontend"
```
No nginx/systemd changes needed for routine redeploys — only if adding a genuinely new top-level route or service.

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
