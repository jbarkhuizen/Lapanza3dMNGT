# Frontend: Printers Pages Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Phase 4b of the frontend build-out: Printers list/create/edit, plus nested Printer Presets and Maintenance Log management on a printer's edit page. Last of the "reference data" module phases before Costing Templates/Quotes/Invoices.

**Architecture:** Same shape as Filaments/Labour Steps/Consumables (Phase 4a) for the top-level `Printer` resource. Presets and Maintenance Log entries are nested under a printer (`/api/printers/:printerId/presets`, `/api/printers/:printerId/maintenance-log`) and are managed INLINE on `PrinterFormPage` in edit mode only — they don't get their own routes/pages, since neither makes sense without an existing printer.

**Tech Stack:** Same as prior phases.

## Global Constraints — read `docs/AI_HANDOFF.md`'s "Frontend form-data gotcha" section (all 6 points) before starting

This is the 4th CRUD-page phase. The discipline that's caught 3 real bugs across the prior 3 phases still applies:

- **Before finalizing any submit logic, read the ACTUAL zod schema in `platform/api/src/routes/{printers,printer-presets,printer-maintenance}.ts` yourself** — don't assume "reference-data modules never need `omitBlankFields`" just because Labour Steps/Consumables didn't. This module's `purchaseDate` (on `Printer`) and `date` (on maintenance log entries) both use the same `.refine()` date-format check that Filaments' `purchaseDate` needed `omitBlankFields` for — confirm this yourself and apply the same treatment. Every OTHER optional field in all three schemas — check for yourself whether any needs it too.
- **Optional NUMBER fields** (`buildVolumeXMm/Y/Z`, `purchaseCost`, `powerDrawWatts`, `expectedLifetimeHours` on Printer; `nozzleTempC`, `bedTempC`, `printSpeedMmS`, `layerHeightMm`, `infillPercent` on PrinterPreset; `cost` on maintenance log): normalize `null → undefined` on load, `onChange` converts blank→`undefined`/filled→`Number(value)`.
- **REQUIRED number fields need the `number | undefined` local-form-state pattern** (see `LabourStepFormPage.tsx`'s `LabourStepFormState` / `ConsumableFormPage.tsx`'s `ConsumableFormState`) so clearing the field doesn't silently coerce to `0` — this plan has one: maintenance log's `cost` is actually OPTIONAL (not required), but double check; the log entry's `date` is required but is a date string, not a number, so this specific trap doesn't apply there.
- **One NEW wrinkle this phase introduces: `Printer.electricityRatePerKwh` is a Decimal field, serialized by the API as a STRING already formatted to 4dp** (e.g. `"2.5000"`), not a plain number like every other numeric field so far (see `platform/api/src/routes/printers.ts`'s `serializePrinter()`). On load, convert it to a number for the form (`existingPrinter.electricityRatePerKwh != null ? Number(existingPrinter.electricityRatePerKwh) : undefined`) — do NOT treat the string like every other field's `null`. On submit, send a plain `Number(...)`, matching what the create/update schema (`z.number().nonnegative().optional()`) expects — never send the formatted string back.
- Every list page: `isLoading`/`isError`/empty. Every form page's edit mode: `isLoading`/`isError` for the initial fetch, id-keyed populate-once ref guard.
- Every API call through `apiGet`/`apiPost`/`apiPatch`. Every navigation through `<Link>`/`useNavigate`.
- **Scope decision, matching this codebase's existing "no standalone Invoice create form in v1" precedent**: Presets support list + create only in this phase (the API has a `PATCH` for presets, but editing-in-place adds meaningful UI complexity — deferred). Maintenance Log entries support list + create only (matching the API's own full capability — there is no `PATCH`/`DELETE` route for maintenance log entries at all, so this isn't a scope reduction, it's the complete feature).

---

### Task 1: Printers list + create/edit pages (core fields only, no nested resources yet)

**Files:**
- Create: `platform/frontend/src/api/printers.ts`
- Create: `platform/frontend/src/pages/printers/PrintersListPage.tsx`
- Create: `platform/frontend/tests/PrintersListPage.test.tsx`
- Create: `platform/frontend/src/pages/printers/PrinterFormPage.tsx`
- Create: `platform/frontend/tests/PrinterFormPage.test.tsx`
- Modify: `platform/frontend/src/components/AppShell.tsx` (add nav entry)
- Modify: `platform/frontend/src/App.tsx` (add routes)
- Modify: `platform/frontend/tests/App.test.tsx` (routing test)

