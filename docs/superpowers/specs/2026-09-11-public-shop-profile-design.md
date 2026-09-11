# Public Shop Profile Page — Design Spec

**Backlog:** #21 — "Public shop profile page (/shop/{slug})"

**Goal:** A tenant can publish a public, read-only page at `barkie.co.za/shop/{slug}` showing their business tagline, services, hours, a photo gallery, and contact links — editable from a new Settings page in the admin dashboard.

## Scope

In scope: tagline, services list, opening-hours free text, gallery (list of image URLs — no upload pipeline exists yet, same convention as the existing `logoUrl` field), WhatsApp contact link, a slug-based public URL, and a publish/unpublish toggle.

Out of scope (no request currently covers these — do not add them): image upload/storage, a shop-to-shop directory or search, reviews/ratings, online ordering, analytics on page views.

## Data model

Extend `Tenant` in `platform/api/prisma/schema.prisma` (no new table — this is the same "one row per tenant, selected subset of fields" pattern `companyProfile` already uses):

```prisma
shopSlug             String?  @unique
shopTagline          String?
shopServices         String[] @default([])
shopHoursText        String?
shopGalleryUrls      String[] @default([])
shopContactWhatsapp  String?
shopIsPublished      Boolean  @default(false)
```

Slug format: lowercase letters, digits, hyphens, 3–60 chars, no leading/trailing/double hyphen: `/^[a-z0-9]+(-[a-z0-9]+)*$/`. Enforced in the zod schema, not the DB.

Publish invariant: `shopIsPublished` can only be `true` if a `shopSlug` is set (existing or in the same request). Enforced in the route handler, same style as `company-profile.ts`'s VAT-registered/VAT-number invariant.

## Backend

**`platform/api/src/db/scoped.ts`** — add a `shopProfileSelect` (mirroring `companyProfileSelect`) covering the 7 new fields, and a `shopProfile: { get, update }` accessor on `tenantScope()`, same shape as the existing `companyProfile` accessor (`get()` returns `prisma.tenant.findUnique(...)`, `update(data)` returns `prisma.tenant.update(...)`).

**`platform/api/src/routes/shop-profile.ts`** (new router, mounted in `app.ts` next to `companyProfileRouter`):
- `GET /api/shop-profile` — `requireTenantAuth, requireActiveSubscription`. Returns the full editable state (including `shopSlug` and `shopIsPublished`, whether or not currently published).
- `PATCH /api/shop-profile` — same middleware. zod schema: `shopSlug` (the regex above, `.optional()`), `shopTagline` (`.string().trim().optional()`), `shopServices` (`.array(z.string().trim().min(1)).max(20).optional()`), `shopHoursText` (`.string().trim().optional()`), `shopGalleryUrls` (`.array(z.string().trim().url()).max(12).optional()`), `shopContactWhatsapp` (`.string().trim().optional()`), `shopIsPublished` (`.boolean().optional()`). Before writing: load the current row, compute `willBePublished = parsed.data.shopIsPublished ?? current.shopIsPublished` and `willHaveSlug = parsed.data.shopSlug ?? current.shopSlug`; if `willBePublished && !willHaveSlug`, 400 `"Set a URL slug before publishing your shop page."`. Wrap the `update()` call in try/catch for Prisma `P2002` (unique `shopSlug` collision) → 400 `"That URL is already taken — try a different one."` (same pattern as `admin.ts`'s backlog-number P2002 retry, but here it's a genuine user error, not a race to retry — just report it).

