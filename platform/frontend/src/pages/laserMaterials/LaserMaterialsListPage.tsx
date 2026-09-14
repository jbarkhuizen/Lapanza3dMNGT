import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useParams } from 'react-router-dom';
import { FormField } from '../../components/FormField.js';
import { NumberField } from '../../components/NumberField.js';
import { MoreDetailsToggle } from '../../components/MoreDetailsToggle.js';
import { InlineEditableRow } from '../../components/InlineEditableRow.js';
import { ApiError } from '../../api/client.js';
import {
  useLaserMaterials,
  useLaserMaterial,
  useCreateLaserMaterial,
  useUpdateLaserMaterial,
  useDeleteLaserMaterial,
  type LaserMaterial,
  type LaserMaterialFormInput,
} from '../../api/laserMaterials.js';

type LaserMaterialFormState = Omit<LaserMaterialFormInput, 'sheetPrice' | 'sheetAreaM2' | 'usableSheetAreaM2'> & {
  sheetPrice: number | undefined;
  sheetAreaM2: number | undefined;
  usableSheetAreaM2: number | undefined;
};

const emptyForm: LaserMaterialFormState = {
  name: '',
  sheetPrice: undefined,
  sheetAreaM2: undefined,
  usableSheetAreaM2: undefined,
  costMultiplier: undefined,
};