**Interfaces:**
- Consumes: `apiGet`/`apiPost`/`apiPatch`, `FormField`, `createTestQueryClient`.
- Produces: `PrinterFormPage`'s edit-mode shell, into which Task 2 inserts the Presets and Maintenance Log sections (Task 2 modifies this file, not creates a new one).

- [ ] **Step 1: Read `platform/api/src/routes/printers.ts`'s real schema and confirm the `omitBlankFields` list**

Confirm: `purchaseDate` needs it (same `.refine()` pattern as Filaments — verify by checking `Date.parse('')` is `NaN`). Confirm every other field (`make`, `model`, `buildVolumeXMm/Y/Z`, `purchaseCost`, `powerDrawWatts`, `electricityRatePerKwh`, `expectedLifetimeHours`, `status`) has no stricter-than-plain-`.optional()` validation that would reject `''`/need omitting (numbers can't be sent as `''` at all if handled per this plan's number-field convention, so only STRING-typed optional fields are candidates — `make`, `model` are plain optional strings needing no special treatment; `status` is `z.enum(STATUSES).optional()`, handled via a `<select>`, never blank-submitted since it always has a value once the user picks one — default it to `'active'` in `emptyForm` so it's never blank).

- [ ] **Step 2: Create the Printers API hook module**

Create `platform/frontend/src/api/printers.ts`:

```typescript
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiGet, apiPatch, apiPost } from './client.js';

export type PrinterStatus = 'active' | 'maintenance' | 'retired';

export interface Printer {
  id: string;
  name: string;
  make: string | null;
  model: string | null;
  buildVolumeXMm: number | null;
  buildVolumeYMm: number | null;
  buildVolumeZMm: number | null;
  purchaseDate: string | null;
  purchaseCost: number | null;
  powerDrawWatts: number | null;
  electricityRatePerKwh: string | null;
  expectedLifetimeHours: number | null;
  status: PrinterStatus;
  createdAt: string;
}

export interface PrinterFormInput {
  name: string;
  make?: string;
  model?: string;
  buildVolumeXMm?: number;
  buildVolumeYMm?: number;
  buildVolumeZMm?: number;
  purchaseDate?: string;
  purchaseCost?: number;
  powerDrawWatts?: number;
  electricityRatePerKwh?: number;
  expectedLifetimeHours?: number;
  status?: PrinterStatus;
}

const PRINTERS_QUERY_KEY = ['printers'] as const;

export function usePrinters() {
  return useQuery({
    queryKey: PRINTERS_QUERY_KEY,
    queryFn: () => apiGet<{ printers: Printer[] }>('/api/printers').then((r) => r.printers),
  });
}

export function usePrinter(id: string | undefined) {
  return useQuery({
    queryKey: [...PRINTERS_QUERY_KEY, id],
    queryFn: () => apiGet<{ printer: Printer }>(`/api/printers/${id}`).then((r) => r.printer),
    enabled: id !== undefined,
  });
}

export function useCreatePrinter() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: PrinterFormInput) =>
      apiPost<{ printer: Printer }>('/api/printers', data).then((r) => r.printer),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: PRINTERS_QUERY_KEY });
    },
  });
}

export function useUpdatePrinter(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<PrinterFormInput>) => apiPatch(`/api/printers/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: PRINTERS_QUERY_KEY });
    },
  });
}
```

- [ ] **Step 3: Write the failing PrintersListPage test**

Create `platform/frontend/tests/PrintersListPage.test.tsx`, mirroring `FilamentsListPage.test.tsx`'s 4 tests (list, empty, error, new-link) adapted for `Printer` (columns: name, make, model, status).

- [ ] **Step 4: Run the test, verify it fails, then implement `PrintersListPage`**

Create `platform/frontend/src/pages/printers/PrintersListPage.tsx`, mirroring `FilamentsListPage.tsx`'s exact shape, table columns `name`, `make ?? '—'`, `model ?? '—'`, `status`, Edit link to `/printers/:id`, "New Printer" link to `/printers/new`.

Run the test — expect PASS.

- [ ] **Step 5: Write the failing PrinterFormPage test (core fields only — Task 2 adds preset/maintenance tests)**

Create `platform/frontend/tests/PrinterFormPage.test.tsx`, mirroring `FilamentFormPage.test.tsx`'s create/edit structure, PLUS one test specific to this module's new wrinkle:

```typescript
it('converts electricityRatePerKwh from a formatted API string to a number on load, and back to a number on save', async () => {
  vi.spyOn(client, 'apiGet').mockResolvedValue({
    ok: true,
    printer: {
      id: '1', name: 'Prusa MK4', make: null, model: null,
      buildVolumeXMm: null, buildVolumeYMm: null, buildVolumeZMm: null,
      purchaseDate: null, purchaseCost: null, powerDrawWatts: null,
      electricityRatePerKwh: '2.5000', expectedLifetimeHours: null,
      status: 'active', createdAt: '2026-01-01T00:00:00.000Z',
    },
  });
  const patchSpy = vi.spyOn(client, 'apiPatch').mockResolvedValue({ ok: true });
  renderAt('/printers/1');

  await waitFor(() => expect(screen.getByLabelText('Electricity rate per kWh')).toHaveValue(2.5));
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));

  await waitFor(() =>
    expect(patchSpy).toHaveBeenCalledWith('/api/printers/1', expect.objectContaining({ electricityRatePerKwh: 2.5 })),
  );
});
```

(Adapt the rest of the file's structure — imports, `renderAt` helper, create-mode test, blank-optional-field test — from `FilamentFormPage.test.tsx`, changing only field names/values to match `Printer`.)

- [ ] **Step 6: Run the test, verify it fails, then implement `PrinterFormPage`**

Create `platform/frontend/src/pages/printers/PrinterFormPage.tsx`, mirroring `FilamentFormPage.tsx`'s structure exactly, with these Printer-specific adaptations:

```typescript
const emptyForm: PrinterFormInput = {
  name: '',
  make: '',
  model: '',
  buildVolumeXMm: undefined,
  buildVolumeYMm: undefined,
  buildVolumeZMm: undefined,
  purchaseDate: '',
  purchaseCost: undefined,
  powerDrawWatts: undefined,
  electricityRatePerKwh: undefined,
  expectedLifetimeHours: undefined,
  status: 'active',
};
```

Populate effect converts `electricityRatePerKwh` specially:
```typescript
electricityRatePerKwh: existingPrinter.electricityRatePerKwh != null ? Number(existingPrinter.electricityRatePerKwh) : undefined,
```

Render a `<select>` for `status` (options: `active`, `maintenance`, `retired`) mirroring `FilamentFormPage.tsx`'s `diameterMm` select structure. Render `FormField`s for every other field, using the numeric-field pattern (`setNumber`, narrowed to only the module's optional numeric fields — `buildVolumeXMm/Y/Z`, `purchaseCost`, `powerDrawWatts`, `electricityRatePerKwh`, `expectedLifetimeHours`) established in `FilamentFormPage.tsx`/fixed per the Consumables review round (no cast needed, narrow the type). Apply `omitBlankFields(form, ['purchaseDate'])` at both mutation call sites per Step 1's finding (only if Step 1 confirms it — don't apply it speculatively without having actually re-derived the need).

Run the test — expect PASS.

- [ ] **Step 7: Add the nav entry and routes**

`AppShell.tsx`: append `{ to: '/printers', label: 'Printers' },`

`App.tsx`: add imports and 3 routes (`/printers`, `/printers/new`, `/printers/:id`) before the catch-all, mirroring the established pattern.

- [ ] **Step 8: Add a routing test**

Mirror the established pattern, asserting the "Printers" heading via `getByRole('heading', ...)`.

- [ ] **Step 9: Run the full test suite, typecheck, and build**

```bash
npm test
npm run typecheck
npm run build
```
Expected: all tests pass (96 existing + this task's ~9 new), zero type errors, build succeeds.

- [ ] **Step 10: Commit**

```bash
git add platform/frontend/src/api/printers.ts platform/frontend/src/pages/printers platform/frontend/tests/PrintersListPage.test.tsx platform/frontend/tests/PrinterFormPage.test.tsx platform/frontend/src/components/AppShell.tsx platform/frontend/src/App.tsx platform/frontend/tests/App.test.tsx
git commit -m "Add Printers pages: list, create, edit"
```

---

### Task 2: Nested Printer Presets and Maintenance Log (inline on the edit page, edit mode only)

**Files:**
- Create: `platform/frontend/src/api/printerPresets.ts`
- Create: `platform/frontend/src/api/printerMaintenance.ts`
- Create: `platform/frontend/src/components/printers/PresetsSection.tsx`
- Create: `platform/frontend/tests/PresetsSection.test.tsx`
- Create: `platform/frontend/src/components/printers/MaintenanceLogSection.tsx`
- Create: `platform/frontend/tests/MaintenanceLogSection.test.tsx`
- Modify: `platform/frontend/src/pages/printers/PrinterFormPage.tsx` (render both sections when in edit mode)
- Modify: `platform/frontend/tests/PrinterFormPage.test.tsx` (confirm sections render in edit mode, don't render in create mode)

**Interfaces:**
- Consumes: `PrinterFormPage.tsx`'s existing `isEditMode`/`id` — both new section components are only rendered when `isEditMode` is true, receiving `printerId={id!}` as a prop.
- Produces: nothing consumed elsewhere — this is the last task in this plan.

- [ ] **Step 1: Read `platform/api/src/routes/printer-presets.ts` and `printer-maintenance.ts`'s real schemas**

Confirm (per this plan's Global Constraints): presets have NO `GET /api/printers/:printerId/presets/:id` — only list (`GET .../presets`), create (`POST .../presets`), and update (`PATCH .../presets/:id`, unused in this phase per the scope decision). Maintenance log entries have ONLY list (`GET .../maintenance-log`) and create (`POST .../maintenance-log`) — no update, no delete, no single-entry GET; confirm the `date` field's `.refine()` needs `omitBlankFields` treatment IF you make it optional in the form (it's actually REQUIRED per the schema — `date: z.string().refine(...)` with no `.optional()` — so it needs the `required` HTML attribute, not `omitBlankFields`, matching how required fields are always handled in this codebase). Confirm `cost` (maintenance) and every preset field beyond `name`/`materialType` (required) are plain `.optional()` with no stricter validation.

- [ ] **Step 2: Create the Printer Presets API hook module**

Create `platform/frontend/src/api/printerPresets.ts`:

```typescript
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiGet, apiPost } from './client.js';

