# Kanban Production Queue (Jobs Board) — Design Spec

**Backlog:** #23 — "Kanban production queue (Jobs board)"

**Goal:** A tenant can turn a Costing Template into a trackable print job and move it through a 5-column board (Backlog → Slicing → Printing → Post-processing → Done) as work actually happens on the shop floor.

## Scope decision — read this before implementing

No drag-and-drop library exists anywhere in this codebase (`platform/frontend/package.json` has no DnD dependency), and every other list-style page in this app uses plain buttons/selects for state changes (see `QuoteDetailPage.tsx`/`InvoiceDetailPage.tsx`'s status-action buttons). **Decision:** columns are visual groupings only; a job moves between them via a status `<select>` on its card (or a "Move to [next stage]" button — implementer's choice, keep it simple), not drag-and-drop. Do not add a DnD dependency for this phase.

Unlike `Invoice`'s status transitions (`VALID_INVOICE_STATUS_TRANSITIONS` in `platform/api/src/routes/invoices.ts`), which protect a real financial state machine (you can't un-pay an invoice), a job's board column is pure workflow tracking with no financial invariant to protect — a shop floor genuinely does move a job backward sometimes (a print fails and needs re-slicing). **Decision:** any of the 5 statuses is a valid `PATCH` target from any other status; there is no transition-adjacency map to build or test, unlike the invoice/quote pattern.

