# Backlog Medium-Priority Batch Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close backlog items #7, #8, #12, #45, #56 — five independent,
small, Medium-priority fixes.

**Architecture:** Two tasks split by domain: backend (env/rate-limit/
session hygiene) and frontend (a form UX hint, and currency/VAT display
consistency between the UI and the generated PDF).

**Tech Stack:** No new dependencies anywhere in this plan.

## Global Constraints

- `TRUST_PROXY`'s exact-match behavior (`=== 'true'`) does not change —
  only a startup warning is added for any other non-empty value.
- Rate-limit window/limit values (10/hour) do not change — only which
  endpoints share a bucket.
- Session pruning is delete-on-detection inside `getSession()` — no new
  scheduled job, no new dependency.
- The 4 costing-related Printer fields do not become required — this is
  a UI hint only, no validation change.
- `formatCurrency()`'s own implementation does not change — only how its
  callers on the two detail pages invoke it.

---

### Task 1: Backend — `TRUST_PROXY` warning, split rate limiters, session pruning

**Files:**
- Modify: `platform/api/src/env.ts`
- Modify: `platform/api/src/routes/auth.ts`
- Modify: `platform/api/src/auth/session.ts`
- Test: `platform/api/tests/env.test.ts` (new)
- Test: `platform/api/tests/session.test.ts` (new)
- Test: `platform/api/tests/auth.test.ts`

**Interfaces:**
- Produces: `trustProxyWarning(raw: string | undefined): string | null`,
  exported from `src/env.ts` alongside the existing `env` object.
- Consumes: nothing from earlier tasks (this is the first task).

- [ ] **Step 1: Write the failing test for `trustProxyWarning`**

Create `platform/api/tests/env.test.ts`:

```typescript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { trustProxyWarning } from '../src/env.js';

test('trustProxyWarning returns null for unset, empty, "true", or "false"', () => {
  assert.equal(trustProxyWarning(undefined), null);
  assert.equal(trustProxyWarning(''), null);
  assert.equal(trustProxyWarning('true'), null);
  assert.equal(trustProxyWarning('false'), null);
});

test('trustProxyWarning returns a message naming the bad value for anything else', () => {
  const warning = trustProxyWarning('1');
  assert.ok(warning);
  assert.match(warning!, /TRUST_PROXY/);
  assert.match(warning!, /"1"/);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd platform/api && npm test -- --test-name-pattern trustProxyWarning`
Expected: FAIL — `trustProxyWarning` doesn't exist yet.

- [ ] **Step 3: Implement `trustProxyWarning` and wire it into `env.ts`**

In `platform/api/src/env.ts`, change:

```typescript
import 'dotenv/config';

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export const env = {
  port: Number(process.env.PORT ?? 4200),
  nodeEnv: process.env.NODE_ENV ?? 'development',
  databaseUrl: required('DATABASE_URL'),
  frontendOrigin: process.env.FRONTEND_ORIGIN ?? 'http://localhost:5174',
  // The SPA is served at the site root in dev, but under a path prefix
  // (`/app`) in production's path-based hosting — see
  // docs/superpowers/specs/2026-09-07-frontend-deploy-design.md.
  frontendBasePath: process.env.FRONTEND_BASE_PATH ?? '',
  sessionCookieName: process.env.SESSION_COOKIE_NAME ?? 'barkie_session',
  trustProxy: process.env.TRUST_PROXY === 'true',
  // Real SMTP is opt-in: unset in dev/test/CI (see src/lib/mailer.ts),
  // set only in the VPS's production .env. Never required() — a missing
  // value means "stay in dev-mode console-log", not a startup failure.
  smtpUser: process.env.SMTP_USER,
  smtpAppPassword: process.env.SMTP_APP_PASSWORD,
  smtpFromName: process.env.SMTP_FROM_NAME ?? 'Barkie',
};
```

to:

```typescript
import 'dotenv/config';

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

// Exported for testing. A misspelled TRUST_PROXY value (e.g. "1", "yes")
// silently falls back to false via the exact-match check below — this
// warning exists so a deploy-config typo shows up in the logs instead of
// silently reinstating the shared-rate-limit-bucket bug behind a
// reverse proxy.
export function trustProxyWarning(raw: string | undefined): string | null {
  if (raw === undefined || raw === '' || raw === 'true' || raw === 'false') {
    return null;
  }
  return `TRUST_PROXY is set to "${raw}", which is not exactly "true" or "false" — treating it as false. If you meant to enable it, set TRUST_PROXY=true exactly.`;
}

const trustProxyRaw = process.env.TRUST_PROXY;
const trustProxyWarningMessage = trustProxyWarning(trustProxyRaw);
if (trustProxyWarningMessage) {
  console.warn(trustProxyWarningMessage);
}

export const env = {
  port: Number(process.env.PORT ?? 4200),
  nodeEnv: process.env.NODE_ENV ?? 'development',
  databaseUrl: required('DATABASE_URL'),
  frontendOrigin: process.env.FRONTEND_ORIGIN ?? 'http://localhost:5174',
  // The SPA is served at the site root in dev, but under a path prefix
  // (`/app`) in production's path-based hosting — see
  // docs/superpowers/specs/2026-09-07-frontend-deploy-design.md.
  frontendBasePath: process.env.FRONTEND_BASE_PATH ?? '',
  sessionCookieName: process.env.SESSION_COOKIE_NAME ?? 'barkie_session',
  trustProxy: trustProxyRaw === 'true',
  // Real SMTP is opt-in: unset in dev/test/CI (see src/lib/mailer.ts),
  // set only in the VPS's production .env. Never required() — a missing
  // value means "stay in dev-mode console-log", not a startup failure.
  smtpUser: process.env.SMTP_USER,
  smtpAppPassword: process.env.SMTP_APP_PASSWORD,
  smtpFromName: process.env.SMTP_FROM_NAME ?? 'Barkie',
};
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd platform/api && npm test -- --test-name-pattern trustProxyWarning`
Expected: PASS (2/2)

- [ ] **Step 5: Write the failing tests for split rate limiters**

Add these tests to `platform/api/tests/auth.test.ts`, near the end of
the file (after the existing resend-verification tests):

```typescript
test('login rate limit is independent from the register/resend-verification bucket', async () => {
  const app = buildApp();
  const email = 'jane@acmeprints.co.za';
  for (let i = 0; i < 10; i++) {
    await request(app).post('/api/auth/login').send({ email, password: 'wrong' });
  }
  const limitedLogin = await request(app).post('/api/auth/login').send({ email, password: 'wrong' });
  assert.equal(limitedLogin.status, 429);

  const registerRes = await request(app).post('/api/auth/register').send({
    businessName: 'Acme Prints',
    contactName: 'Jane Doe',
    email,
    password: 'correct horse battery staple',
  });
  assert.notEqual(registerRes.status, 429);
});

test('register and resend-verification share one rate-limit bucket', async () => {
  const app = buildApp();
  const payload = {
    businessName: 'Acme Prints',
    contactName: 'Jane Doe',
    email: 'jane@acmeprints.co.za',
    password: 'correct horse battery staple',
  };
  await request(app).post('/api/auth/register').send(payload);
  for (let i = 0; i < 9; i++) {
    await request(app).post('/api/auth/resend-verification').send({ email: payload.email });
  }
  const limited = await request(app).post('/api/auth/resend-verification').send({ email: payload.email });
  assert.equal(limited.status, 429);
});
```

- [ ] **Step 6: Run the tests to verify they fail**

Run: `cd platform/api && npm test -- --test-name-pattern "rate-limit|rate limit"`
Expected: FAIL — both tests currently pass against the OLD shared-bucket
behavior in a way that doesn't prove isolation; run them anyway and
confirm you understand why (the first test's `registerRes` would also be
429 today, since register/login currently share one bucket) before
proceeding.

- [ ] **Step 7: Split `authLimiter` into `loginLimiter` and `accountLimiter`**

In `platform/api/src/routes/auth.ts`, change:

```typescript
  const authLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    limit: 10,
    standardHeaders: true,
    legacyHeaders: false,
  });
```

to:

