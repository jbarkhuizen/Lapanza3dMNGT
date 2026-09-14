import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useParams } from 'react-router-dom';
import { FormField } from '../../components/FormField.js';
import { NumberField } from '../../components/NumberField.js';
import { MoreDetailsToggle } from '../../components/MoreDetailsToggle.js';
import { InlineEditableRow } from '../../components/InlineEditableRow.js';
import { ApiError } from '../../api/client.js';
import {
  useConsumables,
  useConsumable,
  useCreateConsumable,
  useUpdateConsumable,
  CONSUMABLE_CATEGORIES,
  type Consumable,
  type ConsumableFormInput,
} from '../../api/consumables.js';

// `costPerUnit` is required by the real API contract (`ConsumableFormInput`), but the form
// needs to represent "cleared, mid-edit" as `undefined` rather than coercing to `0` —
// otherwise clearing the field silently produces a real, meaningful cost. `required`
// on the input then genuinely blocks submitting while it's `undefined`.
type ConsumableFormState = Omit<ConsumableFormInput, 'costPerUnit'> & { costPerUnit: number | undefined };

const emptyForm: ConsumableFormState = {
  name: '',
  category: CONSUMABLE_CATEGORIES[0],
  unitOfMeasure: '',
  costPerUnit: undefined,
  currentStock: undefined,
  reorderThreshold: undefined,
  supplier: '',
};

// The real zod schema in `platform/api/src/routes/consumables.ts` has no `.refine()`,
// `.email()`, or other stricter-than-plain-`.optional()` validation on any field —
// every optional field there is a bare `z.string().optional()` or `z.number().optional()`,
// which accepts ''/undefined fine. So no field needs `omitBlankFields` treatment here.

type NumericConsumableField = 'currentStock' | 'reorderThreshold';