export interface PrinterPreset {
  id: string;
  name: string;
  materialType: string;
  nozzleTempC: number | null;
  bedTempC: number | null;
  printSpeedMmS: number | null;
  layerHeightMm: number | null;
  infillPercent: number | null;
  notes: string | null;
  createdAt: string;
}

export interface PrinterPresetFormInput {
  name: string;
  materialType: string;
  nozzleTempC?: number;
  bedTempC?: number;
  printSpeedMmS?: number;
  layerHeightMm?: number;
  infillPercent?: number;
  notes?: string;
}

export function usePrinterPresets(printerId: string) {
  return useQuery({
    queryKey: ['printers', printerId, 'presets'],
    queryFn: () => apiGet<{ presets: PrinterPreset[] }>(`/api/printers/${printerId}/presets`).then((r) => r.presets),
  });
}

export function useCreatePrinterPreset(printerId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: PrinterPresetFormInput) =>
      apiPost<{ preset: PrinterPreset }>(`/api/printers/${printerId}/presets`, data).then((r) => r.preset),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['printers', printerId, 'presets'] });
    },
  });
}
```

- [ ] **Step 3: Create the Printer Maintenance Log API hook module**

Create `platform/frontend/src/api/printerMaintenance.ts`, mirroring Step 2's exact shape:

```typescript
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiGet, apiPost } from './client.js';

