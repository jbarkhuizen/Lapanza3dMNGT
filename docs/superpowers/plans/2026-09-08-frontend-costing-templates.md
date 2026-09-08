# Frontend: Costing Templates Pages Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Phase 5 of the frontend build-out: Costing Templates — a create form (select filament + printer, weight/print-time/markup, dynamic labour and consumable line items) and a read-only list + detail view showing the computed cost breakdown. Builds on all 6 reference-data modules (Filaments, Printers, Labour Steps, Consumables) already live.

**Architecture:** Genuinely different shape from every prior phase: `CostingTemplate` is **create-only** — there is no `PATCH`/update route (`platform/api/src/routes/costing-templates.ts` has only `GET` list, `GET /:id`, `POST`) because a costing template is an immutable snapshot of costs at the moment it was created (the whole point — a later filament price change shouldn't silently alter an old quote's cost basis). So this phase has no edit page, no `omitBlankFields` concerns (every field in the create schema is required, confirmed by reading the real route file), and introduces one new UI pattern none of the prior phases needed: a dynamic, user-extendable list of line items (add/remove rows) within a single form.

**Tech Stack:** Same as prior phases.

## Global Constraints

- **No `PATCH /api/costing-templates/:id` exists — do not build an edit page.** The list page links to a read-only detail view, not a form.
- **Every field in `createCostingTemplateSchema` is required** (`name`, `filamentId`, `weightGrams`, `printerId`, `printTimeHours`, `markupPercent` are all non-optional; `labourLines`/`consumableLines` default to `[]` but aren't optional-with-blank-handling — an empty array is a valid, meaningful "no labour/consumables" state, not a blank field to omit). So none of the `docs/AI_HANDOFF.md` "Frontend form-data gotcha" null/undefined/omit patterns apply here — still read that section for context, but there's nothing to normalize on load (there's no edit mode) and nothing to omit on submit.
- **All money fields in every API response are ALREADY formatted strings** (e.g. `totalCost: "190.00"`, `filamentSnapshotCostPerGram: "0.006000"`) — `platform/api/src/routes/costing-templates.ts`'s `serializeCostingTemplate()` does this server-side at each field's real column scale. The frontend never re-parses these to a `Number` for display (only the create FORM's own INPUT fields — `weightGrams`, `printTimeHours`, `markupPercent`, line item `hours`/`quantity` — are plain numbers the user types; the computed cost fields in the response are pre-formatted strings to render as-is). This is the first phase with Decimal-backed fields actually DISPLAYED (not just edited in a form input, as `electricityRatePerKwh` was in Printers) — per the design spec's "Money display" cross-cutting rule, create ONE shared `formatCurrency(value: string, currency?: string)` helper (`src/lib/formatCurrency.ts`) and use it everywhere a cost string is rendered, rather than an ad-hoc `"R " + value` per page (Task 1 creates this helper; every later phase — Quotes, Invoices — reuses it too).
- **The create form does NOT compute or preview costs client-side.** Per the design spec, the cost breakdown only appears after a successful submit, rendered from the response — there is no live client-side recalculation, so this phase does not duplicate `platform/api/src/costing/calculate.ts`'s logic in the frontend. Submitting shows the full breakdown (or the create page redirects to the new template's detail page, which shows it — pick whichever is simpler to implement cleanly, see Task 2).
- Every API call through `apiGet`/`apiPost` (no `apiPatch` needed — nothing here is ever patched). Every navigation through `<Link>`/`useNavigate`. Every list/detail page: `isLoading`/`isError` (list also needs empty-state).
- Every dropdown populated from another module's list endpoint (filament/printer/labour-step/consumable pickers) must itself handle its OWN `isLoading` (disable the select while loading) — a user should never be able to submit against a not-yet-loaded picker's stale/empty option list.

---

### Task 1: Costing Templates API hook module + list page + read-only detail page

**Files:**
- Create: `platform/frontend/src/lib/formatCurrency.ts`
- Create: `platform/frontend/tests/formatCurrency.test.ts`
- Create: `platform/frontend/src/api/costingTemplates.ts`
- Create: `platform/frontend/src/pages/costingTemplates/CostingTemplatesListPage.tsx`
- Create: `platform/frontend/tests/CostingTemplatesListPage.test.tsx`
- Create: `platform/frontend/src/pages/costingTemplates/CostingTemplateDetailPage.tsx`
- Create: `platform/frontend/tests/CostingTemplateDetailPage.test.tsx`
- Modify: `platform/frontend/src/components/AppShell.tsx` (add nav entry)
- Modify: `platform/frontend/src/App.tsx` (add routes for list + detail — the create route is added in Task 2)
- Modify: `platform/frontend/tests/App.test.tsx` (routing test)

**Interfaces:**
- Consumes: `apiGet`, `createTestQueryClient`.
- Produces: `formatCurrency(value: string, currency?: string)` — a shared helper every later phase (Quotes, Invoices) reuses for their own Decimal-backed display fields. Produces: `useCostingTemplates()`/`useCostingTemplate(id)` — Task 2's create page reuses the query-invalidation key (`COSTING_TEMPLATES_QUERY_KEY`) this task defines, and redirects to the detail route this task builds.

- [ ] **Step 1: Create the shared `formatCurrency` helper**

Create `platform/frontend/src/lib/formatCurrency.ts`:

```typescript
const CURRENCY_SYMBOLS: Record<string, string> = {
  ZAR: 'R',
};

export function formatCurrency(value: string, currency: string = 'ZAR'): string {
  const symbol = CURRENCY_SYMBOLS[currency] ?? currency;
  return `${symbol} ${value}`;
}
```

(The API pre-formats every money field to its correct decimal scale server-side — this helper's only job is prefixing a currency symbol, never reformatting the numeric string itself. `defaultCurrency` is fixed to `'ZAR'` app-wide per the design spec, so a single-entry symbol map is sufficient for now — not over-engineered for currencies this app doesn't support yet.)

- [ ] **Step 2: Write and run the `formatCurrency` test**

Create `platform/frontend/tests/formatCurrency.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { formatCurrency } from '../src/lib/formatCurrency.js';

describe('formatCurrency', () => {
  it('prefixes a ZAR value with "R " by default', () => {
    expect(formatCurrency('190.00')).toBe('R 190.00');
  });

  it('preserves the exact string scale, never reformats the number', () => {
    expect(formatCurrency('0.300000')).toBe('R 0.300000');
  });

  it('falls back to the currency code itself for an unrecognized currency', () => {
    expect(formatCurrency('10.00', 'USD')).toBe('USD 10.00');
  });
});
```

Run `npx vitest run tests/formatCurrency.test.ts` — expect PASS, all 3 tests (no implementation step needed beyond Step 1, this is a pure function with no dependencies to stub).

- [ ] **Step 3: Create the Costing Templates API hook module**

Create `platform/frontend/src/api/costingTemplates.ts`:

```typescript
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiGet, apiPost } from './client.js';

export interface CostingLabourLine {
  id: string;
  labourStepId: string | null;
  labourStepSnapshotName: string;
  hourlyRateSnapshot: string;
  hours: number;
  lineCost: string;
}

export interface CostingConsumableLine {
  id: string;
  consumableId: string | null;
  consumableSnapshotName: string;
  costPerUnitSnapshot: string;
  quantity: number;
  lineCost: string;
}

export interface CostingTemplate {
  id: string;
  name: string;
  filamentId: string | null;
  filamentSnapshotBrand: string | null;
  filamentSnapshotMaterialType: string | null;
  filamentSnapshotCostPerGram: string | null;
  weightGrams: number;
  printerId: string | null;
  printerSnapshotName: string | null;
  printerSnapshotElectricityRatePerKwh: string | null;
  printerSnapshotDepreciationPerHour: string | null;
  printTimeHours: number;
  markupPercent: string;
  filamentCost: string;
  electricityCost: string;
  depreciationCost: string;
  labourCost: string;
  consumablesCost: string;
  totalCost: string;
  suggestedPrice: string;
  createdAt: string;
  labourLines?: CostingLabourLine[];
  consumableLines?: CostingConsumableLine[];
}

export interface CostingTemplateFormInput {
  name: string;
  filamentId: string;
  weightGrams: number;
  printerId: string;
  printTimeHours: number;
  markupPercent: number;
  labourLines: Array<{ labourStepId: string; hours: number }>;
  consumableLines: Array<{ consumableId: string; quantity: number }>;
}

const COSTING_TEMPLATES_QUERY_KEY = ['costingTemplates'] as const;

export function useCostingTemplates() {
  return useQuery({
    queryKey: COSTING_TEMPLATES_QUERY_KEY,
    queryFn: () =>
      apiGet<{ costingTemplates: CostingTemplate[] }>('/api/costing-templates').then((r) => r.costingTemplates),
  });
}

export function useCostingTemplate(id: string | undefined) {
  return useQuery({
    queryKey: [...COSTING_TEMPLATES_QUERY_KEY, id],
    queryFn: () =>
      apiGet<{ costingTemplate: CostingTemplate }>(`/api/costing-templates/${id}`).then((r) => r.costingTemplate),
    enabled: id !== undefined,
  });
}

export function useCreateCostingTemplate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: CostingTemplateFormInput) =>
      apiPost<{ costingTemplate: CostingTemplate }>('/api/costing-templates', data).then((r) => r.costingTemplate),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: COSTING_TEMPLATES_QUERY_KEY });
    },
  });
}
```

- [ ] **Step 4: Write the failing CostingTemplatesListPage test**

Create `platform/frontend/tests/CostingTemplatesListPage.test.tsx`, mirroring `FilamentsListPage.test.tsx`'s 4-test structure (list, empty, error, new-link — the "new" link goes to `/costing-templates/new`), adapted for `CostingTemplate` (columns: `name`, `filamentSnapshotBrand`, `printerSnapshotName`, `totalCost`, `suggestedPrice`). Import `formatCurrency` from `../src/lib/formatCurrency.js` in the test and use it to build the expected cell text, e.g. `screen.getByText(formatCurrency('190.00'))` — don't hardcode the literal `'R 190.00'` string in the test, so the test and the component both derive the expected text from the same helper.

- [ ] **Step 5: Run the test, verify it fails, then implement `CostingTemplatesListPage`**

Create `platform/frontend/src/pages/costingTemplates/CostingTemplatesListPage.tsx`, mirroring `FilamentsListPage.tsx`'s exact list/table shape (loading/error/empty states, table columns as above — the `totalCost`/`suggestedPrice` cells rendered via `formatCurrency(template.totalCost)`/`formatCurrency(template.suggestedPrice)`, imported from `../../lib/formatCurrency.js` — each row a `<Link to={`/costing-templates/${template.id}`}>` — link the `name` cell itself, or add a trailing "View" link, matching this codebase's established "Edit" trailing-link pattern but reading "View" since there's nothing to edit). "New Costing Template" link to `/costing-templates/new`.

Run the test — expect PASS.

- [ ] **Step 6: Write the failing CostingTemplateDetailPage test**

Create `platform/frontend/tests/CostingTemplateDetailPage.test.tsx`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { CostingTemplateDetailPage } from '../src/pages/costingTemplates/CostingTemplateDetailPage.js';
import * as client from '../src/api/client.js';
import { createTestQueryClient } from './helpers/queryClient.js';
import { formatCurrency } from '../src/lib/formatCurrency.js';

beforeEach(() => {
  vi.restoreAllMocks();
});

const fullTemplate = {
  id: '1',
  name: 'Standard PLA bracket',
  filamentId: 'f1',
  filamentSnapshotBrand: 'eSun',
  filamentSnapshotMaterialType: 'PLA',
  filamentSnapshotCostPerGram: '0.300000',
  weightGrams: 50,
  printerId: 'p1',
  printerSnapshotName: 'Prusa MK4',
  printerSnapshotElectricityRatePerKwh: '2.5000',
  printerSnapshotDepreciationPerHour: '2.0000',
  printTimeHours: 2,
  markupPercent: '50.00',
  filamentCost: '15.00',
  electricityCost: '1.00',
  depreciationCost: '4.00',
  labourCost: '150.00',
  consumablesCost: '20.00',
  totalCost: '190.00',
  suggestedPrice: '285.00',
  createdAt: '2026-01-01T00:00:00.000Z',
  labourLines: [
    { id: 'l1', labourStepId: 'ls1', labourStepSnapshotName: 'Slicing', hourlyRateSnapshot: '150.00', hours: 1, lineCost: '150.00' },
  ],
  consumableLines: [
    { id: 'c1', consumableId: 'cs1', consumableSnapshotName: 'Build plate adhesive', costPerUnitSnapshot: '10.00', quantity: 2, lineCost: '20.00' },
  ],
};

function renderAt(path: string) {
  const queryClient = createTestQueryClient();
  return render(
    <MemoryRouter initialEntries={[path]}>
      <QueryClientProvider client={queryClient}>
        <Routes>
          <Route path="/costing-templates/:id" element={<CostingTemplateDetailPage />} />
        </Routes>
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

describe('CostingTemplateDetailPage', () => {
  it('renders the full cost breakdown including line items', async () => {
    vi.spyOn(client, 'apiGet').mockResolvedValue({ ok: true, costingTemplate: fullTemplate });
    renderAt('/costing-templates/1');

    await waitFor(() => expect(screen.getByRole('heading', { name: 'Standard PLA bracket' })).toBeInTheDocument());
    expect(screen.getByText('eSun')).toBeInTheDocument();
    expect(screen.getByText('Prusa MK4')).toBeInTheDocument();
    expect(screen.getByText(formatCurrency('190.00'))).toBeInTheDocument();
    expect(screen.getByText(formatCurrency('285.00'))).toBeInTheDocument();
    expect(screen.getByText('Slicing')).toBeInTheDocument();
    expect(screen.getByText('Build plate adhesive')).toBeInTheDocument();
  });

  it('shows an error message when the template fails to load', async () => {
    vi.spyOn(client, 'apiGet').mockRejectedValue(new client.ApiError('Costing template not found.', 404));
    renderAt('/costing-templates/999');
    await waitFor(() => expect(screen.getByText('Costing template not found.')).toBeInTheDocument());
  });
});
```

- [ ] **Step 7: Run the test, verify it fails, then implement `CostingTemplateDetailPage`**

Create `platform/frontend/src/pages/costingTemplates/CostingTemplateDetailPage.tsx`:

```typescript
import { useParams } from 'react-router-dom';
import { useCostingTemplate } from '../../api/costingTemplates.js';
import { ApiError } from '../../api/client.js';
import { formatCurrency as money } from '../../lib/formatCurrency.js';

export function CostingTemplateDetailPage() {
  const { id } = useParams();
  const { data: template, isLoading, isError, error } = useCostingTemplate(id);

  if (isLoading) {
    return <p className="text-slate-500">Loading…</p>;
  }
  if (isError || !template) {
    return (
      <p className="text-red-600">
        {error instanceof ApiError ? error.message : "Couldn't load this costing template."}
      </p>
    );
  }

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <h1 className="text-2xl font-semibold text-slate-900">{template.name}</h1>

      <section className="grid grid-cols-2 gap-4 text-sm">
        <div>
          <div className="text-slate-500">Filament</div>
          <div>{template.filamentSnapshotBrand} — {template.filamentSnapshotMaterialType}</div>
        </div>
        <div>
          <div className="text-slate-500">Printer</div>
          <div>{template.printerSnapshotName}</div>
        </div>
        <div>
          <div className="text-slate-500">Weight</div>
          <div>{template.weightGrams}g</div>
        </div>
        <div>
          <div className="text-slate-500">Print time</div>
          <div>{template.printTimeHours}h</div>
        </div>
        <div>
          <div className="text-slate-500">Markup</div>
          <div>{template.markupPercent}%</div>
        </div>
      </section>

      <section className="flex flex-col gap-2 border-t border-slate-200 pt-4 text-sm">
        <h2 className="text-lg font-semibold text-slate-900">Cost breakdown</h2>
        <div className="flex justify-between"><span>Filament cost</span><span>{money(template.filamentCost)}</span></div>
        <div className="flex justify-between"><span>Electricity cost</span><span>{money(template.electricityCost)}</span></div>
        <div className="flex justify-between"><span>Depreciation cost</span><span>{money(template.depreciationCost)}</span></div>
        <div className="flex justify-between"><span>Labour cost</span><span>{money(template.labourCost)}</span></div>
        <div className="flex justify-between"><span>Consumables cost</span><span>{money(template.consumablesCost)}</span></div>
        <div className="flex justify-between border-t border-slate-200 pt-2 font-semibold"><span>Total cost</span><span>{money(template.totalCost)}</span></div>
        <div className="flex justify-between font-semibold text-slate-900"><span>Suggested price</span><span>{money(template.suggestedPrice)}</span></div>
      </section>

      {template.labourLines && template.labourLines.length > 0 && (
        <section className="flex flex-col gap-2 border-t border-slate-200 pt-4 text-sm">
          <h2 className="text-lg font-semibold text-slate-900">Labour lines</h2>
          {template.labourLines.map((line) => (
            <div key={line.id} className="flex justify-between">
              <span>{line.labourStepSnapshotName} ({line.hours}h @ {money(line.hourlyRateSnapshot)})</span>
              <span>{money(line.lineCost)}</span>
            </div>
          ))}
        </section>
      )}

      {template.consumableLines && template.consumableLines.length > 0 && (
        <section className="flex flex-col gap-2 border-t border-slate-200 pt-4 text-sm">
          <h2 className="text-lg font-semibold text-slate-900">Consumable lines</h2>
          {template.consumableLines.map((line) => (
            <div key={line.id} className="flex justify-between">
              <span>{line.consumableSnapshotName} ({line.quantity} @ {money(line.costPerUnitSnapshot)})</span>
              <span>{money(line.lineCost)}</span>
            </div>
          ))}
        </section>
      )}
    </div>
  );
}
```

Run the test — expect PASS.

- [ ] **Step 8: Add the nav entry and the list/detail routes (NOT the create route — Task 2 adds it)**

`AppShell.tsx`: append `{ to: '/costing-templates', label: 'Costing Templates' },`

`App.tsx`: add imports and 2 routes (`/costing-templates`, `/costing-templates/:id`) before the catch-all. Do NOT add `/costing-templates/new` yet — Task 2 does that alongside the page it routes to.

- [ ] **Step 9: Add a routing test**

Mirror the established pattern, asserting the "Costing Templates" heading via `getByRole('heading', ...)` at `/costing-templates`.

- [ ] **Step 10: Run the full test suite, typecheck, and build**

```bash
npm test
npm run typecheck
npm run build
```
Expected: all tests pass (118 existing + this task's ~10 new), zero type errors, build succeeds.

- [ ] **Step 11: Commit**

```bash
git add platform/frontend/src/lib/formatCurrency.ts platform/frontend/tests/formatCurrency.test.ts platform/frontend/src/api/costingTemplates.ts platform/frontend/src/pages/costingTemplates/CostingTemplatesListPage.tsx platform/frontend/src/pages/costingTemplates/CostingTemplateDetailPage.tsx platform/frontend/tests/CostingTemplatesListPage.test.tsx platform/frontend/tests/CostingTemplateDetailPage.test.tsx platform/frontend/src/components/AppShell.tsx platform/frontend/src/App.tsx platform/frontend/tests/App.test.tsx
git commit -m "Add Costing Templates list and detail pages, shared formatCurrency helper"
```

---

### Task 2: Costing Template create form (filament/printer pickers + dynamic labour/consumable line items)

**Files:**
- Create: `platform/frontend/src/pages/costingTemplates/CostingTemplateCreatePage.tsx`
- Create: `platform/frontend/tests/CostingTemplateCreatePage.test.tsx`
- Modify: `platform/frontend/src/App.tsx` (add the `/costing-templates/new` route)
- Modify: `platform/frontend/tests/App.test.tsx` (routing test, if not already sufficiently covered)

**Interfaces:**
- Consumes: `useCreateCostingTemplate` (Task 1), `useFilaments` (`src/api/filaments.ts`), `usePrinters` (`src/api/printers.ts`), `useLabourSteps` (`src/api/labourSteps.ts`), `useConsumables` (`src/api/consumables.ts`) — all already exist from prior phases.
- Produces: nothing consumed elsewhere — last task in this plan.

- [ ] **Step 1: Read `platform/api/src/routes/costing-templates.ts`'s real schema one more time to confirm the exact submitted shape**

Confirm: `labourLines: [{ labourStepId, hours }]`, `consumableLines: [{ consumableId, quantity }]` — no other fields accepted per line (the API resolves the labour step/consumable server-side and snapshots name/rate itself; the frontend never sends a name or rate, only the id + quantity/hours). Confirm `markupPercent` accepts `0` (a printer sold at cost) — `z.number().min(0)`, so `0` is valid, don't accidentally treat `0` as "unset" anywhere in the form (this is the exact class of falsy-coercion bug fixed in the Filaments/Labour Steps/Consumables phase — a required field defaulting to blank-on-clear must become `undefined`, not silently `0`, but ALSO a genuinely-typed `0` must be preserved, not treated as empty).

- [ ] **Step 2: Write the failing CostingTemplateCreatePage test**

Create `platform/frontend/tests/CostingTemplateCreatePage.test.tsx`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { CostingTemplateCreatePage } from '../src/pages/costingTemplates/CostingTemplateCreatePage.js';
import * as client from '../src/api/client.js';
import { createTestQueryClient } from './helpers/queryClient.js';

beforeEach(() => {
  vi.restoreAllMocks();
});

function mockReferenceData() {
  vi.spyOn(client, 'apiGet').mockImplementation((path: string) => {
    if (path === '/api/filaments') {
      return Promise.resolve({ ok: true, filaments: [{ id: 'f1', brand: 'eSun', materialType: 'PLA', diameterMm: 1.75, colour: null, costPerSpool: null, costPerKg: 300, spoolWeightGrams: null, remainingWeightGrams: null, supplier: null, purchaseDate: null, notes: null, lowStockThresholdGrams: null, createdAt: '2026-01-01T00:00:00.000Z' }] });
    }
    if (path === '/api/printers') {
      return Promise.resolve({ ok: true, printers: [{ id: 'p1', name: 'Prusa MK4', make: null, model: null, buildVolumeXMm: null, buildVolumeYMm: null, buildVolumeZMm: null, purchaseDate: null, purchaseCost: 4000, powerDrawWatts: 200, electricityRatePerKwh: '2.5000', expectedLifetimeHours: 2000, status: 'active', createdAt: '2026-01-01T00:00:00.000Z' }] });
    }
    if (path === '/api/labour-steps') {
      return Promise.resolve({ ok: true, labourSteps: [{ id: 'ls1', name: 'Slicing', hourlyRate: 150, active: true, createdAt: '2026-01-01T00:00:00.000Z' }] });
    }
    if (path === '/api/consumables') {
      return Promise.resolve({ ok: true, consumables: [{ id: 'cs1', name: 'Build plate adhesive', category: 'other', unitOfMeasure: 'each', costPerUnit: 10, currentStock: 5, reorderThreshold: null, supplier: null, createdAt: '2026-01-01T00:00:00.000Z' }] });
    }
    return Promise.reject(new client.ApiError('not found', 404));
  });
}

function renderPage() {
  const queryClient = createTestQueryClient();
  return render(
    <MemoryRouter initialEntries={['/costing-templates/new']}>
      <QueryClientProvider client={queryClient}>
        <Routes>
          <Route path="/costing-templates/new" element={<CostingTemplateCreatePage />} />
          <Route path="/costing-templates/:id" element={<div>detail page</div>} />
        </Routes>
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

describe('CostingTemplateCreatePage', () => {
  it('populates filament/printer/labour-step/consumable pickers from their respective APIs', async () => {
    mockReferenceData();
    renderPage();
    await waitFor(() => expect(screen.getByRole('option', { name: 'eSun — PLA' })).toBeInTheDocument());
    expect(screen.getByRole('option', { name: 'Prusa MK4' })).toBeInTheDocument();
  });

  it('creates a costing template with no line items and navigates to its detail page', async () => {
    mockReferenceData();
    const postSpy = vi.spyOn(client, 'apiPost').mockResolvedValue({ ok: true, costingTemplate: { id: 'new-template-1' } });
    renderPage();
    await waitFor(() => expect(screen.getByRole('option', { name: 'eSun — PLA' })).toBeInTheDocument());

    fireEvent.change(screen.getByLabelText('Template name'), { target: { value: 'Standard bracket' } });
    fireEvent.change(screen.getByLabelText('Filament'), { target: { value: 'f1' } });
    fireEvent.change(screen.getByLabelText('Weight (g)'), { target: { value: '50' } });
    fireEvent.change(screen.getByLabelText('Printer'), { target: { value: 'p1' } });
    fireEvent.change(screen.getByLabelText('Print time (hours)'), { target: { value: '2' } });
    fireEvent.change(screen.getByLabelText('Markup (%)'), { target: { value: '50' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create Costing Template' }));

    await waitFor(() =>
      expect(postSpy).toHaveBeenCalledWith('/api/costing-templates', {
        name: 'Standard bracket',
        filamentId: 'f1',
        weightGrams: 50,
        printerId: 'p1',
        printTimeHours: 2,
        markupPercent: 50,
        labourLines: [],
        consumableLines: [],
      }),
    );
    await waitFor(() => expect(screen.getByText('detail page')).toBeInTheDocument());
  });

  it('adds a labour line and a consumable line, and submits both correctly', async () => {
    mockReferenceData();
    const postSpy = vi.spyOn(client, 'apiPost').mockResolvedValue({ ok: true, costingTemplate: { id: 'new-template-1' } });
    renderPage();
    await waitFor(() => expect(screen.getByRole('option', { name: 'eSun — PLA' })).toBeInTheDocument());

    fireEvent.change(screen.getByLabelText('Template name'), { target: { value: 'Standard bracket' } });
    fireEvent.change(screen.getByLabelText('Filament'), { target: { value: 'f1' } });
    fireEvent.change(screen.getByLabelText('Weight (g)'), { target: { value: '50' } });
    fireEvent.change(screen.getByLabelText('Printer'), { target: { value: 'p1' } });
    fireEvent.change(screen.getByLabelText('Print time (hours)'), { target: { value: '2' } });
    fireEvent.change(screen.getByLabelText('Markup (%)'), { target: { value: '50' } });

    fireEvent.click(screen.getByRole('button', { name: 'Add Labour Line' }));
    fireEvent.change(screen.getByLabelText('Labour step'), { target: { value: 'ls1' } });
    fireEvent.change(screen.getByLabelText('Hours'), { target: { value: '1' } });

    fireEvent.click(screen.getByRole('button', { name: 'Add Consumable Line' }));
    fireEvent.change(screen.getByLabelText('Consumable'), { target: { value: 'cs1' } });
    fireEvent.change(screen.getByLabelText('Quantity'), { target: { value: '2' } });

    fireEvent.click(screen.getByRole('button', { name: 'Create Costing Template' }));

    await waitFor(() =>
      expect(postSpy).toHaveBeenCalledWith('/api/costing-templates', {
        name: 'Standard bracket',
        filamentId: 'f1',
        weightGrams: 50,
        printerId: 'p1',
        printTimeHours: 2,
        markupPercent: 50,
        labourLines: [{ labourStepId: 'ls1', hours: 1 }],
        consumableLines: [{ consumableId: 'cs1', quantity: 2 }],
      }),
    );
  });

  it('shows the server error message when creation fails', async () => {
    mockReferenceData();
    vi.spyOn(client, 'apiPost').mockRejectedValue(
      new client.ApiError('This printer is missing an electricity rate, power draw, expected lifetime, or purchase cost — set these before costing a job on it.', 400),
    );
    renderPage();
    await waitFor(() => expect(screen.getByRole('option', { name: 'eSun — PLA' })).toBeInTheDocument());

    fireEvent.change(screen.getByLabelText('Template name'), { target: { value: 'Standard bracket' } });
    fireEvent.change(screen.getByLabelText('Filament'), { target: { value: 'f1' } });
    fireEvent.change(screen.getByLabelText('Weight (g)'), { target: { value: '50' } });
    fireEvent.change(screen.getByLabelText('Printer'), { target: { value: 'p1' } });
    fireEvent.change(screen.getByLabelText('Print time (hours)'), { target: { value: '2' } });
    fireEvent.change(screen.getByLabelText('Markup (%)'), { target: { value: '50' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create Costing Template' }));

    await waitFor(() =>
      expect(
        screen.getByText('This printer is missing an electricity rate, power draw, expected lifetime, or purchase cost — set these before costing a job on it.'),
      ).toBeInTheDocument(),
    );
  });
});
```

Note: the "populates pickers" test asserts option text `'eSun — PLA'` (brand + material type) for the filament select and `'Prusa MK4'` (name only) for the printer select — build the `<option>` label text to match exactly, using an em dash (`—`) between filament brand/material, not a hyphen.

- [ ] **Step 3: Run the test, verify it fails**

```bash
npx vitest run tests/CostingTemplateCreatePage.test.tsx
```
Expected: FAIL — `src/pages/costingTemplates/CostingTemplateCreatePage.tsx` does not exist yet.

- [ ] **Step 4: Implement `CostingTemplateCreatePage`**

Create `platform/frontend/src/pages/costingTemplates/CostingTemplateCreatePage.tsx`:

```typescript
import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { FormField } from '../../components/FormField.js';
import { ApiError } from '../../api/client.js';
import { useCreateCostingTemplate, type CostingTemplateFormInput } from '../../api/costingTemplates.js';
import { useFilaments } from '../../api/filaments.js';
import { usePrinters } from '../../api/printers.js';
import { useLabourSteps } from '../../api/labourSteps.js';
import { useConsumables } from '../../api/consumables.js';

interface LabourLineDraft {
  labourStepId: string;
  hours: string;
}

interface ConsumableLineDraft {
  consumableId: string;
  quantity: string;
}

export function CostingTemplateCreatePage() {
  const navigate = useNavigate();
  const { data: filaments, isLoading: isLoadingFilaments } = useFilaments();
  const { data: printers, isLoading: isLoadingPrinters } = usePrinters();
  const { data: labourSteps, isLoading: isLoadingLabourSteps } = useLabourSteps();
  const { data: consumables, isLoading: isLoadingConsumables } = useConsumables();
  const createMutation = useCreateCostingTemplate();

  const [name, setName] = useState('');
  const [filamentId, setFilamentId] = useState('');
  const [weightGrams, setWeightGrams] = useState('');
  const [printerId, setPrinterId] = useState('');
  const [printTimeHours, setPrintTimeHours] = useState('');
  const [markupPercent, setMarkupPercent] = useState('');
  const [labourLines, setLabourLines] = useState<LabourLineDraft[]>([]);
  const [consumableLines, setConsumableLines] = useState<ConsumableLineDraft[]>([]);
  const [error, setError] = useState<string | null>(null);

  function addLabourLine() {
    setLabourLines((prev) => [...prev, { labourStepId: labourSteps?.[0]?.id ?? '', hours: '' }]);
  }
  function updateLabourLine(index: number, patch: Partial<LabourLineDraft>) {
    setLabourLines((prev) => prev.map((line, i) => (i === index ? { ...line, ...patch } : line)));
  }
  function removeLabourLine(index: number) {
    setLabourLines((prev) => prev.filter((_, i) => i !== index));
  }

  function addConsumableLine() {
    setConsumableLines((prev) => [...prev, { consumableId: consumables?.[0]?.id ?? '', quantity: '' }]);
  }
  function updateConsumableLine(index: number, patch: Partial<ConsumableLineDraft>) {
    setConsumableLines((prev) => prev.map((line, i) => (i === index ? { ...line, ...patch } : line)));
  }
  function removeConsumableLine(index: number) {
    setConsumableLines((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const payload: CostingTemplateFormInput = {
      name,
      filamentId,
      weightGrams: Number(weightGrams),
      printerId,
      printTimeHours: Number(printTimeHours),
      markupPercent: Number(markupPercent),
      labourLines: labourLines.map((line) => ({ labourStepId: line.labourStepId, hours: Number(line.hours) })),
      consumableLines: consumableLines.map((line) => ({ consumableId: line.consumableId, quantity: Number(line.quantity) })),
    };
    try {
      const created = await createMutation.mutateAsync(payload);
      navigate(`/costing-templates/${created.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong. Try again shortly.');
    }
  }

  const isLoadingReferenceData = isLoadingFilaments || isLoadingPrinters || isLoadingLabourSteps || isLoadingConsumables;

  return (
    <form onSubmit={handleSubmit} className="flex max-w-xl flex-col gap-4">
      <h1 className="text-2xl font-semibold text-slate-900">New Costing Template</h1>
      <FormField id="templateName" label="Template name" value={name} onChange={(e) => setName(e.target.value)} required />

      <div className="flex flex-col gap-1">
        <label htmlFor="filamentId" className="text-sm font-medium text-slate-700">Filament</label>
        <select
          id="filamentId"
          value={filamentId}
          onChange={(e) => setFilamentId(e.target.value)}
          disabled={isLoadingFilaments}
          required
          className="rounded border border-slate-300 px-3 py-2 text-sm"
        >
          <option value="" disabled>Select a filament…</option>
          {filaments?.map((f) => (
            <option key={f.id} value={f.id}>{f.brand} — {f.materialType}</option>
          ))}
        </select>
      </div>

      <FormField id="weightGrams" label="Weight (g)" type="number" value={weightGrams} onChange={(e) => setWeightGrams(e.target.value)} required />

      <div className="flex flex-col gap-1">
        <label htmlFor="printerId" className="text-sm font-medium text-slate-700">Printer</label>
        <select
          id="printerId"
          value={printerId}
          onChange={(e) => setPrinterId(e.target.value)}
          disabled={isLoadingPrinters}
          required
          className="rounded border border-slate-300 px-3 py-2 text-sm"
        >
          <option value="" disabled>Select a printer…</option>
          {printers?.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
      </div>

      <FormField id="printTimeHours" label="Print time (hours)" type="number" value={printTimeHours} onChange={(e) => setPrintTimeHours(e.target.value)} required />
      <FormField id="markupPercent" label="Markup (%)" type="number" value={markupPercent} onChange={(e) => setMarkupPercent(e.target.value)} required />

      <section className="flex flex-col gap-3 border-t border-slate-200 pt-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900">Labour lines</h2>
          <button type="button" onClick={addLabourLine} disabled={isLoadingLabourSteps} className="rounded bg-slate-100 px-3 py-1 text-sm">
            Add Labour Line
          </button>
        </div>
        {labourLines.map((line, i) => (
          <div key={i} className="flex items-end gap-3">
            <div className="flex flex-col gap-1">
              <label htmlFor={`labourStep-${i}`} className="text-sm font-medium text-slate-700">Labour step</label>
              <select
                id={`labourStep-${i}`}
                value={line.labourStepId}
                onChange={(e) => updateLabourLine(i, { labourStepId: e.target.value })}
                className="rounded border border-slate-300 px-3 py-2 text-sm"
              >
                {labourSteps?.map((step) => (
                  <option key={step.id} value={step.id}>{step.name}</option>
                ))}
              </select>
            </div>
            <FormField id={`labourHours-${i}`} label="Hours" type="number" value={line.hours} onChange={(e) => updateLabourLine(i, { hours: e.target.value })} required />
            <button type="button" onClick={() => removeLabourLine(i)} className="text-sm text-red-600">Remove</button>
          </div>
        ))}
      </section>

      <section className="flex flex-col gap-3 border-t border-slate-200 pt-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900">Consumable lines</h2>
          <button type="button" onClick={addConsumableLine} disabled={isLoadingConsumables} className="rounded bg-slate-100 px-3 py-1 text-sm">
            Add Consumable Line
          </button>
        </div>
        {consumableLines.map((line, i) => (
          <div key={i} className="flex items-end gap-3">
            <div className="flex flex-col gap-1">
              <label htmlFor={`consumable-${i}`} className="text-sm font-medium text-slate-700">Consumable</label>
              <select
                id={`consumable-${i}`}
                value={line.consumableId}
                onChange={(e) => updateConsumableLine(i, { consumableId: e.target.value })}
                className="rounded border border-slate-300 px-3 py-2 text-sm"
              >
                {consumables?.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
            <FormField id={`consumableQuantity-${i}`} label="Quantity" type="number" value={line.quantity} onChange={(e) => updateConsumableLine(i, { quantity: e.target.value })} required />
            <button type="button" onClick={() => removeConsumableLine(i)} className="text-sm text-red-600">Remove</button>
          </div>
        ))}
      </section>

      {error && <p className="text-sm text-red-600">{error}</p>}
      <button
        type="submit"
        disabled={createMutation.isPending || isLoadingReferenceData}
        className="w-fit rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
      >
        Create Costing Template
      </button>
    </form>
  );
}
```

Note on the two dynamic-line-item test cases (Step 2's third test): the test interacts with `getByLabelText('Labour step')`/`getByLabelText('Hours')` etc. WITHOUT an index suffix, which only works cleanly if exactly one line of each type is added during that test (as written). If a test needs multiple lines of the same type, it would need `getAllByLabelText(...)` — the brief's tests only add one of each, so `getByLabelText` is fine as specified; don't over-generalize this into a "keys must never repeat" test unless you actually add a multi-line test case (not required by this brief).

- [ ] **Step 5: Run the test, verify it passes**

```bash
npx vitest run tests/CostingTemplateCreatePage.test.tsx
```
Expected: PASS, all 4 tests.

- [ ] **Step 6: Add the create route**

In `App.tsx`, add the import:
```typescript
import { CostingTemplateCreatePage } from './pages/costingTemplates/CostingTemplateCreatePage.js';
```
Add the route (alongside the list/detail routes Task 1 added, before the catch-all):
```typescript
        <Route
          path="/costing-templates/new"
          element={
            <RequireAuth>
              <AppShell>
                <CostingTemplateCreatePage />
              </AppShell>
            </RequireAuth>
          }
        />
```
Place it BEFORE `/costing-templates/:id` in the file for readability (though as established in Phase 3, React Router v6 ranks static segments over dynamic ones regardless of declaration order, so exact placement doesn't affect correctness — just match the codebase's existing convention of listing the more-specific route first).

- [ ] **Step 7: Run the full test suite, typecheck, and build**

```bash
npm test
npm run typecheck
npm run build
```
Expected: all tests pass (Task 1's total + this task's 4 new), zero type errors, build succeeds.

- [ ] **Step 8: Commit**

```bash
git add platform/frontend/src/pages/costingTemplates/CostingTemplateCreatePage.tsx platform/frontend/tests/CostingTemplateCreatePage.test.tsx platform/frontend/src/App.tsx platform/frontend/tests/App.test.tsx
git commit -m "Add Costing Template create form with dynamic labour/consumable line items"
```