```typescript
  // Login is the highest-frequency, most brute-forceable of the three
  // account-lifecycle actions, so it gets its own bucket. Register and
  // resend-verification are both low-frequency "something's wrong with
  // my account" actions and share one — see backlog item #8.
  const loginLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    limit: 10,
    standardHeaders: true,
    legacyHeaders: false,
  });

  const accountLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    limit: 10,
    standardHeaders: true,
    legacyHeaders: false,
  });
```

Then update the three route registrations that reference it:

```typescript
  authRouter.post('/api/auth/register', authLimiter, async (req, res) => {
```
→
```typescript
  authRouter.post('/api/auth/register', accountLimiter, async (req, res) => {
```

```typescript
  authRouter.post('/api/auth/resend-verification', authLimiter, async (req, res) => {
```
→
```typescript
  authRouter.post('/api/auth/resend-verification', accountLimiter, async (req, res) => {
```

```typescript
  authRouter.post('/api/auth/login', authLimiter, async (req, res) => {
```
→
```typescript
  authRouter.post('/api/auth/login', loginLimiter, async (req, res) => {
```

- [ ] **Step 8: Run the tests to verify they pass**

Run: `cd platform/api && npm test -- --test-name-pattern "rate-limit|rate limit"`
Expected: PASS (2/2)

- [ ] **Step 9: Write the failing tests for session pruning**

Create `platform/api/tests/session.test.ts`:

```typescript
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { prisma } from '../src/db/client.js';
import { createSession, getSession } from '../src/auth/session.js';
import { resetTestDatabase } from './helpers/testApp.js';

beforeEach(resetTestDatabase);

test('getSession deletes an expired session row instead of just rejecting it', async () => {
  const { token } = await createSession('tenant', 'fake-tenant-id');
  await prisma.session.update({ where: { token }, data: { expiresAt: new Date(Date.now() - 1000) } });

  const result = await getSession(token);
  assert.equal(result, null);

  const row = await prisma.session.findUnique({ where: { token } });
  assert.equal(row, null, 'the expired session row should have been deleted');
});

test('getSession returns the subject for a still-valid session and leaves it in place', async () => {
  const { token } = await createSession('tenant', 'fake-tenant-id');
  const result = await getSession(token);
  assert.deepEqual(result, { subjectType: 'tenant', subjectId: 'fake-tenant-id' });

  const row = await prisma.session.findUnique({ where: { token } });
  assert.ok(row, 'a still-valid session should not be deleted');
});

test('getSession returns null for a token that was never created', async () => {
  const result = await getSession('not-a-real-token');
  assert.equal(result, null);
});
```

- [ ] **Step 10: Run the tests to verify they fail**

Run: `cd platform/api && npm test -- --test-name-pattern getSession`
Expected: FAIL on the first test — the row is currently NOT deleted.

- [ ] **Step 11: Implement delete-on-detection in `getSession`**

In `platform/api/src/auth/session.ts`, change:

```typescript
export async function getSession(token: string): Promise<{ subjectType: string; subjectId: string } | null> {
  const session = await prisma.session.findUnique({ where: { token } });
  if (!session || session.expiresAt < new Date()) {
    return null;
  }
  return { subjectType: session.subjectType, subjectId: session.subjectId };
}
```

to:

```typescript
export async function getSession(token: string): Promise<{ subjectType: string; subjectId: string } | null> {
  const session = await prisma.session.findUnique({ where: { token } });
  if (!session) {
    return null;
  }
  if (session.expiresAt < new Date()) {
    // Self-pruning: an expired session naturally encountered by real
    // traffic gets cleaned up here — no scheduled job needed. See
    // backlog item #12.
    await prisma.session.deleteMany({ where: { token } });
    return null;
  }
  return { subjectType: session.subjectType, subjectId: session.subjectId };
}
```

- [ ] **Step 12: Run the tests to verify they pass**

Run: `cd platform/api && npm test -- --test-name-pattern getSession`
Expected: PASS (3/3)

- [ ] **Step 13: Run the full suite and typecheck**

Run: `cd platform/api && npm test && npm run typecheck`
Expected: PASS, no regressions

- [ ] **Step 14: Commit**

```bash
cd platform/api
git add src/env.ts src/routes/auth.ts src/auth/session.ts tests/env.test.ts tests/session.test.ts tests/auth.test.ts
git commit -m "Backend hygiene batch: TRUST_PROXY warning, split rate limiters, prune expired sessions (closes #7, #8, #12)"
```

