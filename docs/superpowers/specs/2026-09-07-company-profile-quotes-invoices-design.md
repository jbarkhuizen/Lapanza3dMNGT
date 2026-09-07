# Company Profile + Quotes/Invoices — Design

**Status:** Approved
**Source:** SRS §4.4 (Company Profile), §4.11/§8.3 (Quotes/Invoices)
**Scope:** API + data only. No PDF generation, no email sending — deferred to a future slice once SMTP infra and a frontend trigger exist.

## Why company profile first

Quotes/invoices need VAT-registration status (to decide whether to add 15% VAT), banking details and legal text (to appear on documents once PDF generation lands), and configurable document-number prefixes. None of that exists on `Tenant` today. Building it first avoids threading half-finished fields through the quote/invoice work.

## 1. Company Profile

Singleton per tenant — new fields directly on `Tenant`, no separate table.

**New `Tenant` fields:**
- `registrationNumber String?`
- `vatRegistered Boolean @default(false)`
- `vatNumber String?`
- `logoUrl String?` (field only — no upload endpoint yet; file storage is a separate decision)
- `addressLine1 String?`, `addressLine2 String?`, `city String?`, `postalCode String?`
- `phone String?`, `website String?`
- `bankName String?`, `bankAccountHolder String?`, `bankAccountNumber String?`, `bankBranchCode String?`
- `termsAndConditionsText String?`
- `defaultCurrency String @default("ZAR")`
- `defaultQuoteValidityDays Int?`
- `quoteNumberPrefix String @default("QT")`
- `invoiceNumberPrefix String @default("INV")`

All optional except the three with defaults — a tenant can operate before filling in banking/address details.

**API:** `GET /api/company-profile`, `PATCH /api/company-profile`. Both operate on the authenticated tenant's own row — no `:id` param, no list endpoint. Zod schema validates `vatNumber` required-if `vatRegistered: true` at the application layer (DB stays nullable — the constraint is a business rule, not a data-integrity one, and it can be true→false without clearing the number).

## 2. Numbering

Sequential per-tenant document numbers (`QT-0001`, `INV-0001`), race-safe under concurrent creates.

**New model:**
```
model TenantSequence {
  id       String @id @default(uuid())
  tenantId String
  type     String // "quote" | "invoice"
  value    Int    @default(0)

  tenant Tenant @relation(fields: [tenantId], references: [id])

  @@unique([tenantId, type])
  @@map("tenant_sequences")
}
```

Next number obtained via `prisma.tenantSequence.update({ where: { tenantId_type: {...} }, data: { value: { increment: 1 } } })` — Prisma compiles `{ increment: 1 }` to a single atomic `UPDATE ... SET value = value + 1` statement, so concurrent requests can't produce duplicate numbers without any manual locking. The row is created (via `upsert`, starting at 0) the first time a tenant issues a quote or invoice.

Formatted number = `{prefix}-{value.toString().padStart(4, '0')}`, prefix read from the tenant's `quoteNumberPrefix`/`invoiceNumberPrefix` at creation time (not re-derived later, so a later prefix change doesn't relabel old documents).

## 3. Quotes

```
model Quote {
  id          String    @id @default(uuid())
  tenantId    String
  number      String    // e.g. "QT-0001", snapshotted formatted string
  customerId  String
  status      String    @default("draft") // draft | sent | accepted | expired
  validUntil  DateTime? @db.Timestamptz(3)
  vatApplied  Boolean   // snapshot of tenant.vatRegistered at creation
  subtotal    Decimal   @db.Decimal(12, 2)
  vatAmount   Decimal   @db.Decimal(12, 2)
  total       Decimal   @db.Decimal(12, 2)
  notes       String?
  createdAt   DateTime  @default(now()) @db.Timestamptz(3)

  tenant   Tenant       @relation(fields: [tenantId], references: [id])
  customer Customer     @relation(fields: [customerId], references: [id])
  lineItems QuoteLineItem[]
  invoice  Invoice?

  @@index([tenantId])
  @@map("quotes")
}

model QuoteLineItem {
  id                String   @id @default(uuid())
  tenantId          String
  quoteId           String
  costingTemplateId String?
  description       String
  quantity          Float    @default(1)
  unitPrice         Decimal  @db.Decimal(12, 2)
  lineTotal         Decimal  @db.Decimal(12, 2)

  tenant          Tenant           @relation(fields: [tenantId], references: [id])
  quote           Quote            @relation(fields: [quoteId], references: [id])
  costingTemplate CostingTemplate? @relation(fields: [costingTemplateId], references: [id], onDelete: SetNull)

  @@index([tenantId])
  @@index([quoteId])
  @@map("quote_line_items")
}
```

