# Inline List/Add/Edit Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the list-then-navigate-to-a-blank-page pattern with an always-visible inline add form and edit-in-place, across all 9 simple CRUD resource pages.

**Architecture:** Each resource's separate `FormPage` is deleted; its logic merges into the `ListPage`. Two new shared layout/behavior components (`MoreDetailsToggle`, `InlineEditableRow`) carry the pattern; each resource keeps its own hand-written field markup, types, and validation exactly as today.

**Tech Stack:** Same as the rest of `platform/frontend` — React 18/TS/Tailwind/react-router-dom v6/`@tanstack/react-query`. No new dependencies.

Full design context: [docs/superpowers/specs/2026-09-14-inline-list-form-redesign-design.md](../specs/2026-09-14-inline-list-form-redesign-design.md) — read it before starting; this plan does not repeat the "why."

## Global Constraints

- **The essentials/details rule, applied literally and consistently**: a field is "essentials" (always visible, inline, above/with the table) if and only if it is required on that resource's `Create*Input` type. Every other field — including single checkboxes and fields with defaults that are still optional in the type — goes inside `MoreDetailsToggle`. The one exception: a `<select>` field that is required-with-a-default (can never be blank — e.g. Printers' `status`/`process`, Consumables' `category`) counts as essentials even though React state might technically allow `undefined` transiently, because hiding a primary classifier behind a toggle would be confusing. Do not use judgment beyond this rule — it was deliberately designed to need none.
- `MoreDetailsToggle` renders nothing (no toggle button, no wrapper) when it has no children — verify this by checking `React.Children.count(children) === 0`, not by each call site conditionally omitting the component (keeps every resource's JSX uniform, whether or not it has optional fields).
- Every resource keeps its own `FormInput` type, its own `set`/`setNumber`/`clearNumber` helpers, and its own `omitBlankFields`/`OMIT_WHEN_BLANK` usage exactly as today — only WHERE that code lives (merged into the list page) and HOW it's laid out (inline, not a separate page) changes.
- `/resource/new` routes are deleted. `/resource/:id` routes are kept, still pointing at the (now merged) list page component, which reads `:id` via `useParams()` and auto-expands+scrolls to that row on mount.
- Existing mutation hooks (`useCreateX`, `useUpdateX`, `useDeleteX`) are reused unchanged — they already invalidate the list query on success, so no new refetch logic is needed anywhere in this plan.
- Delete buttons/flows (where they exist: Scanners, Laser Materials, Premade Items, Products) are carried over into the new row markup unchanged — not touched by this plan beyond moving their JSX.

---

### Task 1: Shared components + Filaments (proving case)

**Files:**
- Create: `platform/frontend/src/components/MoreDetailsToggle.tsx`
- Create: `platform/frontend/src/components/InlineEditableRow.tsx`
- Create: `platform/frontend/tests/MoreDetailsToggle.test.tsx`
- Create: `platform/frontend/tests/InlineEditableRow.test.tsx`
- Modify: `platform/frontend/src/pages/filaments/FilamentsListPage.tsx`
- Delete: `platform/frontend/src/pages/filaments/FilamentFormPage.tsx`
- Modify: `platform/frontend/src/pages/materials/MaterialsLibraryPage.tsx` (the "Use this material" link)
- Modify: `platform/frontend/src/App.tsx` (remove `/filaments/new`, point `/filaments/:id` at `FilamentsListPage`, remove the now-unused `FilamentFormPage` import)
- Modify: `platform/frontend/tests/FilamentsListPage.test.tsx`
- Delete: `platform/frontend/tests/FilamentFormPage.test.tsx` (if it exists — confirm via `ls platform/frontend/tests/ | grep -i filament` first)
- Modify: `platform/frontend/tests/MaterialsLibraryPage.test.tsx` (if it asserts on the `/filaments/new` link — confirm first)

**Interfaces:**
- Produces: `<MoreDetailsToggle>{children}</MoreDetailsToggle>` — starts collapsed, renders a `"+ More details"` / `"− Hide details"` text toggle; renders nothing at all when `children` is empty (check via `React.Children.count`).
- Produces: `<InlineEditableRow isEditing={boolean} readOnlyContent={ReactNode} editContent={ReactNode} />` — renders `readOnlyContent` inside a normal `<tr>` when `!isEditing`, or `editContent` inside a `<tr>` with a highlighted background when `isEditing`. Owns no state itself.
- Consumes: existing `FormField`, `NumberField`, `TextareaField`, `Checkbox` components (`platform/frontend/src/components/`) — read their current prop signatures before use, don't guess.
- Consumes: existing `useFilaments`, `useFilament`, `useCreateFilament`, `useUpdateFilament` hooks (`platform/frontend/src/api/filaments.ts`) — unchanged.

- [ ] **Step 1: Write `MoreDetailsToggle`**

```tsx
import { useState, Children, type ReactNode } from 'react';

interface MoreDetailsToggleProps {
  children: ReactNode;
}

export function MoreDetailsToggle({ children }: MoreDetailsToggleProps) {
  const [expanded, setExpanded] = useState(false);
  if (Children.count(children) === 0) {
    return null;
  }
  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        onClick={() => setExpanded((prev) => !prev)}
        className="w-fit text-sm text-slate-600 underline"
      >
        {expanded ? '− Hide details' : '+ More details'}
      </button>
      {expanded && <div className="flex flex-col gap-3">{children}</div>}
    </div>
  );
}
```

- [ ] **Step 2: Test `MoreDetailsToggle`**

Create `platform/frontend/tests/MoreDetailsToggle.test.tsx`. Cases: renders nothing (queries for the toggle button find nothing) when given no children (test with `{null}` and with `{[]}` as children); with children, starts collapsed (children not in the document); clicking the toggle reveals the children and flips the label to "− Hide details"; clicking again re-collapses.
Run: `npm test -- MoreDetailsToggle`
Expected: pass.

- [ ] **Step 3: Write `InlineEditableRow`**

```tsx
import type { ReactNode } from 'react';

interface InlineEditableRowProps {
  isEditing: boolean;
  readOnlyContent: ReactNode;
  editContent: ReactNode;
}

export function InlineEditableRow({ isEditing, readOnlyContent, editContent }: InlineEditableRowProps) {
  if (isEditing) {
    return <tr className="bg-slate-50">{editContent}</tr>;
  }
  return <tr className="border-b border-slate-100">{readOnlyContent}</tr>;
}
```

- [ ] **Step 4: Test `InlineEditableRow`**

Create `platform/frontend/tests/InlineEditableRow.test.tsx`. Render inside a `<table><tbody>` wrapper (a bare `<tr>` outside a table is invalid HTML and some test environments warn/misbehave). Cases: `isEditing={false}` renders `readOnlyContent` and not `editContent`; `isEditing={true}` renders `editContent` and not `readOnlyContent`.
Run: `npm test -- InlineEditableRow`
Expected: pass.

- [ ] **Step 5: Merge Filaments into one page**

Rewrite `platform/frontend/src/pages/filaments/FilamentsListPage.tsx`. Read the current `FilamentsListPage.tsx` and `FilamentFormPage.tsx` in full first — this step folds the second into the first, it does not start from scratch. Structure:

```tsx
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { FormField } from '../../components/FormField.js';
import { NumberField } from '../../components/NumberField.js';
import { TextareaField } from '../../components/TextareaField.js';
import { MoreDetailsToggle } from '../../components/MoreDetailsToggle.js';
import { InlineEditableRow } from '../../components/InlineEditableRow.js';
import { ApiError } from '../../api/client.js';
import {
  useFilaments,
  useFilament,
  useCreateFilament,
  useUpdateFilament,
  type Filament,
  type FilamentFormInput,
} from '../../api/filaments.js';
import { omitBlankFields } from '../../lib/omitBlankFields.js';

const emptyForm: FilamentFormInput = {
  brand: '', materialType: '', diameterMm: 1.75, colour: '',
  costPerSpool: undefined, costPerKg: undefined, spoolWeightGrams: undefined,
  remainingWeightGrams: undefined, supplier: '', purchaseDate: '', notes: '',
  lowStockThresholdGrams: undefined,
};

const OMIT_WHEN_BLANK: (keyof FilamentFormInput)[] = ['purchaseDate'];

type NumericFilamentField =
  | 'costPerSpool' | 'costPerKg' | 'spoolWeightGrams' | 'remainingWeightGrams' | 'lowStockThresholdGrams';

export function FilamentsListPage() {
  const { id: deepLinkedId } = useParams();
  const { data: filaments, isLoading, isError } = useFilaments();
  const [searchParams] = useSearchParams();

  // ---- Add form state (essentials always visible + More details) ----
  const [addForm, setAddForm] = useState<FilamentFormInput>(() => ({
    ...emptyForm,
    materialType: searchParams.get('materialType') ?? '',
    costPerKg: searchParams.get('costPerKg') ? Number(searchParams.get('costPerKg')) : undefined,
  }));
  const [addError, setAddError] = useState<string | null>(null);
  const createMutation = useCreateFilament();

  function setAdd<K extends keyof FilamentFormInput>(key: K, value: FilamentFormInput[K]) {
    setAddForm((prev) => ({ ...prev, [key]: value }));
  }
  function setAddNumber(key: NumericFilamentField, raw: string) {
    setAdd(key, raw ? Number(raw) : undefined);
  }

  async function handleAdd(e: FormEvent) {
    e.preventDefault();
    setAddError(null);
    try {
      await createMutation.mutateAsync(omitBlankFields(addForm, OMIT_WHEN_BLANK) as FilamentFormInput);
      setAddForm(emptyForm);
    } catch (err) {
      setAddError(err instanceof ApiError ? err.message : 'Something went wrong. Try again shortly.');
    }
  }

  // ---- Edit-in-place state ----
  const [editingId, setEditingId] = useState<string | null>(deepLinkedId ?? null);
  const [editForm, setEditForm] = useState<FilamentFormInput>(emptyForm);
  const [editError, setEditError] = useState<string | null>(null);
  const updateMutation = useUpdateFilament(editingId ?? '');
  const { data: deepLinkedFilament } = useFilament(deepLinkedId);
  const populatedForIdRef = useRef<string | undefined>(undefined);

  function startEdit(filament: Filament) {
    setEditingId(filament.id);
    setEditError(null);
    setEditForm({
      brand: filament.brand, materialType: filament.materialType,
      diameterMm: filament.diameterMm as 1.75 | 2.85, colour: filament.colour ?? '',
      costPerSpool: filament.costPerSpool ?? undefined, costPerKg: filament.costPerKg ?? undefined,
      spoolWeightGrams: filament.spoolWeightGrams ?? undefined,
      remainingWeightGrams: filament.remainingWeightGrams ?? undefined,
      supplier: filament.supplier ?? '', purchaseDate: filament.purchaseDate?.slice(0, 10) ?? '',
      notes: filament.notes ?? '', lowStockThresholdGrams: filament.lowStockThresholdGrams ?? undefined,
    });
  }

  // Deep-link support: /filaments/:id auto-expands that row once its data has loaded.
  useEffect(() => {
    if (deepLinkedId && deepLinkedFilament && populatedForIdRef.current !== deepLinkedId) {
      populatedForIdRef.current = deepLinkedId;
      startEdit(deepLinkedFilament);
      document.getElementById(`filament-row-${deepLinkedId}`)?.scrollIntoView({ block: 'center' });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deepLinkedId, deepLinkedFilament]);

  function setEdit<K extends keyof FilamentFormInput>(key: K, value: FilamentFormInput[K]) {
    setEditForm((prev) => ({ ...prev, [key]: value }));
  }
  function setEditNumber(key: NumericFilamentField, raw: string) {
    setEdit(key, raw ? Number(raw) : undefined);
  }
  function clearEditNumber(key: NumericFilamentField) {
    setEdit(key, null);
  }

  async function handleSaveEdit(e: FormEvent) {
    e.preventDefault();
    setEditError(null);
    try {
      await updateMutation.mutateAsync(omitBlankFields(editForm, OMIT_WHEN_BLANK));
      setEditingId(null);
    } catch (err) {
      setEditError(err instanceof ApiError ? err.message : 'Something went wrong. Try again shortly.');
    }
  }

  function cancelEdit() {
    setEditingId(null);
    setEditError(null);
  }

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold text-slate-900">Filaments</h1>

      <form onSubmit={handleAdd} className="flex flex-col gap-3 rounded border border-slate-200 p-4">
        <div className="flex flex-wrap items-end gap-3">
          <FormField id="add-brand" label="Brand" value={addForm.brand} onChange={(e) => setAdd('brand', e.target.value)} required />
          <FormField id="add-materialType" label="Material type" value={addForm.materialType} onChange={(e) => setAdd('materialType', e.target.value)} required />
          <div className="flex flex-col gap-1">
            <label htmlFor="add-diameterMm" className="text-sm font-medium text-slate-700">Diameter</label>
            <select id="add-diameterMm" value={addForm.diameterMm} onChange={(e) => setAdd('diameterMm', Number(e.target.value) as 1.75 | 2.85)} className="rounded border border-slate-300 px-3 py-2 text-sm">
              <option value={1.75}>1.75mm</option>
              <option value={2.85}>2.85mm</option>
            </select>
          </div>
          <button type="submit" disabled={createMutation.isPending} className="rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
            Add
          </button>
        </div>
        <MoreDetailsToggle>
          <FormField id="add-colour" label="Colour" value={addForm.colour ?? ''} onChange={(e) => setAdd('colour', e.target.value)} />
          <NumberField id="add-costPerSpool" label="Cost per spool" value={addForm.costPerSpool ?? ''} onChange={(raw) => setAddNumber('costPerSpool', raw)} />
          <NumberField id="add-costPerKg" label="Cost per kg" value={addForm.costPerKg ?? ''} onChange={(raw) => setAddNumber('costPerKg', raw)} />
          <NumberField id="add-spoolWeightGrams" label="Spool weight (g)" value={addForm.spoolWeightGrams ?? ''} onChange={(raw) => setAddNumber('spoolWeightGrams', raw)} />
          <NumberField id="add-remainingWeightGrams" label="Remaining weight (g)" value={addForm.remainingWeightGrams ?? ''} onChange={(raw) => setAddNumber('remainingWeightGrams', raw)} />
          <NumberField id="add-lowStockThresholdGrams" label="Low stock threshold (g)" value={addForm.lowStockThresholdGrams ?? ''} onChange={(raw) => setAddNumber('lowStockThresholdGrams', raw)} />
          <FormField id="add-supplier" label="Supplier" value={addForm.supplier ?? ''} onChange={(e) => setAdd('supplier', e.target.value)} />
          <FormField id="add-purchaseDate" label="Purchase date" type="date" value={addForm.purchaseDate ?? ''} onChange={(e) => setAdd('purchaseDate', e.target.value)} />
          <TextareaField id="add-notes" label="Notes" value={addForm.notes ?? ''} onChange={(value) => setAdd('notes', value)} />
        </MoreDetailsToggle>
        {addError && <p className="text-sm text-red-600">{addError}</p>}
      </form>

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
              <InlineEditableRow
                key={filament.id}
                isEditing={editingId === filament.id}
                readOnlyContent={
                  <>
                    <td id={`filament-row-${filament.id}`} className="py-2">{filament.brand}</td>
                    <td className="py-2">{filament.materialType}</td>
                    <td className="py-2">{filament.diameterMm}mm</td>
                    <td className="py-2">{filament.colour || '—'}</td>
                    <td className="py-2 text-right">
                      <button type="button" onClick={() => startEdit(filament)} className="text-slate-600 underline">
                        Edit
                      </button>
                    </td>
                  </>
                }
                editContent={
                  <td colSpan={5} className="py-3">
                    <form onSubmit={handleSaveEdit} className="flex flex-col gap-3">
                      <div className="flex flex-wrap items-end gap-3">
                        <FormField id="edit-brand" label="Brand" value={editForm.brand} onChange={(e) => setEdit('brand', e.target.value)} required />
                        <FormField id="edit-materialType" label="Material type" value={editForm.materialType} onChange={(e) => setEdit('materialType', e.target.value)} required />
                        <div className="flex flex-col gap-1">
                          <label htmlFor="edit-diameterMm" className="text-sm font-medium text-slate-700">Diameter</label>
                          <select id="edit-diameterMm" value={editForm.diameterMm} onChange={(e) => setEdit('diameterMm', Number(e.target.value) as 1.75 | 2.85)} className="rounded border border-slate-300 px-3 py-2 text-sm">
                            <option value={1.75}>1.75mm</option>
                            <option value={2.85}>2.85mm</option>
                          </select>
                        </div>
                      </div>
                      <MoreDetailsToggle>
                        <FormField id="edit-colour" label="Colour" value={editForm.colour ?? ''} onChange={(e) => setEdit('colour', e.target.value)} />
                        <NumberField id="edit-costPerSpool" label="Cost per spool" value={editForm.costPerSpool ?? ''} onChange={(raw) => setEditNumber('costPerSpool', raw)} onClear={() => clearEditNumber('costPerSpool')} />
                        <NumberField id="edit-costPerKg" label="Cost per kg" value={editForm.costPerKg ?? ''} onChange={(raw) => setEditNumber('costPerKg', raw)} onClear={() => clearEditNumber('costPerKg')} />
                        <NumberField id="edit-spoolWeightGrams" label="Spool weight (g)" value={editForm.spoolWeightGrams ?? ''} onChange={(raw) => setEditNumber('spoolWeightGrams', raw)} onClear={() => clearEditNumber('spoolWeightGrams')} />
                        <NumberField id="edit-remainingWeightGrams" label="Remaining weight (g)" value={editForm.remainingWeightGrams ?? ''} onChange={(raw) => setEditNumber('remainingWeightGrams', raw)} onClear={() => clearEditNumber('remainingWeightGrams')} />
                        <NumberField id="edit-lowStockThresholdGrams" label="Low stock threshold (g)" value={editForm.lowStockThresholdGrams ?? ''} onChange={(raw) => setEditNumber('lowStockThresholdGrams', raw)} onClear={() => clearEditNumber('lowStockThresholdGrams')} />
                        <FormField id="edit-supplier" label="Supplier" value={editForm.supplier ?? ''} onChange={(e) => setEdit('supplier', e.target.value)} />
                        <FormField id="edit-purchaseDate" label="Purchase date" type="date" value={editForm.purchaseDate ?? ''} onChange={(e) => setEdit('purchaseDate', e.target.value)} />
                        <TextareaField id="edit-notes" label="Notes" value={editForm.notes ?? ''} onChange={(value) => setEdit('notes', value)} />
                      </MoreDetailsToggle>
                      {editError && <p className="text-sm text-red-600">{editError}</p>}
                      <div className="flex gap-2">
                        <button type="submit" disabled={updateMutation.isPending} className="w-fit rounded bg-slate-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-50">Save</button>
                        <button type="button" onClick={cancelEdit} className="w-fit rounded bg-slate-100 px-3 py-2 text-sm">Cancel</button>
                      </div>
                    </form>
                  </td>
                }
              />
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
```

Note the `Link` import from the original list page is no longer needed (no more `/filaments/new` link) — remove it if unused; the `id="filament-row-..."` on the read-only row's first `<td>` is what the deep-link scroll targets.

- [ ] **Step 6: Delete `FilamentFormPage.tsx`**

```bash
rm platform/frontend/src/pages/filaments/FilamentFormPage.tsx
```

- [ ] **Step 7: Update routing in `App.tsx`**

Remove the `FilamentFormPage` import. Remove the `/filaments/new` route entirely. Change the `/filaments/:id` route's element from `<FilamentFormPage />` to `<FilamentsListPage />` (same component as the bare `/filaments` route).

- [ ] **Step 8: Fix the Materials Library's link**

In `platform/frontend/src/pages/materials/MaterialsLibraryPage.tsx`, change the helper that currently returns `` `/filaments/new?${params.toString()}` `` to return `` `/filaments?${params.toString()}` ``.

- [ ] **Step 9: Update/write Filaments tests**

Run `ls platform/frontend/tests/ | grep -i filament` and `ls platform/frontend/tests/ | grep -i materialslibrary` first to see what exists. Delete `FilamentFormPage.test.tsx` if present. Rewrite `FilamentsListPage.test.tsx` to cover: initial render shows the essentials-only add form with "+ More details" collapsed; filling essentials and submitting calls create and the new row appears; expanding "More details" and filling an optional field includes it in the create payload; clicking a row's Edit shows that row's form pre-filled with its current values and collapses back to read-only on Cancel without calling update; Save calls update and returns to read-only with new values; navigating to `/filaments/:id` (render the router with that initial path) auto-expands the matching row. Update `MaterialsLibraryPage.test.tsx` if it asserts on the old `/filaments/new?...` link text/href.

- [ ] **Step 10: Typecheck and run the full frontend suite**

Run: `npm run typecheck && npm test`
Expected: both clean. This is the proving case — do not proceed to Task 2 until this passes cleanly.

- [ ] **Step 11: Commit**

```bash
git add platform/frontend/src/components/MoreDetailsToggle.tsx platform/frontend/src/components/InlineEditableRow.tsx platform/frontend/tests/MoreDetailsToggle.test.tsx platform/frontend/tests/InlineEditableRow.test.tsx platform/frontend/src/pages/filaments platform/frontend/src/pages/materials/MaterialsLibraryPage.tsx platform/frontend/src/App.tsx platform/frontend/tests/FilamentsListPage.test.tsx platform/frontend/tests/MaterialsLibraryPage.test.tsx
git commit -m "Add inline add/edit pattern (MoreDetailsToggle, InlineEditableRow), apply to Filaments"
```

---

### Task 2: Customers + Consumables

**Files:**
- Modify: `platform/frontend/src/pages/customers/CustomersListPage.tsx`
- Delete: `platform/frontend/src/pages/customers/CustomerFormPage.tsx`
- Modify: `platform/frontend/src/pages/consumables/ConsumablesListPage.tsx`
- Delete: `platform/frontend/src/pages/consumables/ConsumableFormPage.tsx`
- Modify: `platform/frontend/src/App.tsx` (remove both `/new` routes, repoint both `/:id` routes)
- Modify: `platform/frontend/tests/CustomersListPage.test.tsx`, `platform/frontend/tests/ConsumablesListPage.test.tsx`
- Delete the corresponding `*FormPage.test.tsx` files if present (`ls platform/frontend/tests/ | grep -iE "customerform|consumableform"` first)

**Interfaces:**
- Consumes: `MoreDetailsToggle`, `InlineEditableRow` from Task 1 — verbatim, no changes needed to either.
- Consumes: existing `useCustomers`/`useCustomer`/`useCreateCustomer`/`useUpdateCustomer` and `useConsumables`/`useConsumable`/`useCreateConsumable`/`useUpdateConsumable` hooks — unchanged.

Apply the EXACT same transformation as Task 1 Step 5 (merge list+form into one page, add-form state + edit-in-place state + deep-link `useEffect`, `InlineEditableRow` per table row, `MoreDetailsToggle` wrapping optional fields), to these two resources, using their real field split below. Read each resource's current `*ListPage.tsx` and `*FormPage.tsx` in full before rewriting — do not guess field names, labels, or validation quirks (e.g. Customers' `billingAddress` is a `TextareaField` in the current form, not a `FormField`; check before assuming).

