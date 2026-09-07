# Frontend: Filaments, Labour Steps, Consumables Pages Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Phase 4a of the frontend build-out (per `docs/superpowers/specs/2026-09-07-frontend-deploy-design.md`'s execution order): list/create/edit pages for the three simplest remaining reference-data modules. Printers (which has nested Presets/Maintenance Logs, and is meaningfully more complex) is its own follow-up phase, not part of this plan.

**Architecture:** Identical shape to the already-merged Customers pages (`src/pages/customers/CustomersListPage.tsx` / `CustomerFormPage.tsx`) — a `useX`/`useCreateX`/`useUpdateX` hook module per resource, a list page, a create/edit form page, wired into `App.tsx`/`AppShell.tsx`.

**Tech Stack:** Same as prior phases — React 18, TypeScript, Vite, Tailwind, React Router v6, `@tanstack/react-query`, Vitest + React Testing Library.

## Global Constraints — READ `docs/AI_HANDOFF.md`'s "Frontend form-data gotcha" SECTION BEFORE STARTING

The Company Profile page shipped completely broken (every save 400'd) because form state wasn't built explicitly from the API response, and a blanket blank-field-stripping approach silently broke the ability to clear fields. That mistake must not repeat here. This plan's field handling has already been worked out per-field below — follow it exactly, don't improvise a shortcut:

- **Optional STRING fields** (`colour`, `supplier`, `notes` on Filament; none on LabourStep; `supplier` on Consumable): normalize `null → ''` when loading existing data into form state; send `''` as-is on save (none of these three modules' optional string fields have `.email()`/`.min(1)`-style strict validation — confirmed by reading `platform/api/src/routes/{filaments,labour-steps,consumables}.ts` directly — so `''` is always accepted and correctly clears the field server-side). **Do NOT use `omitBlankFields` in this plan at all** — it exists for the specific fields elsewhere that reject `''`, and none of this plan's fields do.
- **Optional NUMBER fields** (`costPerSpool`, `costPerKg`, `spoolWeightGrams`, `remainingWeightGrams`, `lowStockThresholdGrams` on Filament; `currentStock`, `reorderThreshold` on Consumable): normalize `null → undefined` when loading (not `''`, not `null` — `undefined` is what `JSON.stringify` naturally omits, and the backend's `.optional()` number schemas accept a missing key but not literal `null`). On the input's `onChange`, blank string → `undefined`, non-blank → `Number(value)`. This exact pattern is already used correctly for Company Profile's `defaultQuoteValidityDays` field (`platform/frontend/src/pages/CompanyProfilePage.tsx`) — copy it.
- **Boolean field** (`active` on LabourStep): plain `Checkbox` component (already exists from Phase 3), no special handling.
- **Enum/select fields** (`diameterMm` on Filament: `1.75 | 2.85`; `category` on Consumable: the fixed `CATEGORIES` list) — use a plain `<select>` (no new component needed; write it inline in the two pages that need one, it's simple enough not to warrant a shared component yet).
- **Required fields** (`brand`/`materialType`/`diameterMm` on Filament; `name`/`hourlyRate` on LabourStep; `name`/`category`/`unitOfMeasure`/`costPerUnit` on Consumable): plain `FormField`s with the `required` HTML attribute (matches the Company Profile fix — don't ship a required field without it).
- Every API call goes through `apiGet`/`apiPost`/`apiPatch` — never raw `fetch`.
- Every internal navigation uses `<Link>`/`useNavigate` — never a hardcoded `<a href="/app/...">`.
- Every new authenticated page is wrapped in `<RequireAuth><AppShell>...</AppShell></RequireAuth>`, with exactly one `NAV_ITEMS` entry added per module.
- Tests for pages using `useQuery`/`useMutation` use `createTestQueryClient()` (`tests/helpers/queryClient.ts`, already exists) — never the shared `AppProviders` singleton.
- Every list page handles `isLoading`, `isError`, AND the empty-list case (Company Profile's review found `CustomersListPage` initially missed the error case — don't repeat that gap here).
- Every form page's edit mode handles `isLoading`/`isError` for the initial fetch, and uses an id-keyed ref guard (not a bare boolean) for its "populate form once" effect — mirrors `CustomerFormPage.tsx`'s fixed pattern (`populatedForIdRef`).

---

### Task 1: Filaments pages

**Files:**
- Create: `platform/frontend/src/api/filaments.ts`
- Create: `platform/frontend/src/pages/filaments/FilamentsListPage.tsx`
- Create: `platform/frontend/tests/FilamentsListPage.test.tsx`
- Create: `platform/frontend/src/pages/filaments/FilamentFormPage.tsx`
- Create: `platform/frontend/tests/FilamentFormPage.test.tsx`
- Modify: `platform/frontend/src/components/AppShell.tsx` (add nav entry)
- Modify: `platform/frontend/src/App.tsx` (add routes)
- Modify: `platform/frontend/tests/App.test.tsx` (routing test)

**Interfaces:**
- Consumes: `apiGet`/`apiPost`/`apiPatch`, `FormField`, `TextareaField`, `createTestQueryClient`.
- Produces: nothing consumed by Tasks 2-3 in this plan (each module is independent) — but establishes the "optional number field" pattern Task 2 doesn't need (LabourStep's only numeric field, `hourlyRate`, is REQUIRED, not optional) and Task 3 does need (Consumable's `currentStock`/`reorderThreshold`).

- [ ] **Step 1: Create the Filaments API hook module**

Create `platform/frontend/src/api/filaments.ts`:

```typescript
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiGet, apiPatch, apiPost } from './client.js';

export interface Filament {
  id: string;
  brand: string;
  materialType: string;
  diameterMm: number;
  colour: string | null;
  costPerSpool: number | null;
  costPerKg: number | null;
  spoolWeightGrams: number | null;
  remainingWeightGrams: number | null;
  supplier: string | null;
  purchaseDate: string | null;
  notes: string | null;
  lowStockThresholdGrams: number | null;
  createdAt: string;
}

export interface FilamentFormInput {
  brand: string;
  materialType: string;
  diameterMm: 1.75 | 2.85;
  colour?: string;
  costPerSpool?: number;
  costPerKg?: number;
  spoolWeightGrams?: number;
  remainingWeightGrams?: number;
  supplier?: string;
  purchaseDate?: string;
  notes?: string;
  lowStockThresholdGrams?: number;
}

const FILAMENTS_QUERY_KEY = ['filaments'] as const;

export function useFilaments() {
  return useQuery({
    queryKey: FILAMENTS_QUERY_KEY,
    queryFn: () => apiGet<{ filaments: Filament[] }>('/api/filaments').then((r) => r.filaments),
  });
}

export function useFilament(id: string | undefined) {
  return useQuery({
    queryKey: [...FILAMENTS_QUERY_KEY, id],
    queryFn: () => apiGet<{ filament: Filament }>(`/api/filaments/${id}`).then((r) => r.filament),
    enabled: id !== undefined,
  });
}

export function useCreateFilament() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: FilamentFormInput) =>
      apiPost<{ filament: Filament }>('/api/filaments', data).then((r) => r.filament),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: FILAMENTS_QUERY_KEY });
    },
  });
}

export function useUpdateFilament(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<FilamentFormInput>) => apiPatch(`/api/filaments/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: FILAMENTS_QUERY_KEY });
    },
  });
}
```

- [ ] **Step 2: Write the failing FilamentsListPage test**

Create `platform/frontend/tests/FilamentsListPage.test.tsx`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { FilamentsListPage } from '../src/pages/filaments/FilamentsListPage.js';
import * as client from '../src/api/client.js';
import { createTestQueryClient } from './helpers/queryClient.js';

beforeEach(() => {
  vi.restoreAllMocks();
});

function renderPage() {
  const queryClient = createTestQueryClient();
  return render(
    <MemoryRouter>
      <QueryClientProvider client={queryClient}>
        <FilamentsListPage />
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

const baseFilament = {
  id: '1', brand: 'eSun', materialType: 'PLA', diameterMm: 1.75, colour: 'Black',
  costPerSpool: null, costPerKg: 300, spoolWeightGrams: null, remainingWeightGrams: null,
  supplier: null, purchaseDate: null, notes: null, lowStockThresholdGrams: null,
  createdAt: '2026-01-01T00:00:00.000Z',
};

describe('FilamentsListPage', () => {
  it('lists filaments returned by the API', async () => {
    vi.spyOn(client, 'apiGet').mockResolvedValue({ ok: true, filaments: [baseFilament] });
    renderPage();
    await waitFor(() => expect(screen.getByText('eSun')).toBeInTheDocument());
  });

  it('shows an empty state when there are no filaments', async () => {
    vi.spyOn(client, 'apiGet').mockResolvedValue({ ok: true, filaments: [] });
    renderPage();
    await waitFor(() => expect(screen.getByText(/no filaments yet/i)).toBeInTheDocument());
  });

  it('shows an error message when the list fails to load', async () => {
    vi.spyOn(client, 'apiGet').mockRejectedValue(new client.ApiError('Something went wrong.', 500));
    renderPage();
    await waitFor(() => expect(screen.getByText(/couldn't load filaments/i)).toBeInTheDocument());
  });

  it('has a link to create a new filament', async () => {
    vi.spyOn(client, 'apiGet').mockResolvedValue({ ok: true, filaments: [] });
    renderPage();
    await waitFor(() =>
      expect(screen.getByRole('link', { name: 'New Filament' })).toHaveAttribute('href', '/filaments/new'),
    );
  });
});
```

