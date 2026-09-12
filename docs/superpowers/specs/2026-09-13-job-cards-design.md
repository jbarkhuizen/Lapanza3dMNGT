# Job Cards — Design Spec

**Source:** competitor reference screenshots ("Job cards" list + Repair/Print/CAD job card forms). A distinct feature from the existing Kanban `Job` model (backlog #23, which tracks a *costing-template-derived* print job through workflow columns) — Job Cards are customer-facing service-intake tickets: what was received, what was agreed, signed off by the customer.

## Scope decision

The reference shows a "Blank card" / "Print blank cards" button implying a printable paper-form PDF for a customer to hand-fill at a counter. **Skip that entirely for this pass** — it's a real, separable feature (PDF generation from a template with no data), not core to having Job Cards at all. Build the digital CRUD + "raise a quote from this card" flow only.

## Data model

New model in `platform/api/prisma/schema.prisma`:

```prisma
model JobCard {
  id           String    @id @default(uuid())
  tenantId     String
  number       String
  cardType     String
  customerId   String?
  jobTitle     String
  status       String    @default("new")
  priority     String    @default("normal")
  assignedTo   String?
  receivedDate DateTime  @db.Timestamptz(3)
  requiredBy   DateTime? @db.Timestamptz(3)
  notes        String?
  terms        String?
  receivedBy   String?
  quoteId      String?   @unique
  createdAt    DateTime  @default(now()) @db.Timestamptz(3)

  // Repair fields
  equipmentMake          String?
  equipmentModel         String?
  equipmentSerial        String?
  reportedFault          String?
  receivedWithPowerCord  Boolean  @default(false)
  receivedWithFilament   Boolean  @default(false)
  receivedWithBuildPlate Boolean  @default(false)
  receivedWithSdCard     Boolean  @default(false)
  receivedWithTools      Boolean  @default(false)
  receivedWithOther      String?
  conditionPrintHead     String?
  conditionPrintBed      String?
  conditionExistingDamage String?
  technicianFindings     String?

  // Print fields
  printFileName       String?
  printQuantity        Int?
  printWhatIsPrinted  String?
  printProcess        String?
  printMaterial       String?
  printColour         String?
  printQuality        String?
  finishRemoveSupports Boolean @default(false)
  finishDeburrClean    Boolean @default(false)
  finishSand           Boolean @default(false)
  finishPrime          Boolean @default(false)
  finishPaint          Boolean @default(false)
  finishPostCure       Boolean @default(false)
  finishInstallInserts Boolean @default(false)
  finishAssemble       Boolean @default(false)
  resultQuantityAccepted Int?
  resultQuantityRejected Int?
  resultNotes          String?

  // CAD fields
  cadDesignType         String?
  cadWhatModelMustDo    String?
  cadMaterial           String?
  cadIntendedProcess    String?
  cadTolerances         String?
  cadCriticalDimensions String?
  deliverableNativeCad  Boolean @default(false)
  deliverableStep       Boolean @default(false)
  deliverableStl        Boolean @default(false)
  deliverable3mf        Boolean @default(false)
  deliverableDxf        Boolean @default(false)
  deliverableDrawingPdf Boolean @default(false)
  deliverableRenderedImages Boolean @default(false)
  cadApprovedRevision   String?

  tenant   Tenant    @relation(fields: [tenantId], references: [id])
  customer Customer? @relation(fields: [customerId], references: [id])
  quote    Quote?    @relation(fields: [quoteId], references: [id])

  @@unique([tenantId, number])
  @@index([tenantId])
  @@map("job_cards")
}
```

`cardType`: `'repair' | 'print' | 'cad'`. `status`: `'new' | 'in_progress' | 'done' | 'cancelled'`. `priority`: `'low' | 'normal' | 'high'`. All the type-specific columns are nullable/default-false and only populated for their own `cardType` — the same "sparse columns per variant" approach this schema already uses elsewhere (e.g. `CostingTemplate`'s filament-vs-printer snapshot fields), not a JSON blob, for consistency with the rest of this codebase.

`number` is a new `TenantSequence` type `'job_card'`, formatted via the existing `formatDocumentNumber()` helper — check `platform/api/src/lib/numbering.ts` and how `Quote`/`Invoice` mint theirs via `scoped.tenantSequences.next()` and mirror it exactly. Note this is a THIRD sequence type alongside `'quote'`/`'invoice'` — no schema change needed for `TenantSequence` itself (`type` is already a plain string), just a new value.

Add inverse relations: `jobCards JobCard[]` on `Tenant`, `Customer`, and `Quote`.

## Backend

**`platform/api/src/db/scoped.ts`** — add a `jobCards` accessor: `findMany()`, `findById(id)`, `create(data)` (mints the next `'job_card'` sequence number itself, same pattern as `quotes.create`), `update(id, data)` (updateMany-then-refetch pattern, three-state clearing for every nullable field the same way `Job.update()`/`Printer` optional fields already do it), `linkQuote(id, quoteId)`.

**`platform/api/src/routes/job-cards.ts`** (new router, mounted in `app.ts`):
- `GET /api/job-cards` — list, tenant-scoped.
- `GET /api/job-cards/stats` — placed before `/:id`. Returns `{ dueSoon, awaitingQuote, quoted, invoiced }`: `dueSoon` = count where `requiredBy` is within the next 3 days and `status` not in `['done','cancelled']`; `awaitingQuote` = count where `quoteId IS NULL` and `status` not `'cancelled'`; `quoted` = count where `quoteId IS NOT NULL`; `invoiced` = count where `quoteId IS NOT NULL` and that quote's linked `Invoice` exists (a join — use `prisma.jobCard.count({ where: { tenantId, quote: { invoice: { isNot: null } } } })` or equivalent).
- `GET /api/job-cards/:id`.
- `POST /api/job-cards` — body includes `cardType` plus whichever type-specific fields apply (zod: a discriminated union on `cardType`, each variant only allowing its own fields — reject a `print`-typed request that includes `cadDesignType`, etc., don't just silently ignore it).
- `PATCH /api/job-cards/:id` — same discriminated-union shape, all fields optional within the card's own existing `cardType` (changing `cardType` after creation is not supported — reject it).
- `POST /api/job-cards/:id/create-quote` — creates a new `Quote` for the card's `customerId` (400 if the card has no customer set) with one line item (`description: card.jobTitle, unitPrice: 0, quantity: 1`, no `costingTemplateId`) via the existing `scoped.quotes.create()`, links `jobCard.quoteId` to it, returns the created quote. 400 if the card already has a `quoteId` (don't silently create a second one).

## Frontend (`platform/frontend`)

**`platform/frontend/src/api/jobCards.ts`** (new) — `JobCard` interface (all fields above), `useJobCards()`, `useJobCardStats()`, `useJobCard(id)`, `useCreateJobCard()`, `useUpdateJobCard(id)`, `useCreateQuoteFromJobCard(id)`.

**`platform/frontend/src/pages/jobCards/JobCardsListPage.tsx`** (new) — the 4-stat row (Due Soon / Awaiting Quote / Quoted / Invoiced), a "New job card" button opening a small type-picker (Repair / Print job / CAD job — a dropdown or three buttons, matching the reference's dropdown-under-button pattern), list of existing cards (number, title, type, status, customer name, due date), each row linking to its detail/edit page.

**`platform/frontend/src/pages/jobCards/JobCardFormPage.tsx`** (new) — one page handling all three `cardType`s: shared fields first (customer select, job title, status, priority, assigned-to, received/required dates), then a type-specific section rendered conditionally on `cardType` (only shown/submitted for the type actually selected — read the reference screenshots' exact field groupings above and mirror them), then shared Notes/Terms fields and a "Received by" / signature-name line at the bottom (plain text inputs — no real e-signature capture, matching the reference's simple underlined signature-line treatment). A "Raise a quote" button once a customer is set and no `quoteId` yet; once a quote exists, show a link to it instead of the button.

**`platform/frontend/src/App.tsx`** — routes `/job-cards`, `/job-cards/new`, `/job-cards/:id`, inside `RequireAuth`.

**`platform/frontend/src/components/AppShell.tsx`** — add `{ to: '/job-cards', label: 'Job Cards' }` to `NAV_ITEMS`, near `Jobs` (the Kanban board) — but keep the two clearly visually/textually distinct so a tenant doesn't confuse "Jobs" (the Kanban board) with "Job Cards" (this feature).

## Tests

- `platform/api/tests/job-cards.test.ts` (new): auth required; create/get/update cycle for each of the three `cardType`s; a create request with fields from the wrong type is rejected; `stats` route returns correct counts against fixture data; `create-quote` links the card and 400s on a second attempt; tenant isolation (404 for another tenant's card).
- `platform/frontend/tests/JobCardsListPage.test.tsx` / `JobCardFormPage.test.tsx` (new): list renders stats and rows from mocked data; form renders the correct field section per `cardType` and submits the right shape for each.

## Global constraints

- Every route: `requireTenantAuth, requireActiveSubscription`, tenant-scoped via `tenantScope()`.
- `updateMany`-then-refetch pattern for all writes (not raw `prisma.jobCard.update()`), matching `Job`/`Customer`.
- Three-state PATCH-clearing (`'field' in data ? (value ?? null) : undefined`) for every nullable field, matching the established convention.
