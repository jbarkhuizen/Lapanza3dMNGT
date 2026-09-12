# Shop Profile v2 — Design Spec

**Source:** competitor reference screenshots ("My Shop Profile" — listing details, about, social media, model marketplaces, trading hours) supplied by the user. Extends the shop-profile feature already shipped (backlog #21).

**Goal:** Bring the existing shop profile (`Tenant.shopSlug`/`shopTagline`/`shopServices`/`shopGalleryUrls`/`shopContactWhatsapp`/`shopIsPublished`, `shop-profile.ts`, `ShopProfilePage.tsx`, `landing/public/shop.html`+`shop.js`) up to the richer content set shown in the reference: a longer About section, structured per-day trading hours, social media links, and 3D-model-marketplace links.

## Explicitly out of scope for this pass

- **Map/Mapbox location pin** — requires a Mapbox API key (an external service credential this session doesn't have, same class of blocker as the newsletter ESP decision) and geocoding logic. Do not stub it.
- **"Contact visibility — hidden from non-members"** toggle — the reference product has visitor accounts on its own directory; Barkie's shop page has no visitor-login concept at all, so "hidden from non-members" doesn't map onto anything that exists. Skip entirely.
- **Embeddable "Listed on Barkie" website badge** — a nice-to-have, not requested elsewhere, skip.
- **Shop image upload (file, not URL)** — `shopGalleryUrls` already exists as a URL list (backlog #21); this pass does not add binary upload infra.

## Data model

Extend `Tenant` in `platform/api/prisma/schema.prisma` with these additional nullable fields (all optional, no defaults needed beyond Prisma's implicit `null`):

```prisma
shopAboutText        String?
shopAvailability     String?
shopGoogleReviewsUrl String?
shopTradingHours     Json?
shopFacebookUrl      String?
shopInstagramUrl     String?
shopTwitterUrl       String?
shopTiktokUrl        String?
shopYoutubeUrl       String?
shopLinkedinUrl      String?
shopDiscordUrl       String?
shopCults3dUrl       String?
shopPrintablesUrl    String?
shopThingiverseUrl   String?
shopMakerworldUrl    String?
shopThangsUrl        String?
shopCrealityCloudUrl String?
shopGrabcadUrl       String?
```

`shopTradingHours` is the one JSON column in this schema (every other field in this codebase is an explicit typed column — that convention holds for the 16 single-purpose URL/text fields above, but trading hours is genuinely 7 identically-shaped records, which is what JSON columns are for). Shape: `{ monday: { open: boolean, start: string, end: string }, tuesday: {...}, ..., sunday: {...} }` — `start`/`end` are `"HH:MM"` 24-hour strings (e.g. `"08:00"`), meaningless when `open` is `false`. Validate this shape with a zod schema in the route (see below) rather than trusting the client.

## Backend

**`platform/api/src/db/scoped.ts`** — extend `shopProfileSelect` with all the new fields above.

**`platform/api/src/routes/shop-profile.ts`** — extend `updateShopProfileSchema`:
- `shopAboutText`: `z.string().trim().optional()`
- `shopAvailability`: `z.string().trim().optional()`
- `shopGoogleReviewsUrl`: `z.string().trim().url().optional().or(z.literal(''))`
- The 14 social/marketplace URL fields: same `.trim().url().optional().or(z.literal(''))` pattern (allow clearing back to blank)
- `shopTradingHours`: a nested zod object — `z.record(z.enum(['monday','tuesday','wednesday','thursday','friday','saturday','sunday']), z.object({ open: z.boolean(), start: z.string().regex(/^\d{2}:\d{2}$/), end: z.string().regex(/^\d{2}:\d{2}$/) })).optional()` (adjust exact zod construction as needed for a partial/record-of-known-keys shape — the point is every provided day must have all three sub-fields validated, and unknown day keys are rejected)

**`platform/api/src/routes/public.ts`** — extend the `GET /api/public/shop/:slug` select to include all the new fields (still excluding anything tenant-private — none of these new fields are private, they're all meant to be publicly shown).

## Frontend (`platform/frontend`)

**`platform/frontend/src/api/shopProfile.ts`** — extend `ShopProfile`/`UpdateShopProfileInput` with the new fields; add a `TradingHours` type (`Record<DayOfWeek, { open: boolean; start: string; end: string }>`) and a `DAYS_OF_WEEK` constant (ordered Monday→Sunday, matching the reference screenshot's order).

**`platform/frontend/src/pages/ShopProfilePage.tsx`** — extend the existing form (read the file first, follow its established section-per-`<section>` pattern from the #21 build) with:
- An "About your shop" textarea (`shopAboutText`).
- An "Availability" text field.
- A "Google reviews link" field alongside the existing WhatsApp field.
- A "Trading hours" section: one row per day (Monday→Sunday), each with an open/closed toggle (`Checkbox` component) and two time inputs (`<input type="time">` via `FormField` with `type="time"`, or a plain input if `FormField` doesn't support that type — check first) that only need to be sensible when `open` is true; initialize any day missing from the loaded `shopTradingHours` to `{ open: false, start: '09:00', end: '17:00' }` so the form always has a complete 7-day object to submit.
- A "Social media" section: 7 `FormField`s (Facebook, Instagram, X/Twitter, TikTok, YouTube, LinkedIn, Discord).
- A "Model marketplaces" section: 7 `FormField`s (Cults3D, Printables, Thingiverse, MakerWorld, Thangs, Creality Cloud, GrabCAD).

## Public page (`landing/`)

**`landing/public/js/shop.js`** — extend the rendering to add, when present in the API response:
- The About text as one or more paragraphs (split on `\n\n` into separate `<p>` elements, built via `document.createElement`/`.textContent` only — no `innerHTML`).
- A trading-hours table/list: one row per day, "Closed" when `open` is false, `"{start} – {end}"` when open.
- A row of social-media icon links (only for the platforms that have a URL set) — plain text links are fine if adding icon assets is disproportionate; don't spend time sourcing/embedding 14 brand SVG icons for this pass, text labels are an acceptable substitute (e.g. a link that reads "Instagram").
- A row of model-marketplace links, same treatment.
- Google reviews link and availability text, placed near the existing tagline/contact block.

## Tests

- `platform/api/tests/shop-profile.test.ts` (extend): PATCH accepts and round-trips the new fields; rejects a malformed `shopTradingHours` (missing `end` for a day, an unknown day key, a non-`HH:MM` time string) with 400; rejects a malformed URL field the same way the existing tests already check for the original fields.
- `platform/api/tests/public.test.ts` (extend): the public shop response includes the new fields for a published shop.
- `platform/frontend/tests/ShopProfilePage.test.tsx` (extend): trading-hours toggles and time inputs save correctly; social/marketplace fields save correctly.

## Global constraints

- Every PATCH field stays optional; omitted keys are left untouched (existing three-state convention only applies to fields that need explicit clearing — most of these are plain optional strings following `shop-profile.ts`'s existing convention for `shopTagline`/`shopHoursText`, not the null-clearing pattern).
- No new dependency (no icon library, no Mapbox SDK) — text-based rendering for anything that would otherwise need one.
- Match Barkie's existing form/section conventions in `ShopProfilePage.tsx` and `CompanyProfilePage.tsx` — do not introduce a new form-building pattern for this one page.