---

### Task 2: Frontend — Printer costing hint, currency + VAT label consistency

**Files:**
- Modify: `platform/frontend/src/pages/printers/PrinterFormPage.tsx`
- Modify: `platform/frontend/src/pages/quotes/QuoteDetailPage.tsx`
- Modify: `platform/frontend/src/pages/invoices/InvoiceDetailPage.tsx`
- Test: `platform/frontend/tests/PrinterFormPage.test.tsx`
- Test: `platform/frontend/tests/QuoteDetailPage.test.tsx`
- Test: `platform/frontend/tests/InvoiceDetailPage.test.tsx`

**Interfaces:**
- Consumes: `useCompanyProfile()` (already exists, exported from
  `src/api/companyProfile.ts`, already used by `CompanyProfilePage`) —
  `{ data: CompanyProfile | undefined }`, where `CompanyProfile.
  defaultCurrency: string`.
- Consumes: `formatCurrency(value: string, currency?: string)` (already
  exists, unchanged) from `src/lib/formatCurrency.ts`.

- [ ] **Step 1: Write the failing test for the Printer costing hint**

Add this test inside the existing `describe('PrinterFormPage — create
mode'` block in `platform/frontend/tests/PrinterFormPage.test.tsx`
(after the last existing test in that block, before its closing `});`):

```typescript
  it('shows a hint that purchase cost, power draw, electricity rate, and expected lifetime are needed for job costing', async () => {
    renderAt('/printers/new');
    expect(screen.getByText(/required for job costing/i)).toBeInTheDocument();
  });
```

(`renderAt(path)` is the render helper already defined at the top of
this test file, used by every existing test in this `describe` block.)

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd platform/frontend && npm test -- PrinterFormPage`
Expected: FAIL — no such text exists yet.

- [ ] **Step 3: Add the hint to `PrinterFormPage.tsx`**

In `platform/frontend/src/pages/printers/PrinterFormPage.tsx`, change:

```typescript
        <FormField id="purchaseDate" label="Purchase date" type="date" value={form.purchaseDate ?? ''} onChange={(e) => set('purchaseDate', e.target.value)} />
        <FormField id="purchaseCost" label="Purchase cost" type="number" value={form.purchaseCost ?? ''} onChange={(e) => setNumber('purchaseCost', e.target.value)} />
        <FormField id="powerDrawWatts" label="Power draw (W)" type="number" value={form.powerDrawWatts ?? ''} onChange={(e) => setNumber('powerDrawWatts', e.target.value)} />
        <FormField id="electricityRatePerKwh" label="Electricity rate per kWh" type="number" value={form.electricityRatePerKwh ?? ''} onChange={(e) => setNumber('electricityRatePerKwh', e.target.value)} />
        <FormField id="expectedLifetimeHours" label="Expected lifetime (hours)" type="number" value={form.expectedLifetimeHours ?? ''} onChange={(e) => setNumber('expectedLifetimeHours', e.target.value)} />
