# Subscriber Dashboard Frontend + Deploy + PDF/Email — Design

**Status:** Approved (user opted out of interactive brainstorming for this slice — see decisions below, made by the controller under explicit standing authorization for autonomous overnight execution)
**Scope:** A full React SPA covering every existing API module, deployed alongside the API and landing page on the existing VPS, plus a PDF/email capability for quotes and invoices (dev-mode email — no real SMTP credentials available tonight).

## Decisions already made (via AskUserQuestion, this session)

1. **Hosting:** path-based on `barkie.co.za`, no new DNS. `/` stays the existing landing page. `/app/*` serves the new dashboard SPA (client-side routed, `basename: '/app'`). `/api/*` reverse-proxies to the existing Express API. All three share one nginx server block, one Certbot cert.
2. **Email:** dev-mode only tonight — a `sendVerificationEmail`-style console logger, not real SMTP. Real credentials are a future backlog item, not a blocker.
3. **Frontend scope:** full CRUD UI for every existing module, not an MVP subset.

## Stack

- **React 18 + TypeScript + Vite** — matches the existing TS-everywhere codebase; `FRONTEND_ORIGIN=http://localhost:5174` in `env.sample` already anticipated a Vite dev server on that port.
- **Tailwind CSS** — utility-first, fastest path to consistent styling across ~10 CRUD page groups in one session.
- **React Router v6**, `basename="/app"` in production (dev keeps `basename="/"` since the dev server isn't path-prefixed).
- **`@tanstack/react-query`** for all server state (list/detail fetches, create/update mutations, cache invalidation on write) — keeps every CRUD page's data-fetching code near-identical instead of hand-rolled `useEffect`/`useState` per page.
- **No global client state library** — auth state lives in one `AuthContext` (backed by `GET /api/auth/me`), everything else is server state via React Query.

## Cross-cutting pieces (Frontend Foundation — built first, everything else depends on it)

- **`src/api/client.ts`** — a thin fetch wrapper: `apiGet(path)`, `apiPost(path, body)`, `apiPatch(path, body)`. Always `credentials: 'include'`. Base URL: `import.meta.env.VITE_API_BASE_URL` (dev: `http://localhost:4200`; prod build: must be empty/unset, since same-origin path-based hosting means the frontend and API share `barkie.co.za` and every call path already starts with `/api/...` — a non-empty value like `/api` would double up to `/api/api/...`). `platform/frontend/.env.production` exists specifically to override the dev `.env` value for production builds (Vite loads `.env` in every mode, so without it the dev value would leak into the production bundle). Throws a typed `ApiError { status, message }` on any `{ ok: false }` response, so pages don't each hand-roll error parsing.
- **`AuthContext`** — on mount, calls `GET /api/auth/me`; exposes `{ tenant, loading, refetch }`. A `<RequireAuth>` wrapper redirects to `/app/login` when unauthenticated (after the initial loading check completes, to avoid a login-page flash on a valid session).
- **App shell** — a persistent left nav (one link per module below) + top bar (business name from `AuthContext`, logout button) wrapping every authenticated route; unauthenticated routes (`/login`, `/register`, `/verify-email`) render standalone.
- **Money display** — every module rendering a Decimal-backed field (already `.toFixed(n)` strings from the API) formats via one shared `formatCurrency(value: string, currency = 'ZAR')` helper — never reformats the string manually per-page.

## Module pages (each: list view, create form, edit-in-place or detail view; matches its API 1:1)

1. **Auth** — Login, Register, Verify Email (post-registration landing, paste/click a token link)
2. **Company Profile** — single settings-style form (`GET/PATCH /api/company-profile`), all 19 fields grouped (Business, VAT/Legal, Address, Banking, Numbering)
3. **Customers** — list + create/edit form
4. **Printers** (+ nested Printer Presets, + Maintenance Log) — list + create/edit; a printer's detail view nests its presets and maintenance history
5. **Filaments** — list + create/edit
6. **Labour Steps** — list + create/edit
7. **Consumables** — list + create/edit
8. **Costing Templates** — create form (select filament, printer, labour lines, consumable lines, weight/print-time/markup) showing the live-computed breakdown from the response; list + detail (read-only, snapshot display)
9. **Quotes** — list (filterable by status) + create form (customer, line items — either "from costing template" picker or ad-hoc description/price) + detail view (status-transition buttons matching the allowed transitions, "Convert to Invoice" button when accepted)
10. **Invoices** — list (filterable by status) + detail view (payment-status buttons, amount-paid input) — no standalone create form needed in the UI for v1 (invoices mostly arrive via quote conversion; a "New Invoice" form can follow as a fast-follow if time allows)

## PDF + Email capability (backend, dev-mode email)

- **`POST /api/quotes/:id/send`** and **`POST /api/invoices/:id/send`** — generates a PDF (via `pdfkit`, no external service — matches the "no new secrets tonight" constraint) using the company profile's business name/address/banking/logo-url/T&Cs plus the document's line items and totals, and "sends" it via a `sendDocumentEmail()` function that — like `sendVerificationEmail` — logs to the console in dev mode (`[dev-email] Quote QT-0001 PDF would be emailed to <customer email>`) rather than calling a real SMTP provider. Returns the generated PDF as a base64 string or a download link in the response so the frontend can offer "Download PDF" even without real email.
- Frontend: a "Send to customer" button on the Quote/Invoice detail pages, hitting this endpoint, showing a success toast ("Emailed to customer (dev mode — check server console)" if `NODE_ENV !== 'production'` is echoed back, else just "Sent").

## Deploy

- **API**: new systemd service `barkie-api.service` (mirrors `barkie-landing.service`'s pattern — `deploy` user, `Restart=on-failure`), a new production Postgres database (`barkie_prod`, new role or reuse `barkie` role with a stronger prod password), `prisma migrate deploy` run against it, `.env` written on the VPS (never committed) with real `SESSION_COOKIE_NAME`, `FRONTEND_ORIGIN=https://barkie.co.za`, `TRUST_PROXY=true`, a fresh `DATABASE_URL`.
- **Frontend**: `npm run build` locally (or on the VPS), static files copied to `/opt/barkie/app-frontend/`, nginx serves them at `/app/` with SPA fallback (`try_files $uri /app/index.html`).
- **nginx**: extend the existing `barkie.conf` server block — add a `location /api/ { proxy_pass http://127.0.0.1:<api-port>; }` and a `location /app/ { alias /opt/barkie/app-frontend/; try_files $uri $uri/ /app/index.html; }`, leaving the existing `location /` (landing page) untouched.
- **Verification**: curl `https://barkie.co.za/api/health` (already exists), then a browser check of `https://barkie.co.za/app/login` rendering and a real register→verify→login round trip against production data.

## Out of scope tonight (explicitly, to keep the above achievable)

- Real SMTP/email delivery (dev-mode logging only, per the user's own choice)
- Real logo file upload (company profile keeps `logoUrl` as a plain text field in the UI, same as the API)
- Payment gateway integration (Phase 2, unrelated to this slice)
- Mobile-specific responsive polish beyond "doesn't visibly break" — this is a desktop-first admin tool for now

## Execution order (front-loaded so something is live as early as possible)

1. Frontend Foundation (scaffold, API client, auth context, shell/nav, auth pages) — smallest unit that proves the whole pipeline
2. Deploy pipeline (get Foundation live at `barkie.co.za/app` against a real production API) — hits "previewable by morning" as early as possible, even before every module page exists
3. Company Profile + Customers pages → redeploy
4. Printers/Presets/Maintenance + Filaments + Labour Steps + Consumables pages → redeploy
5. Costing Templates page → redeploy
6. Quotes + Invoices pages → redeploy
7. PDF/email capability + its frontend trigger → redeploy

Each numbered phase gets its own implementation plan, written just before it's executed (rather than all seven upfront), so later phases can incorporate anything learned from earlier ones. Phases 3-7 are additive to the same frontend app — no re-scaffolding, just new route/page files plus a nav entry each.
