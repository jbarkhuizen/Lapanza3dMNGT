import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
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

// `purchaseDate` is the only field on the filaments route with stricter-than-plain-optional
// validation (a date-parse refine that rejects ''). Every other optional string field
// accepts '' fine and is sent as-is, so a user can actually clear it.
const OMIT_WHEN_BLANK: (keyof FilamentFormInput)[] = ['purchaseDate'];

type NumericFilamentField =
  | 'costPerSpool'
  | 'costPerKg'
  | 'spoolWeightGrams'
  | 'remainingWeightGrams'
  | 'lowStockThresholdGrams';

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
      // `brand`, `materialType`, and `diameterMm` are required and never in the omit list,
      // so they're always present on the result — safe to assert back to the full input
      // type for the create endpoint, which (unlike update) doesn't accept a partial payload.
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
      brand: filament.brand,
      materialType: filament.materialType,
      diameterMm: filament.diameterMm as 1.75 | 2.85,
      colour: filament.colour ?? '',
      costPerSpool: filament.costPerSpool ?? undefined,
      costPerKg: filament.costPerKg ?? undefined,
      spoolWeightGrams: filament.spoolWeightGrams ?? undefined,
      remainingWeightGrams: filament.remainingWeightGrams ?? undefined,
      supplier: filament.supplier ?? '',
      purchaseDate: filament.purchaseDate?.slice(0, 10) ?? '',
      notes: filament.notes ?? '',
      lowStockThresholdGrams: filament.lowStockThresholdGrams ?? undefined,
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
  // Explicit "clear" affordance for optional numeric fields (edit mode only):
  // sends `null`, which -- unlike `undefined` -- survives JSON.stringify and
  // tells the PATCH endpoint to actually clear the stored value instead of
  // leaving it untouched.
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
          <FormField
            id="add-materialType"
            label="Material type"
            value={addForm.materialType}
            onChange={(e) => setAdd('materialType', e.target.value)}
            required
          />
          <div className="flex flex-col gap-1">
            <label htmlFor="add-diameterMm" className="text-sm font-medium text-slate-700">
              Diameter
            </label>
            <select
              id="add-diameterMm"
              value={addForm.diameterMm}
              onChange={(e) => setAdd('diameterMm', Number(e.target.value) as 1.75 | 2.85)}
              className="rounded border border-slate-300 px-3 py-2 text-sm"
            >
              <option value={1.75}>1.75mm</option>
              <option value={2.85}>2.85mm</option>
            </select>
          </div>
          <button
            type="submit"
            disabled={createMutation.isPending}
            className="rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            Add
          </button>
        </div>
        <MoreDetailsToggle>
          <FormField id="add-colour" label="Colour" value={addForm.colour ?? ''} onChange={(e) => setAdd('colour', e.target.value)} />
          <NumberField
            id="add-costPerSpool"
            label="Cost per spool"
            value={addForm.costPerSpool ?? ''}
            onChange={(raw) => setAddNumber('costPerSpool', raw)}
          />
          <NumberField
            id="add-costPerKg"
            label="Cost per kg"
            value={addForm.costPerKg ?? ''}
            onChange={(raw) => setAddNumber('costPerKg', raw)}
          />
          <NumberField
            id="add-spoolWeightGrams"
            label="Spool weight (g)"
            value={addForm.spoolWeightGrams ?? ''}
            onChange={(raw) => setAddNumber('spoolWeightGrams', raw)}
          />
          <NumberField
            id="add-remainingWeightGrams"
            label="Remaining weight (g)"
            value={addForm.remainingWeightGrams ?? ''}
            onChange={(raw) => setAddNumber('remainingWeightGrams', raw)}
          />
          <NumberField
            id="add-lowStockThresholdGrams"
            label="Low stock threshold (g)"
            value={addForm.lowStockThresholdGrams ?? ''}
            onChange={(raw) => setAddNumber('lowStockThresholdGrams', raw)}
          />
          <FormField id="add-supplier" label="Supplier" value={addForm.supplier ?? ''} onChange={(e) => setAdd('supplier', e.target.value)} />
          <FormField
            id="add-purchaseDate"
            label="Purchase date"
            type="date"
            value={addForm.purchaseDate ?? ''}
            onChange={(e) => setAdd('purchaseDate', e.target.value)}
          />
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
                    <td id={`filament-row-${filament.id}`} className="py-2">
                      {filament.brand}
                    </td>
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
                        <FormField
                          id="edit-materialType"
                          label="Material type"
                          value={editForm.materialType}
                          onChange={(e) => setEdit('materialType', e.target.value)}
                          required
                        />
                        <div className="flex flex-col gap-1">
                          <label htmlFor="edit-diameterMm" className="text-sm font-medium text-slate-700">
                            Diameter
                          </label>
                          <select
                            id="edit-diameterMm"
                            value={editForm.diameterMm}
                            onChange={(e) => setEdit('diameterMm', Number(e.target.value) as 1.75 | 2.85)}
                            className="rounded border border-slate-300 px-3 py-2 text-sm"
                          >
                            <option value={1.75}>1.75mm</option>
                            <option value={2.85}>2.85mm</option>
                          </select>
                        </div>
                      </div>
                      <MoreDetailsToggle>
                        <FormField id="edit-colour" label="Colour" value={editForm.colour ?? ''} onChange={(e) => setEdit('colour', e.target.value)} />
                        <NumberField
                          id="edit-costPerSpool"
                          label="Cost per spool"
                          value={editForm.costPerSpool ?? ''}
                          onChange={(raw) => setEditNumber('costPerSpool', raw)}
                          onClear={() => clearEditNumber('costPerSpool')}
                        />
                        <NumberField
                          id="edit-costPerKg"
                          label="Cost per kg"
                          value={editForm.costPerKg ?? ''}
                          onChange={(raw) => setEditNumber('costPerKg', raw)}
                          onClear={() => clearEditNumber('costPerKg')}
                        />
                        <NumberField
                          id="edit-spoolWeightGrams"
                          label="Spool weight (g)"
                          value={editForm.spoolWeightGrams ?? ''}
                          onChange={(raw) => setEditNumber('spoolWeightGrams', raw)}
                          onClear={() => clearEditNumber('spoolWeightGrams')}
                        />
                        <NumberField
                          id="edit-remainingWeightGrams"
                          label="Remaining weight (g)"
                          value={editForm.remainingWeightGrams ?? ''}
                          onChange={(raw) => setEditNumber('remainingWeightGrams', raw)}
                          onClear={() => clearEditNumber('remainingWeightGrams')}
                        />
                        <NumberField
                          id="edit-lowStockThresholdGrams"
                          label="Low stock threshold (g)"
                          value={editForm.lowStockThresholdGrams ?? ''}
                          onChange={(raw) => setEditNumber('lowStockThresholdGrams', raw)}
                          onClear={() => clearEditNumber('lowStockThresholdGrams')}
                        />
                        <FormField id="edit-supplier" label="Supplier" value={editForm.supplier ?? ''} onChange={(e) => setEdit('supplier', e.target.value)} />
                        <FormField
                          id="edit-purchaseDate"
                          label="Purchase date"
                          type="date"
                          value={editForm.purchaseDate ?? ''}
                          onChange={(e) => setEdit('purchaseDate', e.target.value)}
                        />
                        <TextareaField id="edit-notes" label="Notes" value={editForm.notes ?? ''} onChange={(value) => setEdit('notes', value)} />
                      </MoreDetailsToggle>
                      {editError && <p className="text-sm text-red-600">{editError}</p>}
                      <div className="flex gap-2">
                        <button
                          type="submit"
                          disabled={updateMutation.isPending}
                          className="w-fit rounded bg-slate-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
                        >
                          Save
                        </button>
                        <button type="button" onClick={cancelEdit} className="w-fit rounded bg-slate-100 px-3 py-2 text-sm">
                          Cancel
                        </button>
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