**`platform/api/src/routes/public.ts`** — add `GET /api/public/shop/:slug`, `publicLimiter`, no auth. Look up `prisma.tenant.findFirst({ where: { shopSlug: req.params.slug, shopIsPublished: true }, select: { businessName: true, shopTagline: true, shopServices: true, shopHoursText: true, shopGalleryUrls: true, shopContactWhatsapp: true, phone: true, email: true, website: true, logoUrl: true, city: true } })`. `404 { ok: false, error: 'Shop not found.' }` if null or not published (same message either way — don't leak whether a slug exists but is unpublished). Otherwise `200 { ok: true, shop: {...} }`.

**`platform/api/src/app.ts`** — import and `app.use(shopProfileRouter)` next to `app.use(companyProfileRouter)`. `publicRouter` is already mounted; no change needed there beyond the new route inside `public.ts`.

## Frontend (`platform/frontend`, admin dashboard)

**`platform/frontend/src/api/shopProfile.ts`** (new) — mirror `companyProfile.ts` exactly: a `ShopProfile` interface matching the 7 fields (`shopSlug: string | null`, `shopServices: string[]`, `shopGalleryUrls: string[]`, `shopIsPublished: boolean`, rest `string | null`), `UpdateShopProfileInput = Partial<ShopProfile>`, `useShopProfile()` (`GET /api/shop-profile`), `useUpdateShopProfile()` (`PATCH /api/shop-profile`, `onSuccess` writes the returned profile into the query cache under `['shopProfile']`).

**`platform/frontend/src/pages/ShopProfilePage.tsx`** (new) — same structural pattern as `CompanyProfilePage.tsx`: populate a local form state once from the loaded profile (`shopServices`/`shopGalleryUrls` arrays edited as one textarea each, one entry per line, split/joined on save — do not build a dynamic add/remove-row UI, that's unnecessary complexity for a list this small), a `Checkbox` for "Publish this page", a `FormField` for the slug with live preview text under it reading `Your public page: barkie.co.za/shop/{slug || '…'}`, `Save` button, `error`/`saved` banners identical to `CompanyProfilePage`.

**`platform/frontend/src/App.tsx`** — add a route `/shop-profile` rendering `<ShopProfilePage />` inside the same `RequireAuth` wrapper as `/company-profile`.

**`platform/frontend/src/components/AppShell.tsx`** — add `{ to: '/shop-profile', label: 'Shop Profile' }` to `NAV_ITEMS`, right after `Company Profile`.

## Public page (`landing/`)

**`landing/public/shop.html`** (new) — static shell (header/footer matching `materials.html`'s look), a container div the JS fills in, and a "not found" state hidden by default.

**`landing/public/js/shop.js`** (new, vanilla JS, `document.createElement`/`.textContent` only — no `innerHTML`): reads the slug from `location.pathname` (`/shop/<slug>`), `fetch('/api/public/shop/' + encodeURIComponent(slug))`. On 200: render business name, tagline, services (as a list), hours text, gallery (as an image grid — plain `<img>` tags built via `document.createElement`), WhatsApp/phone/email/website links (only the ones present), city. On 404 or network error: show the "not found" state with a link back to `/`.

**`landing/server.js`** — add `app.get('/shop/:slug', (req, res) => res.sendFile(path.join(__dirname, 'public', 'shop.html')));` **before** the `express.static(...)` line (so the dynamic path is handled before the static middleware's 404-for-unknown-path behavior would otherwise apply — `express.static` only serves files that exist on disk, and there is no `shop.html` at a slug-shaped path).

## Tests

- `platform/api/tests/shop-profile.test.ts` (new, following the `buildMinimalApp`/`loggedInAgent` pattern from `tests/helpers/testApp.ts`): auth-required check, GET returns defaults for a fresh tenant (`shopSlug: null`, `shopIsPublished: false`, empty arrays), PATCH updates fields and round-trips, PATCH rejects publishing without a slug, PATCH rejects a malformed slug, PATCH returns 400 (not 500) on a duplicate slug across two tenants.
- `platform/api/tests/public.test.ts` (extend): `GET /api/public/shop/:slug` returns 404 for an unknown slug, 404 for a real-but-unpublished slug, 200 with the expected shape for a published one, and confirms the response does **not** include tenant-private fields (`vatNumber`, `bankAccountNumber`, etc. — those aren't in the select at all, but assert the response keys explicitly so a future accidental widening of the select is caught).
- `platform/frontend/tests/ShopProfilePage.test.tsx` (new, mirroring `CompanyProfilePage`'s existing test file structure): loads and populates the form, saves changes, shows the slug preview text update as the user types, shows the publish-blocked error surfaced from the API.

## Global constraints (apply to every task above)

- Multi-tenancy: every admin-facing route goes through `tenantScope(req.tenantId!)`; never query `prisma.tenant` directly by anything other than the authenticated tenant's id in `shop-profile.ts`. The public route is the one deliberate exception — it looks up by `shopSlug`, not `tenantId`, because it has no authenticated tenant.
- Auth: `shop-profile.ts` routes carry `requireTenantAuth, requireActiveSubscription` on both GET and PATCH, matching every other resource router post-#6. `public.ts`'s new route carries neither, matching its two existing routes.
- No `innerHTML` anywhere in `landing/public/js/shop.js` — the repo-wide hook blocks it even in comments.
- Follow the three-state PATCH-clearing convention already used elsewhere (`'field' in data ? ... : undefined`) *only if* a field needs to be explicitly clearable back to null after being set — `shopTagline`/`shopHoursText`/`shopContactWhatsapp` plausibly do; treat omitted-vs-blank-string the same way `company-profile.ts` does today (plain optional, blank string allowed) rather than inventing a new pattern, since that's what the sibling route does.
