# Material Selector / Comparison Library — Design Spec

**Backlog:** #22 — "Material selector / comparison library"

**Goal:** Give a logged-in tenant a browsable, filterable reference table of common 3D-printing materials (recommended temps, ZAR/kg price range, application tags) inside the admin dashboard, with a two-material side-by-side comparison and a "use this material" shortcut into adding a new Filament.

## Scope decision — read this before implementing

The backlog description says the "use this material" link "pre-fills a new costing template." That is not literally possible with the current API: `POST /api/costing-templates` (`platform/api/src/routes/costing-templates.ts`) requires an existing `filamentId` belonging to the tenant — a costing template cannot be created from a bare material name, only from a Filament row the tenant has already added to their own inventory. Re-plumbing costing-template creation to accept an unsaved/synthetic filament is out of scope and not requested elsewhere.

**Decision:** "use this material" instead pre-fills the **New Filament** form (`/filaments/new`) — the actual next step in a tenant's real workflow — with the material's name as `materialType` and the midpoint of its ZAR/kg price range as a starting `costPerKg` the tenant can adjust. Once that filament is saved, they use it in a costing template exactly as today. This is a deliberate reinterpretation of the backlog text to match what the system can actually do; note it if a human reviews this against the original ticket.

Out of scope: an admin UI for tenants to add/edit materials (this is platform-curated reference data, not tenant-generated content — no CRUD needed, only read endpoints), the guided "which material fits my part" quiz that the public landing site's `/materials.html` already has (that page serves end customers; this feature serves tenants who already know roughly what they're comparing).

## Data model

New model in `platform/api/prisma/schema.prisma`, global (no `tenantId` — this is shared reference data, the same status as `Plan`):

```prisma
model Material {
  id                     String   @id
  name                   String
  chemistry              String
  bestFor                String
  nozzleTempC            Int
  bedTempC               Int
  requiresEnclosure      Boolean  @default(false)
  requiresHardenedNozzle Boolean  @default(false)
  requiresDirectDrive    Boolean  @default(false)
  recommendsDryFilament  Boolean  @default(false)
  recommendsVentilation  Boolean  @default(false)
  difficulty             String
  moisture                String
  abrasive               Boolean  @default(false)
  priceZarPerKgLow       Float
  priceZarPerKgHigh      Float
  priceEstimated         Boolean  @default(false)
  whyChooseIt            String
  avoidWhenText          String
  tags                   String[] @default([])
  createdAt              DateTime @default(now()) @db.Timestamptz(3)

  @@map("materials")
}
```

`id` is a stable slug (`'pla'`, `'petg'`, etc.), not a `uuid()` default — set explicitly at seed time, matching the ids already used in `landing/public/js/materials-data.js`.

**Seed data:** `platform/api/prisma/seed.ts` (check whether this file already exists — if `package.json#prisma.seed` is configured, add to it; if not, create it and wire it up the same way) inserts every material from `landing/public/js/materials-data.js`'s `MATERIALS` array (currently PLA, PETG, and others — read that file for the full, current list) via `prisma.material.upsert()` keyed on `id`, mapping `printerRequirements.nozzleTempC` → `nozzleTempC`, `priceZarPerKg.low/high/estimated` → `priceZarPerKgLow/High/priceEstimated`, and flattening the rest 1:1. This is a deliberate one-time duplication of that data — `landing/` and `platform/api` are separate apps with separate databases and no shared import boundary, so there is no way to share the literal source without new cross-app plumbing that isn't otherwise needed. If the two ever drift, that's expected; this table is the source of truth for the in-app tenant-facing feature, `materials-data.js` for the public page.

## Backend

**`platform/api/src/routes/materials.ts`** (new router, mounted in `app.ts`):
- `GET /api/materials` — `requireTenantAuth, requireActiveSubscription`. Optional `?tag=` query param filters by `tags` array containing that value (Prisma `has`). Returns `{ ok: true, materials: [...] }`, every field as stored (no Decimal fields here, nothing to `.toFixed()`).
- `GET /api/materials/:id` — same auth. 404 `{ ok: false, error: 'Material not found.' }` if no row with that id. Otherwise `{ ok: true, material: {...} }`.