```

to:

```typescript
        <FormField id="purchaseDate" label="Purchase date" type="date" value={form.purchaseDate ?? ''} onChange={(e) => set('purchaseDate', e.target.value)} />
        <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Required for job costing</p>
        <FormField id="purchaseCost" label="Purchase cost" type="number" value={form.purchaseCost ?? ''} onChange={(e) => setNumber('purchaseCost', e.target.value)} />
        <FormField id="powerDrawWatts" label="Power draw (W)" type="number" value={form.powerDrawWatts ?? ''} onChange={(e) => setNumber('powerDrawWatts', e.target.value)} />
        <FormField id="electricityRatePerKwh" label="Electricity rate per kWh" type="number" value={form.electricityRatePerKwh ?? ''} onChange={(e) => setNumber('electricityRatePerKwh', e.target.value)} />
        <FormField id="expectedLifetimeHours" label="Expected lifetime (hours)" type="number" value={form.expectedLifetimeHours ?? ''} onChange={(e) => setNumber('expectedLifetimeHours', e.target.value)} />
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd platform/frontend && npm test -- PrinterFormPage`
Expected: PASS, all tests in the file including the new one.

- [ ] **Step 5: Update `QuoteDetailPage.test.tsx`'s mocks to serve `/api/company-profile`**

The page is about to start calling `useCompanyProfile()`, which fetches
`/api/company-profile`. Every `apiGet` mock in this test file must serve
that path or the query will error. Add a shared fixture and a case to
BOTH `apiGet` mock implementations in this file (`mockData()` and the
inline mock inside the `'sends the quote, downloads the PDF...'` test).

First, add this constant near the top of
`platform/frontend/tests/QuoteDetailPage.test.tsx`, right after the
`draftQuote` constant:

```typescript
const testCompanyProfile = {
  businessName: 'Acme Prints', contactName: 'Jane Doe', email: 'jane@acmeprints.co.za',
  registrationNumber: null, vatRegistered: false, vatNumber: null, logoUrl: null,
  addressLine1: null, addressLine2: null, city: null, postalCode: null, phone: null, website: null,
  bankName: null, bankAccountHolder: null, bankAccountNumber: null, bankBranchCode: null,
  termsAndConditionsText: null, defaultCurrency: 'ZAR', defaultQuoteValidityDays: null,
  quoteNumberPrefix: 'QT', invoiceNumberPrefix: 'INV',
};
```

Then in `mockData()`, change:

```typescript
function mockData(quote = draftQuote) {
  vi.spyOn(client, 'apiGet').mockImplementation((path: string) => {
    if (path === `/api/quotes/${quote.id}`) return Promise.resolve({ ok: true, quote });
    if (path === '/api/customers') return Promise.resolve({ ok: true, customers: [{ id: 'c1', name: 'Bob Client', company: null, email: null, phone: null, billingAddress: '1 Oak St', deliveryAddress: null, vatNumber: null, notes: null, createdAt: '2026-01-01T00:00:00.000Z' }] });
    return Promise.reject(new client.ApiError('not found', 404));
  });
}
```

to:

```typescript
function mockData(quote = draftQuote, companyProfile = testCompanyProfile) {
  vi.spyOn(client, 'apiGet').mockImplementation((path: string) => {
    if (path === `/api/quotes/${quote.id}`) return Promise.resolve({ ok: true, quote });
    if (path === '/api/customers') return Promise.resolve({ ok: true, customers: [{ id: 'c1', name: 'Bob Client', company: null, email: null, phone: null, billingAddress: '1 Oak St', deliveryAddress: null, vatNumber: null, notes: null, createdAt: '2026-01-01T00:00:00.000Z' }] });
    if (path === '/api/company-profile') return Promise.resolve({ ok: true, companyProfile });
    return Promise.reject(new client.ApiError('not found', 404));
  });
}
```

And in the `'sends the quote, downloads the PDF, and shows a dev-mode
success message'` test, change:

```typescript
    vi.spyOn(client, 'apiGet').mockImplementation((path: string) => {
      if (path === '/api/quotes/q1') return Promise.resolve({ ok: true, quote: draftQuote });
      if (path === '/api/customers') {
        return Promise.resolve({
          ok: true,
          customers: [{ id: 'c1', name: 'Bob Client', company: null, email: 'bob@example.com', phone: null, billingAddress: '1 Oak St', deliveryAddress: null, vatNumber: null, notes: null, createdAt: '2026-01-01T00:00:00.000Z' }],
        });
      }
      return Promise.reject(new client.ApiError('not found', 404));
    });
```

to:

```typescript
    vi.spyOn(client, 'apiGet').mockImplementation((path: string) => {
      if (path === '/api/quotes/q1') return Promise.resolve({ ok: true, quote: draftQuote });
      if (path === '/api/customers') {
        return Promise.resolve({
          ok: true,
          customers: [{ id: 'c1', name: 'Bob Client', company: null, email: 'bob@example.com', phone: null, billingAddress: '1 Oak St', deliveryAddress: null, vatNumber: null, notes: null, createdAt: '2026-01-01T00:00:00.000Z' }],
        });
      }
      if (path === '/api/company-profile') return Promise.resolve({ ok: true, companyProfile: testCompanyProfile });
      return Promise.reject(new client.ApiError('not found', 404));
    });
```

