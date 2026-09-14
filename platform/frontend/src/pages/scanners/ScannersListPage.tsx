import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useParams } from 'react-router-dom';
import { FormField } from '../../components/FormField.js';
import { NumberField } from '../../components/NumberField.js';
import { MoreDetailsToggle } from '../../components/MoreDetailsToggle.js';
import { InlineEditableRow } from '../../components/InlineEditableRow.js';
import { ApiError } from '../../api/client.js';
import {
  useScanners,
  useScanner,
  useCreateScanner,
  useUpdateScanner,
  useDeleteScanner,
  type Scanner,
  type ScannerFormInput,
} from '../../api/scanners.js';

// scannerCost/expectedScanHours are required by the real API contract, but the form needs
// to represent "cleared, mid-edit" as `undefined` rather than coercing to `0` -- same
// convention as LabourStepsListPage's hourlyRate.
type ScannerFormState = Omit<ScannerFormInput, 'scannerCost' | 'expectedScanHours'> & {
  scannerCost: number | undefined;
  expectedScanHours: number | undefined;
};

const emptyForm: ScannerFormState = {
  name: '',
  scannerCost: undefined,
  expectedScanHours: undefined,
  powerCostPerHour: undefined,
};

export function ScannersListPage() {
  const { id: deepLinkedId } = useParams();
  const { data: scanners, isLoading, isError } = useScanners();
  const deleteMutation = useDeleteScanner();

  function handleDelete(id: string) {
    if (window.confirm('Delete this scanner? This cannot be undone.')) {
      deleteMutation.mutate(id);
    }
  }

  // ---- Add form state (essentials always visible + More details) ----
  const [addForm, setAddForm] = useState<ScannerFormState>(emptyForm);
  const [addError, setAddError] = useState<string | null>(null);
  const createMutation = useCreateScanner();

  function setAdd<K extends keyof ScannerFormState>(key: K, value: ScannerFormState[K]) {
    setAddForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleAdd(e: FormEvent) {
    e.preventDefault();
    setAddError(null);
    try {
      // `name`, `scannerCost`, and `expectedScanHours` are required and guaranteed
      // non-undefined here because the inputs' `required` attribute blocks submitting
      // while blank -- safe to assert back to the full input type for create.
      await createMutation.mutateAsync(addForm as ScannerFormInput);
      setAddForm(emptyForm);
    } catch (err) {
      setAddError(err instanceof ApiError ? err.message : 'Something went wrong. Try again shortly.');
    }
  }

  // ---- Edit-in-place state ----
  const [editingId, setEditingId] = useState<string | null>(deepLinkedId ?? null);
  const [editForm, setEditForm] = useState<ScannerFormState>(emptyForm);
  const [editError, setEditError] = useState<string | null>(null);
  const updateMutation = useUpdateScanner(editingId ?? '');
  const { data: deepLinkedScanner } = useScanner(deepLinkedId);
  const populatedForIdRef = useRef<string | undefined>(undefined);

  function startEdit(scanner: Scanner) {
    setEditingId(scanner.id);
    setEditError(null);
    setEditForm({
      name: scanner.name,
      scannerCost: scanner.scannerCost,
      expectedScanHours: scanner.expectedScanHours,
      powerCostPerHour: scanner.powerCostPerHour,
    });
  }

  // Deep-link support: /scanners/:id auto-expands that row once its data has loaded.
  useEffect(() => {
    if (deepLinkedId && deepLinkedScanner && populatedForIdRef.current !== deepLinkedId) {
      populatedForIdRef.current = deepLinkedId;
      startEdit(deepLinkedScanner);
      document.getElementById(`scanner-row-${deepLinkedId}`)?.scrollIntoView({ block: 'center' });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deepLinkedId, deepLinkedScanner]);

  function setEdit<K extends keyof ScannerFormState>(key: K, value: ScannerFormState[K]) {
    setEditForm((prev) => ({ ...prev, [key]: value }));
  }
  function setEditPowerCost(raw: string) {
    setEdit('powerCostPerHour', raw ? Number(raw) : undefined);
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
      <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">Scanners</h1>

      <form onSubmit={handleAdd} className="flex flex-col gap-3 rounded border border-slate-200 p-4 dark:border-slate-700">
        <div className="flex flex-wrap items-end gap-3">
          <FormField id="add-name" label="Name" value={addForm.name} onChange={(e) => setAdd('name', e.target.value)} required />
          <FormField
            id="add-scannerCost"
            label="Scanner cost"
            type="number"
            value={addForm.scannerCost ?? ''}
            onChange={(e) => setAdd('scannerCost', e.target.value ? Number(e.target.value) : undefined)}
            required
          />
          <FormField
            id="add-expectedScanHours"
            label="Expected scan hours"
            type="number"
            min="0.01"
            value={addForm.expectedScanHours ?? ''}
            onChange={(e) => setAdd('expectedScanHours', e.target.value ? Number(e.target.value) : undefined)}
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
            id="add-powerCostPerHour"
            label="Power cost per hour"
            value={addForm.powerCostPerHour ?? ''}
            onChange={(raw) => setAdd('powerCostPerHour', raw ? Number(raw) : undefined)}
          />
        </MoreDetailsToggle>
        {addError && <p className="text-sm text-red-600 dark:text-red-400">{addError}</p>}
      </form>

      {isLoading && <p className="text-slate-500 dark:text-slate-400">Loading…</p>}
      {isError && <p className="text-red-600 dark:text-red-400">Couldn't load scanners. Try refreshing the page.</p>}
      {!isLoading && !isError && scanners?.length === 0 && <p className="text-slate-500 dark:text-slate-400">No scanners yet.</p>}
      {!isLoading && !isError && scanners && scanners.length > 0 && (
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-slate-500 dark:border-slate-700 dark:text-slate-400">
              <th className="py-2">Name</th>
              <th className="py-2">Scanner cost</th>
              <th className="py-2">Expected scan hours</th>
              <th className="py-2">Power cost / hour</th>
              <th className="py-2"></th>
            </tr>
          </thead>
          <tbody>
            {scanners.map((scanner) => (
              <InlineEditableRow
                key={scanner.id}
                isEditing={editingId === scanner.id}
                readOnlyContent={
                  <>
                    <td id={`scanner-row-${scanner.id}`} className="py-2">
                      {scanner.name}
                    </td>
                    <td className="py-2">{scanner.scannerCost}</td>
                    <td className="py-2">{scanner.expectedScanHours}</td>
                    <td className="py-2">{scanner.powerCostPerHour}</td>
                    <td className="py-2 text-right">
                      <button type="button" onClick={() => startEdit(scanner)} className="text-slate-600 underline dark:text-slate-400">
                        Edit
                      </button>{' '}
                      <button type="button" onClick={() => handleDelete(scanner.id)} className="text-red-600 underline dark:text-red-400">
                        Delete
                      </button>
                    </td>
                  </>
                }
                editContent={
                  <td colSpan={5} className="py-3">
                    <form onSubmit={handleSaveEdit} className="flex flex-col gap-3">
                      <div className="flex flex-wrap items-end gap-3">
                        <FormField id="edit-name" label="Name" value={editForm.name} onChange={(e) => setEdit('name', e.target.value)} required />
                        <FormField
                          id="edit-scannerCost"
                          label="Scanner cost"
                          type="number"
                          value={editForm.scannerCost ?? ''}
                          onChange={(e) => setEdit('scannerCost', e.target.value ? Number(e.target.value) : undefined)}
                          required
                        />
                        <FormField
                          id="edit-expectedScanHours"
                          label="Expected scan hours"
                          type="number"
                          min="0.01"
                          value={editForm.expectedScanHours ?? ''}
                          onChange={(e) => setEdit('expectedScanHours', e.target.value ? Number(e.target.value) : undefined)}
                          required
                        />
                      </div>
                      <MoreDetailsToggle>
                        <NumberField
                          id="edit-powerCostPerHour"
                          label="Power cost per hour"
                          value={editForm.powerCostPerHour ?? ''}
                          onChange={setEditPowerCost}
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
