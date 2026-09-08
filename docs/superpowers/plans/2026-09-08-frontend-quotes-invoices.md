# Frontend: Quotes + Invoices Pages Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Phase 6 of the frontend build-out, and the last one before PDF/email: Quotes (list, detail with status transitions + convert-to-invoice, create with dual-mode line items) and Invoices (list, detail with payment-status transitions — no create form, per the design spec's approved v1 scope: invoices mostly arrive via quote conversion). Builds on Costing Templates (just merged) and every reference-data module.

**Architecture:** Same page-group shape as prior phases (API hook module + list + detail/form pages), with two genuinely new patterns: (1) **status-transition buttons** driven by the exact same transition tables the backend enforces (`VALID_STATUS_TRANSITIONS` for quotes, `VALID_INVOICE_STATUS_TRANSITIONS` for invoices) — the frontend mirrors these tables so it only ever offers a legal next status, rather than letting the backend's 400 be the only guard; (2) **dual-mode line items** on the Quote create form — each line is either a costing-template pick OR an ad-hoc description+price, a discriminated choice the backend's `lineItemSchema` itself enforces via `.refine()`.

**Tech Stack:** Same as prior phases.

## Global Constraints

- **Neither `Quote` nor `Invoice` API responses include the related `Customer` record** (confirmed: `platform/api/src/db/scoped.ts`'s `quotes.findMany`/`findById` and `invoices.findMany`/`findById` only `include: { lineItems: true }`, never the customer relation) — every response only has a raw `customerId` string. Resolve customer NAMES for display entirely client-side: Task 1 adds a `useCustomerLookup()` hook to the existing `src/api/customers.ts` (returns a `Map<string, Customer>` built from the already-existing `useCustomers()` list query), and every quote/invoice list/detail page uses it instead of ever trying to add a backend include. This is a deliberate, cheap frontend-only solution — do not modify the backend to add the include.
- **Status transitions are frontend-mirrored, not re-invented.** Quotes: `draft → [sent, expired]`, `sent → [accepted, expired]` (`accepted`/`expired` are terminal — no further transitions). Invoices: `unpaid → [partially_paid, paid, overdue]`, `partially_paid → [partially_paid, paid, overdue]`, `overdue → [overdue, partially_paid, paid]`, `paid → []` (fully terminal). Copy these tables verbatim from `platform/api/src/routes/{quotes,invoices}.ts` — don't re-derive them from reading prose, use the actual `Record<string, string[]>` objects as the source of truth, and re-verify against the live route files before finalizing (this project's discipline all phase: read the real schema, don't assume).
- **Invoice `PATCH .../status` needs `amountPaid` for `partially_paid`/`paid`, and explicitly FORBIDS it for `overdue`** (`platform/api/src/routes/invoices.ts`'s `updateInvoiceStatusSchema` has a `.refine()` rejecting `amountPaid` when `status === 'overdue'`) — the frontend's status-action UI must reflect this: an "Overdue" button needs no amount input, "Partially Paid"/"Paid" buttons do.
- **`balanceDue` is now a real field on every invoice response** (`platform/api/src/routes/invoices.ts`'s `serializeInvoice`, added just before this plan) — use it directly, never compute `total - amountPaid` in the frontend.
- **All money fields arrive as pre-formatted strings** — use the existing shared `formatCurrency()` (`src/lib/formatCurrency.ts`) everywhere, never re-parse to `Number` for display (only for the CREATE form's own numeric inputs).
- **Quote line items are dual-mode**: `{ costingTemplateId }` (backend snapshots the costing template's `name`/`suggestedPrice`) OR `{ description, unitPrice }` (ad-hoc) — `quantity` is common to both. The backend's `lineItemSchema` `.refine()`s that exactly one mode's required fields are present; the frontend's create form gives each line a mode toggle and only submits the fields for the selected mode (never both, never neither).
- **`validUntil`/`dueDate` are optional date fields with the same `.refine()` date-format validation as every prior phase's date fields** — leave blank to use the tenant's configured default (quote validity days / 30-day invoice default), matching the backend's own fallback behavior; don't force these to be required in the frontend.
- Every API call through `apiGet`/`apiPost`/`apiPatch`. Every navigation through `<Link>`/`useNavigate`. Every list/detail page: `isLoading`/`isError`/empty (list), `isLoading`/`isError` (detail).

---

### Task 1: Quotes API hooks + list + detail (status transitions + convert-to-invoice)

**Files:**
- Modify: `platform/frontend/src/api/customers.ts` (add `useCustomerLookup()`)
- Create: `platform/frontend/tests/useCustomerLookup.test.tsx` (or fold into an existing customers test file if one exists — check first)
- Create: `platform/frontend/src/api/quotes.ts`
- Create: `platform/frontend/src/pages/quotes/QuotesListPage.tsx`
- Create: `platform/frontend/tests/QuotesListPage.test.tsx`
- Create: `platform/frontend/src/pages/quotes/QuoteDetailPage.tsx`
- Create: `platform/frontend/tests/QuoteDetailPage.test.tsx`
- Modify: `platform/frontend/src/components/AppShell.tsx` (add nav entry)
- Modify: `platform/frontend/src/App.tsx` (add routes for list + detail — create route added in Task 2)
- Modify: `platform/frontend/tests/App.test.tsx` (routing test)

**Interfaces:**
- Consumes: `apiGet`/`apiPost`/`apiPatch`, `formatCurrency`, `useCustomers` (existing).
- Produces: `useCustomerLookup()` — reused by Invoices (Task 3) too. Produces: `QUOTES_QUERY_KEY`, `useQuotes`/`useQuote`/`useUpdateQuoteStatus`/`useConvertQuoteToInvoice` — Task 2's create page reuses `QUOTES_QUERY_KEY` for cache invalidation and the detail route this task builds for post-create navigation.

- [ ] **Step 1: Add `useCustomerLookup()` to the existing Customers API module**

Read `platform/frontend/src/api/customers.ts` first to see its current exports and match its exact style. Add:

```typescript
export function useCustomerLookup() {
  const { data: customers, isLoading } = useCustomers();
  const lookup = new Map(customers?.map((c) => [c.id, c]) ?? []);
  return { lookup, isLoading };
}
```

(A fresh `Map` is rebuilt on every render this way — acceptable for a typical tenant's customer-list size; wrap in `useMemo(() => new Map(...), [customers])` if you want to avoid the rebuild, either is fine, prefer `useMemo` since it's one line more and avoids a real (if small) per-render cost.)

- [ ] **Step 2: Write and run a test for `useCustomerLookup()`**

Add to (or create, matching whatever convention Step 1 found) a test file, e.g. `platform/frontend/tests/customersApi.test.tsx` or appended to an existing customers-related test file:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { useCustomerLookup } from '../src/api/customers.js';
import * as client from '../src/api/client.js';
import { createTestQueryClient } from './helpers/queryClient.js';

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('useCustomerLookup', () => {
  it('builds a Map of customer id to customer record', async () => {
    vi.spyOn(client, 'apiGet').mockResolvedValue({
      ok: true,
      customers: [{ id: 'c1', name: 'Bob Client', company: null, email: null, phone: null, billingAddress: '1 Oak St', deliveryAddress: null, vatNumber: null, notes: null, createdAt: '2026-01-01T00:00:00.000Z' }],
    });
    const queryClient = createTestQueryClient();
    const { result } = renderHook(() => useCustomerLookup(), {
      wrapper: ({ children }) => <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>,
    });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.lookup.get('c1')?.name).toBe('Bob Client');
  });
});
```

Run `npx vitest run` on the file you created — expect PASS.

- [ ] **Step 3: Read `platform/api/src/routes/quotes.ts`'s real schema and status-transition table**

Confirm `VALID_STATUS_TRANSITIONS = { draft: ['sent', 'expired'], sent: ['accepted', 'expired'] }` matches what's actually in the file (copy it verbatim, don't retype from memory). Confirm `serializeQuote`'s exact field list (no customer include, confirmed by this plan's Global Constraints — just double-check nothing changed).

- [ ] **Step 4: Create the Quotes API hook module**

Create `platform/frontend/src/api/quotes.ts`:

```typescript
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiGet, apiPatch, apiPost } from './client.js';

export type QuoteStatus = 'draft' | 'sent' | 'accepted' | 'expired';

export interface QuoteLineItem {
  id: string;
  costingTemplateId: string | null;
  description: string;
  quantity: number;
  unitPrice: string;
  lineTotal: string;
}

export interface Quote {
  id: string;
  number: string;
  customerId: string;
  status: QuoteStatus;
  validUntil: string | null;
  vatApplied: boolean;
  subtotal: string;
  vatAmount: string;
  total: string;
  notes: string | null;
  createdAt: string;
  lineItems?: QuoteLineItem[];
}

export interface QuoteLineItemInput {
  costingTemplateId?: string;
  description?: string;
  unitPrice?: number;
  quantity: number;
}

export interface QuoteFormInput {
  customerId: string;
  validUntil?: string;
  notes?: string;
  lineItems: QuoteLineItemInput[];
}

export const VALID_QUOTE_STATUS_TRANSITIONS: Record<string, QuoteStatus[]> = {
  draft: ['sent', 'expired'],
  sent: ['accepted', 'expired'],
};

const QUOTES_QUERY_KEY = ['quotes'] as const;

export function useQuotes() {
  return useQuery({
    queryKey: QUOTES_QUERY_KEY,
    queryFn: () => apiGet<{ quotes: Quote[] }>('/api/quotes').then((r) => r.quotes),
  });
}

export function useQuote(id: string | undefined) {
  return useQuery({
    queryKey: [...QUOTES_QUERY_KEY, id],
    queryFn: () => apiGet<{ quote: Quote }>(`/api/quotes/${id}`).then((r) => r.quote),
    enabled: id !== undefined,
  });
}

export function useCreateQuote() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: QuoteFormInput) => apiPost<{ quote: Quote }>('/api/quotes', data).then((r) => r.quote),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUOTES_QUERY_KEY });
    },
  });
}