- [ ] **Step 6: Write the failing tests for currency + VAT label on `QuoteDetailPage`**

Add these two `it` blocks inside the existing `describe('QuoteDetailPage'`
block, after the last existing test, before its closing `});`:

```typescript
  it('labels the VAT row "VAT (15%)" to match the generated PDF', async () => {
    mockData({ ...draftQuote, vatApplied: true, vatAmount: '15.00' });
    renderAt('/quotes/q1');
    await waitFor(() => expect(screen.getByText('VAT (15%)')).toBeInTheDocument());
  });

  it('formats money using the tenant\'s actual currency, not the ZAR default', async () => {
    mockData(draftQuote, { ...testCompanyProfile, defaultCurrency: 'USD' });
    renderAt('/quotes/q1');
    await waitFor(() => expect(screen.getByRole('heading', { name: 'QT-0001' })).toBeInTheDocument());
    expect(screen.getByText('USD 100.00')).toBeInTheDocument();
  });
```

- [ ] **Step 7: Run the tests to verify they fail**

Run: `cd platform/frontend && npm test -- QuoteDetailPage`
Expected: FAIL — the VAT label still says "VAT", and money is still
formatted with the ZAR default regardless of the mocked company profile.

- [ ] **Step 8: Update `QuoteDetailPage.tsx`**

Change the import block from:

```typescript
import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuote, useUpdateQuoteStatus, useConvertQuoteToInvoice, useSendQuote, VALID_QUOTE_STATUS_TRANSITIONS, type QuoteStatus } from '../../api/quotes.js';
import { useCustomerLookup } from '../../api/customers.js';
import { formatCurrency } from '../../lib/formatCurrency.js';
import { downloadBase64Pdf } from '../../lib/downloadPdf.js';
import { ApiError } from '../../api/client.js';
```

to:

```typescript
import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuote, useUpdateQuoteStatus, useConvertQuoteToInvoice, useSendQuote, VALID_QUOTE_STATUS_TRANSITIONS, type QuoteStatus } from '../../api/quotes.js';
import { useCustomerLookup } from '../../api/customers.js';
import { useCompanyProfile } from '../../api/companyProfile.js';
import { formatCurrency } from '../../lib/formatCurrency.js';
import { downloadBase64Pdf } from '../../lib/downloadPdf.js';
import { ApiError } from '../../api/client.js';
```

Add the hook call right after `const { lookup: customerLookup } =
useCustomerLookup();`:

```typescript
  const { lookup: customerLookup } = useCustomerLookup();
  const { data: companyProfile } = useCompanyProfile();
```

Then change the line-items/totals section from:

```typescript
        {quote.lineItems?.map((line) => (
          <div key={line.id} className="flex justify-between">
            <span>
              <span>{line.description}</span> × {line.quantity}
            </span>
            <span>{formatCurrency(line.lineTotal)}</span>
          </div>
        ))}
        <div className="flex justify-between border-t border-slate-200 pt-2"><span>Subtotal</span><span>{formatCurrency(quote.subtotal)}</span></div>
        {quote.vatApplied && <div className="flex justify-between"><span>VAT</span><span>{formatCurrency(quote.vatAmount)}</span></div>}
        <div className="flex justify-between font-semibold text-slate-900"><span>Total</span><span>{formatCurrency(quote.total)}</span></div>
```

to:

```typescript
        {quote.lineItems?.map((line) => (
          <div key={line.id} className="flex justify-between">
            <span>
              <span>{line.description}</span> × {line.quantity}
            </span>
            <span>{formatCurrency(line.lineTotal, companyProfile?.defaultCurrency)}</span>
          </div>
        ))}
        <div className="flex justify-between border-t border-slate-200 pt-2"><span>Subtotal</span><span>{formatCurrency(quote.subtotal, companyProfile?.defaultCurrency)}</span></div>
        {quote.vatApplied && <div className="flex justify-between"><span>VAT (15%)</span><span>{formatCurrency(quote.vatAmount, companyProfile?.defaultCurrency)}</span></div>}
        <div className="flex justify-between font-semibold text-slate-900"><span>Total</span><span>{formatCurrency(quote.total, companyProfile?.defaultCurrency)}</span></div>
```