export interface MaintenanceLogEntry {
  id: string;
  date: string;
  description: string;
  cost: number | null;
  performedBy: string | null;
  createdAt: string;
}

export interface MaintenanceLogFormInput {
  date: string;
  description: string;
  cost?: number;
  performedBy?: string;
}

export function useMaintenanceLog(printerId: string) {
  return useQuery({
    queryKey: ['printers', printerId, 'maintenance-log'],
    queryFn: () =>
      apiGet<{ entries: MaintenanceLogEntry[] }>(`/api/printers/${printerId}/maintenance-log`).then((r) => r.entries),
  });
}

export function useCreateMaintenanceLogEntry(printerId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: MaintenanceLogFormInput) =>
      apiPost<{ entry: MaintenanceLogEntry }>(`/api/printers/${printerId}/maintenance-log`, data).then((r) => r.entry),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['printers', printerId, 'maintenance-log'] });
    },
  });
}
```

- [ ] **Step 4: Write the failing PresetsSection test**

Create `platform/frontend/tests/PresetsSection.test.tsx`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { PresetsSection } from '../src/components/printers/PresetsSection.js';
import * as client from '../src/api/client.js';
import { createTestQueryClient } from './helpers/queryClient.js';

beforeEach(() => {
  vi.restoreAllMocks();
});

function renderSection() {
  const queryClient = createTestQueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <PresetsSection printerId="printer-1" />
    </QueryClientProvider>,
  );
}

describe('PresetsSection', () => {
  it('lists presets for the printer', async () => {
    vi.spyOn(client, 'apiGet').mockResolvedValue({
      ok: true,
      presets: [{ id: '1', name: 'PLA — Standard', materialType: 'PLA', nozzleTempC: 210, bedTempC: 60, printSpeedMmS: null, layerHeightMm: null, infillPercent: null, notes: null, createdAt: '2026-01-01T00:00:00.000Z' }],
    });
    renderSection();
    await waitFor(() => expect(screen.getByText('PLA — Standard')).toBeInTheDocument());
  });

  it('creates a new preset and clears the add form', async () => {
    vi.spyOn(client, 'apiGet').mockResolvedValue({ ok: true, presets: [] });
    const postSpy = vi.spyOn(client, 'apiPost').mockResolvedValue({
      ok: true,
      preset: { id: '2', name: 'PETG', materialType: 'PETG', nozzleTempC: null, bedTempC: null, printSpeedMmS: null, layerHeightMm: null, infillPercent: null, notes: null, createdAt: '2026-01-01T00:00:00.000Z' },
    });
    renderSection();
    await waitFor(() => expect(screen.getByText(/no presets yet/i)).toBeInTheDocument());

    fireEvent.change(screen.getByLabelText('Preset name'), { target: { value: 'PETG' } });
    fireEvent.change(screen.getByLabelText('Material type'), { target: { value: 'PETG' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add Preset' }));

    await waitFor(() =>
      expect(postSpy).toHaveBeenCalledWith(
        '/api/printers/printer-1/presets',
        expect.objectContaining({ name: 'PETG', materialType: 'PETG' }),
      ),
    );
  });
});
```

