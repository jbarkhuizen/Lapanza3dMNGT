# Barkie temp landing page — design spec

Status: approved (2026-09-06)

## Context

"Barkie" is the working name for a future multi-tenant SaaS platform for small
3D-printing businesses (see `S:\3d Bytes\3d Management Project\3d
Management_Requirements_Specification V0.21.docx` for full product scope —
that spec is a separate, much larger effort, not part of this deliverable).

barkie.co.za currently shows a bare placeholder ("This is the Home of the new
barkie.co.za site"). It will be hosted on the same VPS as lapanza3d.co.za, in
its own sibling folder/process — **not** inside the lapanza3d codebase, and
lapanza3d must not be modified or touched in any way by this work.

This spec covers only the temporary holding page: a professional "coming
soon" page that represents the brand until the real platform is built.

## Goals

- Look and feel like a serious, professional software product (not a
  consumer storefront) — first impression for future subscribers.
- Explain what Barkie is in one glance, using the confirmed v1 scope.
- Capture real interest: a working email signup, not just a poster.
- Reuse the existing Lapanza design language (already built, unreleased, in
  `lapanza-3d-fullsite V1 - Martin/src/styles/main.css`) so the brand feels
  like a natural evolution, not a random new template.
- Zero impact on the live lapanza3d site or its codebase.

## Non-goals

- No subscriber accounts, login, billing, or any of the full platform's
  functional modules — those belong to the future Barkie SaaS build.
- No CMS — content is hand-authored HTML for a single page.
- No third-party analytics/marketing tooling in this pass.

## Visual design

Ported (copied, not shared/imported) from lapanza-3d's `main.css` tokens:

- Fonts: `Fraunces` (display/headlines), `DM Sans` (body/UI) — via Google
  Fonts, self-hosted-fallback not required for a temp page.
- Palette (light mode): cream `#f7f3eb` background, charcoal `#1a1612` text/
  borders, terracotta `#c24b28` primary accent, olive `#6b6a4f` / steel
  `#83898d` as muted secondary tones.
- Dark mode: charcoal-ish background, cream text, same terracotta accent —
  toggled via `[data-theme="dark"]`, defaulting to the visitor's OS
  preference.
- Signature look: neubrutalist offset box-shadow cards (solid charcoal
  border + hard drop shadow, no blur/gradient) — matches the existing
  Lapanza rebuild's aesthetic.

## Content (single page)

1. Header — wordmark "Barkie" + tagline, dark-mode toggle.
2. Hero — one-line positioning ("Run your 3D print shop like a business"),
   short subhead, primary CTA scrolls to signup.
3. Three feature teaser cards, pulled from the confirmed SRS v1 scope:
   job costing & pricing, quotes & invoices, printer/filament/consumables
   tracking. No feature promised beyond what's in the SRS.
4. Signup section — email field + explicit consent checkbox ("Barkie may
   email me about the launch — no other use"), submit button.
5. Footer — © year, contact mailto, one-line data-use note (placeholder
   until the real Privacy Policy/ToS exist per SRS §5.3).

## Architecture

Small self-contained Node app, same stack family as lapanza-3d (Express +
better-sqlite3), deployed as an independent process in its own VPS folder:

- `server.js` — Express app. Serves the static page from `public/` and one
  endpoint: `POST /api/notify`.
- `POST /api/notify` — accepts `{ email, consent }`. Validates: email format,
  consent must be `true`, honeypot field (`company`) must be empty. Writes a
  row to a local SQLite file (`data/signups.db`, gitignored) with a
  timestamp and hashed IP for basic abuse tracking. Returns JSON success/
  error; no page reload (fetch + inline success state).
- Rate limiting: `express-rate-limit` on the endpoint (matches lapanza-3d's
  existing use of the same package), e.g. 5 requests/hour/IP.
- No auth, no sessions, no other routes.
- Config via `PORT` env var (default `4100`), `.env.example` provided.

## Deployment

I hand off a self-contained folder (`landing/`) with a README covering:
`npm install`, `node server.js`, required env vars, and how to point an
Nginx/reverse-proxy location at the port — the same shape as lapanza3d's
existing admin process, so it's a familiar pattern to wire up. I do not
touch hosting credentials or the live server; the user deploys it.

## Data / POPIA posture

Only field collected is email + explicit opt-in consent. Plain-language
purpose statement shown at the point of collection. This is a stopgap until
the full Barkie platform's real Privacy Policy/Terms exist (SRS §5.3) — the
footer note says so explicitly so it's never presented as final legal text.

## Out of scope for this spec

Everything in the SRS beyond this single page: subscriber auth, billing,
CRM, printer/filament/costing modules, platform admin, etc. Those get their
own spec(s) and plan(s) later, per the phased approach discussed.