export function useUpdateQuoteStatus(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (status: QuoteStatus) =>
      apiPatch<{ quote: Quote }>(`/api/quotes/${id}/status`, { status }).then((r) => r.quote),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUOTES_QUERY_KEY });
    },
  });
}

export function useConvertQuoteToInvoice(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => apiPost<{ invoice: { id: string } }>(`/api/quotes/${id}/convert-to-invoice`).then((r) => r.invoice),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUOTES_QUERY_KEY });
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
    },
  });
}
```

- [ ] **Step 5: Write the failing QuotesListPage test**

Create `platform/frontend/tests/QuotesListPage.test.tsx`, mirroring `CostingTemplatesListPage.test.tsx`'s structure (list, empty, error, new-link to `/quotes/new`), adapted for `Quote` — table columns `number`, customer name (resolved via `useCustomerLookup()` — mock `apiGet('/api/customers')` alongside `apiGet('/api/quotes')` in the test, matching the multi-endpoint mocking pattern already used in `CostingTemplateCreatePage.test.tsx`'s `mockReferenceData()`), `status`, `total` (via `formatCurrency`), `validUntil`. Add ONE more test: a status filter `<select>` that, when changed to e.g. `'accepted'`, hides rows whose status doesn't match (client-side filtering — the backend has no status query param).

- [ ] **Step 6: Run the test, verify it fails, then implement `QuotesListPage`**

Create `platform/frontend/src/pages/quotes/QuotesListPage.tsx`, mirroring `CostingTemplatesListPage.tsx`'s list/table shape, PLUS:
- A customer-name cell using `useCustomerLookup()`'s `lookup.get(quote.customerId)?.name ?? 'Unknown customer'`.
- A status filter `<select>` (options: `All`, `draft`, `sent`, `accepted`, `expired`) driving a client-side `.filter()` over the fetched list before rendering rows.
- Each row's number cell links to `/quotes/${quote.id}`.
- "New Quote" link to `/quotes/new`.

Run the test — expect PASS.

- [ ] **Step 7: Write the failing QuoteDetailPage test**

Create `platform/frontend/tests/QuoteDetailPage.test.tsx`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { QuoteDetailPage } from '../src/pages/quotes/QuoteDetailPage.js';
import * as client from '../src/api/client.js';
import { createTestQueryClient } from './helpers/queryClient.js';

beforeEach(() => {
  vi.restoreAllMocks();
});

const draftQuote = {
  id: 'q1', number: 'QT-0001', customerId: 'c1', status: 'draft', validUntil: null,
  vatApplied: false, subtotal: '100.00', vatAmount: '0.00', total: '100.00', notes: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  lineItems: [{ id: 'li1', costingTemplateId: null, description: 'Custom bracket', quantity: 1, unitPrice: '100.00', lineTotal: '100.00' }],
};

function mockData(quote = draftQuote) {
  vi.spyOn(client, 'apiGet').mockImplementation((path: string) => {
    if (path === `/api/quotes/${quote.id}`) return Promise.resolve({ ok: true, quote });
    if (path === '/api/customers') return Promise.resolve({ ok: true, customers: [{ id: 'c1', name: 'Bob Client', company: null, email: null, phone: null, billingAddress: '1 Oak St', deliveryAddress: null, vatNumber: null, notes: null, createdAt: '2026-01-01T00:00:00.000Z' }] });
    return Promise.reject(new client.ApiError('not found', 404));
  });
}

function renderAt(path: string) {
  const queryClient = createTestQueryClient();
  return render(
    <MemoryRouter initialEntries={[path]}>
      <QueryClientProvider client={queryClient}>
        <Routes>
          <Route path="/quotes/:id" element={<QuoteDetailPage />} />
          <Route path="/invoices/:id" element={<div>invoice detail page</div>} />
        </Routes>
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

describe('QuoteDetailPage', () => {
  it('renders quote details, customer name, and line items', async () => {
    mockData();
    renderAt('/quotes/q1');
    await waitFor(() => expect(screen.getByRole('heading', { name: 'QT-0001' })).toBeInTheDocument());
    expect(screen.getByText('Bob Client')).toBeInTheDocument();
    expect(screen.getByText('Custom bracket')).toBeInTheDocument();
  });

  it('shows only legal next-status buttons for a draft quote (sent, expired — not accepted)', async () => {
    mockData();
    renderAt('/quotes/q1');
    await waitFor(() => expect(screen.getByRole('heading', { name: 'QT-0001' })).toBeInTheDocument());
    expect(screen.getByRole('button', { name: 'Mark as Sent' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Mark as Expired' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Mark as Accepted' })).not.toBeInTheDocument();
  });

  it('transitions status via PATCH when a status button is clicked', async () => {
    mockData();
    const patchSpy = vi.spyOn(client, 'apiPatch').mockResolvedValue({ ok: true, quote: { ...draftQuote, status: 'sent' } });
    renderAt('/quotes/q1');
    await waitFor(() => expect(screen.getByRole('button', { name: 'Mark as Sent' })).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'Mark as Sent' }));
    await waitFor(() => expect(patchSpy).toHaveBeenCalledWith('/api/quotes/q1/status', { status: 'sent' }));
  });

  it('shows a "Convert to Invoice" button only when status is accepted, and navigates to the new invoice on success', async () => {
    mockData({ ...draftQuote, status: 'accepted' });
    const postSpy = vi.spyOn(client, 'apiPost').mockResolvedValue({ ok: true, invoice: { id: 'inv1' } });
    renderAt('/quotes/q1');
    await waitFor(() => expect(screen.getByRole('button', { name: 'Convert to Invoice' })).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'Convert to Invoice' }));
    await waitFor(() => expect(postSpy).toHaveBeenCalledWith('/api/quotes/q1/convert-to-invoice'));
    await waitFor(() => expect(screen.getByText('invoice detail page')).toBeInTheDocument());
  });

  it('does not show a "Convert to Invoice" button for a draft quote', async () => {
    mockData();
    renderAt('/quotes/q1');
    await waitFor(() => expect(screen.getByRole('heading', { name: 'QT-0001' })).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: 'Convert to Invoice' })).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 8: Run the test, verify it fails, then implement `QuoteDetailPage`**

Create `platform/frontend/src/pages/quotes/QuoteDetailPage.tsx`:

```typescript
import { useParams, useNavigate } from 'react-router-dom';
import { useQuote, useUpdateQuoteStatus, useConvertQuoteToInvoice, VALID_QUOTE_STATUS_TRANSITIONS, type QuoteStatus } from '../../api/quotes.js';
import { useCustomerLookup } from '../../api/customers.js';
import { formatCurrency } from '../../lib/formatCurrency.js';
import { ApiError } from '../../api/client.js';
import { useState } from 'react';

