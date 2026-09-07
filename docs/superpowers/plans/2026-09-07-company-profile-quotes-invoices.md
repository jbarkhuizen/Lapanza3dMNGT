# Company Profile + Quotes/Invoices Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Company Profile (SRS §4.4) to `Tenant`, then Quotes and Invoices (SRS §4.11/§8.3) with VAT calculation, per-tenant sequential numbering, and quote→invoice conversion. API and data only — no PDF, no email.

**Architecture:** Four vertical slices, each schema→data-layer→route→tests, built on the existing tenant-scoping (`tenantScope()` in `src/db/scoped.ts`) and Decimal-money conventions (live `Prisma.Decimal` in the data layer, formatting only at the HTTP boundary, rounding owned by a pure calculation function) already established by the costing engine.

**Tech Stack:** Node/TypeScript, Express 5, Prisma/PostgreSQL, zod, `node:test` + `supertest`.

## Global Constraints

- Every money field is `Decimal` at the schema's stated precision; the data layer (`scoped.ts`) never formats — it always returns a live `Prisma.Decimal`. Formatting (`.toFixed(n)`) happens only in each route file's `serialize*()` helper, at the HTTP response boundary.
- Any pure calculation function rounds a RATE to its column scale (2dp) before deriving a COST from it, and rounds each line-item cost before summing into a total — never round only the final total.
- Regression tests for money math use independently hand-computed expected values, never a value re-derived from the same formula under test.
- Every new tenant-scoped table gets a group in `tenantScope()` (`src/db/scoped.ts`) and at least one cross-tenant isolation test in `tests/tenant-isolation.test.ts`, following the existing pattern (e.g. `costingTemplates`).
- Every child-resource creation resolves and validates all referenced records (customer, costing template) via `tenantScope()` lookups BEFORE running any calculation — 400 on any miss, matching `routes/costing-templates.ts`'s existing order.
- Route files require auth via `router.use(requireTenantAuth)`, matching every existing router.
- New tables added to `tests/helpers/testApp.ts`'s `resetTestDatabase()`, children before parents, before the existing `customer`/`tenant` deletes (since the new tables reference `Customer`/`Tenant`).

---

### Task 1: Company Profile

**Files:**
- Modify: `prisma/schema.prisma` (add fields to `Tenant`)
- Modify: `src/db/scoped.ts` (add `companyProfile` group)
- Create: `src/routes/company-profile.ts`
- Modify: `src/app.ts` (mount the router)
- Create: `tests/company-profile.test.ts`

**Interfaces:**
- Produces: `tenantScope(tenantId).companyProfile.get()` → `Promise<CompanyProfile | null>`; `.update(data: UpdateCompanyProfileInput)` → `Promise<CompanyProfile>`, where `CompanyProfile` is the subset of `Tenant` fields listed below (never `passwordHash`, `verificationToken`, `verificationTokenExpires`).
- Produces: `GET /api/company-profile`, `PATCH /api/company-profile` — later tasks read `defaultQuoteValidityDays`, `quoteNumberPrefix`, `invoiceNumberPrefix`, `vatRegistered` off `tenantScope(tenantId).companyProfile.get()`.

- [ ] **Step 1: Add company-profile fields to `Tenant` and generate the migration**

Edit `prisma/schema.prisma`, inside `model Tenant { ... }`, add these fields right after `createdAt`:

```prisma
  registrationNumber       String?
  vatRegistered            Boolean   @default(false)
  vatNumber                String?
  logoUrl                  String?
  addressLine1             String?
  addressLine2             String?
  city                     String?
  postalCode               String?
  phone                    String?
  website                  String?
  bankName                 String?
  bankAccountHolder        String?
  bankAccountNumber        String?
  bankBranchCode           String?
  termsAndConditionsText   String?
  defaultCurrency          String    @default("ZAR")
  defaultQuoteValidityDays Int?
  quoteNumberPrefix        String    @default("QT")
  invoiceNumberPrefix      String    @default("INV")
```

Run:
```bash
npx prisma migrate dev --name add_company_profile_fields
```
Expected: a new migration directory under `prisma/migrations/`, applied cleanly to `barkie_dev`.

- [ ] **Step 2: Add the `companyProfile` group to `tenantScope()`**

In `src/db/scoped.ts`, add these interfaces near the top (after the existing `Update*Input` interfaces, before `export function tenantScope`):

```typescript
export interface UpdateCompanyProfileInput {
  businessName?: string;
  contactName?: string;
  registrationNumber?: string;
  vatRegistered?: boolean;
  vatNumber?: string;
  logoUrl?: string;
  addressLine1?: string;
  addressLine2?: string;
  city?: string;
  postalCode?: string;
  phone?: string;
  website?: string;
  bankName?: string;
  bankAccountHolder?: string;
  bankAccountNumber?: string;
  bankBranchCode?: string;
  termsAndConditionsText?: string;
  defaultCurrency?: string;
  defaultQuoteValidityDays?: number;
  quoteNumberPrefix?: string;
  invoiceNumberPrefix?: string;
}
```