- [ ] **Step 9: Run the tests to verify they pass**

Run: `cd platform/frontend && npm test -- QuoteDetailPage`
Expected: PASS, all tests including the 2 new ones.

- [ ] **Step 10: Repeat Steps 5-9 for `InvoiceDetailPage`**

Apply the exact same pattern to
`platform/frontend/tests/InvoiceDetailPage.test.tsx` and
`platform/frontend/src/pages/invoices/InvoiceDetailPage.tsx`:

In `InvoiceDetailPage.test.tsx`, add the same `testCompanyProfile`
constant after `unpaidInvoice`, add `companyProfile = testCompanyProfile`
as a second parameter to `mockData()` with the same
`/api/company-profile` branch, add the same branch to the inline mock
inside `'sends the invoice, downloads the PDF...'`, and add these two
tests inside `describe('InvoiceDetailPage'`:

```typescript
  it('labels the VAT row "VAT (15%)" to match the generated PDF', async () => {
    mockData({ ...unpaidInvoice, vatApplied: true, vatAmount: '15.00' });
    renderAt('/invoices/inv1');
    await waitFor(() => expect(screen.getByText('VAT (15%)')).toBeInTheDocument());
  });

  it('formats money using the tenant\'s actual currency, not the ZAR default', async () => {
    mockData(unpaidInvoice, { ...testCompanyProfile, defaultCurrency: 'USD' });
    renderAt('/invoices/inv1');
    await waitFor(() => expect(screen.getByRole('heading', { name: 'INV-0001' })).toBeInTheDocument());
    expect(screen.getByText('USD 100.00')).toBeInTheDocument();
  });
```

In `InvoiceDetailPage.tsx`, add the same `useCompanyProfile` import and
hook call (right after `const { lookup: customerLookup } =
useCustomerLookup();`), and change every `formatCurrency(x)` call in the
line-items/totals section (`line.lineTotal`, `invoice.subtotal`,
`invoice.vatAmount`, `invoice.total`, `invoice.amountPaid`,
`invoice.balanceDue` — six call sites total, one more than
QuoteDetailPage's four, since this page also shows amount-paid and
balance-due) to pass `companyProfile?.defaultCurrency` as the second
argument, and change the VAT row's `<span>VAT</span>` to `<span>VAT
(15%)</span>`.

- [ ] **Step 11: Run both test files to verify all tests pass**

Run: `cd platform/frontend && npm test -- QuoteDetailPage InvoiceDetailPage`
Expected: PASS, all tests including the 4 new ones (2 per page).

- [ ] **Step 12: Run the full frontend test suite**

Run: `cd platform/frontend && npm test`
Expected: PASS, no regressions.

- [ ] **Step 13: Typecheck / build**

Run: `cd platform/frontend && npm run build`
Expected: no type errors, build succeeds.

- [ ] **Step 14: Commit**

```bash
cd platform/frontend
git add src/pages/printers/PrinterFormPage.tsx src/pages/quotes/QuoteDetailPage.tsx src/pages/invoices/InvoiceDetailPage.tsx tests/PrinterFormPage.test.tsx tests/QuoteDetailPage.test.tsx tests/InvoiceDetailPage.test.tsx
git commit -m "Frontend polish batch: printer costing hint, tenant-currency-aware money display, matching VAT label (closes #45, #56)"
```

---

## After all tasks

Deploy both `platform/api` and `platform/frontend` per
`docs/AI_HANDOFF.md`'s "Deploying" section. Smoke-test: confirm a
malformed `TRUST_PROXY` value in a local run logs the warning (don't set
this on the VPS — it's already correctly `true` there); confirm
`/api/auth/login` and `/api/auth/register` are independently rate-limited
in production behavior (or trust the test coverage — no need to actually
exhaust a production rate limit); load a Quote/Invoice detail page and
confirm "VAT (15%)" renders. Mark backlog items #7, #8, #12, #45, #56
Done. Update `docs/AI_HANDOFF.md` if any of these are worth a permanent
note (the rate-limiter split is worth documenting inline near the
existing `authLimiter` history if any exists).