- [ ] **Step 3: Run the test, verify it fails**

```bash
npx vitest run tests/FilamentsListPage.test.tsx
```
Expected: FAIL — `src/pages/filaments/FilamentsListPage.tsx` does not exist yet.

- [ ] **Step 4: Implement `FilamentsListPage`**

Create `platform/frontend/src/pages/filaments/FilamentsListPage.tsx`:

```typescript
import { Link } from 'react-router-dom';
import { useFilaments } from '../../api/filaments.js';

export function FilamentsListPage() {
  const { data: filaments, isLoading, isError } = useFilaments();

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-slate-900">Filaments</h1>
        <Link to="/filaments/new" className="rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white">
          New Filament
        </Link>
      </div>
      {isLoading && <p className="text-slate-500">Loading…</p>}
      {isError && <p className="text-red-600">Couldn't load filaments. Try refreshing the page.</p>}
      {!isLoading && !isError && filaments?.length === 0 && <p className="text-slate-500">No filaments yet.</p>}
      {!isLoading && !isError && filaments && filaments.length > 0 && (
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-slate-500">
              <th className="py-2">Brand</th>
              <th className="py-2">Material</th>
              <th className="py-2">Diameter</th>
              <th className="py-2">Colour</th>
              <th className="py-2"></th>
            </tr>
          </thead>
          <tbody>
            {filaments.map((filament) => (
              <tr key={filament.id} className="border-b border-slate-100">
                <td className="py-2">{filament.brand}</td>
                <td className="py-2">{filament.materialType}</td>
                <td className="py-2">{filament.diameterMm}mm</td>
                <td className="py-2">{filament.colour ?? '—'}</td>
                <td className="py-2 text-right">
                  <Link to={`/filaments/${filament.id}`} className="text-slate-600 underline">
                    Edit
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
```