No POST/PATCH/DELETE — this is read-only reference data for tenants.

## Frontend (`platform/frontend`)

**`platform/frontend/src/api/materials.ts`** (new) — `Material` interface matching the model 1:1 (`tags: string[]`, everything else per the schema above), `useMaterials(tag?: string)` (`GET /api/materials` or `/api/materials?tag=...`), `useMaterial(id: string)` (`GET /api/materials/:id`).

**`platform/frontend/src/pages/materials/MaterialsLibraryPage.tsx`** (new) — grid of material cards (name, chemistry, bestFor, price range, tag chips), a tag-filter row above the grid (same tag vocabulary as `landing/public/js/materials.js`'s `TAG_LABELS`: `beginner-friendly`, `flexible`, `outdoor-safe`, `food-safe`, `engineering`). Each card has a "Use this material" link to `/filaments/new?materialType={name}&costPerKg={round((low+high)/2)}` and a "Compare" checkbox; when exactly two materials are checked, show a "Compare selected" button that navigates to `/materials/compare?a={id1}&b={id2}`.

**`platform/frontend/src/pages/materials/MaterialComparePage.tsx`** (new) — reads `a`/`b` from `useSearchParams()`, loads both via `useMaterial`, renders a table with one row per attribute (temps, difficulty, moisture, abrasive, price, requirements) — same structural idea as `landing/public/js/materials.js`'s `COMPARE_ROWS`/`renderCompareResult()`, but as a React component instead of hand-built DOM. If either id is missing/invalid, show "Pick two materials to compare them" with a link back to `/materials`.

**`platform/frontend/src/pages/filaments/FilamentFormPage.tsx`** — in create mode only (`!isEditMode`), read `materialType` and `costPerKg` from `useSearchParams()` and use them as the initial values in the `emptyForm`-derived state instead of `''`/`undefined`, via a lazy `useState` initializer (`useState(() => ({ ...emptyForm, materialType: params.get('materialType') ?? '', costPerKg: params.get('costPerKg') ? Number(params.get('costPerKg')) : undefined }))`) — do not touch the existing populate-from-`existingFilament` effect, which already only runs in edit mode.

**`platform/frontend/src/App.tsx`** — routes `/materials` → `<MaterialsLibraryPage />` and `/materials/compare` → `<MaterialComparePage />`, both inside `RequireAuth`.

**`platform/frontend/src/components/AppShell.tsx`** — add `{ to: '/materials', label: 'Materials' }` to `NAV_ITEMS`.

## Tests

- `platform/api/tests/materials.test.ts` (new): auth-required on both routes, list returns seeded materials, `?tag=` filters correctly, detail 404 for an unknown id, detail 200 for a known one. Seed the test DB's `Material` rows directly in the test (2–3 fixture rows via `prisma.material.create`) rather than depending on the real seed script having run against the test database.
- `platform/frontend/tests/MaterialsLibraryPage.test.tsx` (new): renders materials from a mocked `apiGet`, tag filter narrows the list, "Use this material" link has the correct `href` with query params.
- `platform/frontend/tests/MaterialComparePage.test.tsx` (new): renders both materials' data side by side given `?a=pla&b=petg`; shows the empty-state copy when a param is missing.
- `platform/frontend/tests/FilamentFormPage.test.tsx` (extend): a new create-mode test asserting `/filaments/new?materialType=PETG&costPerKg=360` pre-fills those two fields and leaves the rest at their normal empty defaults.

## Global constraints

- `materials.ts`'s two routes carry `requireTenantAuth, requireActiveSubscription`, matching every other resource router post-#6 — this is tenant-gated read access to shared data, not a public endpoint.
- No `tenantId` on `Material` and no `tenantScope()` involvement anywhere in this feature — it is intentionally global, unlike every other model in this schema.
- Follow existing list/detail hook and page patterns exactly (`platform/frontend/src/api/consumables.ts` and `ConsumablesListPage.tsx` are a good structural reference for a simple read-oriented resource).