- [ ] **Step 5: Run the test, verify it fails, then implement `PresetsSection`**

Create `platform/frontend/src/components/printers/PresetsSection.tsx`:

```typescript
import { useState, type FormEvent } from 'react';
import { FormField } from '../FormField.js';
import { ApiError } from '../../api/client.js';
import { usePrinterPresets, useCreatePrinterPreset, type PrinterPresetFormInput } from '../../api/printerPresets.js';

const emptyForm: PrinterPresetFormInput = { name: '', materialType: '' };

export function PresetsSection({ printerId }: { printerId: string }) {
  const { data: presets, isLoading, isError } = usePrinterPresets(printerId);
  const createMutation = useCreatePrinterPreset(printerId);
  const [form, setForm] = useState<PrinterPresetFormInput>(emptyForm);
  const [error, setError] = useState<string | null>(null);

  function set<K extends keyof PrinterPresetFormInput>(key: K, value: PrinterPresetFormInput[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await createMutation.mutateAsync(form);
      setForm(emptyForm);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong. Try again shortly.');
    }
  }

  return (
    <section className="flex flex-col gap-3 border-t border-slate-200 pt-6">
      <h2 className="text-lg font-semibold text-slate-900">Printer Presets</h2>
      {isLoading && <p className="text-slate-500">Loading…</p>}
      {isError && <p className="text-red-600">Couldn't load presets.</p>}
      {!isLoading && !isError && presets?.length === 0 && <p className="text-slate-500">No presets yet.</p>}
      {!isLoading && !isError && presets && presets.length > 0 && (
        <ul className="flex flex-col gap-2 text-sm">
          {presets.map((preset) => (
            <li key={preset.id} className="flex justify-between border-b border-slate-100 py-1">
              <span>{preset.name}</span>
              <span className="text-slate-500">{preset.materialType}</span>
            </li>
          ))}
        </ul>
      )}
      <form onSubmit={handleSubmit} className="flex flex-wrap items-end gap-3">
        <FormField id="presetName" label="Preset name" value={form.name} onChange={(e) => set('name', e.target.value)} required />
        <FormField id="presetMaterialType" label="Material type" value={form.materialType} onChange={(e) => set('materialType', e.target.value)} required />
        <button
          type="submit"
          disabled={createMutation.isPending}
          className="rounded bg-slate-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          Add Preset
        </button>
      </form>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </section>
  );
}
```

Note: `<FormField id="presetName" label="Preset name" ...>` renders a `<label htmlFor="presetName">Preset name</label>` — the test's `getByLabelText('Preset name')` matches this. Run the test — expect PASS.