Add this constant right after the interface (it's reused by `get` and `update` so the two can never drift):

```typescript
const companyProfileSelect = {
  businessName: true,
  contactName: true,
  email: true,
  registrationNumber: true,
  vatRegistered: true,
  vatNumber: true,
  logoUrl: true,
  addressLine1: true,
  addressLine2: true,
  city: true,
  postalCode: true,
  phone: true,
  website: true,
  bankName: true,
  bankAccountHolder: true,
  bankAccountNumber: true,
  bankBranchCode: true,
  termsAndConditionsText: true,
  defaultCurrency: true,
  defaultQuoteValidityDays: true,
  quoteNumberPrefix: true,
  invoiceNumberPrefix: true,
} as const;
```

Inside `tenantScope(tenantId)`'s returned object, add a `companyProfile` group as a sibling of `customers`, `printers`, etc.:

```typescript
    companyProfile: {
      get: () => prisma.tenant.findUnique({ where: { id: tenantId }, select: companyProfileSelect }),

      update: (data: UpdateCompanyProfileInput) =>
        prisma.tenant.update({ where: { id: tenantId }, data, select: companyProfileSelect }),
    },
```

The explicit `select` is load-bearing: it's what keeps `passwordHash`, `verificationToken`, and `verificationTokenExpires` out of every company-profile response, so there's no separate serializer needed at the route layer for secrecy (only for `Decimal` fields, and this resource has none).

- [ ] **Step 3: Write the company-profile route**

Create `src/routes/company-profile.ts`:

```typescript
import { Router } from 'express';
import { z } from 'zod';
import { requireTenantAuth } from '../middleware/requireTenantAuth.js';
import { tenantScope } from '../db/scoped.js';

export const companyProfileRouter = Router();
companyProfileRouter.use(requireTenantAuth);

const updateCompanyProfileSchema = z
  .object({
    businessName: z.string().min(1).optional(),
    contactName: z.string().min(1).optional(),
    registrationNumber: z.string().optional(),
    vatRegistered: z.boolean().optional(),
    vatNumber: z.string().optional(),
    logoUrl: z.string().optional(),
    addressLine1: z.string().optional(),
    addressLine2: z.string().optional(),
    city: z.string().optional(),
    postalCode: z.string().optional(),
    phone: z.string().optional(),
    website: z.string().optional(),
    bankName: z.string().optional(),
    bankAccountHolder: z.string().optional(),
    bankAccountNumber: z.string().optional(),
    bankBranchCode: z.string().optional(),
    termsAndConditionsText: z.string().optional(),
    defaultCurrency: z.string().optional(),
    defaultQuoteValidityDays: z.number().int().positive().optional(),
    quoteNumberPrefix: z.string().min(1).optional(),
    invoiceNumberPrefix: z.string().min(1).optional(),
  })
  .refine((data) => !(data.vatRegistered === true && data.vatNumber === ''), {
    message: 'VAT number is required when VAT-registered.',
  });

companyProfileRouter.get('/api/company-profile', async (req, res) => {
  const scoped = tenantScope(req.tenantId!);
  const profile = await scoped.companyProfile.get();
  res.json({ ok: true, companyProfile: profile });
});

companyProfileRouter.patch('/api/company-profile', async (req, res) => {
  const parsed = updateCompanyProfileSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ ok: false, error: 'Invalid company profile fields.' });
  }
  const scoped = tenantScope(req.tenantId!);
  const current = await scoped.companyProfile.get();
  if (current === null) {
    return res.status(404).json({ ok: false, error: 'Tenant not found.' });
  }
  const willBeVatRegistered = parsed.data.vatRegistered ?? current.vatRegistered;
  const willHaveVatNumber = parsed.data.vatNumber ?? current.vatNumber;
  if (willBeVatRegistered && !willHaveVatNumber) {
    return res.status(400).json({ ok: false, error: 'VAT number is required when VAT-registered.' });
  }
  const profile = await scoped.companyProfile.update(parsed.data);
  res.json({ ok: true, companyProfile: profile });
});
```

The `willBeVatRegistered`/`willHaveVatNumber` check (rather than only the zod `.refine`) is needed because `.refine` only sees the current PATCH body, not the tenant's existing stored `vatNumber` — a request that flips `vatRegistered: true` without also sending `vatNumber` should still fail if the tenant has never set one.

- [ ] **Step 4: Mount the router**

In `src/app.ts`, add the import alongside the others:

```typescript
import { companyProfileRouter } from './routes/company-profile.js';
```

And mount it alongside the others (after `app.use(costingTemplatesRouter);`):

```typescript
  app.use(companyProfileRouter);
```

- [ ] **Step 5: Write the tests**

Create `tests/company-profile.test.ts`:

```typescript
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { buildApp } from '../src/app.js';
import { resetTestDatabase } from './helpers/testApp.js';
import { prisma } from '../src/db/client.js';

beforeEach(resetTestDatabase);

async function loggedInAgent(app: ReturnType<typeof buildApp>, email = 'jane@acmeprints.co.za') {
  await request(app).post('/api/auth/register').send({
    businessName: 'Acme Prints',
    contactName: 'Jane Doe',
    email,
    password: 'correct horse battery staple',
  });
  const tenant = await prisma.tenant.findUnique({ where: { email } });
  await request(app).post('/api/auth/verify-email').send({ token: tenant?.verificationToken });

  const agent = request.agent(app);
  await agent.post('/api/auth/login').send({ email, password: 'correct horse battery staple' });
  return agent;
}

test('company profile endpoints require auth', async () => {
  const app = buildApp();
  const res = await request(app).get('/api/company-profile');
  assert.equal(res.status, 401);
});

test('GET /api/company-profile returns defaults for a freshly registered tenant, never the password hash', async () => {
  const app = buildApp();
  const agent = await loggedInAgent(app);
  const res = await agent.get('/api/company-profile');
  assert.equal(res.status, 200);
  assert.equal(res.body.companyProfile.businessName, 'Acme Prints');
  assert.equal(res.body.companyProfile.vatRegistered, false);
  assert.equal(res.body.companyProfile.defaultCurrency, 'ZAR');
  assert.equal(res.body.companyProfile.quoteNumberPrefix, 'QT');
  assert.equal(res.body.companyProfile.invoiceNumberPrefix, 'INV');
  assert.equal('passwordHash' in res.body.companyProfile, false);
});

test('PATCH /api/company-profile updates fields', async () => {
  const app = buildApp();
  const agent = await loggedInAgent(app);
  const res = await agent.patch('/api/company-profile').send({
    registrationNumber: '2024/123456/07',
    addressLine1: '1 Industria Rd',
    city: 'Cape Town',
    bankName: 'FNB',
  });
  assert.equal(res.status, 200);
  assert.equal(res.body.companyProfile.registrationNumber, '2024/123456/07');
  assert.equal(res.body.companyProfile.city, 'Cape Town');
});

test('PATCH rejects vatRegistered: true without a vatNumber, on a tenant that has never set one', async () => {
  const app = buildApp();
  const agent = await loggedInAgent(app);
  const res = await agent.patch('/api/company-profile').send({ vatRegistered: true });
  assert.equal(res.status, 400);
});

test('PATCH accepts vatRegistered: true when vatNumber is supplied in the same request', async () => {
  const app = buildApp();
  const agent = await loggedInAgent(app);
  const res = await agent.patch('/api/company-profile').send({ vatRegistered: true, vatNumber: '4123456789' });
  assert.equal(res.status, 200);
  assert.equal(res.body.companyProfile.vatRegistered, true);
});

test('PATCH accepts vatRegistered: true relying on a vatNumber set in an earlier request', async () => {
  const app = buildApp();
  const agent = await loggedInAgent(app);
  await agent.patch('/api/company-profile').send({ vatNumber: '4123456789' });
  const res = await agent.patch('/api/company-profile').send({ vatRegistered: true });
  assert.equal(res.status, 200);
  assert.equal(res.body.companyProfile.vatRegistered, true);
});
```

- [ ] **Step 6: Run the tests and typecheck**

```bash
npm run migrate:test
npm test
npm run typecheck
```
Expected: all tests pass (existing + new), `tsc --noEmit` reports no errors.

- [ ] **Step 7: Commit**

```bash
git add prisma/schema.prisma prisma/migrations src/db/scoped.ts src/routes/company-profile.ts src/app.ts tests/company-profile.test.ts
git commit -m "Add Company Profile: tenant fields, GET/PATCH /api/company-profile"
```

---

### Task 2: Tenant Sequences (per-tenant document numbering)

**Files:**
- Modify: `prisma/schema.prisma` (add `TenantSequence` model, `tenantSequences` back-relation on `Tenant`)
- Modify: `src/db/scoped.ts` (add `tenantSequences` group)
- Create: `src/lib/numbering.ts`
- Modify: `tests/helpers/testApp.ts` (delete `tenantSequence` rows on reset)
- Create: `tests/numbering.test.ts`
- Modify: `tests/tenant-isolation.test.ts` (add isolation test for `tenantSequences`)

**Interfaces:**
- Consumes: nothing new from Task 1.
- Produces: `tenantScope(tenantId).tenantSequences.next(type: 'quote' | 'invoice')` → `Promise<number>` (the new value, starting at 1 on first call). Produces: `formatDocumentNumber(prefix: string, value: number)` → `string`, e.g. `formatDocumentNumber('QT', 1)` → `'QT-0001'`. Task 3 and Task 4 call both together to mint a quote/invoice number.

- [ ] **Step 1: Add the `TenantSequence` model**

In `prisma/schema.prisma`, add this model (after `model Tenant`, anywhere before the closing of the file is fine — place it after `PlatformAdmin` for consistency with the file's existing top-to-bottom order of "small infra tables first"):

```prisma
model TenantSequence {
  id       String @id @default(uuid())
  tenantId String
  type     String
  value    Int    @default(0)

  tenant Tenant @relation(fields: [tenantId], references: [id])

  @@unique([tenantId, type])
  @@map("tenant_sequences")
}
```

Add the back-relation to `model Tenant`, alongside the other `[]` relation fields:

```prisma
  tenantSequences TenantSequence[]
```

Run:
```bash
npx prisma migrate dev --name add_tenant_sequences
```
Expected: new migration applied cleanly.

- [ ] **Step 2: Add the `tenantSequences` group to `tenantScope()`**

In `src/db/scoped.ts`, inside `tenantScope(tenantId)`'s returned object:

```typescript
    tenantSequences: {
      next: async (type: 'quote' | 'invoice') => {
        await prisma.tenantSequence.upsert({
          where: { tenantId_type: { tenantId, type } },
          create: { tenantId, type, value: 0 },
          update: {},
        });
        const updated = await prisma.tenantSequence.update({
          where: { tenantId_type: { tenantId, type } },
          data: { value: { increment: 1 } },
        });
        return updated.value;
      },
    },
```

`{ increment: 1 }` compiles to a single atomic `UPDATE tenant_sequences SET value = value + 1 ...` — concurrent callers each get a distinct, gapless value without any manual locking. The `upsert` beforehand only creates the row on first use; its `update: {}` is a deliberate no-op so a second concurrent `upsert` on an existing row changes nothing before the atomic increment runs.

- [ ] **Step 3: Write the formatting helper**

Create `src/lib/numbering.ts`:

```typescript
export function formatDocumentNumber(prefix: string, value: number): string {
  return `${prefix}-${value.toString().padStart(4, '0')}`;
}
```

- [ ] **Step 4: Update the test-database reset helper**

In `tests/helpers/testApp.ts`, add a line deleting `tenantSequence` rows before `tenant.deleteMany()` (it has a non-null FK to `Tenant`):

```typescript
  await prisma.tenantSequence.deleteMany();
```

Insert it right before the existing `await prisma.tenant.deleteMany();` line.

- [ ] **Step 5: Write the tests**

Create `tests/numbering.test.ts`:

```typescript
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { resetTestDatabase } from './helpers/testApp.js';
import { prisma } from '../src/db/client.js';
import { hashPassword } from '../src/auth/password.js';
import { tenantScope } from '../src/db/scoped.js';
import { formatDocumentNumber } from '../src/lib/numbering.js';

beforeEach(resetTestDatabase);

async function makeTenant(email: string) {
  return prisma.tenant.create({
    data: {
      businessName: 'Test Co',
      contactName: 'Test Person',
      email,
      passwordHash: await hashPassword('irrelevant password value'),
    },
  });
}

test('formatDocumentNumber pads to 4 digits', () => {
  assert.equal(formatDocumentNumber('QT', 1), 'QT-0001');
  assert.equal(formatDocumentNumber('INV', 42), 'INV-0042');
  assert.equal(formatDocumentNumber('QT', 10000), 'QT-10000');
});

test('next() starts at 1 and increments per call', async () => {
  const tenant = await makeTenant('a@example.co.za');
  const scoped = tenantScope(tenant.id);

  assert.equal(await scoped.tenantSequences.next('quote'), 1);
  assert.equal(await scoped.tenantSequences.next('quote'), 2);
  assert.equal(await scoped.tenantSequences.next('quote'), 3);
});

test('quote and invoice sequences are independent', async () => {
  const tenant = await makeTenant('a@example.co.za');
  const scoped = tenantScope(tenant.id);

  assert.equal(await scoped.tenantSequences.next('quote'), 1);
  assert.equal(await scoped.tenantSequences.next('invoice'), 1);
  assert.equal(await scoped.tenantSequences.next('quote'), 2);
});

test('concurrent next() calls never return a duplicate value', async () => {
  const tenant = await makeTenant('a@example.co.za');
  const scoped = tenantScope(tenant.id);

  const results = await Promise.all(
    Array.from({ length: 10 }, () => scoped.tenantSequences.next('quote')),
  );
  const unique = new Set(results);
  assert.equal(unique.size, 10);
  assert.deepEqual([...results].sort((a, b) => a - b), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
});
```

In `tests/tenant-isolation.test.ts`, add this test at the end of the file:

```typescript
test('a tenant\'s sequence numbers are independent of another tenant\'s', async () => {
  const tenantA = await makeTenant('a@example.co.za');
  const tenantB = await makeTenant('b@example.co.za');

  const scopedA = tenantScope(tenantA.id);
  const scopedB = tenantScope(tenantB.id);

  assert.equal(await scopedA.tenantSequences.next('quote'), 1);
  assert.equal(await scopedB.tenantSequences.next('quote'), 1);
  assert.equal(await scopedA.tenantSequences.next('quote'), 2);
});
```

- [ ] **Step 6: Run the tests and typecheck**

```bash
npm run migrate:test
npm test
npm run typecheck
```
Expected: all tests pass, no type errors.

- [ ] **Step 7: Commit**

```bash
git add prisma/schema.prisma prisma/migrations src/db/scoped.ts src/lib/numbering.ts tests/helpers/testApp.ts tests/numbering.test.ts tests/tenant-isolation.test.ts
git commit -m "Add TenantSequence: race-safe per-tenant document numbering"
```

---

### Task 3: Quotes

**Files:**
- Modify: `prisma/schema.prisma` (add `Quote`, `QuoteLineItem`; back-relations on `Tenant`, `Customer`, `CostingTemplate`)
- Create: `src/quoting/calculate.ts`
- Create: `tests/quoting-calculate.test.ts`
- Modify: `src/db/scoped.ts` (add `quotes` group)
- Create: `src/routes/quotes.ts`
- Modify: `src/app.ts` (mount the router)
- Modify: `tests/helpers/testApp.ts` (delete `quoteLineItem`/`quote` rows on reset)
- Create: `tests/quotes.test.ts`
- Modify: `tests/tenant-isolation.test.ts` (add isolation test for `quotes`)

**Interfaces:**
- Consumes: `tenantScope(tenantId).companyProfile.get()` (Task 1) for `vatRegistered`, `defaultQuoteValidityDays`, `quoteNumberPrefix`. Consumes: `tenantScope(tenantId).tenantSequences.next('quote')` and `formatDocumentNumber()` (Task 2). Consumes: `tenantScope(tenantId).customers.findById()` and `tenantScope(tenantId).costingTemplates.findById()` (existing).
- Produces: `calculateQuoteTotals()` in `src/quoting/calculate.ts`, reused as-is by Task 4 for invoice creation (same line-item math, no VAT-status re-derivation — Task 4 passes its own `vatApplied`). Produces: `tenantScope(tenantId).quotes.{findMany,findById,create,updateStatus}`. Produces: `Quote`/`QuoteLineItem` records that Task 4's convert-to-invoice reads directly via `prisma.quote.findFirst(...)` (not through `tenantScope()`, since that step needs a raw transaction — see Task 4).

- [ ] **Step 1: Add the `Quote` and `QuoteLineItem` models**

In `prisma/schema.prisma`, add:

```prisma
model Quote {
  id         String    @id @default(uuid())
  tenantId   String
  number     String
  customerId String
  status     String    @default("draft")
  validUntil DateTime? @db.Timestamptz(3)
  vatApplied Boolean
  subtotal   Decimal   @db.Decimal(12, 2)
  vatAmount  Decimal   @db.Decimal(12, 2)
  total      Decimal   @db.Decimal(12, 2)
  notes      String?
  createdAt  DateTime  @default(now()) @db.Timestamptz(3)

  tenant   Tenant   @relation(fields: [tenantId], references: [id])
  customer Customer @relation(fields: [customerId], references: [id])

  lineItems QuoteLineItem[]
  invoice   Invoice?

  @@index([tenantId])
  @@map("quotes")
}

model QuoteLineItem {
  id                String  @id @default(uuid())
  tenantId          String
  quoteId           String
  costingTemplateId String?
  description       String
  quantity          Float   @default(1)
  unitPrice         Decimal @db.Decimal(12, 2)
  lineTotal         Decimal @db.Decimal(12, 2)

  tenant          Tenant           @relation(fields: [tenantId], references: [id])
  quote           Quote            @relation(fields: [quoteId], references: [id])
  costingTemplate CostingTemplate? @relation(fields: [costingTemplateId], references: [id], onDelete: SetNull)

  @@index([tenantId])
  @@index([quoteId])
  @@map("quote_line_items")
}
```

`invoice Invoice?` on `Quote` is a forward reference to the model Task 4 adds — Prisma allows this as long as `Invoice` exists by the time you run `migrate dev`, so this line will only compile once Task 4 lands. **Leave it out for now** — add it in Task 4 instead, alongside the `Invoice` model itself, to keep this task's migration self-contained. So for this task, `model Quote` has no `invoice` field.

Add back-relations:
- `model Tenant`: add `quotes Quote[]`
- `model Customer`: add `quotes Quote[]`
- `model CostingTemplate`: add `quoteLineItems QuoteLineItem[]`

Run:
```bash
npx prisma migrate dev --name add_quotes
```
Expected: new migration applied cleanly.

- [ ] **Step 2: Write the pure quote-totals calculation**

Create `src/quoting/calculate.ts`:

```typescript
import { Prisma } from '@prisma/client';

export interface QuoteLineInput {
  unitPrice: number | Prisma.Decimal;
  quantity: number;
}

export interface QuoteTotalsInput {
  lines: QuoteLineInput[];
  vatApplied: boolean;
}

export interface QuoteTotalsResult {
  lineUnitPrices: Prisma.Decimal[];
  lineTotals: Prisma.Decimal[];
  subtotal: Prisma.Decimal;
  vatAmount: Prisma.Decimal;
  total: Prisma.Decimal;
}

const VAT_RATE = new Prisma.Decimal('0.15');

function toDecimal(value: number | Prisma.Decimal): Prisma.Decimal {
  return value instanceof Prisma.Decimal ? value : new Prisma.Decimal(value);
}

function round(value: Prisma.Decimal, decimalPlaces: number): Prisma.Decimal {
  return value.toDecimalPlaces(decimalPlaces, Prisma.Decimal.ROUND_HALF_UP);
}

export function calculateQuoteTotals(input: QuoteTotalsInput): QuoteTotalsResult {
  const { lines, vatApplied } = input;

  // Round each rate to its column scale BEFORE deriving a line total from it,
  // so the persisted unitPrice and the persisted lineTotal always reconcile
  // (unitPrice * quantity === lineTotal), the same discipline the costing
  // engine's calculateCosting() applies to labour/consumable rates.
  const lineUnitPrices = lines.map((line) => round(toDecimal(line.unitPrice), 2));
  const lineTotals = lines.map((line, i) => round(lineUnitPrices[i].times(line.quantity), 2));

  const subtotal = round(
    lineTotals.reduce((sum, cost) => sum.plus(cost), new Prisma.Decimal(0)),
    2,
  );
  const vatAmount = vatApplied ? round(subtotal.times(VAT_RATE), 2) : new Prisma.Decimal(0);
  const total = round(subtotal.plus(vatAmount), 2);

  return { lineUnitPrices, lineTotals, subtotal, vatAmount, total };
}
```

- [ ] **Step 3: Write the calculation tests**

Create `tests/quoting-calculate.test.ts`:

```typescript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calculateQuoteTotals } from '../src/quoting/calculate.js';

test('single line, no VAT', () => {
  const result = calculateQuoteTotals({
    lines: [{ unitPrice: 150, quantity: 2 }],
    vatApplied: false,
  });
  assert.equal(result.lineTotals[0].toFixed(2), '300.00');
  assert.equal(result.subtotal.toFixed(2), '300.00');
  assert.equal(result.vatAmount.toFixed(2), '0.00');
  assert.equal(result.total.toFixed(2), '300.00');
});

test('single line, VAT applied at 15%', () => {
  const result = calculateQuoteTotals({
    lines: [{ unitPrice: 100, quantity: 1 }],
    vatApplied: true,
  });
  assert.equal(result.subtotal.toFixed(2), '100.00');
  assert.equal(result.vatAmount.toFixed(2), '15.00');
  assert.equal(result.total.toFixed(2), '115.00');
});

test('multiple lines sum into subtotal before VAT', () => {
  const result = calculateQuoteTotals({
    lines: [
      { unitPrice: 50, quantity: 3 }, // 150.00
      { unitPrice: 20, quantity: 2 }, // 40.00
    ],
    vatApplied: true,
  });
  assert.equal(result.lineTotals[0].toFixed(2), '150.00');
  assert.equal(result.lineTotals[1].toFixed(2), '40.00');
  assert.equal(result.subtotal.toFixed(2), '190.00');
  assert.equal(result.vatAmount.toFixed(2), '28.50');
  assert.equal(result.total.toFixed(2), '218.50');
});

test('rounds the unit price to 2dp before deriving the line total, so the persisted rate and total reconcile', () => {
  // 2.335 rounds to 2.34 under HALF_UP; 2.34 * 3 = 7.02 exactly.
  // Multiplying the raw 2.335 * 3 = 7.005 directly (without rounding the rate
  // first) would give 7.01 -- the same defect class the costing engine's
  // calculateCosting() was fixed for.
  const result = calculateQuoteTotals({
    lines: [{ unitPrice: 2.335, quantity: 3 }],
    vatApplied: false,
  });
  assert.equal(result.lineUnitPrices[0].toFixed(2), '2.34');
  assert.equal(result.lineTotals[0].toFixed(2), '7.02');
  assert.equal(result.lineUnitPrices[0].times(3).toFixed(2), result.lineTotals[0].toFixed(2));
});

test('empty line list produces zero totals', () => {
  const result = calculateQuoteTotals({ lines: [], vatApplied: true });
  assert.equal(result.subtotal.toFixed(2), '0.00');
  assert.equal(result.vatAmount.toFixed(2), '0.00');
  assert.equal(result.total.toFixed(2), '0.00');
});
```

Run:
```bash
npm test -- tests/quoting-calculate.test.ts
```
Expected: all pass (this file has no DB dependency, so it runs standalone).

- [ ] **Step 4: Add the `quotes` group to `tenantScope()`**

In `src/db/scoped.ts`, add these interfaces near the other `Create*Input` interfaces:

```typescript
export interface CreateQuoteLineItemInput {
  costingTemplateId: string | null;
  description: string;
  quantity: number;
  unitPrice: string;
  lineTotal: string;
}

export interface CreateQuoteInput {
  customerId: string;
  number: string;
  validUntil: Date | null;
  vatApplied: boolean;
  subtotal: string;
  vatAmount: string;
  total: string;
  notes: string | null;
  lineItems: CreateQuoteLineItemInput[];
}
```

Inside `tenantScope(tenantId)`'s returned object:

```typescript
    quotes: {
      findMany: () => prisma.quote.findMany({ where: { tenantId }, orderBy: { createdAt: 'desc' } }),

      findById: (id: string) =>
        prisma.quote.findFirst({ where: { id, tenantId }, include: { lineItems: true } }),

      create: (data: CreateQuoteInput) =>
        prisma.quote.create({
          data: {
            tenantId,
            customerId: data.customerId,
            number: data.number,
            validUntil: data.validUntil,
            vatApplied: data.vatApplied,
            subtotal: data.subtotal,
            vatAmount: data.vatAmount,
            total: data.total,
            notes: data.notes,
            lineItems: {
              create: data.lineItems.map((line) => ({
                tenantId,
                costingTemplateId: line.costingTemplateId,
                description: line.description,
                quantity: line.quantity,
                unitPrice: line.unitPrice,
                lineTotal: line.lineTotal,
              })),
            },
          },
          include: { lineItems: true },
        }),

      updateStatus: (id: string, status: string) =>
        prisma.quote.updateMany({ where: { id, tenantId }, data: { status } }),
    },
```

- [ ] **Step 5: Write the quotes route**

Create `src/routes/quotes.ts`:

```typescript
import { Router } from 'express';
import { z } from 'zod';
import type { Quote, QuoteLineItem } from '@prisma/client';
import { requireTenantAuth } from '../middleware/requireTenantAuth.js';
import { tenantScope } from '../db/scoped.js';
import { calculateQuoteTotals } from '../quoting/calculate.js';
import { formatDocumentNumber } from '../lib/numbering.js';

export const quotesRouter = Router();
quotesRouter.use(requireTenantAuth);

type QuoteWithOptionalLines = Quote & { lineItems?: QuoteLineItem[] };

function serializeQuote(quote: QuoteWithOptionalLines) {
  return {
    ...quote,
    subtotal: quote.subtotal.toFixed(2),
    vatAmount: quote.vatAmount.toFixed(2),
    total: quote.total.toFixed(2),
    lineItems: quote.lineItems?.map((line) => ({
      ...line,
      unitPrice: line.unitPrice.toFixed(2),
      lineTotal: line.lineTotal.toFixed(2),
    })),
  };
}

const lineItemSchema = z
  .object({
    costingTemplateId: z.string().min(1).optional(),
    description: z.string().min(1).optional(),
    unitPrice: z.number().nonnegative().optional(),
    quantity: z.number().positive().default(1),
  })
  .refine((data) => data.costingTemplateId != null || (data.description != null && data.unitPrice != null), {
    message: 'Each line item needs either a costingTemplateId, or a description and unitPrice.',
  });

const createQuoteSchema = z.object({
  customerId: z.string().min(1),
  validUntil: z.string().optional(),
  notes: z.string().optional(),
  lineItems: z.array(lineItemSchema).min(1),
});

const VALID_STATUS_TRANSITIONS: Record<string, string[]> = {
  draft: ['sent', 'expired'],
  sent: ['accepted', 'expired'],
};

quotesRouter.get('/api/quotes', async (req, res) => {
  const scoped = tenantScope(req.tenantId!);
  const quotes = await scoped.quotes.findMany();
  res.json({ ok: true, quotes: quotes.map(serializeQuote) });
});

quotesRouter.get('/api/quotes/:id', async (req, res) => {
  const scoped = tenantScope(req.tenantId!);
  const quote = await scoped.quotes.findById(req.params.id);
  if (!quote) {
    return res.status(404).json({ ok: false, error: 'Quote not found.' });
  }
  res.json({ ok: true, quote: serializeQuote(quote) });
});

quotesRouter.post('/api/quotes', async (req, res) => {
  const parsed = createQuoteSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      ok: false,
      error: 'A customer and at least one line item are required.',
    });
  }
  const { customerId, validUntil, notes, lineItems } = parsed.data;
  const scoped = tenantScope(req.tenantId!);

  const customer = await scoped.customers.findById(customerId);
  if (!customer) {
    return res.status(400).json({ ok: false, error: 'Customer not found.' });
  }

  const resolvedLines: Array<{
    costingTemplateId: string | null;
    description: string;
    unitPrice: number | import('@prisma/client').Prisma.Decimal;
    quantity: number;
  }> = [];
  for (const line of lineItems) {
    if (line.costingTemplateId) {
      const template = await scoped.costingTemplates.findById(line.costingTemplateId);
      if (!template) {
        return res.status(400).json({ ok: false, error: 'One of the costing templates was not found.' });
      }
      resolvedLines.push({
        costingTemplateId: template.id,
        description: template.name,
        unitPrice: template.suggestedPrice,
        quantity: line.quantity,
      });
    } else {
      resolvedLines.push({
        costingTemplateId: null,
        description: line.description!,
        unitPrice: line.unitPrice!,
        quantity: line.quantity,
      });
    }
  }

  const profile = await scoped.companyProfile.get();
  if (!profile) {
    return res.status(404).json({ ok: false, error: 'Tenant not found.' });
  }

  const totals = calculateQuoteTotals({
    lines: resolvedLines.map((line) => ({ unitPrice: line.unitPrice, quantity: line.quantity })),
    vatApplied: profile.vatRegistered,
  });

  const sequenceValue = await scoped.tenantSequences.next('quote');
  const number = formatDocumentNumber(profile.quoteNumberPrefix, sequenceValue);

  let resolvedValidUntil: Date | null = null;
  if (validUntil) {
    resolvedValidUntil = new Date(validUntil);
  } else if (profile.defaultQuoteValidityDays) {
    resolvedValidUntil = new Date(Date.now() + profile.defaultQuoteValidityDays * 24 * 60 * 60 * 1000);
  }

  const quote = await scoped.quotes.create({
    customerId,
    number,
    validUntil: resolvedValidUntil,
    vatApplied: profile.vatRegistered,
    subtotal: totals.subtotal.toString(),
    vatAmount: totals.vatAmount.toString(),
    total: totals.total.toString(),
    notes: notes ?? null,
    lineItems: resolvedLines.map((line, i) => ({
      costingTemplateId: line.costingTemplateId,
      description: line.description,
      quantity: line.quantity,
      unitPrice: totals.lineUnitPrices[i].toString(),
      lineTotal: totals.lineTotals[i].toString(),
    })),
  });

  res.status(201).json({ ok: true, quote: serializeQuote(quote) });
});

quotesRouter.patch('/api/quotes/:id/status', async (req, res) => {
  const parsed = z.object({ status: z.enum(['sent', 'accepted', 'expired']) }).safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ ok: false, error: 'status must be one of: sent, accepted, expired.' });
  }
  const scoped = tenantScope(req.tenantId!);
  const quote = await scoped.quotes.findById(req.params.id);
  if (!quote) {
    return res.status(404).json({ ok: false, error: 'Quote not found.' });
  }
  const allowedNextStatuses = VALID_STATUS_TRANSITIONS[quote.status] ?? [];
  if (!allowedNextStatuses.includes(parsed.data.status)) {
    return res.status(400).json({
      ok: false,
      error: `Cannot move a quote from "${quote.status}" to "${parsed.data.status}".`,
    });
  }
  await scoped.quotes.updateStatus(req.params.id, parsed.data.status);
  const updated = await scoped.quotes.findById(req.params.id);
  res.json({ ok: true, quote: serializeQuote(updated!) });
});
```

- [ ] **Step 6: Mount the router**

In `src/app.ts`:

```typescript
import { quotesRouter } from './routes/quotes.js';
```

```typescript
  app.use(quotesRouter);
```

(after `app.use(companyProfileRouter);`)

- [ ] **Step 7: Update the test-database reset helper**

In `tests/helpers/testApp.ts`, add (before `tenant.deleteMany()`, after the `tenantSequence` line added in Task 2):

```typescript
  await prisma.quoteLineItem.deleteMany();
  await prisma.quote.deleteMany();
```

- [ ] **Step 8: Write the route tests**

Create `tests/quotes.test.ts`:

```typescript
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { buildApp } from '../src/app.js';
import { resetTestDatabase } from './helpers/testApp.js';
import { prisma } from '../src/db/client.js';

beforeEach(resetTestDatabase);

async function loggedInAgent(app: ReturnType<typeof buildApp>, email = 'jane@acmeprints.co.za') {
  await request(app).post('/api/auth/register').send({
    businessName: 'Acme Prints',
    contactName: 'Jane Doe',
    email,
    password: 'correct horse battery staple',
  });
  const tenant = await prisma.tenant.findUnique({ where: { email } });
  await request(app).post('/api/auth/verify-email').send({ token: tenant?.verificationToken });

  const agent = request.agent(app);
  await agent.post('/api/auth/login').send({ email, password: 'correct horse battery staple' });
  return agent;
}

async function makeCustomer(agent: ReturnType<typeof request.agent>) {
  const res = await agent.post('/api/customers').send({ name: 'Bob Client', billingAddress: '5 Oak St' });
  return res.body.customer.id as string;
}

test('quote endpoints require auth', async () => {
  const app = buildApp();
  const res = await request(app).get('/api/quotes');
  assert.equal(res.status, 401);
});

test('POST /api/quotes rejects a missing customer or line items', async () => {
  const app = buildApp();
  const agent = await loggedInAgent(app);
  const res = await agent.post('/api/quotes').send({ customerId: 'nope', lineItems: [] });
  assert.equal(res.status, 400);
});

test('POST /api/quotes rejects an unknown customer', async () => {
  const app = buildApp();
  const agent = await loggedInAgent(app);
  const res = await agent.post('/api/quotes').send({
    customerId: 'does-not-exist',
    lineItems: [{ description: 'Custom part', unitPrice: 100, quantity: 1 }],
  });
  assert.equal(res.status, 400);
});

test('POST /api/quotes creates an ad-hoc-line quote, numbered QT-0001, no VAT by default', async () => {
  const app = buildApp();
  const agent = await loggedInAgent(app);
  const customerId = await makeCustomer(agent);

  const res = await agent.post('/api/quotes').send({
    customerId,
    lineItems: [{ description: 'Custom bracket', unitPrice: 150, quantity: 2 }],
  });

  assert.equal(res.status, 201);
  assert.equal(res.body.quote.number, 'QT-0001');
  assert.equal(res.body.quote.status, 'draft');
  assert.equal(res.body.quote.vatApplied, false);
  assert.equal(res.body.quote.subtotal, '300.00');
  assert.equal(res.body.quote.vatAmount, '0.00');
  assert.equal(res.body.quote.total, '300.00');
  assert.equal(res.body.quote.lineItems[0].lineTotal, '300.00');
});

test('POST /api/quotes applies VAT when the tenant is VAT-registered', async () => {
  const app = buildApp();
  const agent = await loggedInAgent(app);
  await agent.patch('/api/company-profile').send({ vatRegistered: true, vatNumber: '4123456789' });
  const customerId = await makeCustomer(agent);

  const res = await agent.post('/api/quotes').send({
    customerId,
    lineItems: [{ description: 'Custom bracket', unitPrice: 100, quantity: 1 }],
  });

  assert.equal(res.status, 201);
  assert.equal(res.body.quote.vatApplied, true);
  assert.equal(res.body.quote.subtotal, '100.00');
  assert.equal(res.body.quote.vatAmount, '15.00');
  assert.equal(res.body.quote.total, '115.00');
});

test('POST /api/quotes rejects an unknown costing template line', async () => {
  const app = buildApp();
  const agent = await loggedInAgent(app);
  const customerId = await makeCustomer(agent);

  const res = await agent.post('/api/quotes').send({
    customerId,
    lineItems: [{ costingTemplateId: 'does-not-exist', quantity: 1 }],
  });
  assert.equal(res.status, 400);
});

test('quote numbers increment across successive quotes for the same tenant', async () => {
  const app = buildApp();
  const agent = await loggedInAgent(app);
  const customerId = await makeCustomer(agent);
  const line = { description: 'Part', unitPrice: 10, quantity: 1 };

  const first = await agent.post('/api/quotes').send({ customerId, lineItems: [line] });
  const second = await agent.post('/api/quotes').send({ customerId, lineItems: [line] });

  assert.equal(first.body.quote.number, 'QT-0001');
  assert.equal(second.body.quote.number, 'QT-0002');
});

test('PATCH /api/quotes/:id/status enforces the draft -> sent -> accepted lifecycle', async () => {
  const app = buildApp();
  const agent = await loggedInAgent(app);
  const customerId = await makeCustomer(agent);
  const created = await agent.post('/api/quotes').send({
    customerId,
    lineItems: [{ description: 'Part', unitPrice: 10, quantity: 1 }],
  });
  const quoteId = created.body.quote.id as string;

  const skipStraightToAccepted = await agent.patch(`/api/quotes/${quoteId}/status`).send({ status: 'accepted' });
  assert.equal(skipStraightToAccepted.status, 400);

  const toSent = await agent.patch(`/api/quotes/${quoteId}/status`).send({ status: 'sent' });
  assert.equal(toSent.status, 200);
  assert.equal(toSent.body.quote.status, 'sent');

  const toAccepted = await agent.patch(`/api/quotes/${quoteId}/status`).send({ status: 'accepted' });
  assert.equal(toAccepted.status, 200);
  assert.equal(toAccepted.body.quote.status, 'accepted');

  const backToSent = await agent.patch(`/api/quotes/${quoteId}/status`).send({ status: 'sent' });
  assert.equal(backToSent.status, 400);
});
```

- [ ] **Step 9: Write the isolation test**

In `tests/tenant-isolation.test.ts`, add at the end of the file:

```typescript
test('a tenant cannot see another tenant\'s quotes', async () => {
  const tenantA = await makeTenant('a@example.co.za');
  const tenantB = await makeTenant('b@example.co.za');

  const customerA = await prisma.customer.create({
    data: { tenantId: tenantA.id, name: 'Customer A', billingAddress: '1 Main Rd' },
  });

  const scopedA = tenantScope(tenantA.id);
  const scopedB = tenantScope(tenantB.id);

  await scopedA.quotes.create({
    customerId: customerA.id,
    number: 'QT-0001',
    validUntil: null,
    vatApplied: false,
    subtotal: '100.00',
    vatAmount: '0.00',
    total: '100.00',
    notes: null,
    lineItems: [],
  });

  const aList = await scopedA.quotes.findMany();
  const bList = await scopedB.quotes.findMany();

  assert.equal(aList.length, 1);
  assert.equal(bList.length, 0);

  const bFindById = await scopedB.quotes.findById(aList[0].id);
  assert.equal(bFindById, null);
});
```

- [ ] **Step 10: Run the tests and typecheck**

```bash
npm run migrate:test
npm test
npm run typecheck
```
Expected: all tests pass, no type errors.

- [ ] **Step 11: Commit**

```bash
git add prisma/schema.prisma prisma/migrations src/quoting src/db/scoped.ts src/routes/quotes.ts src/app.ts tests/helpers/testApp.ts tests/quoting-calculate.test.ts tests/quotes.test.ts tests/tenant-isolation.test.ts
git commit -m "Add Quotes: draft/sent/accepted/expired lifecycle, VAT calc, sequential numbering"
```

---

### Task 4: Invoices + quote-to-invoice conversion

**Files:**
- Modify: `prisma/schema.prisma` (add `Invoice`, `InvoiceLineItem`; add `invoice Invoice?` to `Quote`; back-relations on `Tenant`, `Customer`, `CostingTemplate`)
- Modify: `src/db/scoped.ts` (add `invoices` group)
- Create: `src/routes/invoices.ts`
- Modify: `src/routes/quotes.ts` (add `POST /api/quotes/:id/convert-to-invoice`)
- Modify: `src/app.ts` (mount the router)
- Modify: `tests/helpers/testApp.ts` (delete `invoiceLineItem`/`invoice` rows on reset)
- Create: `tests/invoices.test.ts`
- Modify: `tests/tenant-isolation.test.ts` (add isolation test for `invoices`)

**Interfaces:**
- Consumes: `calculateQuoteTotals()` (Task 3, reused verbatim for invoice line-item math). Consumes: `tenantScope(tenantId).companyProfile.get()`, `.tenantSequences.next('invoice')`, `formatDocumentNumber()`. Consumes: `tenantScope(tenantId).customers.findById()`, `.costingTemplates.findById()`.
- Produces: `tenantScope(tenantId).invoices.{findMany,findById,create,updateStatus}`. Produces: `POST /api/quotes/:id/convert-to-invoice`, which other tasks/frontends call once a quote is `accepted`.

- [ ] **Step 1: Add the `Invoice` and `InvoiceLineItem` models, and complete `Quote`**

In `prisma/schema.prisma`, add:

```prisma
model Invoice {
  id         String   @id @default(uuid())
  tenantId   String
  number     String
  customerId String
  quoteId    String?  @unique
  status     String   @default("unpaid")
  dueDate    DateTime @db.Timestamptz(3)
  vatApplied Boolean
  subtotal   Decimal  @db.Decimal(12, 2)
  vatAmount  Decimal  @db.Decimal(12, 2)
  total      Decimal  @db.Decimal(12, 2)
  amountPaid Decimal  @default(0) @db.Decimal(12, 2)
  notes      String?
  createdAt  DateTime @default(now()) @db.Timestamptz(3)

  tenant   Tenant   @relation(fields: [tenantId], references: [id])
  customer Customer @relation(fields: [customerId], references: [id])
  quote    Quote?   @relation(fields: [quoteId], references: [id])

  lineItems InvoiceLineItem[]

  @@index([tenantId])
  @@map("invoices")
}

model InvoiceLineItem {
  id                String  @id @default(uuid())
  tenantId          String
  invoiceId         String
  quoteLineItemId   String?
  costingTemplateId String?
  description       String
  quantity          Float   @default(1)
  unitPrice         Decimal @db.Decimal(12, 2)
  lineTotal         Decimal @db.Decimal(12, 2)

  tenant          Tenant           @relation(fields: [tenantId], references: [id])
  invoice         Invoice          @relation(fields: [invoiceId], references: [id])
  costingTemplate CostingTemplate? @relation(fields: [costingTemplateId], references: [id], onDelete: SetNull)

  @@index([tenantId])
  @@index([invoiceId])
  @@map("invoice_line_items")
}
```

Add `invoice Invoice?` to `model Quote` (it references `Invoice.quoteId`, so this must land in the same migration as `Invoice` itself):

```prisma
  invoice Invoice?
```

Add back-relations:
- `model Tenant`: add `invoices Invoice[]`
- `model Customer`: add `invoices Invoice[]`
- `model CostingTemplate`: add `invoiceLineItems InvoiceLineItem[]`

Run:
```bash
npx prisma migrate dev --name add_invoices
```
Expected: new migration applied cleanly.

- [ ] **Step 2: Add the `invoices` group to `tenantScope()`**

In `src/db/scoped.ts`, add these interfaces:

```typescript
export interface CreateInvoiceLineItemInput {
  quoteLineItemId: string | null;
  costingTemplateId: string | null;
  description: string;
  quantity: number;
  unitPrice: string;
  lineTotal: string;
}

export interface CreateInvoiceInput {
  customerId: string;
  quoteId: string | null;
  number: string;
  dueDate: Date;
  vatApplied: boolean;
  subtotal: string;
  vatAmount: string;
  total: string;
  notes: string | null;
  lineItems: CreateInvoiceLineItemInput[];
}
```

Inside `tenantScope(tenantId)`'s returned object:

```typescript
    invoices: {
      findMany: () => prisma.invoice.findMany({ where: { tenantId }, orderBy: { createdAt: 'desc' } }),

      findById: (id: string) =>
        prisma.invoice.findFirst({ where: { id, tenantId }, include: { lineItems: true } }),

      create: (data: CreateInvoiceInput) =>
        prisma.invoice.create({
          data: {
            tenantId,
            customerId: data.customerId,
            quoteId: data.quoteId,
            number: data.number,
            dueDate: data.dueDate,
            vatApplied: data.vatApplied,
            subtotal: data.subtotal,
            vatAmount: data.vatAmount,
            total: data.total,
            notes: data.notes,
            lineItems: {
              create: data.lineItems.map((line) => ({
                tenantId,
                quoteLineItemId: line.quoteLineItemId,
                costingTemplateId: line.costingTemplateId,
                description: line.description,
                quantity: line.quantity,
                unitPrice: line.unitPrice,
                lineTotal: line.lineTotal,
              })),
            },
          },
          include: { lineItems: true },
        }),

      updateStatus: (id: string, status: string, amountPaid?: string) =>
        prisma.invoice.updateMany({
          where: { id, tenantId },
          data: { status, ...(amountPaid !== undefined ? { amountPaid } : {}) },
        }),
    },
```

- [ ] **Step 3: Write the invoices route**

Create `src/routes/invoices.ts`:

```typescript
import { Router } from 'express';
import { z } from 'zod';
import type { Invoice, InvoiceLineItem } from '@prisma/client';
import { requireTenantAuth } from '../middleware/requireTenantAuth.js';
import { tenantScope } from '../db/scoped.js';
import { calculateQuoteTotals } from '../quoting/calculate.js';
import { formatDocumentNumber } from '../lib/numbering.js';

export const invoicesRouter = Router();
invoicesRouter.use(requireTenantAuth);

type InvoiceWithOptionalLines = Invoice & { lineItems?: InvoiceLineItem[] };

function serializeInvoice(invoice: InvoiceWithOptionalLines) {
  return {
    ...invoice,
    subtotal: invoice.subtotal.toFixed(2),
    vatAmount: invoice.vatAmount.toFixed(2),
    total: invoice.total.toFixed(2),
    amountPaid: invoice.amountPaid.toFixed(2),
    lineItems: invoice.lineItems?.map((line) => ({
      ...line,
      unitPrice: line.unitPrice.toFixed(2),
      lineTotal: line.lineTotal.toFixed(2),
    })),
  };
}

const lineItemSchema = z
  .object({
    costingTemplateId: z.string().min(1).optional(),
    description: z.string().min(1).optional(),
    unitPrice: z.number().nonnegative().optional(),
    quantity: z.number().positive().default(1),
  })
  .refine((data) => data.costingTemplateId != null || (data.description != null && data.unitPrice != null), {
    message: 'Each line item needs either a costingTemplateId, or a description and unitPrice.',
  });

const createInvoiceSchema = z.object({
  customerId: z.string().min(1),
  dueDate: z.string().optional(),
  notes: z.string().optional(),
  lineItems: z.array(lineItemSchema).min(1),
});

const DEFAULT_DUE_DAYS = 30;

invoicesRouter.get('/api/invoices', async (req, res) => {
  const scoped = tenantScope(req.tenantId!);
  const invoices = await scoped.invoices.findMany();
  res.json({ ok: true, invoices: invoices.map(serializeInvoice) });
});

invoicesRouter.get('/api/invoices/:id', async (req, res) => {
  const scoped = tenantScope(req.tenantId!);
  const invoice = await scoped.invoices.findById(req.params.id);
  if (!invoice) {
    return res.status(404).json({ ok: false, error: 'Invoice not found.' });
  }
  res.json({ ok: true, invoice: serializeInvoice(invoice) });
});

invoicesRouter.post('/api/invoices', async (req, res) => {
  const parsed = createInvoiceSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      ok: false,
      error: 'A customer and at least one line item are required.',
    });
  }
  const { customerId, dueDate, notes, lineItems } = parsed.data;
  const scoped = tenantScope(req.tenantId!);

  const customer = await scoped.customers.findById(customerId);
  if (!customer) {
    return res.status(400).json({ ok: false, error: 'Customer not found.' });
  }

  const resolvedLines: Array<{
    costingTemplateId: string | null;
    description: string;
    unitPrice: number | import('@prisma/client').Prisma.Decimal;
    quantity: number;
  }> = [];
  for (const line of lineItems) {
    if (line.costingTemplateId) {
      const template = await scoped.costingTemplates.findById(line.costingTemplateId);
      if (!template) {
        return res.status(400).json({ ok: false, error: 'One of the costing templates was not found.' });
      }
      resolvedLines.push({
        costingTemplateId: template.id,
        description: template.name,
        unitPrice: template.suggestedPrice,
        quantity: line.quantity,
      });
    } else {
      resolvedLines.push({
        costingTemplateId: null,
        description: line.description!,
        unitPrice: line.unitPrice!,
        quantity: line.quantity,
      });
    }
  }

  const profile = await scoped.companyProfile.get();
  if (!profile) {
    return res.status(404).json({ ok: false, error: 'Tenant not found.' });
  }

  const totals = calculateQuoteTotals({
    lines: resolvedLines.map((line) => ({ unitPrice: line.unitPrice, quantity: line.quantity })),
    vatApplied: profile.vatRegistered,
  });

  const sequenceValue = await scoped.tenantSequences.next('invoice');
  const number = formatDocumentNumber(profile.invoiceNumberPrefix, sequenceValue);
  const resolvedDueDate = dueDate
    ? new Date(dueDate)
    : new Date(Date.now() + DEFAULT_DUE_DAYS * 24 * 60 * 60 * 1000);

  const invoice = await scoped.invoices.create({
    customerId,
    quoteId: null,
    number,
    dueDate: resolvedDueDate,
    vatApplied: profile.vatRegistered,
    subtotal: totals.subtotal.toString(),
    vatAmount: totals.vatAmount.toString(),
    total: totals.total.toString(),
    notes: notes ?? null,
    lineItems: resolvedLines.map((line, i) => ({
      quoteLineItemId: null,
      costingTemplateId: line.costingTemplateId,
      description: line.description,
      quantity: line.quantity,
      unitPrice: totals.lineUnitPrices[i].toString(),
      lineTotal: totals.lineTotals[i].toString(),
    })),
  });

  res.status(201).json({ ok: true, invoice: serializeInvoice(invoice) });
});

const updateInvoiceStatusSchema = z
  .object({
    status: z.enum(['partially_paid', 'paid', 'overdue']),
    amountPaid: z.number().nonnegative().optional(),
  })
  .refine((data) => data.status !== 'partially_paid' || data.amountPaid !== undefined, {
    message: 'amountPaid is required when status is partially_paid.',
  })
  .refine((data) => data.status !== 'paid' || data.amountPaid !== undefined, {
    message: 'amountPaid is required when status is paid.',
  });

invoicesRouter.patch('/api/invoices/:id/status', async (req, res) => {
  const parsed = updateInvoiceStatusSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ ok: false, error: 'Invalid status update.' });
  }
  const scoped = tenantScope(req.tenantId!);
  const invoice = await scoped.invoices.findById(req.params.id);
  if (!invoice) {
    return res.status(404).json({ ok: false, error: 'Invoice not found.' });
  }

  const { status, amountPaid } = parsed.data;
  const total = Number(invoice.total.toString());
  if (status === 'partially_paid' && !(amountPaid! > 0 && amountPaid! < total)) {
    return res.status(400).json({
      ok: false,
      error: 'amountPaid must be greater than 0 and less than the invoice total for partially_paid.',
    });
  }
  if (status === 'paid' && amountPaid !== total) {
    return res.status(400).json({ ok: false, error: 'amountPaid must equal the invoice total for paid.' });
  }

  await scoped.invoices.updateStatus(req.params.id, status, amountPaid !== undefined ? String(amountPaid) : undefined);
  const updated = await scoped.invoices.findById(req.params.id);
  res.json({ ok: true, invoice: serializeInvoice(updated!) });
});
```

- [ ] **Step 4: Add the quote-to-invoice conversion endpoint**

In `src/routes/quotes.ts`, add these imports at the top:

```typescript
import { formatDocumentNumber } from '../lib/numbering.js';
import { prisma } from '../db/client.js';
```

(`formatDocumentNumber` may already be imported from Task 3's step 5 — don't duplicate the import line if so.)

Add this route at the end of the file, after the `PATCH /api/quotes/:id/status` handler:

```typescript
quotesRouter.post('/api/quotes/:id/convert-to-invoice', async (req, res) => {
  const scoped = tenantScope(req.tenantId!);
  const quote = await scoped.quotes.findById(req.params.id);
  if (!quote) {
    return res.status(404).json({ ok: false, error: 'Quote not found.' });
  }
  if (quote.status !== 'accepted') {
    return res.status(400).json({ ok: false, error: 'Only an accepted quote can be converted to an invoice.' });
  }

  const profile = await scoped.companyProfile.get();
  if (!profile) {
    return res.status(404).json({ ok: false, error: 'Tenant not found.' });
  }

  const tenantId = req.tenantId!;
  const dueDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

  try {
    const invoice = await prisma.$transaction(async (tx) => {
      const existing = await tx.invoice.findFirst({ where: { quoteId: quote.id, tenantId } });
      if (existing) {
        throw new Error('QUOTE_ALREADY_CONVERTED');
      }

      await tx.tenantSequence.upsert({
        where: { tenantId_type: { tenantId, type: 'invoice' } },
        create: { tenantId, type: 'invoice', value: 0 },
        update: {},
      });
      const sequence = await tx.tenantSequence.update({
        where: { tenantId_type: { tenantId, type: 'invoice' } },
        data: { value: { increment: 1 } },
      });
      const number = formatDocumentNumber(profile.invoiceNumberPrefix, sequence.value);

      return tx.invoice.create({
        data: {
          tenantId,
          customerId: quote.customerId,
          quoteId: quote.id,
          number,
          dueDate,
          vatApplied: quote.vatApplied,
          subtotal: quote.subtotal,
          vatAmount: quote.vatAmount,
          total: quote.total,
          notes: quote.notes,
          lineItems: {
            create: quote.lineItems.map((line) => ({
              tenantId,
              quoteLineItemId: line.id,
              costingTemplateId: line.costingTemplateId,
              description: line.description,
              quantity: line.quantity,
              unitPrice: line.unitPrice,
              lineTotal: line.lineTotal,
            })),
          },
        },
        include: { lineItems: true },
      });
    });

    res.status(201).json({
      ok: true,
      invoice: {
        ...invoice,
        subtotal: invoice.subtotal.toFixed(2),
        vatAmount: invoice.vatAmount.toFixed(2),
        total: invoice.total.toFixed(2),
        amountPaid: invoice.amountPaid.toFixed(2),
        lineItems: invoice.lineItems.map((line) => ({
          ...line,
          unitPrice: line.unitPrice.toFixed(2),
          lineTotal: line.lineTotal.toFixed(2),
        })),
      },
    });
  } catch (err) {
    if (err instanceof Error && err.message === 'QUOTE_ALREADY_CONVERTED') {
      return res.status(400).json({ ok: false, error: 'This quote has already been converted to an invoice.' });
    }
    throw err;
  }
});
```

This is the one place in the codebase that reaches for `prisma` directly instead of going through `tenantScope()` — it needs two dependent writes (the sequence increment and the invoice create) inside one atomic transaction, which `tenantScope()`'s per-call closures don't support. Every query inside the transaction still filters by `tenantId` explicitly, so tenant isolation is preserved even without the wrapper.

- [ ] **Step 5: Mount the router**

In `src/app.ts`:

```typescript
import { invoicesRouter } from './routes/invoices.js';
```

```typescript
  app.use(invoicesRouter);
```

(after `app.use(quotesRouter);`)

- [ ] **Step 6: Update the test-database reset helper**

In `tests/helpers/testApp.ts`, add (before `tenant.deleteMany()`, after the `quote`/`quoteLineItem` lines added in Task 3 — invoices reference quotes via `quoteId`, so invoices must be deleted first):

```typescript
  await prisma.invoiceLineItem.deleteMany();
  await prisma.invoice.deleteMany();
```

Place these two lines **before** the `quoteLineItem`/`quote` deletes added in Task 3 (an `Invoice` row can reference a `Quote` row, so the invoice must go first).

- [ ] **Step 7: Write the route tests**

Create `tests/invoices.test.ts`:

```typescript
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { buildApp } from '../src/app.js';
import { resetTestDatabase } from './helpers/testApp.js';
import { prisma } from '../src/db/client.js';

beforeEach(resetTestDatabase);

async function loggedInAgent(app: ReturnType<typeof buildApp>, email = 'jane@acmeprints.co.za') {
  await request(app).post('/api/auth/register').send({
    businessName: 'Acme Prints',
    contactName: 'Jane Doe',
    email,
    password: 'correct horse battery staple',
  });
  const tenant = await prisma.tenant.findUnique({ where: { email } });
  await request(app).post('/api/auth/verify-email').send({ token: tenant?.verificationToken });

  const agent = request.agent(app);
  await agent.post('/api/auth/login').send({ email, password: 'correct horse battery staple' });
  return agent;
}

async function makeCustomer(agent: ReturnType<typeof request.agent>) {
  const res = await agent.post('/api/customers').send({ name: 'Bob Client', billingAddress: '5 Oak St' });
  return res.body.customer.id as string;
}

test('invoice endpoints require auth', async () => {
  const app = buildApp();
  const res = await request(app).get('/api/invoices');
  assert.equal(res.status, 401);
});

test('POST /api/invoices creates a standalone invoice, numbered INV-0001, due in 30 days by default', async () => {
  const app = buildApp();
  const agent = await loggedInAgent(app);
  const customerId = await makeCustomer(agent);

  const res = await agent.post('/api/invoices').send({
    customerId,
    lineItems: [{ description: 'Custom bracket', unitPrice: 200, quantity: 1 }],
  });

  assert.equal(res.status, 201);
  assert.equal(res.body.invoice.number, 'INV-0001');
  assert.equal(res.body.invoice.status, 'unpaid');
  assert.equal(res.body.invoice.total, '200.00');
  assert.equal(res.body.invoice.amountPaid, '0.00');
  assert.ok(res.body.invoice.dueDate);
});

test('PATCH /api/invoices/:id/status requires amountPaid to equal total for paid', async () => {
  const app = buildApp();
  const agent = await loggedInAgent(app);
  const customerId = await makeCustomer(agent);
  const created = await agent.post('/api/invoices').send({
    customerId,
    lineItems: [{ description: 'Part', unitPrice: 100, quantity: 1 }],
  });
  const invoiceId = created.body.invoice.id as string;

  const wrongAmount = await agent.patch(`/api/invoices/${invoiceId}/status`).send({ status: 'paid', amountPaid: 50 });
  assert.equal(wrongAmount.status, 400);

  const correct = await agent.patch(`/api/invoices/${invoiceId}/status`).send({ status: 'paid', amountPaid: 100 });
  assert.equal(correct.status, 200);
  assert.equal(correct.body.invoice.status, 'paid');
  assert.equal(correct.body.invoice.amountPaid, '100.00');
});

test('PATCH /api/invoices/:id/status accepts a valid partial payment', async () => {
  const app = buildApp();
  const agent = await loggedInAgent(app);
  const customerId = await makeCustomer(agent);
  const created = await agent.post('/api/invoices').send({
    customerId,
    lineItems: [{ description: 'Part', unitPrice: 100, quantity: 1 }],
  });
  const invoiceId = created.body.invoice.id as string;

  const res = await agent.patch(`/api/invoices/${invoiceId}/status`).send({ status: 'partially_paid', amountPaid: 40 });
  assert.equal(res.status, 200);
  assert.equal(res.body.invoice.status, 'partially_paid');
  assert.equal(res.body.invoice.amountPaid, '40.00');
});

test('POST /api/quotes/:id/convert-to-invoice requires an accepted quote', async () => {
  const app = buildApp();
  const agent = await loggedInAgent(app);
  const customerId = await makeCustomer(agent);
  const created = await agent.post('/api/quotes').send({
    customerId,
    lineItems: [{ description: 'Part', unitPrice: 100, quantity: 1 }],
  });
  const quoteId = created.body.quote.id as string;

  const res = await agent.post(`/api/quotes/${quoteId}/convert-to-invoice`);
  assert.equal(res.status, 400);
});

test('POST /api/quotes/:id/convert-to-invoice copies totals and line items from an accepted quote', async () => {
  const app = buildApp();
  const agent = await loggedInAgent(app);
  await agent.patch('/api/company-profile').send({ vatRegistered: true, vatNumber: '4123456789' });
  const customerId = await makeCustomer(agent);
  const created = await agent.post('/api/quotes').send({
    customerId,
    lineItems: [{ description: 'Custom bracket', unitPrice: 100, quantity: 2 }],
  });
  const quoteId = created.body.quote.id as string;
  await agent.patch(`/api/quotes/${quoteId}/status`).send({ status: 'sent' });
  await agent.patch(`/api/quotes/${quoteId}/status`).send({ status: 'accepted' });

  const res = await agent.post(`/api/quotes/${quoteId}/convert-to-invoice`);

  assert.equal(res.status, 201);
  assert.equal(res.body.invoice.number, 'INV-0001');
  assert.equal(res.body.invoice.quoteId, quoteId);
  assert.equal(res.body.invoice.vatApplied, true);
  assert.equal(res.body.invoice.subtotal, '200.00');
  assert.equal(res.body.invoice.vatAmount, '30.00');
  assert.equal(res.body.invoice.total, '230.00');
  assert.equal(res.body.invoice.lineItems[0].description, 'Custom bracket');
  assert.equal(res.body.invoice.lineItems[0].lineTotal, '200.00');
});

test('POST /api/quotes/:id/convert-to-invoice rejects converting the same quote twice', async () => {
  const app = buildApp();
  const agent = await loggedInAgent(app);
  const customerId = await makeCustomer(agent);
  const created = await agent.post('/api/quotes').send({
    customerId,
    lineItems: [{ description: 'Part', unitPrice: 100, quantity: 1 }],
  });
  const quoteId = created.body.quote.id as string;
  await agent.patch(`/api/quotes/${quoteId}/status`).send({ status: 'sent' });
  await agent.patch(`/api/quotes/${quoteId}/status`).send({ status: 'accepted' });

  const first = await agent.post(`/api/quotes/${quoteId}/convert-to-invoice`);
  assert.equal(first.status, 201);

  const second = await agent.post(`/api/quotes/${quoteId}/convert-to-invoice`);
  assert.equal(second.status, 400);
});
```

- [ ] **Step 8: Write the isolation test**

In `tests/tenant-isolation.test.ts`, add at the end of the file:

```typescript
test('a tenant cannot see another tenant\'s invoices', async () => {
  const tenantA = await makeTenant('a@example.co.za');
  const tenantB = await makeTenant('b@example.co.za');

  const customerA = await prisma.customer.create({
    data: { tenantId: tenantA.id, name: 'Customer A', billingAddress: '1 Main Rd' },
  });

  const scopedA = tenantScope(tenantA.id);
  const scopedB = tenantScope(tenantB.id);

  await scopedA.invoices.create({
    customerId: customerA.id,
    quoteId: null,
    number: 'INV-0001',
    dueDate: new Date(),
    vatApplied: false,
    subtotal: '100.00',
    vatAmount: '0.00',
    total: '100.00',
    notes: null,
    lineItems: [],
  });

  const aList = await scopedA.invoices.findMany();
  const bList = await scopedB.invoices.findMany();

  assert.equal(aList.length, 1);
  assert.equal(bList.length, 0);

  const bFindById = await scopedB.invoices.findById(aList[0].id);
  assert.equal(bFindById, null);
});
```

- [ ] **Step 9: Run the full test suite and typecheck**

```bash
npm run migrate:test
npm test
npm run typecheck
```
Expected: all tests pass (existing + all four tasks' new tests), no type errors.

- [ ] **Step 10: Commit**

```bash
git add prisma/schema.prisma prisma/migrations src/db/scoped.ts src/routes/invoices.ts src/routes/quotes.ts src/app.ts tests/helpers/testApp.ts tests/invoices.test.ts tests/tenant-isolation.test.ts
git commit -m "Add Invoices, payment status tracking, and quote-to-invoice conversion"
```