Out of scope: multiple jobs sharing drag-reordering *within* a column, due dates/scheduling, assigning a job to a specific printer or person, customer/quote linkage (a `CostingTemplate` has no `customerId` today — don't add one as a side effect of this feature).

## Data model

New model in `platform/api/prisma/schema.prisma`:

```prisma
model Job {
  id                String    @id @default(uuid())
  tenantId          String
  costingTemplateId String
  name              String
  status            String    @default("backlog")
  notes             String?
  createdAt         DateTime  @default(now()) @db.Timestamptz(3)
  startedAt         DateTime? @db.Timestamptz(3)
  completedAt       DateTime? @db.Timestamptz(3)

  tenant          Tenant          @relation(fields: [tenantId], references: [id])
  costingTemplate CostingTemplate @relation(fields: [costingTemplateId], references: [id])

  @@index([tenantId])
  @@map("jobs")
}
```

Add the inverse relation field `jobs Job[]` on both `Tenant` and `CostingTemplate` in the same migration (Prisma requires the back-relation to exist on both sides).

`name` is a snapshot of the costing template's name **at job-creation time** — the same snapshot convention `CostingTemplate` itself already uses for its filament/printer fields (`filamentSnapshotBrand` etc.), so a job's board card keeps a sensible label even if nothing about the template can change later (it's create-only today, so this is defensive rather than strictly necessary, but matches the established pattern).

`status` values (plain string, not a Prisma enum — matches how `Quote.status`/`Invoice.status` are already plain strings elsewhere in this schema): `"backlog"`, `"slicing"`, `"printing"`, `"post-processing"`, `"done"`.

A `CostingTemplate` can have more than one `Job` (e.g. reprinting the same design) — no uniqueness constraint on `costingTemplateId`.

`startedAt` is set the first time a job's status changes away from `"backlog"` (null while still in Backlog). `completedAt` is set when status becomes `"done"`, cleared (`null`) if it's ever moved back out of `"done"`.

## Backend

**`platform/api/src/db/scoped.ts`** — add a `jobs` accessor on `tenantScope()`:
- `findMany()` → `prisma.job.findMany({ where: { tenantId }, orderBy: { createdAt: 'desc' } })`.
- `findById(id)` → `prisma.job.findFirst({ where: { id, tenantId } })`.
- `create(data: { costingTemplateId: string; name: string })` → `prisma.job.create({ data: { tenantId, ...data } })`.
- `updateStatus(id, status, timestamps)` → `prisma.job.updateMany({ where: { id, tenantId }, data: { status, startedAt: timestamps.startedAt, completedAt: timestamps.completedAt } })` then re-`findById` — mirror the exact `updateMany`-then-refetch pattern `customers.update()` in this same file already uses (it returns the record or `null`), not a raw `prisma.job.update()` (which would 500 instead of cleanly reporting "not found" for a smuggled cross-tenant id — see the `#14`/`#28` fix earlier in this codebase for why).

**`platform/api/src/routes/jobs.ts`** (new router, mounted in `app.ts`):
- `GET /api/jobs` — `requireTenantAuth, requireActiveSubscription`. Returns `{ ok: true, jobs: [...] }`.
- `POST /api/jobs` — same middleware. Body: `{ costingTemplateId: string }`. Look up the costing template via `scoped.costingTemplates.findById()`; 400 `{ ok: false, error: 'Costing template not found.' }` if missing. Create the job with `name` snapshotted from `costingTemplate.name`, `status: 'backlog'`. `201 { ok: true, job: {...} }`.
- `PATCH /api/jobs/:id/status` — same middleware. Body: `{ status: z.enum(['backlog','slicing','printing','post-processing','done']) }`. Load the current job via `findById`; 404 if not found. Compute `startedAt`/`completedAt`: if `current.status === 'backlog' && status !== 'backlog' && current.startedAt === null`, set `startedAt: new Date()`; keep the existing `startedAt` otherwise (don't overwrite it on every move). If `status === 'done'`, set `completedAt: new Date()`; if moving away from `'done'` to anything else, set `completedAt: null`. `200 { ok: true, job: {...} }`.
- `PATCH /api/jobs/:id` — same middleware. Body: `{ notes: z.string().optional() }` (three-state clearing: `'notes' in data ? (data.notes ?? null) : undefined` — reuse the established pattern from `Printer`/`Filament`'s optional-field PATCH schemas) for editing the free-text notes field without touching status.

## Frontend (`platform/frontend`)

**`platform/frontend/src/api/jobs.ts`** (new) — `Job` interface (`id`, `costingTemplateId`, `name`, `status`, `notes: string | null`, `createdAt`, `startedAt: string | null`, `completedAt: string | null`), `useJobs()`, `useCreateJob()` (invalidates the jobs query on success), `useUpdateJobStatus(id)`, `useUpdateJobNotes(id)`.

**`platform/frontend/src/pages/jobs/JobsBoardPage.tsx`** (new) — five columns (one per status, in board order) rendered with CSS grid/flex, each showing the jobs currently in that status as cards (name, notes preview, created/started dates). Each card has a status `<select>` (all 5 options, current one selected) that calls `useUpdateJobStatus` on change — no drag-and-drop, per the scope decision above.

**`platform/frontend/src/pages/costing-templates/CostingTemplateDetailPage.tsx`** — add a "Start Job" button that calls `useCreateJob({ costingTemplateId: template.id })` and, on success, navigates to `/jobs`. If the template already has one or more jobs, show them as links instead of (or alongside) the button — check this file's current structure for the least disruptive place to add this before writing the change.

**`platform/frontend/src/App.tsx`** — route `/jobs` → `<JobsBoardPage />` inside `RequireAuth`.

**`platform/frontend/src/components/AppShell.tsx`** — add `{ to: '/jobs', label: 'Jobs' }` to `NAV_ITEMS`, near `Costing Templates` (the backlog description says the board sits "alongside the Costing Templates list").

## Tests

- `platform/api/tests/jobs.test.ts` (new, `buildMinimalApp`/`loggedInAgent` pattern): auth required; `POST /api/jobs` 400s for an unknown `costingTemplateId`, creates a job with `status: 'backlog'` and the template's name snapshotted for a real one; `PATCH /api/jobs/:id/status` moves through statuses and sets `startedAt` only on the first move out of backlog (assert a second status change doesn't overwrite it); sets and clears `completedAt` correctly entering/leaving `'done'`; 404s for a job belonging to another tenant (tenant-isolation check, matching the pattern in `tests/tenant-isolation.test.ts` for every other resource).
- `platform/frontend/tests/JobsBoardPage.test.tsx` (new): renders jobs grouped into their columns from a mocked `apiGet`; changing a card's status select calls the update mutation with the right id/status.
- `platform/frontend/tests/CostingTemplateDetailPage.test.tsx` (extend): "Start Job" button calls the create endpoint and navigates to `/jobs`.

## Global constraints

- Every route in `jobs.ts` carries `requireTenantAuth, requireActiveSubscription` — matches every resource router post-#6.
- All `Job` reads/writes go through `tenantScope(req.tenantId!)` — never query `prisma.job` directly by anything but the authenticated tenant's id.
- Use the `updateMany`-then-refetch pattern for `updateStatus`/`update` (not a raw `prisma.job.update()`), matching `scoped.ts`'s existing `customers.update()`/`printers.update()`.
- Three-state PATCH-clearing (`'field' in data ? (value ?? null) : undefined`) only where a field can be explicitly cleared back to null after being set — that's `notes` here, nothing else.