export function LaserMaterialsListPage() {
  const { id: deepLinkedId } = useParams();
  const { data: laserMaterials, isLoading, isError } = useLaserMaterials();
  const deleteMutation = useDeleteLaserMaterial();

  function handleDelete(id: string) {
    if (window.confirm('Delete this laser material? This cannot be undone.')) {
      deleteMutation.mutate(id);
    }
  }

  // ---- Add form state (essentials always visible + More details) ----
  const [addForm, setAddForm] = useState<LaserMaterialFormState>(emptyForm);
  const [addError, setAddError] = useState<string | null>(null);
  const createMutation = useCreateLaserMaterial();

  function setAdd<K extends keyof LaserMaterialFormState>(key: K, value: LaserMaterialFormState[K]) {
    setAddForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleAdd(e: FormEvent) {
    e.preventDefault();
    setAddError(null);
    try {
      // `name`, `sheetPrice`, `sheetAreaM2`, and `usableSheetAreaM2` are required and
      // guaranteed non-undefined here because the inputs' `required` attribute blocks
      // submitting while blank -- safe to assert back to the full input type for create.
      await createMutation.mutateAsync(addForm as LaserMaterialFormInput);
      setAddForm(emptyForm);
    } catch (err) {
      setAddError(err instanceof ApiError ? err.message : 'Something went wrong. Try again shortly.');
    }
  }

  // ---- Edit-in-place state ----
  const [editingId, setEditingId] = useState<string | null>(deepLinkedId ?? null);
  const [editForm, setEditForm] = useState<LaserMaterialFormState>(emptyForm);
  const [editError, setEditError] = useState<string | null>(null);
  const updateMutation = useUpdateLaserMaterial(editingId ?? '');
  const { data: deepLinkedLaserMaterial } = useLaserMaterial(deepLinkedId);
  const populatedForIdRef = useRef<string | undefined>(undefined);

  function startEdit(laserMaterial: LaserMaterial) {
    setEditingId(laserMaterial.id);
    setEditError(null);
    setEditForm({
      name: laserMaterial.name,
      sheetPrice: laserMaterial.sheetPrice,
      sheetAreaM2: laserMaterial.sheetAreaM2,
      usableSheetAreaM2: laserMaterial.usableSheetAreaM2,
      costMultiplier: laserMaterial.costMultiplier,
    });
  }

  // Deep-link support: /laser-materials/:id auto-expands that row once its data has loaded.
  useEffect(() => {
    if (deepLinkedId && deepLinkedLaserMaterial && populatedForIdRef.current !== deepLinkedId) {
      populatedForIdRef.current = deepLinkedId;
      startEdit(deepLinkedLaserMaterial);
      document.getElementById(`laser-material-row-${deepLinkedId}`)?.scrollIntoView({ block: 'center' });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deepLinkedId, deepLinkedLaserMaterial]);

  function setEdit<K extends keyof LaserMaterialFormState>(key: K, value: LaserMaterialFormState[K]) {
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
      <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">Laser Materials</h1>

      <form onSubmit={handleAdd} className="flex flex-col gap-3 rounded border border-slate-200 p-4 dark:border-slate-700">
        <div className="flex flex-wrap items-end gap-3">
          <FormField id="add-name" label="Name" value={addForm.name} onChange={(e) => setAdd('name', e.target.value)} required />
          <FormField
            id="add-sheetPrice"
            label="Sheet price"
            type="number"
            value={addForm.sheetPrice ?? ''}
            onChange={(e) => setAdd('sheetPrice', e.target.value ? Number(e.target.value) : undefined)}
            required
          />
          <FormField
            id="add-sheetAreaM2"
            label="Sheet area (m²)"
            type="number"
            min="0.01"
            value={addForm.sheetAreaM2 ?? ''}
            onChange={(e) => setAdd('sheetAreaM2', e.target.value ? Number(e.target.value) : undefined)}
            required
          />
          <FormField
            id="add-usableSheetAreaM2"
            label="Usable sheet area (m²)"
            type="number"
            min="0.01"
            value={addForm.usableSheetAreaM2 ?? ''}
            onChange={(e) => setAdd('usableSheetAreaM2', e.target.value ? Number(e.target.value) : undefined)}
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
      {isError && <p className="text-red-600 dark:text-red-400">Couldn't load laser materials. Try refreshing the page.</p>}
      {!isLoading && !isError && laserMaterials?.length === 0 && (
        <p className="text-slate-500 dark:text-slate-400">No laser materials yet.</p>
      )}
      {!isLoading && !isError && laserMaterials && laserMaterials.length > 0 && (
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-slate-500 dark:border-slate-700 dark:text-slate-400">
              <th className="py-2">Name</th>
              <th className="py-2">Sheet price</th>
              <th className="py-2">Sheet area (m²)</th>
              <th className="py-2">Usable area (m²)</th>
              <th className="py-2">Multiplier</th>
              <th className="py-2"></th>
            </tr>
          </thead>
          <tbody>
            {laserMaterials.map((laserMaterial) => (
              <InlineEditableRow
                key={laserMaterial.id}
                isEditing={editingId === laserMaterial.id}
                readOnlyContent={
                  <>
                    <td id={`laser-material-row-${laserMaterial.id}`} className="py-2">
                      {laserMaterial.name}
                    </td>
                    <td className="py-2">{laserMaterial.sheetPrice}</td>
                    <td className="py-2">{laserMaterial.sheetAreaM2}</td>
                    <td className="py-2">{laserMaterial.usableSheetAreaM2}</td>
                    <td className="py-2">{laserMaterial.costMultiplier}</td>
                    <td className="py-2 text-right">
                      <button type="button" onClick={() => startEdit(laserMaterial)} className="text-slate-600 underline dark:text-slate-400">
                        Edit
                      </button>{' '}
                      <button type="button" onClick={() => handleDelete(laserMaterial.id)} className="text-red-600 underline dark:text-red-400">
                        Delete
                      </button>
                    </td>
                  </>
                }
                editContent={
                  <td colSpan={6} className="py-3">
                    <form onSubmit={handleSaveEdit} className="flex flex-col gap-3">
                      <div className="flex flex-wrap items-end gap-3">
                        <FormField id="edit-name" label="Name" value={editForm.name} onChange={(e) => setEdit('name', e.target.value)} required />
                        <FormField
                          id="edit-sheetPrice"
                          label="Sheet price"
                          type="number"
                          value={editForm.sheetPrice ?? ''}
                          onChange={(e) => setEdit('sheetPrice', e.target.value ? Number(e.target.value) : undefined)}
                          required
                        />
                        <FormField
                          id="edit-sheetAreaM2"
                          label="Sheet area (m²)"
                          type="number"
                          min="0.01"
                          value={editForm.sheetAreaM2 ?? ''}
                          onChange={(e) => setEdit('sheetAreaM2', e.target.value ? Number(e.target.value) : undefined)}
                          required
                        />
                        <FormField
                          id="edit-usableSheetAreaM2"
                          label="Usable sheet area (m²)"
                          type="number"
                          min="0.01"
                          value={editForm.usableSheetAreaM2 ?? ''}
                          onChange={(e) => setEdit('usableSheetAreaM2', e.target.value ? Number(e.target.value) : undefined)}
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
      )}
    </div>
  );
}
