import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useParams } from 'react-router-dom';
import { FormField } from '../../components/FormField.js';
import { NumberField } from '../../components/NumberField.js';
import { MoreDetailsToggle } from '../../components/MoreDetailsToggle.js';
import { InlineEditableRow } from '../../components/InlineEditableRow.js';
import { ApiError } from '../../api/client.js';
import {
  usePremadeItems,
  usePremadeItem,
  useCreatePremadeItem,
  useUpdatePremadeItem,
  useDeletePremadeItem,
  type PremadeItem,
  type PremadeItemFormInput,
} from '../../api/premadeItems.js';

type PremadeItemFormState = Omit<PremadeItemFormInput, 'unitCost'> & { unitCost: number | undefined };

const emptyForm: PremadeItemFormState = { name: '', unitCost: undefined, costMultiplier: undefined };

export function PremadeItemsListPage() {
  const { id: deepLinkedId } = useParams();
  const { data: premadeItems, isLoading, isError } = usePremadeItems();
  const deleteMutation = useDeletePremadeItem();

  function handleDelete(id: string) {
    if (window.confirm('Delete this premade item? This cannot be undone.')) {
      deleteMutation.mutate(id);
    }
  }

  // ---- Add form state (essentials always visible + More details) ----
  const [addForm, setAddForm] = useState<PremadeItemFormState>(emptyForm);
  const [addError, setAddError] = useState<string | null>(null);
  const createMutation = useCreatePremadeItem();

  function setAdd<K extends keyof PremadeItemFormState>(key: K, value: PremadeItemFormState[K]) {
    setAddForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleAdd(e: FormEvent) {
    e.preventDefault();
    setAddError(null);
    try {
      // `name` and `unitCost` are required and `unitCost` is guaranteed non-undefined here
      // because the input's `required` attribute blocks submitting while it's blank -- safe
      // to assert back to the full input type for create.
      await createMutation.mutateAsync(addForm as PremadeItemFormInput);
      setAddForm(emptyForm);
    } catch (err) {
      setAddError(err instanceof ApiError ? err.message : 'Something went wrong. Try again shortly.');
    }
  }

  // ---- Edit-in-place state ----
  const [editingId, setEditingId] = useState<string | null>(deepLinkedId ?? null);
  const [editForm, setEditForm] = useState<PremadeItemFormState>(emptyForm);
  const [editError, setEditError] = useState<string | null>(null);
  const updateMutation = useUpdatePremadeItem(editingId ?? '');
  const { data: deepLinkedPremadeItem } = usePremadeItem(deepLinkedId);
  const populatedForIdRef = useRef<string | undefined>(undefined);

  function startEdit(premadeItem: PremadeItem) {
    setEditingId(premadeItem.id);
    setEditError(null);
    setEditForm({
      name: premadeItem.name,
      unitCost: premadeItem.unitCost,
      costMultiplier: premadeItem.costMultiplier,
    });
  }

  // Deep-link support: /premade-items/:id auto-expands that row once its data has loaded.
  useEffect(() => {
    if (deepLinkedId && deepLinkedPremadeItem && populatedForIdRef.current !== deepLinkedId) {
      populatedForIdRef.current = deepLinkedId;
      startEdit(deepLinkedPremadeItem);
      document.getElementById(`premade-item-row-${deepLinkedId}`)?.scrollIntoView({ block: 'center' });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deepLinkedId, deepLinkedPremadeItem]);

  function setEdit<K extends keyof PremadeItemFormState>(key: K, value: PremadeItemFormState[K]) {
    setEditForm((prev) => ({ ...prev, [key]: value }));
  }
  function setEditCostMultiplier(raw: string) {
    setEdit('costMultiplier', raw ? Number(raw) : undefined);
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
      <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">Pre-made Items</h1>

      <form onSubmit={handleAdd} className="flex flex-col gap-3 rounded border border-slate-200 p-4 dark:border-slate-700">
        <div className="flex flex-wrap items-end gap-3">
          <FormField id="add-name" label="Name" value={addForm.name} onChange={(e) => setAdd('name', e.target.value)} required />
          <FormField
            id="add-unitCost"
            label="Unit cost"
            type="number"
            value={addForm.unitCost ?? ''}
            onChange={(e) => setAdd('unitCost', e.target.value ? Number(e.target.value) : undefined)}
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
          <NumberField
            id="add-costMultiplier"
            label="Cost multiplier"
            value={addForm.costMultiplier ?? ''}
            onChange={(raw) => setAdd('costMultiplier', raw ? Number(raw) : undefined)}
          />
        </MoreDetailsToggle>
        {addError && <p className="text-sm text-red-600 dark:text-red-400">{addError}</p>}
      </form>

      {isLoading && <p className="text-slate-500 dark:text-slate-400">Loading…</p>}
      {isError && <p className="text-red-600 dark:text-red-400">Couldn't load premade items. Try refreshing the page.</p>}
      {!isLoading && !isError && premadeItems?.length === 0 && <p className="text-slate-500 dark:text-slate-400">No premade items yet.</p>}
      {!isLoading && !isError && premadeItems && premadeItems.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-slate-500 dark:border-slate-700 dark:text-slate-400">
              <th className="py-2">Name</th>
              <th className="py-2">Unit cost</th>
              <th className="py-2">Multiplier</th>
              <th className="py-2"></th>
            </tr>
          </thead>
          <tbody>
            {premadeItems.map((premadeItem) => (
              <InlineEditableRow
                key={premadeItem.id}
                isEditing={editingId === premadeItem.id}
                readOnlyContent={
                  <>
                    <td id={`premade-item-row-${premadeItem.id}`} className="py-2">
                      {premadeItem.name}
                    </td>
                    <td className="py-2">{premadeItem.unitCost}</td>
                    <td className="py-2">{premadeItem.costMultiplier}</td>
                    <td className="py-2 text-right">
                      <button type="button" onClick={() => startEdit(premadeItem)} className="text-slate-600 underline dark:text-slate-400">
                        Edit
                      </button>{' '}
                      <button type="button" onClick={() => handleDelete(premadeItem.id)} className="text-red-600 underline dark:text-red-400">
                        Delete
                      </button>
                    </td>
                  </>
                }
                editContent={
                  <td colSpan={4} className="py-3">
                    <form onSubmit={handleSaveEdit} className="flex flex-col gap-3">
                      <div className="flex flex-wrap items-end gap-3">
                        <FormField id="edit-name" label="Name" value={editForm.name} onChange={(e) => setEdit('name', e.target.value)} required />
                        <FormField
                          id="edit-unitCost"
                          label="Unit cost"
                          type="number"
                          value={editForm.unitCost ?? ''}
                          onChange={(e) => setEdit('unitCost', e.target.value ? Number(e.target.value) : undefined)}
                          required
                        />
                      </div>
                      <MoreDetailsToggle>
                        <NumberField
                          id="edit-costMultiplier"
                          label="Cost multiplier"
                          value={editForm.costMultiplier ?? ''}
                          onChange={setEditCostMultiplier}
                        />
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
        </div>
      )}
    </div>
  );
}
