# Public Site (Home / Pricing / Materials Guide) — Design Spec

**Status:** Approved 2026-09-09. Replaces the temporary coming-soon page
at barkie.co.za with the real public marketing site. Admin center
(backlog #26) is explicitly a separate, later phase — not in this spec.

## Goal

A prospective tenant lands on barkie.co.za, understands what Barkie does,
sees real (not fabricated) traction numbers, can compare plans on a real
pricing page backed by the live `Plan` table, and can read a genuine
materials-guide resource — all before ever creating an account. This
replaces `landing/`'s current single coming-soon page.

## Decisions already made (not open for re-litigation in this spec)

- **Scope this week**: Home, Pricing, Materials Guide. Admin center is a
  separate follow-up phase (backlog #26).
- **Reference for structure, not palette**: a competitor site
  ("The 3D Printing Network") was used as a structural reference — stats
  strip on the homepage, 3-tier pricing cards + comparison table + FAQ
  accordion on the pricing page. Barkie's own existing visual design
  (Fraunces/DM Sans, terracotta/charcoal/cream, neubrutalist offset
  shadows — already built for the current coming-soon page) is kept
  as-is; nothing about the competitor's dark/purple palette is adopted.
- **Architecture**: extend `landing/` (the existing simple Express +
  static-file app already deployed at barkie.co.za) rather than building
  a second React app or bolting public routes onto the authenticated
  `platform/frontend` SPA. `landing/` already has its own deploy pipeline,
  process, and nginx routing — reusing it is the fastest path to a
  testable site this week and needs no new infrastructure.
- **Pricing page pulls live data** from a new public API endpoint (no
  login) — never hand-typed prices that can drift from the real `Plan`
  table.
- **Materials guide is hand-authored public content** this phase (real
  technical accuracy, not placeholder text). Wiring it into the costing
  engine's material picker (so a tenant's `CostingTemplate` line items
  could reference it) is explicitly deferred to a later phase — flag it
  as a backlog item, don't build it now.
- **Stats are shown honestly**, even when small (current prod: 1
  registered tenant, 0 active subscriptions after this week's sandbox
  test tenant was cleaned up). No vanity-number fabrication, no hiding
  the stats strip until numbers look better — matches the user's own
  "more realistic" framing for the pricing page, applied to the whole
  site.

## Site map

```
barkie.co.za/            → Home (replaces the coming-soon page)
barkie.co.za/pricing      → Pricing
barkie.co.za/materials    → Materials Guide
barkie.co.za/app/...      → unchanged — the authenticated SPA (platform/frontend)
barkie.co.za/api/...      → unchanged — the authenticated API (platform/api)
```

`landing/` keeps serving at `/` on port 4100 exactly as it does today
(nginx already routes `location /` there) — these become three real pages
plus shared nav/footer instead of one static page.

## Page 1: Home

Sections, top to bottom:

1. **Nav** (persistent across all 3 pages) — logo/wordmark, links to
   Home / Pricing / Materials Guide, "Log in" + "Start free trial" (links
   to `/app/login` and `/app/register`).
2. **Hero** — keep the existing coming-soon page's core value-prop copy
   (adapt tense from "coming soon" to "live now"), a single primary CTA
   ("Start your 14-day free trial" → `/app/register`).
3. **Stats strip** — 2 numbers, both real, both live:
   - **Registered businesses** — `count(Tenant)`.
   - **Active subscriptions** — `count(Subscription where status IN ('active', 'trialing'))`.
     Both `active` and `trialing` count as "currently subscribed" (a
     trialing tenant has a live, un-lapsed subscription even though no
     charge has happened yet) — `lapsed`/`canceled` don't count.
   Fetched from the new `GET /api/public/stats` endpoint at page load.
   If the fetch fails, the strip hides itself rather than showing a
   broken/zero state — a marketing page silently degrading to "no stats
   shown" is better than showing a visibly-broken widget.
4. **What Barkie does** — short feature summary (customers, printers,
   costing, quotes/invoices — matches what's actually built and live,
   not aspirational).
5. **Footer** — Terms/Support/Privacy links (existing), plus now Pricing
   and Materials Guide.

## Page 2: Pricing

1. **Header** — "Pricing" + one-line framing.
2. **Tier cards** — 3 cards, one per `Plan` row, fetched live from
   `GET /api/public/plans` (name, monthly price, sort order). Card copy
   per tier is hand-written (not derived from the DB — the DB only has
   name/price), framed around printer count / job volume as *guidance*,
   not an enforced limit — **this must be worded honestly**: something
   like "Recommended for shops running up to N printers" rather than "Up
   to N printers" phrased as a hard cap, since Barkie does not actually
   enforce any usage limit yet (confirmed in the billing design spec —
   tiers differ in name/price only, no enforcement built). Each card:
   tier name, price (`R{monthlyPrice}/month`), 1-line positioning, a
   feature list (same feature set on all 3 tiers today, since there's no
   real differentiation yet — be upfront about that rather than inventing
   fake tier-gated features), "Start free trial" CTA → `/app/register`.
3. **Comparison note** — since all 3 tiers currently have identical
   features, a competitor-style feature-comparison TABLE would be
   dishonest (nothing to compare). Replace with a short "what's the
   same across every plan" list instead, plus a one-line note that usage
   limits aren't enforced yet. Revisit this section once the admin
   center or a future phase adds real tier differentiation.
4. **FAQ accordion** — real, accurate answers about Barkie's actual
   billing behavior (pulled from the billing design spec, not invented):
   "When do I get charged?" (card captured at signup, 14-day free trial,
   auto-charged at trial end), "Can I cancel anytime?" (yes, from billing
   settings), "What happens if my card fails?" (7-day grace period,
   read-only after that), "Can I switch plans?" (cancel and resubscribe
   — no in-place upgrade/downgrade yet, per the design spec's explicit
   scope cut).

## Page 3: Materials Guide

Public, no login required. Real technical content, covering the common
FDM/resin materials a 3D-print shop would actually quote:

- **PLA** — properties, typical use cases, strengths/limitations.
- **PETG** — same.
- **ABS** — same.
- **ASA** — same.
- **TPU (flexible)** — same.
- **Nylon** — same.
- **Resin (standard/tough/flexible)** — same.
- A **comparison table** — strength, flexibility, heat resistance, ease
  of printing, typical cost tier, at a glance across all materials.

Content authored directly in this phase (not sourced from any external
site) — accuracy matters since real print-shop owners will read it.
Written as static content on the page (no CMS/DB backing needed for a
one-time content page).

## API additions (`platform/api`)

**`GET /api/public/stats`** — new, no auth. Returns
`{ ok: true, registeredBusinesses: number, activeSubscriptions: number }`.

**`GET /api/public/plans`** — new, no auth. Returns the same shape as the
existing authenticated `GET /api/plans` (`{ ok: true, plans: [...] }`),
but does NOT reuse or modify that existing route — it stays exactly as
it is (authenticated, used by the in-app `PlanSelectionPage`). A
brand-new, separate, unauthenticated route is safer given this
codebase's history: three separate router-mount-order bugs have already
been found and fixed in this project (an unpathed `router.use()` on a
router mounted at `/` intercepts every request that reaches it, not just
its own routes) — carving an exception out of the existing
auth-blanketed `billingRouter` risks reintroducing that exact bug class.
A fresh `publicRouter` with no auth middleware at all, mounted in
`app.ts` alongside `webhooksRouter` (before any auth-gated router),
avoids the risk entirely by construction rather than by careful ordering.

Both routes are read-only, return no tenant-identifying data (just
counts and public plan pricing), and need no rate limiting beyond
whatever's already global to the API. No CORS changes needed —
`landing/` and `platform/api` are both proxied under the same
`https://barkie.co.za` origin by nginx (`/` → landing on 4100, `/api/` →
the API on 4200), so a fetch from a page served at `/` to `/api/public/...`
is same-origin from the browser's perspective.

## What this spec does NOT cover

- Admin center (backlog #26) — separate phase.
- Wiring the Materials Guide into the costing engine's material picker —
  flag as a backlog item when this phase ships, don't build it now.
- Real tier differentiation / usage-limit enforcement — out of scope,
  same as the original billing design spec.
- Any change to `platform/frontend` (the authenticated SPA) or to the
  existing authenticated `GET /api/plans` route.