- [ ] **Step 5: Run the test, verify it passes**

```bash
npx vitest run tests/FilamentsListPage.test.tsx
```
Expected: PASS, all 4 tests.

- [ ] **Step 6: Write the failing FilamentFormPage test**

Create `platform/frontend/tests/FilamentFormPage.test.tsx`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { FilamentFormPage } from '../src/pages/filaments/FilamentFormPage.js';
import * as client from '../src/api/client.js';
import { createTestQueryClient } from './helpers/queryClient.js';

beforeEach(() => {
  vi.restoreAllMocks();
});

function renderAt(path: string) {
  const queryClient = createTestQueryClient();
  return render(
    <MemoryRouter initialEntries={[path]}>
      <QueryClientProvider client={queryClient}>
        <Routes>
          <Route path="/filaments/new" element={<FilamentFormPage />} />
          <Route path="/filaments/:id" element={<FilamentFormPage />} />
          <Route path="/filaments" element={<div>filaments list</div>} />
        </Routes>
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

describe('FilamentFormPage — create mode', () => {
  it('creates a filament with an optional numeric field left blank (omitted, not NaN or empty string)', async () => {
    const postSpy = vi.spyOn(client, 'apiPost').mockResolvedValue({ ok: true, filament: { id: '1' } });
    renderAt('/filaments/new');

    fireEvent.change(screen.getByLabelText('Brand'), { target: { value: 'eSun' } });
    fireEvent.change(screen.getByLabelText('Material type'), { target: { value: 'PLA' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(postSpy).toHaveBeenCalled());
    const [, body] = postSpy.mock.calls[0];
    expect(body).toMatchObject({ brand: 'eSun', materialType: 'PLA', diameterMm: 1.75 });
    expect((body as Record<string, unknown>).costPerKg).toBeUndefined();
  });

  it('sends a filled-in optional numeric field as a real number, not a string', async () => {
    const postSpy = vi.spyOn(client, 'apiPost').mockResolvedValue({ ok: true, filament: { id: '1' } });
    renderAt('/filaments/new');

    fireEvent.change(screen.getByLabelText('Brand'), { target: { value: 'eSun' } });
    fireEvent.change(screen.getByLabelText('Material type'), { target: { value: 'PLA' } });
    fireEvent.change(screen.getByLabelText('Cost per kg'), { target: { value: '300' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(postSpy).toHaveBeenCalled());
    const [, body] = postSpy.mock.calls[0];
    expect((body as Record<string, unknown>).costPerKg).toBe(300);
  });
});

describe('FilamentFormPage — edit mode', () => {
  it('loads an existing filament (null optional fields become blank inputs, not "null" text) and saves changes', async () => {
    vi.spyOn(client, 'apiGet').mockResolvedValue({
      ok: true,
      filament: {
        id: '1', brand: 'eSun', materialType: 'PLA', diameterMm: 1.75, colour: null,
        costPerSpool: null, costPerKg: 300, spoolWeightGrams: null, remainingWeightGrams: null,
        supplier: null, purchaseDate: null, notes: null, lowStockThresholdGrams: null,
        createdAt: '2026-01-01T00:00:00.000Z',
      },
    });
    const patchSpy = vi.spyOn(client, 'apiPatch').mockResolvedValue({ ok: true });
    renderAt('/filaments/1');

    await waitFor(() => expect(screen.getByDisplayValue('eSun')).toBeInTheDocument());
    expect(screen.getByLabelText('Colour')).toHaveValue('');
    fireEvent.change(screen.getByLabelText('Colour'), { target: { value: 'Black' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() =>
      expect(patchSpy).toHaveBeenCalledWith('/api/filaments/1', expect.objectContaining({ colour: 'Black' })),
    );
  });
});
```

- [ ] **Step 7: Run the test, verify it fails**

```bash
npx vitest run tests/FilamentFormPage.test.tsx
```
Expected: FAIL — `src/pages/filaments/FilamentFormPage.tsx` does not exist yet.

- [ ] **Step 8: Implement `FilamentFormPage`**

Create `platform/frontend/src/pages/filaments/FilamentFormPage.tsx`:

```typescript
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { FormField } from '../../components/FormField.js';
import { TextareaField } from '../../components/TextareaField.js';
import { ApiError } from '../../api/client.js';
import {
  useFilament,
  useCreateFilament,
  useUpdateFilament,
  type FilamentFormInput,
} from '../../api/filaments.js';

const emptyForm: FilamentFormInput = {
  brand: '',
  materialType: '',
  diameterMm: 1.75,
  colour: '',
  costPerSpool: undefined,
  costPerKg: undefined,
  spoolWeightGrams: undefined,
  remainingWeightGrams: undefined,
  supplier: '',
  purchaseDate: '',
  notes: '',
  lowStockThresholdGrams: undefined,
};

export function FilamentFormPage() {
  const { id } = useParams();
  const isEditMode = id !== undefined;
  const navigate = useNavigate();
  const { data: existingFilament, isLoading: isLoadingFilament, isError: isFilamentError } = useFilament(id);
  const createMutation = useCreateFilament();
  const updateMutation = useUpdateFilament(id ?? '');
  const [form, setForm] = useState<FilamentFormInput>(emptyForm);
  const [error, setError] = useState<string | null>(null);
  const populatedForIdRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (existingFilament && populatedForIdRef.current !== id) {
      populatedForIdRef.current = id;
      setForm({
        brand: existingFilament.brand,
        materialType: existingFilament.materialType,
        diameterMm: existingFilament.diameterMm as 1.75 | 2.85,
        colour: existingFilament.colour ?? '',
        costPerSpool: existingFilament.costPerSpool ?? undefined,
        costPerKg: existingFilament.costPerKg ?? undefined,
        spoolWeightGrams: existingFilament.spoolWeightGrams ?? undefined,
        remainingWeightGrams: existingFilament.remainingWeightGrams ?? undefined,
        supplier: existingFilament.supplier ?? '',
        purchaseDate: existingFilament.purchaseDate ?? '',
        notes: existingFilament.notes ?? '',
        lowStockThresholdGrams: existingFilament.lowStockThresholdGrams ?? undefined,
      });
    }
  }, [existingFilament, id]);

  function set<K extends keyof FilamentFormInput>(key: K, value: FilamentFormInput[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function setNumber(key: keyof FilamentFormInput, raw: string) {
    set(key, (raw ? Number(raw) : undefined) as never);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      if (isEditMode) {
        await updateMutation.mutateAsync(form);
      } else {
        await createMutation.mutateAsync(form);
      }
      navigate('/filaments');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong. Try again shortly.');
    }
  }

  if (isEditMode && isLoadingFilament) {
    return <p className="text-slate-500">Loading…</p>;
  }
  if (isEditMode && isFilamentError) {
    return <p className="text-red-600">Couldn't load this filament. It may have been deleted.</p>;
  }

  const isPending = createMutation.isPending || updateMutation.isPending;

  return (
    <form onSubmit={handleSubmit} className="flex max-w-xl flex-col gap-4">
      <h1 className="text-2xl font-semibold text-slate-900">{isEditMode ? 'Edit Filament' : 'New Filament'}</h1>
      <FormField id="brand" label="Brand" value={form.brand} onChange={(e) => set('brand', e.target.value)} required />
      <FormField id="materialType" label="Material type" value={form.materialType} onChange={(e) => set('materialType', e.target.value)} required />
      <div className="flex flex-col gap-1">
        <label htmlFor="diameterMm" className="text-sm font-medium text-slate-700">Diameter</label>
        <select
          id="diameterMm"
          value={form.diameterMm}
          onChange={(e) => set('diameterMm', Number(e.target.value) as 1.75 | 2.85)}
          className="rounded border border-slate-300 px-3 py-2 text-sm"
        >
          <option value={1.75}>1.75mm</option>
          <option value={2.85}>2.85mm</option>
        </select>
      </div>
      <FormField id="colour" label="Colour" value={form.colour ?? ''} onChange={(e) => set('colour', e.target.value)} />
      <FormField id="costPerSpool" label="Cost per spool" type="number" value={form.costPerSpool ?? ''} onChange={(e) => setNumber('costPerSpool', e.target.value)} />
      <FormField id="costPerKg" label="Cost per kg" type="number" value={form.costPerKg ?? ''} onChange={(e) => setNumber('costPerKg', e.target.value)} />
      <FormField id="spoolWeightGrams" label="Spool weight (g)" type="number" value={form.spoolWeightGrams ?? ''} onChange={(e) => setNumber('spoolWeightGrams', e.target.value)} />
      <FormField id="remainingWeightGrams" label="Remaining weight (g)" type="number" value={form.remainingWeightGrams ?? ''} onChange={(e) => setNumber('remainingWeightGrams', e.target.value)} />
      <FormField id="lowStockThresholdGrams" label="Low stock threshold (g)" type="number" value={form.lowStockThresholdGrams ?? ''} onChange={(e) => setNumber('lowStockThresholdGrams', e.target.value)} />
      <FormField id="supplier" label="Supplier" value={form.supplier ?? ''} onChange={(e) => set('supplier', e.target.value)} />
      <TextareaField id="notes" label="Notes" value={form.notes ?? ''} onChange={(value) => set('notes', value)} />
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button
        type="submit"
        disabled={isPending}
        className="w-fit rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
      >
        Save
      </button>
    </form>
  );
}
```

- [ ] **Step 9: Run the test, verify it passes**

```bash
npx vitest run tests/FilamentFormPage.test.tsx
```
Expected: PASS, all 3 tests.

- [ ] **Step 10: Add the nav entry and routes**

In `src/components/AppShell.tsx`, append to `NAV_ITEMS`:

```typescript
  { to: '/filaments', label: 'Filaments' },
```

In `src/App.tsx`, add imports:

```typescript
import { FilamentsListPage } from './pages/filaments/FilamentsListPage.js';
import { FilamentFormPage } from './pages/filaments/FilamentFormPage.js';
```

Add three routes (after the existing Customers routes, before the catch-all):

```typescript
        <Route
          path="/filaments"
          element={
            <RequireAuth>
              <AppShell>
                <FilamentsListPage />
              </AppShell>
            </RequireAuth>
          }
        />
        <Route
          path="/filaments/new"
          element={
            <RequireAuth>
              <AppShell>
                <FilamentFormPage />
              </AppShell>
            </RequireAuth>
          }
        />
        <Route
          path="/filaments/:id"
          element={
            <RequireAuth>
              <AppShell>
                <FilamentFormPage />
              </AppShell>
            </RequireAuth>
          }
        />
```

- [ ] **Step 11: Add a routing test**

In `tests/App.test.tsx`, add a new `it(...)` inside `describe('App routing', ...)`, following the exact pattern of the existing Customers routing test (same `future` prop on `MemoryRouter`, same `apiGet` mock-by-path-switch style), asserting `/filaments` renders the heading "Filaments" (use `getByRole('heading', { name: 'Filaments' })` — the Company Profile/Customers tasks both hit an ambiguity here between the nav link text and the page heading, so disambiguate the same way from the start).

- [ ] **Step 12: Run the full test suite, typecheck, and build**

```bash
npm test
npm run typecheck
npm run build
```
Expected: all tests pass (63 existing + this task's ~8 new), zero type errors, build succeeds.

- [ ] **Step 13: Commit**

```bash
git add platform/frontend/src/api/filaments.ts platform/frontend/src/pages/filaments platform/frontend/tests/FilamentsListPage.test.tsx platform/frontend/tests/FilamentFormPage.test.tsx platform/frontend/src/components/AppShell.tsx platform/frontend/src/App.tsx platform/frontend/tests/App.test.tsx
git commit -m "Add Filaments pages: list, create, edit"
```

---

### Task 2: Labour Steps pages

**Files:**
- Create: `platform/frontend/src/api/labourSteps.ts`
- Create: `platform/frontend/src/pages/labourSteps/LabourStepsListPage.tsx`
- Create: `platform/frontend/tests/LabourStepsListPage.test.tsx`
- Create: `platform/frontend/src/pages/labourSteps/LabourStepFormPage.tsx`
- Create: `platform/frontend/tests/LabourStepFormPage.test.tsx`
- Modify: `platform/frontend/src/components/AppShell.tsx`, `platform/frontend/src/App.tsx`, `platform/frontend/tests/App.test.tsx`

**Interfaces:**
- Consumes: `apiGet`/`apiPost`/`apiPatch`, `FormField`, `Checkbox`, `createTestQueryClient`.
- Produces: nothing consumed elsewhere in this plan.

- [ ] **Step 1: Create the Labour Steps API hook module**

Create `platform/frontend/src/api/labourSteps.ts`:

```typescript
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiGet, apiPatch, apiPost } from './client.js';

export interface LabourStep {
  id: string;
  name: string;
  hourlyRate: number;
  active: boolean;
  createdAt: string;
}

export interface LabourStepFormInput {
  name: string;
  hourlyRate: number;
  active?: boolean;
}

const LABOUR_STEPS_QUERY_KEY = ['labourSteps'] as const;

export function useLabourSteps() {
  return useQuery({
    queryKey: LABOUR_STEPS_QUERY_KEY,
    queryFn: () => apiGet<{ labourSteps: LabourStep[] }>('/api/labour-steps').then((r) => r.labourSteps),
  });
}

export function useLabourStep(id: string | undefined) {
  return useQuery({
    queryKey: [...LABOUR_STEPS_QUERY_KEY, id],
    queryFn: () => apiGet<{ labourStep: LabourStep }>(`/api/labour-steps/${id}`).then((r) => r.labourStep),
    enabled: id !== undefined,
  });
}

export function useCreateLabourStep() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: LabourStepFormInput) =>
      apiPost<{ labourStep: LabourStep }>('/api/labour-steps', data).then((r) => r.labourStep),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: LABOUR_STEPS_QUERY_KEY });
    },
  });
}