export function ConsumablesListPage() {
  const { id: deepLinkedId } = useParams();
  const { data: consumables, isLoading, isError } = useConsumables();

  // ---- Add form state (essentials always visible + More details) ----
  const [addForm, setAddForm] = useState<ConsumableFormState>(emptyForm);
  const [addError, setAddError] = useState<string | null>(null);
  const createMutation = useCreateConsumable();

  function setAdd<K extends keyof ConsumableFormState>(key: K, value: ConsumableFormState[K]) {
    setAddForm((prev) => ({ ...prev, [key]: value }));
  }
  function setAddNumber(key: NumericConsumableField, raw: string) {
    setAdd(key, raw ? Number(raw) : undefined);
  }

  async function handleAdd(e: FormEvent) {
    e.preventDefault();
    setAddError(null);
    try {
      // `name`, `unitOfMeasure`, `category`, and `costPerUnit` are required and `costPerUnit`
      // is guaranteed non-undefined here because the input's `required` attribute blocks
      // submitting the form while it's blank — safe to assert back to the full input type
      // for the create endpoint, which (unlike update) doesn't accept a partial payload.
      await createMutation.mutateAsync(addForm as ConsumableFormInput);
      setAddForm(emptyForm);
    } catch (err) {
      setAddError(err instanceof ApiError ? err.message : 'Something went wrong. Try again shortly.');
    }
  }

  // ---- Edit-in-place state ----
  const [editingId, setEditingId] = useState<string | null>(deepLinkedId ?? null);
  const [editForm, setEditForm] = useState<ConsumableFormState>(emptyForm);
  const [editError, setEditError] = useState<string | null>(null);
  const updateMutation = useUpdateConsumable(editingId ?? '');
  const { data: deepLinkedConsumable } = useConsumable(deepLinkedId);
  const populatedForIdRef = useRef<string | undefined>(undefined);

  function startEdit(consumable: Consumable) {
    setEditingId(consumable.id);
    setEditError(null);
    setEditForm({
      name: consumable.name,
      category: consumable.category,
      unitOfMeasure: consumable.unitOfMeasure,
      costPerUnit: consumable.costPerUnit,
      currentStock: consumable.currentStock ?? undefined,
      reorderThreshold: consumable.reorderThreshold ?? undefined,
      supplier: consumable.supplier ?? '',
    });
  }

  // Deep-link support: /consumables/:id auto-expands that row once its data has loaded.
  useEffect(() => {
    if (deepLinkedId && deepLinkedConsumable && populatedForIdRef.current !== deepLinkedId) {
      populatedForIdRef.current = deepLinkedId;
      startEdit(deepLinkedConsumable);
      document.getElementById(`consumable-row-${deepLinkedId}`)?.scrollIntoView({ block: 'center' });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deepLinkedId, deepLinkedConsumable]);

  function setEdit<K extends keyof ConsumableFormState>(key: K, value: ConsumableFormState[K]) {
    setEditForm((prev) => ({ ...prev, [key]: value }));
  }
  function setEditNumber(key: NumericConsumableField, raw: string) {
    setEdit(key, raw ? Number(raw) : undefined);
  }
  // Explicit "clear" affordance for reorderThreshold (edit mode only): sends `null`,
  // which -- unlike `undefined` -- survives JSON.stringify and tells the PATCH endpoint
  // to actually clear the stored value instead of leaving it untouched. `currentStock`
  // has no equivalent: it's a non-nullable column with a DB default, so there's nothing
  // to clear it to.
  function clearEditReorderThreshold() {
    setEdit('reorderThreshold', null);
  }

  async function handleSaveEdit(e: FormEvent) {
    e.preventDefault();
    setEditError(null);
    try {
      await updateMutation.mutateAsync(editForm);
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
      <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">Consumables</h1>

      <form onSubmit={handleAdd} className="flex flex-col gap-3 rounded border border-slate-200 p-4 dark:border-slate-700">
        <div className="flex flex-wrap items-end gap-3">
          <FormField id="add-name" label="Name" value={addForm.name} onChange={(e) => setAdd('name', e.target.value)} required />
          <div className="flex flex-col gap-1">
            <label htmlFor="add-category" className="text-sm font-medium text-slate-700 dark:text-slate-300">
              Category
            </label>
            <select
              id="add-category"
              value={addForm.category}
              onChange={(e) => setAdd('category', e.target.value as ConsumableFormInput['category'])}
              className="rounded border border-slate-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
            >
              {CONSUMABLE_CATEGORIES.map((category) => (
                <option key={category} value={category}>
                  {category}
                </option>
              ))}
            </select>
          </div>
          <FormField
            id="add-unitOfMeasure"
            label="Unit of measure"
            value={addForm.unitOfMeasure}
            onChange={(e) => setAdd('unitOfMeasure', e.target.value)}
            required
          />
          <FormField
            id="add-costPerUnit"
            label="Cost per unit"
            type="number"
            value={addForm.costPerUnit ?? ''}
            onChange={(e) => setAdd('costPerUnit', e.target.value ? Number(e.target.value) : undefined)}
            required
          />
          <button
            type="submit"
            disabled={createMutation.isPending}
            className="rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-slate-100 dark:text-slate-900"
          >
            Add
          </button>
        </div>
        <MoreDetailsToggle>
          <FormField
            id="add-currentStock"
            label="Current stock"
            type="number"
            value={addForm.currentStock ?? ''}
            onChange={(e) => setAddNumber('currentStock', e.target.value)}
          />
          <NumberField
            id="add-reorderThreshold"
            label="Reorder threshold"
            value={addForm.reorderThreshold ?? ''}
            onChange={(raw) => setAddNumber('reorderThreshold', raw)}
          />
          <FormField id="add-supplier" label="Supplier" value={addForm.supplier ?? ''} onChange={(e) => setAdd('supplier', e.target.value)} />
        </MoreDetailsToggle>
        {addError && <p className="text-sm text-red-600 dark:text-red-400">{addError}</p>}
      </form>

      {isLoading && <p className="text-slate-500 dark:text-slate-400">Loading…</p>}
      {isError && <p className="text-red-600 dark:text-red-400">Couldn't load consumables. Try refreshing the page.</p>}
      {!isLoading && !isError && consumables?.length === 0 && <p className="text-slate-500 dark:text-slate-400">No consumables yet.</p>}
      {!isLoading && !isError && consumables && consumables.length > 0 && (
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-slate-500 dark:border-slate-700 dark:text-slate-400">
              <th className="py-2">Name</th>
              <th className="py-2">Category</th>
              <th className="py-2">Unit</th>
              <th className="py-2">Cost per unit</th>
              <th className="py-2">Current stock</th>
              <th className="py-2"></th>
            </tr>
          </thead>
          <tbody>
            {consumables.map((consumable) => (
              <InlineEditableRow
                key={consumable.id}
                isEditing={editingId === consumable.id}
                readOnlyContent={
                  <>
                    <td id={`consumable-row-${consumable.id}`} className="py-2">
                      {consumable.name}
                    </td>
                    <td className="py-2">{consumable.category}</td>
                    <td className="py-2">{consumable.unitOfMeasure}</td>
                    <td className="py-2">{consumable.costPerUnit}</td>
                    <td className="py-2">{consumable.currentStock}</td>
                    <td className="py-2 text-right">
                      <button type="button" onClick={() => startEdit(consumable)} className="text-slate-600 underline dark:text-slate-400">
                        Edit
                      </button>
                    </td>
                  </>
                }
                editContent={
                  <td colSpan={6} className="py-3">
                    <form onSubmit={handleSaveEdit} className="flex flex-col gap-3">
                      <div className="flex flex-wrap items-end gap-3">
                        <FormField id="edit-name" label="Name" value={editForm.name} onChange={(e) => setEdit('name', e.target.value)} required />
                        <div className="flex flex-col gap-1">
                          <label htmlFor="edit-category" className="text-sm font-medium text-slate-700 dark:text-slate-300">
                            Category
                          </label>
                          <select
                            id="edit-category"
                            value={editForm.category}
                            onChange={(e) => setEdit('category', e.target.value as ConsumableFormInput['category'])}
                            className="rounded border border-slate-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
                          >
                            {CONSUMABLE_CATEGORIES.map((category) => (
                              <option key={category} value={category}>
                                {category}
                              </option>
                            ))}
                          </select>
                        </div>
                        <FormField
                          id="edit-unitOfMeasure"
                          label="Unit of measure"
                          value={editForm.unitOfMeasure}
                          onChange={(e) => setEdit('unitOfMeasure', e.target.value)}
                          required
                        />
                        <FormField
                          id="edit-costPerUnit"
                          label="Cost per unit"
                          type="number"
                          value={editForm.costPerUnit ?? ''}
                          onChange={(e) => setEdit('costPerUnit', e.target.value ? Number(e.target.value) : undefined)}
                          required
                        />
                      </div>
                      <MoreDetailsToggle>
                        <FormField
                          id="edit-currentStock"
                          label="Current stock"
                          type="number"
                          value={editForm.currentStock ?? ''}
                          onChange={(e) => setEditNumber('currentStock', e.target.value)}
                        />
                        <NumberField
                          id="edit-reorderThreshold"
                          label="Reorder threshold"
                          value={editForm.reorderThreshold ?? ''}
                          onChange={(raw) => setEditNumber('reorderThreshold', raw)}
                          onClear={clearEditReorderThreshold}
                        />
                        <FormField id="edit-supplier" label="Supplier" value={editForm.supplier ?? ''} onChange={(e) => setEdit('supplier', e.target.value)} />
                      </MoreDetailsToggle>
                      {editError && <p className="text-sm text-red-600 dark:text-red-400">{editError}</p>}
                      <div className="flex gap-2">
                        <button
                          type="submit"
                          disabled={updateMutation.isPending}
                          className="w-fit rounded bg-slate-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-slate-100 dark:text-slate-900"
                        >
                          Save
                        </button>
                        <button type="button" onClick={cancelEdit} className="w-fit rounded bg-slate-100 px-3 py-2 text-sm dark:bg-slate-700 dark:text-slate-100">
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