**Create (`POST /api/quotes`):** body has `customerId`, optional `validUntil` (defaults to `now() + tenant.defaultQuoteValidityDays` days if the tenant set one), optional `notes`, and `lineItems: [{ costingTemplateId } | { description, unitPrice }, quantity ]`. Each line resolves to `description`/`unitPrice`:
- `costingTemplateId` given → look up the tenant-scoped `CostingTemplate`, snapshot its `name` as `description` and `suggestedPrice` as `unitPrice`. 400 if not found or belongs to another tenant.
- otherwise → `description` and `unitPrice` are required directly in the request.

`lineTotal = round(unitPrice * quantity, 2)`. `subtotal = round(sum(lineTotal), 2)`. `vatApplied = tenant.vatRegistered`; `vatAmount = vatApplied ? round(subtotal * 0.15, 2) : 0.00`; `total = subtotal + vatAmount`. Money handling follows the same convention as the costing engine: live `Decimal` in the data layer, rounding owned by the calculation (not delegated to column DDL), formatting only at the HTTP response boundary.

**Status transitions (`PATCH /api/quotes/:id/status`):** body `{ status }`, one of `sent`, `accepted`, `expired` (never back to `draft`). No content edits after creation — a wrong quote is recreated, not patched, matching the CostingTemplate snapshot philosophy already established in this codebase. "Send" only flips status; no email is dispatched (deferred).

**Convert to invoice (`POST /api/quotes/:id/convert-to-invoice`):** requires `status === 'accepted'` (400 otherwise), requires the quote doesn't already have an invoice (400 otherwise — one invoice per quote). Creates an `Invoice` copying `customerId`, `vatApplied`, `subtotal`, `vatAmount`, `total`, and each line item (with `quoteLineItemId` set for traceability), `dueDate` defaulted to `now() + 30 days`. Wrapped in a Prisma transaction with the sequence-number increment.

## 4. Invoices

```
model Invoice {
  id          String    @id @default(uuid())
  tenantId    String
  number      String
  customerId  String
  quoteId     String?   @unique
  status      String    @default("unpaid") // unpaid | partially_paid | paid | overdue
  dueDate     DateTime  @db.Timestamptz(3)
  vatApplied  Boolean
  subtotal    Decimal   @db.Decimal(12, 2)
  vatAmount   Decimal   @db.Decimal(12, 2)
  total       Decimal   @db.Decimal(12, 2)
  amountPaid  Decimal   @default(0) @db.Decimal(12, 2)
  notes       String?
  createdAt   DateTime  @default(now()) @db.Timestamptz(3)

  tenant   Tenant   @relation(fields: [tenantId], references: [id])
  customer Customer @relation(fields: [customerId], references: [id])
  quote    Quote?   @relation(fields: [quoteId], references: [id])
  lineItems InvoiceLineItem[]

  @@index([tenantId])
  @@map("invoices")
}

model InvoiceLineItem {
  id                String   @id @default(uuid())
  tenantId          String
  invoiceId         String
  quoteLineItemId   String?
  costingTemplateId String?
  description       String
  quantity          Float    @default(1)
  unitPrice         Decimal  @db.Decimal(12, 2)
  lineTotal         Decimal  @db.Decimal(12, 2)

  tenant          Tenant           @relation(fields: [tenantId], references: [id])
  invoice         Invoice          @relation(fields: [invoiceId], references: [id])
  costingTemplate CostingTemplate? @relation(fields: [costingTemplateId], references: [id], onDelete: SetNull)

  @@index([tenantId])
  @@index([invoiceId])
  @@map("invoice_line_items")
}
```

**Direct create (`POST /api/invoices`):** same shape and calculation rules as quote creation (`customerId`, `dueDate` optional — defaults `now() + 30 days`, `lineItems`), no `quoteId`.

**Status/payment (`PATCH /api/invoices/:id/status`):** body `{ status, amountPaid? }`. `partially_paid` requires `amountPaid > 0 && amountPaid < total`; `paid` sets/requires `amountPaid === total`. `overdue` is a manual flip in this pass (no scheduled job to auto-detect it yet — that's a backlog item, not blocking).

## 5. Tenant isolation

Every new table (`TenantSequence`, `Quote`, `QuoteLineItem`, `Invoice`, `InvoiceLineItem`) gets a `scoped.ts` group and a cross-tenant isolation test, following the existing pattern (e.g. `CostingTemplate`'s). Line-item creation resolves `customerId` and any `costingTemplateId` through tenant-scoped lookups before any calculation runs — same "resolve everything first, 400 on any miss" order used in `routes/costing-templates.ts`.

## 6. Out of scope (this slice)

- PDF generation, email sending
- Logo file upload (field exists, no endpoint)
- Automatic `overdue` detection (scheduled job)
- Editing quote/invoice line items after creation
- Online payment links