- [ ] **Step 6: Write the failing MaintenanceLogSection test**

Create `platform/frontend/tests/MaintenanceLogSection.test.tsx`, mirroring Step 4's structure exactly, adapted for `MaintenanceLogEntry`'s fields (`date` — a required `<input type="date">`, `description` — required, `cost`/`performedBy` — optional), asserting a create submits `date`/`description` and the button reads "Add Entry".

- [ ] **Step 7: Run the test, verify it fails, then implement `MaintenanceLogSection`**

Create `platform/frontend/src/components/printers/MaintenanceLogSection.tsx`, mirroring `PresetsSection.tsx`'s exact shape and structure, adapted for maintenance log fields. Use the exact heading text `<h2 className="text-lg font-semibold text-slate-900">Maintenance Log</h2>` (Step 9's test asserts this literal string) and an empty-state message `"No maintenance entries yet."`. Fields: `date` (`<FormField type="date" required>` — no special blank-handling needed beyond `required`, since it's mandatory), `description` (`<FormField required>`), `cost` (optional — use the numeric-field pattern, blank→`undefined`, filled→`Number(value)`), `performedBy` (optional string, blank→`''` is fine to send as-is — confirm against Step 1's schema check). The submit button reads `"Add Entry"`. List each entry as `{entry.date} — {entry.description}` (formatted however is simplest; a raw ISO date string is acceptable for this pass, no date-formatting library needed).

Run the test — expect PASS.

- [ ] **Step 8: Wire both sections into `PrinterFormPage`'s edit mode**

Modify `platform/frontend/src/pages/printers/PrinterFormPage.tsx`: import `PresetsSection` and `MaintenanceLogSection`, and render both AFTER the closing `</form>` tag (as siblings, not inside the form — they're independent forms of their own), gated on `isEditMode`:

```typescript
      {isEditMode && id && (
        <>
          <PresetsSection printerId={id} />
          <MaintenanceLogSection printerId={id} />
        </>
      )}
```

(Wrap the whole `PrinterFormPage` return in a fragment or an outer `<div>` if it currently returns the `<form>` directly, so both the form and the two new sections are siblings under one root.)

- [ ] **Step 9: Add a test confirming the sections only render in edit mode**

In `tests/PrinterFormPage.test.tsx`, add:
```typescript
it('does not render Presets/Maintenance Log sections in create mode', async () => {
  renderAt('/printers/new');
  expect(screen.queryByText('Printer Presets')).not.toBeInTheDocument();
  expect(screen.queryByText('Maintenance Log')).not.toBeInTheDocument();
});

it('renders Presets/Maintenance Log sections in edit mode', async () => {
  vi.spyOn(client, 'apiGet').mockImplementation((path: string) => {
    if (path === '/api/printers/1') {
      return Promise.resolve({ ok: true, printer: { /* ...full printer fixture... */ id: '1', name: 'Prusa MK4', make: null, model: null, buildVolumeXMm: null, buildVolumeYMm: null, buildVolumeZMm: null, purchaseDate: null, purchaseCost: null, powerDrawWatts: null, electricityRatePerKwh: null, expectedLifetimeHours: null, status: 'active', createdAt: '2026-01-01T00:00:00.000Z' } });
    }
    if (path === '/api/printers/1/presets') {
      return Promise.resolve({ ok: true, presets: [] });
    }
    if (path === '/api/printers/1/maintenance-log') {
      return Promise.resolve({ ok: true, entries: [] });
    }
    return Promise.reject(new client.ApiError('not found', 404));
  });
  renderAt('/printers/1');
  await waitFor(() => expect(screen.getByText('Printer Presets')).toBeInTheDocument());
  expect(screen.getByText('Maintenance Log')).toBeInTheDocument();
});
```

- [ ] **Step 10: Run the full test suite, typecheck, and build**

```bash
npm test
npm run typecheck
npm run build
```
Expected: all tests pass, zero type errors, build succeeds.

- [ ] **Step 11: Commit**

```bash
git add platform/frontend/src/api/printerPresets.ts platform/frontend/src/api/printerMaintenance.ts platform/frontend/src/components/printers platform/frontend/tests/PresetsSection.test.tsx platform/frontend/tests/MaintenanceLogSection.test.tsx platform/frontend/src/pages/printers/PrinterFormPage.tsx platform/frontend/tests/PrinterFormPage.test.tsx
git commit -m "Add nested Printer Presets and Maintenance Log sections to the printer edit page"
```