export function useUpdateLabourStep(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<LabourStepFormInput>) => apiPatch(`/api/labour-steps/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: LABOUR_STEPS_QUERY_KEY });
    },
  });
}
```

(Confirmed: `GET /api/labour-steps/:id` DOES exist in `platform/api/src/routes/labour-steps.ts` — the direct fetch above is correct, no list-cache fallback needed.)

- [ ] **Step 2: Write the failing LabourStepsListPage test**

Create `platform/frontend/tests/LabourStepsListPage.test.tsx`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { LabourStepsListPage } from '../src/pages/labourSteps/LabourStepsListPage.js';
import * as client from '../src/api/client.js';
import { createTestQueryClient } from './helpers/queryClient.js';

beforeEach(() => {
  vi.restoreAllMocks();
});

function renderPage() {
  const queryClient = createTestQueryClient();
  return render(
    <MemoryRouter>
      <QueryClientProvider client={queryClient}>
        <LabourStepsListPage />
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

describe('LabourStepsListPage', () => {
  it('lists labour steps returned by the API', async () => {
    vi.spyOn(client, 'apiGet').mockResolvedValue({
      ok: true,
      labourSteps: [{ id: '1', name: 'Slicing', hourlyRate: 150, active: true, createdAt: '2026-01-01T00:00:00.000Z' }],
    });
    renderPage();
    await waitFor(() => expect(screen.getByText('Slicing')).toBeInTheDocument());
  });

  it('shows an empty state when there are no labour steps', async () => {
    vi.spyOn(client, 'apiGet').mockResolvedValue({ ok: true, labourSteps: [] });
    renderPage();
    await waitFor(() => expect(screen.getByText(/no labour steps yet/i)).toBeInTheDocument());
  });

  it('shows an error message when the list fails to load', async () => {
    vi.spyOn(client, 'apiGet').mockRejectedValue(new client.ApiError('Something went wrong.', 500));
    renderPage();
    await waitFor(() => expect(screen.getByText(/couldn't load labour steps/i)).toBeInTheDocument());
  });
});
```

- [ ] **Step 3: Run the test, verify it fails, then implement `LabourStepsListPage`**

Create `platform/frontend/src/pages/labourSteps/LabourStepsListPage.tsx`, following `FilamentsListPage.tsx`'s exact shape (Task 1, Step 4), adapted for `LabourStep`'s fields:

```typescript
import { Link } from 'react-router-dom';
import { useLabourSteps } from '../../api/labourSteps.js';

export function LabourStepsListPage() {
  const { data: labourSteps, isLoading, isError } = useLabourSteps();

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-slate-900">Labour Steps</h1>
        <Link to="/labour-steps/new" className="rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white">
          New Labour Step
        </Link>
      </div>
      {isLoading && <p className="text-slate-500">Loading…</p>}
      {isError && <p className="text-red-600">Couldn't load labour steps. Try refreshing the page.</p>}
      {!isLoading && !isError && labourSteps?.length === 0 && <p className="text-slate-500">No labour steps yet.</p>}
      {!isLoading && !isError && labourSteps && labourSteps.length > 0 && (
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-slate-500">
              <th className="py-2">Name</th>
              <th className="py-2">Hourly rate</th>
              <th className="py-2">Active</th>
              <th className="py-2"></th>
            </tr>
          </thead>
          <tbody>
            {labourSteps.map((step) => (
              <tr key={step.id} className="border-b border-slate-100">
                <td className="py-2">{step.name}</td>
                <td className="py-2">{step.hourlyRate}</td>
                <td className="py-2">{step.active ? 'Yes' : 'No'}</td>
                <td className="py-2 text-right">
                  <Link to={`/labour-steps/${step.id}`} className="text-slate-600 underline">
                    Edit
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
```

Run `npx vitest run tests/LabourStepsListPage.test.tsx` — expect PASS, all 3 tests.

- [ ] **Step 4: Write the failing LabourStepFormPage test**

Create `platform/frontend/tests/LabourStepFormPage.test.tsx`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { LabourStepFormPage } from '../src/pages/labourSteps/LabourStepFormPage.js';
import * as client from '../src/api/client.js';
import { createTestQueryClient } from './helpers/queryClient.js';

beforeEach(() => {
  vi.restoreAllMocks();
});

function renderAt(path: string) {
  const queryClient = createTestQueryClient();
  return render(
    <MemoryRouter initialEntries={[path]}>
      <QueryClientProvider client={queryClient}>
        <Routes>
          <Route path="/labour-steps/new" element={<LabourStepFormPage />} />
          <Route path="/labour-steps/:id" element={<LabourStepFormPage />} />
          <Route path="/labour-steps" element={<div>labour steps list</div>} />
        </Routes>
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

describe('LabourStepFormPage — create mode', () => {
  it('creates a labour step with the active checkbox defaulting to checked', async () => {
    const postSpy = vi.spyOn(client, 'apiPost').mockResolvedValue({ ok: true, labourStep: { id: '1' } });
    renderAt('/labour-steps/new');

    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Slicing' } });
    fireEvent.change(screen.getByLabelText('Hourly rate'), { target: { value: '150' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(postSpy).toHaveBeenCalled());
    const [, body] = postSpy.mock.calls[0];
    expect(body).toMatchObject({ name: 'Slicing', hourlyRate: 150, active: true });
  });
});

describe('LabourStepFormPage — edit mode', () => {
  it('loads an existing labour step via GET /api/labour-steps/:id and saves changes', async () => {
    vi.spyOn(client, 'apiGet').mockResolvedValue({
      ok: true,
      labourStep: { id: '1', name: 'Slicing', hourlyRate: 150, active: true, createdAt: '2026-01-01T00:00:00.000Z' },
    });
    const patchSpy = vi.spyOn(client, 'apiPatch').mockResolvedValue({ ok: true });
    renderAt('/labour-steps/1');

    await waitFor(() => expect(screen.getByDisplayValue('Slicing')).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText('Hourly rate'), { target: { value: '175' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() =>
      expect(patchSpy).toHaveBeenCalledWith('/api/labour-steps/1', expect.objectContaining({ hourlyRate: 175 })),
    );
  });
});
```

- [ ] **Step 5: Run the test, verify it fails, then implement `LabourStepFormPage`**

Create `platform/frontend/src/pages/labourSteps/LabourStepFormPage.tsx`:

```typescript
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { FormField } from '../../components/FormField.js';
import { Checkbox } from '../../components/Checkbox.js';
import { ApiError } from '../../api/client.js';
import {
  useLabourStep,
  useCreateLabourStep,
  useUpdateLabourStep,
  type LabourStepFormInput,
} from '../../api/labourSteps.js';

const emptyForm: LabourStepFormInput = { name: '', hourlyRate: 0, active: true };

export function LabourStepFormPage() {
  const { id } = useParams();
  const isEditMode = id !== undefined;
  const navigate = useNavigate();
  const { data: existingStep, isLoading: isLoadingStep, isError: isStepError } = useLabourStep(id);
  const createMutation = useCreateLabourStep();
  const updateMutation = useUpdateLabourStep(id ?? '');
  const [form, setForm] = useState<LabourStepFormInput>(emptyForm);
  const [error, setError] = useState<string | null>(null);
  const populatedForIdRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (existingStep && populatedForIdRef.current !== id) {
      populatedForIdRef.current = id;
      setForm({ name: existingStep.name, hourlyRate: existingStep.hourlyRate, active: existingStep.active });
    }
  }, [existingStep, id]);

  function set<K extends keyof LabourStepFormInput>(key: K, value: LabourStepFormInput[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      if (isEditMode) {
        await updateMutation.mutateAsync(form);
      } else {
        await createMutation.mutateAsync(form);
      }
      navigate('/labour-steps');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong. Try again shortly.');
    }
  }

  if (isEditMode && isLoadingStep) {
    return <p className="text-slate-500">Loading…</p>;
  }
  if (isEditMode && isStepError) {
    return <p className="text-red-600">Couldn't load this labour step. It may have been deleted.</p>;
  }

  const isPending = createMutation.isPending || updateMutation.isPending;

  return (
    <form onSubmit={handleSubmit} className="flex max-w-xl flex-col gap-4">
      <h1 className="text-2xl font-semibold text-slate-900">{isEditMode ? 'Edit Labour Step' : 'New Labour Step'}</h1>
      <FormField id="name" label="Name" value={form.name} onChange={(e) => set('name', e.target.value)} required />
      <FormField
        id="hourlyRate"
        label="Hourly rate"
        type="number"
        value={form.hourlyRate}
        onChange={(e) => set('hourlyRate', Number(e.target.value))}
        required
      />
      <Checkbox id="active" label="Active" checked={form.active ?? true} onChange={(checked) => set('active', checked)} />
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button
        type="submit"
        disabled={isPending}
        className="w-fit rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
      >
        Save
      </button>
    </form>
  );
}
```

Run `npx vitest run tests/LabourStepFormPage.test.tsx` — expect PASS, both tests.

- [ ] **Step 6: Add the nav entry and routes**

In `src/components/AppShell.tsx`, append: `{ to: '/labour-steps', label: 'Labour Steps' },`

In `src/App.tsx`, add imports and three routes for `/labour-steps`, `/labour-steps/new`, `/labour-steps/:id`, mirroring Task 1 Step 10's structure exactly (same wrapping, same placement before the catch-all).

- [ ] **Step 7: Add a routing test**

Same pattern as Task 1 Step 11, for `/labour-steps` asserting the heading "Labour Steps" via `getByRole('heading', ...)`.

- [ ] **Step 8: Run the full test suite, typecheck, and build**

```bash
npm test
npm run typecheck
npm run build
```
Expected: all tests pass, zero type errors, build succeeds.

- [ ] **Step 9: Commit**

```bash
git add platform/frontend/src/api/labourSteps.ts platform/frontend/src/pages/labourSteps platform/frontend/tests/LabourStepsListPage.test.tsx platform/frontend/tests/LabourStepFormPage.test.tsx platform/frontend/src/components/AppShell.tsx platform/frontend/src/App.tsx platform/frontend/tests/App.test.tsx
git commit -m "Add Labour Steps pages: list, create, edit"
```

---

### Task 3: Consumables pages

**Files:**
- Create: `platform/frontend/src/api/consumables.ts`
- Create: `platform/frontend/src/pages/consumables/ConsumablesListPage.tsx`
- Create: `platform/frontend/tests/ConsumablesListPage.test.tsx`
- Create: `platform/frontend/src/pages/consumables/ConsumableFormPage.tsx`
- Create: `platform/frontend/tests/ConsumableFormPage.test.tsx`
- Modify: `platform/frontend/src/components/AppShell.tsx`, `platform/frontend/src/App.tsx`, `platform/frontend/tests/App.test.tsx`

**Interfaces:**
- Consumes: `apiGet`/`apiPost`/`apiPatch`, `FormField`, `createTestQueryClient`.
- Produces: nothing consumed elsewhere in this plan.

**Confirmed against the real route file:** `GET /api/consumables/:id` DOES exist in `platform/api/src/routes/consumables.ts` — use a direct fetch for `useConsumable`, matching `filaments.ts`'s pattern, not a list-cache lookup. The `CATEGORIES` enum is confirmed as `['resin', 'nozzle', 'build-plate-adhesive', 'post-processing', 'packaging', 'other']`.

- [ ] **Step 1: Create the Consumables API hook module**

Create `platform/frontend/src/api/consumables.ts`, following `filaments.ts`'s exact shape (Task 1), adapted for these fields:

```typescript
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiGet, apiPatch, apiPost } from './client.js';

export const CONSUMABLE_CATEGORIES = [
  'resin', 'nozzle', 'build-plate-adhesive', 'post-processing', 'packaging', 'other',
] as const;

export type ConsumableCategory = (typeof CONSUMABLE_CATEGORIES)[number];

export interface Consumable {
  id: string;
  name: string;
  category: ConsumableCategory;
  unitOfMeasure: string;
  costPerUnit: number;
  currentStock: number;
  reorderThreshold: number | null;
  supplier: string | null;
  createdAt: string;
}

export interface ConsumableFormInput {
  name: string;
  category: ConsumableCategory;
  unitOfMeasure: string;
  costPerUnit: number;
  currentStock?: number;
  reorderThreshold?: number;
  supplier?: string;
}

const CONSUMABLES_QUERY_KEY = ['consumables'] as const;

export function useConsumables() {
  return useQuery({
    queryKey: CONSUMABLES_QUERY_KEY,
    queryFn: () => apiGet<{ consumables: Consumable[] }>('/api/consumables').then((r) => r.consumables),
  });
}

export function useConsumable(id: string | undefined) {
  return useQuery({
    queryKey: [...CONSUMABLES_QUERY_KEY, id],
    queryFn: () => apiGet<{ consumable: Consumable }>(`/api/consumables/${id}`).then((r) => r.consumable),
    enabled: id !== undefined,
  });
}

export function useCreateConsumable() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: ConsumableFormInput) =>
      apiPost<{ consumable: Consumable }>('/api/consumables', data).then((r) => r.consumable),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: CONSUMABLES_QUERY_KEY });
    },
  });
}

export function useUpdateConsumable(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<ConsumableFormInput>) => apiPatch(`/api/consumables/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: CONSUMABLES_QUERY_KEY });
    },
  });
}
```

- [ ] **Step 2: Write the failing ConsumablesListPage test**

Create `platform/frontend/tests/ConsumablesListPage.test.tsx`, mirroring `FilamentsListPage.test.tsx`'s 4 tests (list, empty, error, new-link) adapted for Consumable fields (`name`, `category`, `unitOfMeasure`, `costPerUnit`, `currentStock`).

- [ ] **Step 3: Run the test, verify it fails, then implement `ConsumablesListPage`**

Create `platform/frontend/src/pages/consumables/ConsumablesListPage.tsx`, mirroring `FilamentsListPage.tsx`'s exact shape, with a table showing `name`, `category`, `unitOfMeasure`, `costPerUnit`, `currentStock`, and a "New Consumable" link to `/consumables/new`.

Run the test — expect PASS.

- [ ] **Step 4: Write the failing ConsumableFormPage test**

Create `platform/frontend/tests/ConsumableFormPage.test.tsx`, mirroring `FilamentFormPage.test.tsx`'s create/edit tests, adapted for Consumable's fields — including one test confirming the `category` `<select>` sends one of the valid `CONSUMABLE_CATEGORIES` values, not an arbitrary string.

- [ ] **Step 5: Run the test, verify it fails, then implement `ConsumableFormPage`**

Create `platform/frontend/src/pages/consumables/ConsumableFormPage.tsx`, mirroring `FilamentFormPage.tsx`'s structure: `FormField`s for `name`/`unitOfMeasure`/`costPerUnit` (required) and `currentStock`/`reorderThreshold`/`supplier` (optional — `currentStock`/`reorderThreshold` follow the "optional NUMBER field: null→undefined" pattern, `supplier` follows "optional STRING field: null→''"), and a `<select>` for `category` populated from `CONSUMABLE_CATEGORIES` (mirror `FilamentFormPage.tsx`'s `diameterMm` select structure).

Run the test — expect PASS.

- [ ] **Step 6: Add the nav entry and routes**

In `src/components/AppShell.tsx`, append: `{ to: '/consumables', label: 'Consumables' },`

In `src/App.tsx`, add imports and three routes for `/consumables`, `/consumables/new`, `/consumables/:id`, mirroring Task 1 Step 10's structure.

- [ ] **Step 7: Add a routing test**

Same pattern as Task 1 Step 11, for `/consumables` asserting the heading "Consumables" via `getByRole('heading', ...)`.

- [ ] **Step 8: Run the full test suite, typecheck, and build**

```bash
npm test
npm run typecheck
npm run build
```
Expected: all tests pass, zero type errors, build succeeds.

- [ ] **Step 9: Commit**

```bash
git add platform/frontend/src/api/consumables.ts platform/frontend/src/pages/consumables platform/frontend/tests/ConsumablesListPage.test.tsx platform/frontend/tests/ConsumableFormPage.test.tsx platform/frontend/src/components/AppShell.tsx platform/frontend/src/App.tsx platform/frontend/tests/App.test.tsx
git commit -m "Add Consumables pages: list, create, edit"
```