**Customers essentials/details split** (from `platform/frontend/src/api/customers.ts`):
- Essentials (required): `name`, `billingAddress`
- Details (optional): `company`, `email`, `phone`, `deliveryAddress`, `vatNumber`, `notes`

**Consumables essentials/details split** (from `platform/frontend/src/api/consumables.ts`):
- Essentials (required): `name`, `category` (select, fixed enum from `CATEGORIES` — count as essentials per the Global Constraints rule for defaulted selects, even though it's a plain required field here, not defaulted), `unitOfMeasure`, `costPerUnit`
- Details (optional): `currentStock`, `reorderThreshold`, `supplier`

- [ ] **Step 1: Merge Customers into one page** (mirror Task 1 Step 5's transformation, using the field split above)
- [ ] **Step 2: Delete `CustomerFormPage.tsx`**
- [ ] **Step 3: Merge Consumables into one page** (mirror Task 1 Step 5's transformation, using the field split above; Consumables' `category` is a `<select>` over `CATEGORIES`, keep it as a select in the essentials row exactly as it is today)
- [ ] **Step 4: Delete `ConsumableFormPage.tsx`**
- [ ] **Step 5: Update routing in `App.tsx`** for both resources (remove `/new` routes, repoint `/:id` routes at the list pages, remove now-unused `FormPage` imports)
- [ ] **Step 6: Update/write tests for both resources**, same coverage shape as Task 1 Step 9 (essentials-only add, add with details expanded, edit-in-place save/cancel, deep-link auto-expand), adapted to each resource's own fields
- [ ] **Step 7: Typecheck and run the full frontend suite**

Run: `npm run typecheck && npm test`
Expected: both clean.

- [ ] **Step 8: Commit**

```bash
git add platform/frontend/src/pages/customers platform/frontend/src/pages/consumables platform/frontend/src/App.tsx platform/frontend/tests/CustomersListPage.test.tsx platform/frontend/tests/ConsumablesListPage.test.tsx
git commit -m "Apply inline add/edit pattern to Customers and Consumables"
```

---

### Task 3: Labour Steps, Scanners, Laser Materials, Premade Items, Products

**Files:**
- Modify + delete FormPage, for each of: `labourSteps/`, `scanners/`, `laserMaterials/`, `premadeItems/`, `products/`
- Modify: `platform/frontend/src/App.tsx` (remove 5 `/new` routes, repoint 5 `/:id` routes)
- Modify: the 5 corresponding `*ListPage.test.tsx` files; delete the 5 `*FormPage.test.tsx` files if present

**Interfaces:**
- Consumes: `MoreDetailsToggle`, `InlineEditableRow` from Task 1 — verbatim.
- Consumes: each resource's existing hooks (`useLabourSteps`/etc.) — unchanged.

These five are the simplest cases — each has 4 or fewer fields total, so most (or all) end up in the essentials row with little or nothing behind `MoreDetailsToggle`. Apply the same transformation as Task 1 Step 5, using the field splits below. Read each resource's current `*FormPage.tsx` in full before rewriting — Labour Steps' `active` field is a `Checkbox`, not a text/number field; check `platform/frontend/src/components/Checkbox.tsx`'s props before wiring it into both the add and edit forms.

**Labour Steps** (from `platform/frontend/src/api/labourSteps.ts`):
- Essentials (required): `name`, `hourlyRate`
- Details (optional): `active` (Checkbox, defaults `true`) — per the Global Constraints rule this is a plain optional field, not a defaulted-select, so it goes behind the toggle even though it's cheap to render. On the ADD form specifically, most new labour steps should default to active — keep `emptyForm`'s `active: true` default as today, just relocate the checkbox behind `MoreDetailsToggle` rather than removing the default.

**Scanners** (from `platform/frontend/src/api/scanners.ts`):
- Essentials (required): `name`, `scannerCost`, `expectedScanHours`
- Details (optional): `powerCostPerHour`

**Laser Materials** (from `platform/frontend/src/api/laserMaterials.ts` — confirmed by reading the full file, not the earlier incomplete grep):
- Essentials (required): `name`, `sheetPrice`, `sheetAreaM2`, `usableSheetAreaM2`
- Details (optional): `costMultiplier`

**Premade Items** (from `platform/frontend/src/api/premadeItems.ts`):
- Essentials (required): `name`, `unitCost`
- Details (optional): `costMultiplier`

**Products** (from `platform/frontend/src/api/products.ts`):
- Essentials (required): `name`, `cost`, `sellingPrice`
- Details (optional): `category`

- [ ] **Step 1: Merge Labour Steps into one page, delete its FormPage**
- [ ] **Step 2: Merge Scanners into one page, delete its FormPage** (carry over its existing Delete button into the read-only row content, unchanged)
- [ ] **Step 3: Merge Laser Materials into one page, delete its FormPage** (carry over Delete unchanged)
- [ ] **Step 4: Merge Premade Items into one page, delete its FormPage** (carry over Delete unchanged)
- [ ] **Step 5: Merge Products into one page, delete its FormPage** (carry over Delete unchanged)
- [ ] **Step 6: Update routing in `App.tsx`** for all five resources
- [ ] **Step 7: Update/write tests for all five resources**, same coverage shape as Task 1 Step 9 — for these five, explicitly assert that `MoreDetailsToggle` renders no toggle button at all when a resource has zero remaining optional fields after essentials are accounted for (check each field split above — none of these five actually hits zero optional fields, so every one of them DOES get a toggle; if a future edit to a resource's schema removes its last optional field, this test is what catches the toggle becoming a dead one-item control worth simplifying away, per the design spec's explicit call-out of this regression risk)
- [ ] **Step 8: Typecheck and run the full frontend suite**

Run: `npm run typecheck && npm test`
Expected: both clean.

- [ ] **Step 9: Commit**

```bash
git add platform/frontend/src/pages/labourSteps platform/frontend/src/pages/scanners platform/frontend/src/pages/laserMaterials platform/frontend/src/pages/premadeItems platform/frontend/src/pages/products platform/frontend/src/App.tsx platform/frontend/tests/LabourStepsListPage.test.tsx platform/frontend/tests/ScannersListPage.test.tsx platform/frontend/tests/LaserMaterialsListPage.test.tsx platform/frontend/tests/PremadeItemsListPage.test.tsx platform/frontend/tests/ProductsListPage.test.tsx
git commit -m "Apply inline add/edit pattern to Labour Steps, Scanners, Laser Materials, Premade Items, Products"
```

---

### Task 4: Printers (has nested sub-resources)

**Files:**
- Modify: `platform/frontend/src/pages/printers/PrintersListPage.tsx`
- Delete: `platform/frontend/src/pages/printers/PrinterFormPage.tsx`
- Modify: `platform/frontend/src/App.tsx` (remove `/printers/new`, repoint `/printers/:id`)
- Modify: `platform/frontend/tests/PrintersListPage.test.tsx`; delete `PrinterFormPage.test.tsx` if present

**Interfaces:**
- Consumes: `MoreDetailsToggle`, `InlineEditableRow` from Task 1 — verbatim.
- Consumes: existing `usePrinters`/`usePrinter`/`useCreatePrinter`/`useUpdatePrinter` hooks, and the existing `PresetsSection`/`MaintenanceLogSection` components (`platform/frontend/src/components/printers/`) — unchanged.

**Printers essentials/details split** (from `platform/frontend/src/api/printers.ts` and the current `PrinterFormPage.tsx`):
- Essentials (required-with-default selects, per the Global Constraints rule): `name`, `status` (defaults `'active'`), `process` (defaults `'fdm'`)
- Details (optional): `make`, `model`, `buildVolumeXMm`, `buildVolumeYMm`, `buildVolumeZMm`, `purchaseDate`, `purchaseCost`, `powerDrawWatts`, `electricityRatePerKwh`, `expectedLifetimeHours`

**The one real difference from every other resource in this plan**: `PresetsSection` and `MaintenanceLogSection` only make sense once the printer already exists (they manage sub-resources keyed by printer id) — they cannot appear in the ADD form at all (there's no printer id yet), only in the EDIT expansion. Read the current `PrinterFormPage.tsx` in full to see exactly how it conditionally renders these two sections in edit mode today (`{isEditMode && <PresetsSection printerId={id} />}` or similar) and carry that same conditional into the edit-in-place expansion — it renders below the `MoreDetailsToggle` block, always expanded (not itself collapsible), since managing presets/maintenance logs is the actual point of opening a printer for edit, not an optional detail to hide.

- [ ] **Step 1: Merge Printers into one page** (mirror Task 1 Step 5's transformation for the essentials/details/edit-in-place shape; additionally render `PresetsSection`/`MaintenanceLogSection` inside the edit expansion only, exactly as the current `PrinterFormPage.tsx` does in its edit mode)
- [ ] **Step 2: Delete `PrinterFormPage.tsx`**
- [ ] **Step 3: Update routing in `App.tsx`**
- [ ] **Step 4: Update/write tests**, same coverage shape as Task 1 Step 9, plus: editing a printer shows `PresetsSection` and `MaintenanceLogSection` inside the expanded row; the ADD form never renders either section.
- [ ] **Step 5: Typecheck and run the full frontend suite**

Run: `npm run typecheck && npm test`
Expected: both clean.

- [ ] **Step 6: Commit**

```bash
git add platform/frontend/src/pages/printers platform/frontend/src/App.tsx platform/frontend/tests/PrintersListPage.test.tsx
git commit -m "Apply inline add/edit pattern to Printers (with nested presets/maintenance-log sections)"
```