const STATUS_LABELS: Record<QuoteStatus, string> = {
  draft: 'Draft',
  sent: 'Sent',
  accepted: 'Accepted',
  expired: 'Expired',
};

export function QuoteDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { data: quote, isLoading, isError } = useQuote(id);
  const { lookup: customerLookup } = useCustomerLookup();
  const updateStatusMutation = useUpdateQuoteStatus(id ?? '');
  const convertMutation = useConvertQuoteToInvoice(id ?? '');
  const [error, setError] = useState<string | null>(null);

  if (isLoading) {
    return <p className="text-slate-500">Loading…</p>;
  }
  if (isError || !quote) {
    return <p className="text-red-600">Couldn't load this quote.</p>;
  }

  const customer = customerLookup.get(quote.customerId);
  const nextStatuses = VALID_QUOTE_STATUS_TRANSITIONS[quote.status] ?? [];

  async function handleStatusChange(status: QuoteStatus) {
    setError(null);
    try {
      await updateStatusMutation.mutateAsync(status);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong. Try again shortly.');
    }
  }

  async function handleConvert() {
    setError(null);
    try {
      const invoice = await convertMutation.mutateAsync();
      navigate(`/invoices/${invoice.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong. Try again shortly.');
    }
  }

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-slate-900">{quote.number}</h1>
        <span className="rounded bg-slate-100 px-2 py-1 text-sm">{STATUS_LABELS[quote.status]}</span>
      </div>

      <section className="grid grid-cols-2 gap-4 text-sm">
        <div><div className="text-slate-500">Customer</div><div>{customer?.name ?? 'Unknown customer'}</div></div>
        <div><div className="text-slate-500">Valid until</div><div>{quote.validUntil?.slice(0, 10) ?? '—'}</div></div>
      </section>

      <section className="flex flex-col gap-2 border-t border-slate-200 pt-4 text-sm">
        <h2 className="text-lg font-semibold text-slate-900">Line items</h2>
        {quote.lineItems?.map((line) => (
          <div key={line.id} className="flex justify-between">
            <span>{line.description} × {line.quantity}</span>
            <span>{formatCurrency(line.lineTotal)}</span>
          </div>
        ))}
        <div className="flex justify-between border-t border-slate-200 pt-2"><span>Subtotal</span><span>{formatCurrency(quote.subtotal)}</span></div>
        {quote.vatApplied && <div className="flex justify-between"><span>VAT</span><span>{formatCurrency(quote.vatAmount)}</span></div>}
        <div className="flex justify-between font-semibold text-slate-900"><span>Total</span><span>{formatCurrency(quote.total)}</span></div>
      </section>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex gap-3">
        {nextStatuses.map((status) => (
          <button
            key={status}
            onClick={() => handleStatusChange(status)}
            disabled={updateStatusMutation.isPending}
            className="rounded bg-slate-100 px-3 py-2 text-sm disabled:opacity-50"
          >
            Mark as {STATUS_LABELS[status]}
          </button>
        ))}
        {quote.status === 'accepted' && (
          <button
            onClick={handleConvert}
            disabled={convertMutation.isPending}
            className="rounded bg-slate-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            Convert to Invoice
          </button>
        )}
      </div>
    </div>
  );
}
```

Run the test — expect PASS, all 5 tests.

- [ ] **Step 9: Add the nav entry and the list/detail routes (NOT the create route — Task 2 adds it)**

`AppShell.tsx`: append `{ to: '/quotes', label: 'Quotes' },`

`App.tsx`: add imports and 2 routes (`/quotes`, `/quotes/:id`) before the catch-all.

- [ ] **Step 10: Add a routing test**

Mirror the established pattern, asserting the "Quotes" heading via `getByRole('heading', ...)` at `/quotes`.

- [ ] **Step 11: Run the full test suite, typecheck, and build**

```bash
npm test
npm run typecheck
npm run build
```
Expected: all tests pass (135 existing + this task's ~11 new), zero type errors, build succeeds.

- [ ] **Step 12: Commit**

```bash
git add platform/frontend/src/api/customers.ts platform/frontend/tests/customersApi.test.tsx platform/frontend/src/api/quotes.ts platform/frontend/src/pages/quotes platform/frontend/tests/QuotesListPage.test.tsx platform/frontend/tests/QuoteDetailPage.test.tsx platform/frontend/src/components/AppShell.tsx platform/frontend/src/App.tsx platform/frontend/tests/App.test.tsx
git commit -m "Add Quotes list and detail pages with status transitions and convert-to-invoice"
```

(Adjust the `customersApi.test.tsx` path in this command to match whatever filename Step 2 actually used.)

---

### Task 2: Quote create form (customer picker + dual-mode line items)

**Files:**
- Create: `platform/frontend/src/pages/quotes/QuoteCreatePage.tsx`
- Create: `platform/frontend/tests/QuoteCreatePage.test.tsx`
- Modify: `platform/frontend/src/App.tsx` (add the `/quotes/new` route)
- Modify: `platform/frontend/tests/App.test.tsx` (routing test, if needed)

**Interfaces:**
- Consumes: `useCreateQuote` (Task 1), `useCustomers` (existing), `useCostingTemplates` (existing, from Phase 5).
- Produces: nothing consumed elsewhere in this plan — but establishes the dual-mode line-item pattern Invoices (Task 3) does NOT need (invoices have no create form in this pass), so this pattern isn't reused within this plan, only documented for a future "New Invoice" fast-follow.

- [ ] **Step 1: Read `platform/api/src/routes/quotes.ts`'s `lineItemSchema` one more time to confirm the exact dual-mode contract**

Confirm: a line is valid if EITHER `costingTemplateId` is present, OR both `description` AND `unitPrice` are present — never both, never neither (the `.refine()` enforces "at least one of the two modes' required fields", but sending BOTH `costingTemplateId` AND `description`/`unitPrice` together would also pass that specific check since it's an OR, not XOR — however, the resolution code in `quotesRouter.post('/api/quotes', ...)` checks `if (line.costingTemplateId)` FIRST and ignores `description`/`unitPrice` entirely when present, so sending both is harmless but wasteful; the frontend should still only submit ONE mode's fields per line, matching the intended usage even though the backend would tolerate redundant fields).

- [ ] **Step 2: Write the failing QuoteCreatePage test**

Create `platform/frontend/tests/QuoteCreatePage.test.tsx`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { QuoteCreatePage } from '../src/pages/quotes/QuoteCreatePage.js';
import * as client from '../src/api/client.js';
import { createTestQueryClient } from './helpers/queryClient.js';

beforeEach(() => {
  vi.restoreAllMocks();
});

function mockReferenceData() {
  vi.spyOn(client, 'apiGet').mockImplementation((path: string) => {
    if (path === '/api/customers') {
      return Promise.resolve({ ok: true, customers: [{ id: 'c1', name: 'Bob Client', company: null, email: null, phone: null, billingAddress: '1 Oak St', deliveryAddress: null, vatNumber: null, notes: null, createdAt: '2026-01-01T00:00:00.000Z' }] });
    }
    if (path === '/api/costing-templates') {
      return Promise.resolve({ ok: true, costingTemplates: [{ id: 'ct1', name: 'Standard bracket', filamentId: 'f1', filamentSnapshotBrand: 'eSun', filamentSnapshotMaterialType: 'PLA', filamentSnapshotCostPerGram: '0.300000', weightGrams: 50, printerId: 'p1', printerSnapshotName: 'Prusa MK4', printerSnapshotElectricityRatePerKwh: '2.5000', printerSnapshotDepreciationPerHour: '0.8000', printTimeHours: 2, markupPercent: '50.00', filamentCost: '15.00', electricityCost: '1.25', depreciationCost: '1.60', labourCost: '0.00', consumablesCost: '0.00', totalCost: '17.85', suggestedPrice: '26.78', createdAt: '2026-01-01T00:00:00.000Z' }] });
    }
    return Promise.reject(new client.ApiError('not found', 404));
  });
}

function renderPage() {
  const queryClient = createTestQueryClient();
  return render(
    <MemoryRouter initialEntries={['/quotes/new']}>
      <QueryClientProvider client={queryClient}>
        <Routes>
          <Route path="/quotes/new" element={<QuoteCreatePage />} />
          <Route path="/quotes/:id" element={<div>quote detail page</div>} />
        </Routes>
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

describe('QuoteCreatePage', () => {
  it('creates a quote with an ad-hoc line item', async () => {
    mockReferenceData();
    const postSpy = vi.spyOn(client, 'apiPost').mockResolvedValue({ ok: true, quote: { id: 'q1' } });
    renderPage();
    await waitFor(() => expect(screen.getByRole('option', { name: 'Bob Client' })).toBeInTheDocument());

    fireEvent.change(screen.getByLabelText('Customer'), { target: { value: 'c1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add Line Item' }));
    fireEvent.change(screen.getByLabelText('Description'), { target: { value: 'Custom part' } });
    fireEvent.change(screen.getByLabelText('Unit price'), { target: { value: '150' } });
    fireEvent.change(screen.getByLabelText('Quantity'), { target: { value: '2' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create Quote' }));

    await waitFor(() =>
      expect(postSpy).toHaveBeenCalledWith('/api/quotes', {
        customerId: 'c1',
        lineItems: [{ description: 'Custom part', unitPrice: 150, quantity: 2 }],
      }),
    );
    await waitFor(() => expect(screen.getByText('quote detail page')).toBeInTheDocument());
  });

  it('creates a quote with a line item picked from a costing template', async () => {
    mockReferenceData();
    const postSpy = vi.spyOn(client, 'apiPost').mockResolvedValue({ ok: true, quote: { id: 'q1' } });
    renderPage();
    await waitFor(() => expect(screen.getByRole('option', { name: 'Bob Client' })).toBeInTheDocument());

    fireEvent.change(screen.getByLabelText('Customer'), { target: { value: 'c1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add Line Item' }));
    fireEvent.click(screen.getByLabelText('From a costing template'));
    fireEvent.change(screen.getByLabelText('Costing template'), { target: { value: 'ct1' } });
    fireEvent.change(screen.getByLabelText('Quantity'), { target: { value: '1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create Quote' }));

    await waitFor(() =>
      expect(postSpy).toHaveBeenCalledWith('/api/quotes', {
        customerId: 'c1',
        lineItems: [{ costingTemplateId: 'ct1', quantity: 1 }],
      }),
    );
  });

  it('shows the server error message when creation fails', async () => {
    mockReferenceData();
    vi.spyOn(client, 'apiPost').mockRejectedValue(new client.ApiError('Customer not found.', 400));
    renderPage();
    await waitFor(() => expect(screen.getByRole('option', { name: 'Bob Client' })).toBeInTheDocument());

    fireEvent.change(screen.getByLabelText('Customer'), { target: { value: 'c1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add Line Item' }));
    fireEvent.change(screen.getByLabelText('Description'), { target: { value: 'Custom part' } });
    fireEvent.change(screen.getByLabelText('Unit price'), { target: { value: '150' } });
    fireEvent.change(screen.getByLabelText('Quantity'), { target: { value: '1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create Quote' }));

    await waitFor(() => expect(screen.getByText('Customer not found.')).toBeInTheDocument());
  });
});
```

Note: the "ad-hoc" line-item test relies on ad-hoc being each new line's DEFAULT mode (no explicit toggle interaction before typing Description/Unit price) — the "from costing template" test explicitly clicks a `'From a costing template'` radio/label to switch that line's mode. Build the mode toggle as a pair of radio inputs (or a small `<select>`) per line, defaulting to ad-hoc, with `getByLabelText('From a costing template')` addressing the toggle control for that mode.

- [ ] **Step 3: Run the test, verify it fails**

```bash
npx vitest run tests/QuoteCreatePage.test.tsx
```
Expected: FAIL — `src/pages/quotes/QuoteCreatePage.tsx` does not exist yet.

- [ ] **Step 4: Implement `QuoteCreatePage`**

Create `platform/frontend/src/pages/quotes/QuoteCreatePage.tsx`:

```typescript
import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { FormField } from '../../components/FormField.js';
import { ApiError } from '../../api/client.js';
import { useCreateQuote, type QuoteLineItemInput } from '../../api/quotes.js';
import { useCustomers } from '../../api/customers.js';
import { useCostingTemplates } from '../../api/costingTemplates.js';

type LineMode = 'adhoc' | 'costingTemplate';

interface LineItemDraft {
  mode: LineMode;
  costingTemplateId: string;
  description: string;
  unitPrice: string;
  quantity: string;
}

function blankLine(): LineItemDraft {
  return { mode: 'adhoc', costingTemplateId: '', description: '', unitPrice: '', quantity: '1' };
}

export function QuoteCreatePage() {
  const navigate = useNavigate();
  const { data: customers, isLoading: isLoadingCustomers } = useCustomers();
  const { data: costingTemplates, isLoading: isLoadingCostingTemplates } = useCostingTemplates();
  const createMutation = useCreateQuote();

  const [customerId, setCustomerId] = useState('');
  const [validUntil, setValidUntil] = useState('');
  const [notes, setNotes] = useState('');
  const [lines, setLines] = useState<LineItemDraft[]>([]);
  const [error, setError] = useState<string | null>(null);

  function addLine() {
    setLines((prev) => [...prev, blankLine()]);
  }
  function updateLine(index: number, patch: Partial<LineItemDraft>) {
    setLines((prev) => prev.map((line, i) => (i === index ? { ...line, ...patch } : line)));
  }
  function removeLine(index: number) {
    setLines((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const lineItems: QuoteLineItemInput[] = lines.map((line) =>
      line.mode === 'costingTemplate'
        ? { costingTemplateId: line.costingTemplateId, quantity: Number(line.quantity) }
        : { description: line.description, unitPrice: Number(line.unitPrice), quantity: Number(line.quantity) },
    );
    try {
      const created = await createMutation.mutateAsync({
        customerId,
        validUntil: validUntil || undefined,
        notes: notes || undefined,
        lineItems,
      });
      navigate(`/quotes/${created.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong. Try again shortly.');
    }
  }

  const isLoadingReferenceData = isLoadingCustomers || isLoadingCostingTemplates;

  return (
    <form onSubmit={handleSubmit} className="flex max-w-xl flex-col gap-4">
      <h1 className="text-2xl font-semibold text-slate-900">New Quote</h1>

      <div className="flex flex-col gap-1">
        <label htmlFor="customerId" className="text-sm font-medium text-slate-700">Customer</label>
        <select
          id="customerId"
          value={customerId}
          onChange={(e) => setCustomerId(e.target.value)}
          disabled={isLoadingCustomers}
          required
          className="rounded border border-slate-300 px-3 py-2 text-sm"
        >
          <option value="" disabled>Select a customer…</option>
          {customers?.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
      </div>

      <FormField id="validUntil" label="Valid until (optional)" type="date" value={validUntil} onChange={(e) => setValidUntil(e.target.value)} />

      <section className="flex flex-col gap-4 border-t border-slate-200 pt-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900">Line items</h2>
          <button type="button" onClick={addLine} className="rounded bg-slate-100 px-3 py-1 text-sm">
            Add Line Item
          </button>
        </div>
        {lines.map((line, i) => (
          <div key={i} className="flex flex-col gap-2 rounded border border-slate-200 p-3">
            <div className="flex gap-4 text-sm">
              <label className="flex items-center gap-1">
                <input
                  type="radio"
                  name={`lineMode-${i}`}
                  checked={line.mode === 'adhoc'}
                  onChange={() => updateLine(i, { mode: 'adhoc' })}
                />
                Ad-hoc description
              </label>
              <label className="flex items-center gap-1">
                <input
                  type="radio"
                  name={`lineMode-${i}`}
                  checked={line.mode === 'costingTemplate'}
                  onChange={() => updateLine(i, { mode: 'costingTemplate' })}
                  disabled={isLoadingCostingTemplates}
                />
                From a costing template
              </label>
            </div>
            {line.mode === 'adhoc' ? (
              <>
                <FormField id={`description-${i}`} label="Description" value={line.description} onChange={(e) => updateLine(i, { description: e.target.value })} required />
                <FormField id={`unitPrice-${i}`} label="Unit price" type="number" value={line.unitPrice} onChange={(e) => updateLine(i, { unitPrice: e.target.value })} required />
              </>
            ) : (
              <div className="flex flex-col gap-1">
                <label htmlFor={`costingTemplate-${i}`} className="text-sm font-medium text-slate-700">Costing template</label>
                <select
                  id={`costingTemplate-${i}`}
                  value={line.costingTemplateId}
                  onChange={(e) => updateLine(i, { costingTemplateId: e.target.value })}
                  className="rounded border border-slate-300 px-3 py-2 text-sm"
                >
                  <option value="" disabled>Select a costing template…</option>
                  {costingTemplates?.map((ct) => (
                    <option key={ct.id} value={ct.id}>{ct.name}</option>
                  ))}
                </select>
              </div>
            )}
            <FormField id={`quantity-${i}`} label="Quantity" type="number" value={line.quantity} onChange={(e) => updateLine(i, { quantity: e.target.value })} required />
            <button type="button" onClick={() => removeLine(i)} className="w-fit text-sm text-red-600">Remove</button>
          </div>
        ))}
      </section>

      {error && <p className="text-sm text-red-600">{error}</p>}
      <button
        type="submit"
        disabled={createMutation.isPending || isLoadingReferenceData || lines.length === 0}
        className="w-fit rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
      >
        Create Quote
      </button>
    </form>
  );
}
```

Note: `getByLabelText('Description')`/`getByLabelText('Unit price')`/`getByLabelText('Quantity')` in Step 2's test only work unambiguously with exactly ONE line item present — the ids are suffixed `-${i}` but the LABEL TEXT itself repeats per line (same pattern already accepted in the Costing Templates create form's line items). This is fine for this brief's tests (each adds exactly one line before asserting), consistent with the established precedent.

- [ ] **Step 5: Run the test, verify it passes**

```bash
npx vitest run tests/QuoteCreatePage.test.tsx
```
Expected: PASS, all 3 tests.

- [ ] **Step 6: Add the create route**

In `App.tsx`, add the import and the `/quotes/new` route (before `/quotes/:id`, after the routes Task 1 added, before the catch-all), matching the established pattern.

- [ ] **Step 7: Run the full test suite, typecheck, and build**

```bash
npm test
npm run typecheck
npm run build
```
Expected: all tests pass, zero type errors, build succeeds.

- [ ] **Step 8: Commit**

```bash
git add platform/frontend/src/pages/quotes/QuoteCreatePage.tsx platform/frontend/tests/QuoteCreatePage.test.tsx platform/frontend/src/App.tsx platform/frontend/tests/App.test.tsx
git commit -m "Add Quote create form with dual-mode (ad-hoc / costing-template) line items"
```

---

### Task 3: Invoices API hooks + list + detail (payment-status transitions) — no create form (v1 scope)

**Files:**
- Create: `platform/frontend/src/api/invoices.ts`
- Create: `platform/frontend/src/pages/invoices/InvoicesListPage.tsx`
- Create: `platform/frontend/tests/InvoicesListPage.test.tsx`
- Create: `platform/frontend/src/pages/invoices/InvoiceDetailPage.tsx`
- Create: `platform/frontend/tests/InvoiceDetailPage.test.tsx`
- Modify: `platform/frontend/src/components/AppShell.tsx` (add nav entry)
- Modify: `platform/frontend/src/App.tsx` (add routes)
- Modify: `platform/frontend/tests/App.test.tsx` (routing test)

**Interfaces:**
- Consumes: `apiGet`/`apiPatch`, `formatCurrency`, `useCustomerLookup` (Task 1).
- Produces: nothing consumed elsewhere — last task in this plan (and the last reference-data-adjacent frontend phase before PDF/email).

- [ ] **Step 1: Read `platform/api/src/routes/invoices.ts`'s real schema and status-transition table one more time**

Confirm `VALID_INVOICE_STATUS_TRANSITIONS = { unpaid: ['partially_paid', 'paid', 'overdue'], partially_paid: ['partially_paid', 'paid', 'overdue'], overdue: ['overdue', 'partially_paid', 'paid'], paid: [] }` matches the live file exactly (copy verbatim). Confirm `serializeInvoice` now includes `balanceDue` (added just before this plan, in `platform/api/src/routes/invoices.ts`) — if for any reason it's missing, STOP and flag this rather than computing a balance client-side (re-read this plan's Global Constraints).

- [ ] **Step 2: Create the Invoices API hook module**

Create `platform/frontend/src/api/invoices.ts`:

```typescript
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiGet, apiPatch } from './client.js';

export type InvoiceStatus = 'unpaid' | 'partially_paid' | 'paid' | 'overdue';

export interface InvoiceLineItem {
  id: string;
  costingTemplateId: string | null;
  quoteLineItemId: string | null;
  description: string;
  quantity: number;
  unitPrice: string;
  lineTotal: string;
}

export interface Invoice {
  id: string;
  number: string;
  customerId: string;
  quoteId: string | null;
  status: InvoiceStatus;
  dueDate: string;
  vatApplied: boolean;
  subtotal: string;
  vatAmount: string;
  total: string;
  amountPaid: string;
  balanceDue: string;
  notes: string | null;
  createdAt: string;
  lineItems?: InvoiceLineItem[];
}

export const VALID_INVOICE_STATUS_TRANSITIONS: Record<string, InvoiceStatus[]> = {
  unpaid: ['partially_paid', 'paid', 'overdue'],
  partially_paid: ['partially_paid', 'paid', 'overdue'],
  overdue: ['overdue', 'partially_paid', 'paid'],
  paid: [],
};

const INVOICES_QUERY_KEY = ['invoices'] as const;

export function useInvoices() {
  return useQuery({
    queryKey: INVOICES_QUERY_KEY,
    queryFn: () => apiGet<{ invoices: Invoice[] }>('/api/invoices').then((r) => r.invoices),
  });
}

export function useInvoice(id: string | undefined) {
  return useQuery({
    queryKey: [...INVOICES_QUERY_KEY, id],
    queryFn: () => apiGet<{ invoice: Invoice }>(`/api/invoices/${id}`).then((r) => r.invoice),
    enabled: id !== undefined,
  });
}

export function useUpdateInvoiceStatus(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ status, amountPaid }: { status: InvoiceStatus; amountPaid?: number }) =>
      apiPatch<{ invoice: Invoice }>(`/api/invoices/${id}/status`, { status, amountPaid }).then((r) => r.invoice),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: INVOICES_QUERY_KEY });
    },
  });
}
```

- [ ] **Step 3: Write the failing InvoicesListPage test**

Create `platform/frontend/tests/InvoicesListPage.test.tsx`, mirroring `QuotesListPage.test.tsx`'s structure (list, empty, error, status filter — NO "new" link, since there's no create page in this pass), adapted for `Invoice` — table columns `number`, customer name (via `useCustomerLookup()`), `status`, `total`, `balanceDue` (both via `formatCurrency`), `dueDate`.

- [ ] **Step 4: Run the test, verify it fails, then implement `InvoicesListPage`**

Create `platform/frontend/src/pages/invoices/InvoicesListPage.tsx`, mirroring `QuotesListPage.tsx`'s exact shape MINUS the "New Invoice" link (there is genuinely no create route to link to in this pass — don't add a disabled/dead link either, just omit it entirely). Each row's number cell links to `/invoices/${invoice.id}`.

Run the test — expect PASS.

- [ ] **Step 5: Write the failing InvoiceDetailPage test**

Create `platform/frontend/tests/InvoiceDetailPage.test.tsx`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { InvoiceDetailPage } from '../src/pages/invoices/InvoiceDetailPage.js';
import * as client from '../src/api/client.js';
import { createTestQueryClient } from './helpers/queryClient.js';

beforeEach(() => {
  vi.restoreAllMocks();
});

const unpaidInvoice = {
  id: 'inv1', number: 'INV-0001', customerId: 'c1', quoteId: null, status: 'unpaid', dueDate: '2026-02-01T00:00:00.000Z',
  vatApplied: false, subtotal: '100.00', vatAmount: '0.00', total: '100.00', amountPaid: '0.00', balanceDue: '100.00',
  notes: null, createdAt: '2026-01-01T00:00:00.000Z',
  lineItems: [{ id: 'li1', costingTemplateId: null, quoteLineItemId: null, description: 'Custom bracket', quantity: 1, unitPrice: '100.00', lineTotal: '100.00' }],
};

function mockData(invoice = unpaidInvoice) {
  vi.spyOn(client, 'apiGet').mockImplementation((path: string) => {
    if (path === `/api/invoices/${invoice.id}`) return Promise.resolve({ ok: true, invoice });
    if (path === '/api/customers') return Promise.resolve({ ok: true, customers: [{ id: 'c1', name: 'Bob Client', company: null, email: null, phone: null, billingAddress: '1 Oak St', deliveryAddress: null, vatNumber: null, notes: null, createdAt: '2026-01-01T00:00:00.000Z' }] });
    return Promise.reject(new client.ApiError('not found', 404));
  });
}

function renderAt(path: string) {
  const queryClient = createTestQueryClient();
  return render(
    <MemoryRouter initialEntries={[path]}>
      <QueryClientProvider client={queryClient}>
        <Routes>
          <Route path="/invoices/:id" element={<InvoiceDetailPage />} />
        </Routes>
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

describe('InvoiceDetailPage', () => {
  it('renders invoice details, customer name, line items, and balance due', async () => {
    mockData();
    renderAt('/invoices/inv1');
    await waitFor(() => expect(screen.getByRole('heading', { name: 'INV-0001' })).toBeInTheDocument());
    expect(screen.getByText('Bob Client')).toBeInTheDocument();
    expect(screen.getByText('Custom bracket')).toBeInTheDocument();
  });

  it('records a partial payment with an amount input', async () => {
    mockData();
    const patchSpy = vi.spyOn(client, 'apiPatch').mockResolvedValue({ ok: true, invoice: { ...unpaidInvoice, status: 'partially_paid', amountPaid: '40.00', balanceDue: '60.00' } });
    renderAt('/invoices/inv1');
    await waitFor(() => expect(screen.getByRole('button', { name: 'Record Partial Payment' })).toBeInTheDocument());

    fireEvent.change(screen.getByLabelText('Amount paid'), { target: { value: '40' } });
    fireEvent.click(screen.getByRole('button', { name: 'Record Partial Payment' }));

    await waitFor(() =>
      expect(patchSpy).toHaveBeenCalledWith('/api/invoices/inv1/status', { status: 'partially_paid', amountPaid: 40 }),
    );
  });

  it('marks an invoice overdue with no amount input required', async () => {
    mockData();
    const patchSpy = vi.spyOn(client, 'apiPatch').mockResolvedValue({ ok: true, invoice: { ...unpaidInvoice, status: 'overdue' } });
    renderAt('/invoices/inv1');
    await waitFor(() => expect(screen.getByRole('button', { name: 'Mark as Overdue' })).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'Mark as Overdue' }));
    await waitFor(() => expect(patchSpy).toHaveBeenCalledWith('/api/invoices/inv1/status', { status: 'overdue', amountPaid: undefined }));
  });

  it('shows no status-transition actions for a paid (terminal) invoice', async () => {
    mockData({ ...unpaidInvoice, status: 'paid', amountPaid: '100.00', balanceDue: '0.00' });
    renderAt('/invoices/inv1');
    await waitFor(() => expect(screen.getByRole('heading', { name: 'INV-0001' })).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: /Mark as|Record/ })).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 6: Run the test, verify it fails, then implement `InvoiceDetailPage`**

Create `platform/frontend/src/pages/invoices/InvoiceDetailPage.tsx`:

```typescript
import { useParams } from 'react-router-dom';
import { useState } from 'react';
import { useInvoice, useUpdateInvoiceStatus, VALID_INVOICE_STATUS_TRANSITIONS, type InvoiceStatus } from '../../api/invoices.js';
import { useCustomerLookup } from '../../api/customers.js';
import { formatCurrency } from '../../lib/formatCurrency.js';
import { FormField } from '../../components/FormField.js';
import { ApiError } from '../../api/client.js';

const STATUS_LABELS: Record<InvoiceStatus, string> = {
  unpaid: 'Unpaid',
  partially_paid: 'Partially Paid',
  paid: 'Paid',
  overdue: 'Overdue',
};

export function InvoiceDetailPage() {
  const { id } = useParams();
  const { data: invoice, isLoading, isError } = useInvoice(id);
  const { lookup: customerLookup } = useCustomerLookup();
  const updateStatusMutation = useUpdateInvoiceStatus(id ?? '');
  const [amountPaid, setAmountPaid] = useState('');
  const [error, setError] = useState<string | null>(null);

  if (isLoading) {
    return <p className="text-slate-500">Loading…</p>;
  }
  if (isError || !invoice) {
    return <p className="text-red-600">Couldn't load this invoice.</p>;
  }

  const customer = customerLookup.get(invoice.customerId);
  const nextStatuses = VALID_INVOICE_STATUS_TRANSITIONS[invoice.status] ?? [];

  async function handleStatusChange(status: InvoiceStatus, requiresAmount: boolean) {
    setError(null);
    try {
      await updateStatusMutation.mutateAsync({
        status,
        amountPaid: requiresAmount ? Number(amountPaid) : undefined,
      });
      setAmountPaid('');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong. Try again shortly.');
    }
  }

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-slate-900">{invoice.number}</h1>
        <span className="rounded bg-slate-100 px-2 py-1 text-sm">{STATUS_LABELS[invoice.status]}</span>
      </div>

      <section className="grid grid-cols-2 gap-4 text-sm">
        <div><div className="text-slate-500">Customer</div><div>{customer?.name ?? 'Unknown customer'}</div></div>
        <div><div className="text-slate-500">Due date</div><div>{invoice.dueDate.slice(0, 10)}</div></div>
      </section>

      <section className="flex flex-col gap-2 border-t border-slate-200 pt-4 text-sm">
        <h2 className="text-lg font-semibold text-slate-900">Line items</h2>
        {invoice.lineItems?.map((line) => (
          <div key={line.id} className="flex justify-between">
            <span>{line.description} × {line.quantity}</span>
            <span>{formatCurrency(line.lineTotal)}</span>
          </div>
        ))}
        <div className="flex justify-between border-t border-slate-200 pt-2"><span>Subtotal</span><span>{formatCurrency(invoice.subtotal)}</span></div>
        {invoice.vatApplied && <div className="flex justify-between"><span>VAT</span><span>{formatCurrency(invoice.vatAmount)}</span></div>}
        <div className="flex justify-between font-semibold text-slate-900"><span>Total</span><span>{formatCurrency(invoice.total)}</span></div>
        <div className="flex justify-between"><span>Amount paid</span><span>{formatCurrency(invoice.amountPaid)}</span></div>
        <div className="flex justify-between font-semibold text-slate-900"><span>Balance due</span><span>{formatCurrency(invoice.balanceDue)}</span></div>
      </section>

      {error && <p className="text-sm text-red-600">{error}</p>}

      {nextStatuses.length > 0 && (
        <section className="flex flex-col gap-3 border-t border-slate-200 pt-4">
          {(nextStatuses.includes('partially_paid') || nextStatuses.includes('paid')) && (
            <FormField id="amountPaid" label="Amount paid" type="number" value={amountPaid} onChange={(e) => setAmountPaid(e.target.value)} />
          )}
          <div className="flex gap-3">
            {nextStatuses.includes('partially_paid') && (
              <button
                onClick={() => handleStatusChange('partially_paid', true)}
                disabled={updateStatusMutation.isPending}
                className="rounded bg-slate-100 px-3 py-2 text-sm disabled:opacity-50"
              >
                Record Partial Payment
              </button>
            )}
            {nextStatuses.includes('paid') && (
              <button
                onClick={() => handleStatusChange('paid', true)}
                disabled={updateStatusMutation.isPending}
                className="rounded bg-slate-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
              >
                Mark as Paid
              </button>
            )}
            {nextStatuses.includes('overdue') && (
              <button
                onClick={() => handleStatusChange('overdue', false)}
                disabled={updateStatusMutation.isPending}
                className="rounded bg-slate-100 px-3 py-2 text-sm disabled:opacity-50"
              >
                Mark as Overdue
              </button>
            )}
          </div>
        </section>
      )}
    </div>
  );
}
```

Run the test — expect PASS, all 4 tests.

- [ ] **Step 7: Add the nav entry and routes**

`AppShell.tsx`: append `{ to: '/invoices', label: 'Invoices' },`

`App.tsx`: add imports and 2 routes (`/invoices`, `/invoices/:id`) before the catch-all.

- [ ] **Step 8: Add a routing test**

Mirror the established pattern, asserting the "Invoices" heading via `getByRole('heading', ...)` at `/invoices`.

- [ ] **Step 9: Run the full test suite, typecheck, and build**

```bash
npm test
npm run typecheck
npm run build
```
Expected: all tests pass, zero type errors, build succeeds.

- [ ] **Step 10: Commit**

```bash
git add platform/frontend/src/api/invoices.ts platform/frontend/src/pages/invoices platform/frontend/tests/InvoicesListPage.test.tsx platform/frontend/tests/InvoiceDetailPage.test.tsx platform/frontend/src/components/AppShell.tsx platform/frontend/src/App.tsx platform/frontend/tests/App.test.tsx
git commit -m "Add Invoices list and detail pages with payment-status transitions"
```
