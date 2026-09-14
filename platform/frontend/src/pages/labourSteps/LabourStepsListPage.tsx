import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useParams } from 'react-router-dom';
import { FormField } from '../../components/FormField.js';
import { Checkbox } from '../../components/Checkbox.js';
import { MoreDetailsToggle } from '../../components/MoreDetailsToggle.js';
import { InlineEditableRow } from '../../components/InlineEditableRow.js';
import { ApiError } from '../../api/client.js';
import {
  useLabourSteps,
  useLabourStep,
  useCreateLabourStep,
  useUpdateLabourStep,
  type LabourStep,
  type LabourStepFormInput,
} from '../../api/labourSteps.js';

// `hourlyRate` is required by the real API contract (`LabourStepFormInput`), but the form
// needs to represent "cleared, mid-edit" as `undefined` rather than coercing to `0` --
// otherwise clearing the field silently produces a real, meaningful rate. `required`
// on the input then genuinely blocks submitting while it's `undefined`.
type LabourStepFormState = Omit<LabourStepFormInput, 'hourlyRate'> & { hourlyRate: number | undefined };

const emptyForm: LabourStepFormState = { name: '', hourlyRate: undefined, active: true };

export function LabourStepsListPage() {
  const { id: deepLinkedId } = useParams();
  const { data: labourSteps, isLoading, isError } = useLabourSteps();

  // ---- Add form state (essentials always visible + More details) ----
  const [addForm, setAddForm] = useState<LabourStepFormState>(emptyForm);
  const [addError, setAddError] = useState<string | null>(null);
  const createMutation = useCreateLabourStep();

  function setAdd<K extends keyof LabourStepFormState>(key: K, value: LabourStepFormState[K]) {
    setAddForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleAdd(e: FormEvent) {
    e.preventDefault();
    setAddError(null);
    try {
      // `name` and `hourlyRate` are required and `hourlyRate` is guaranteed non-undefined
      // here because the input's `required` attribute blocks submitting while it's blank --
      // safe to assert back to the full input type for the create endpoint, which (unlike
      // update) doesn't accept a partial payload.
      await createMutation.mutateAsync(addForm as LabourStepFormInput);
      setAddForm(emptyForm);
    } catch (err) {
      setAddError(err instanceof ApiError ? err.message : 'Something went wrong. Try again shortly.');
    }
  }

  // ---- Edit-in-place state ----
  const [editingId, setEditingId] = useState<string | null>(deepLinkedId ?? null);
  const [editForm, setEditForm] = useState<LabourStepFormState>(emptyForm);
  const [editError, setEditError] = useState<string | null>(null);
  const updateMutation = useUpdateLabourStep(editingId ?? '');
  const { data: deepLinkedLabourStep } = useLabourStep(deepLinkedId);
  const populatedForIdRef = useRef<string | undefined>(undefined);

  function startEdit(labourStep: LabourStep) {
    setEditingId(labourStep.id);
    setEditError(null);
    setEditForm({ name: labourStep.name, hourlyRate: labourStep.hourlyRate, active: labourStep.active });
  }

  // Deep-link support: /labour-steps/:id auto-expands that row once its data has loaded.
  useEffect(() => {
    if (deepLinkedId && deepLinkedLabourStep && populatedForIdRef.current !== deepLinkedId) {
      populatedForIdRef.current = deepLinkedId;
      startEdit(deepLinkedLabourStep);
      document.getElementById(`labour-step-row-${deepLinkedId}`)?.scrollIntoView({ block: 'center' });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deepLinkedId, deepLinkedLabourStep]);

  function setEdit<K extends keyof LabourStepFormState>(key: K, value: LabourStepFormState[K]) {
    setEditForm((prev) => ({ ...prev, [key]: value }));
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
      <h1 className="text-2xl font-semibold text-slate-900">Labour Steps</h1>

      <form onSubmit={handleAdd} className="flex flex-col gap-3 rounded border border-slate-200 p-4">
        <div className="flex flex-wrap items-end gap-3">
          <FormField id="add-name" label="Name" value={addForm.name} onChange={(e) => setAdd('name', e.target.value)} required />
          <FormField
            id="add-hourlyRate"
            label="Hourly rate"
            type="number"
            value={addForm.hourlyRate ?? ''}
            onChange={(e) => setAdd('hourlyRate', e.target.value ? Number(e.target.value) : undefined)}
            required
          />
          <button
            type="submit"
            disabled={createMutation.isPending}
            className="rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            Add
          </button>
        </div>
        <MoreDetailsToggle>
          <Checkbox id="add-active" label="Active" checked={addForm.active ?? true} onChange={(checked) => setAdd('active', checked)} />
        </MoreDetailsToggle>
        {addError && <p className="text-sm text-red-600">{addError}</p>}
      </form>

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
              <InlineEditableRow
                key={step.id}
                isEditing={editingId === step.id}
                readOnlyContent={
                  <>
                    <td id={`labour-step-row-${step.id}`} className="py-2">
                      {step.name}
                    </td>
                    <td className="py-2">{step.hourlyRate}</td>
                    <td className="py-2">{step.active ? 'Yes' : 'No'}</td>
                    <td className="py-2 text-right">
                      <button type="button" onClick={() => startEdit(step)} className="text-slate-600 underline">
                        Edit
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
                          id="edit-hourlyRate"
                          label="Hourly rate"
                          type="number"
                          value={editForm.hourlyRate ?? ''}
                          onChange={(e) => setEdit('hourlyRate', e.target.value ? Number(e.target.value) : undefined)}
                          required
                        />
                      </div>
                      <MoreDetailsToggle>
                        <Checkbox
                          id="edit-active"
                          label="Active"
                          checked={editForm.active ?? true}
                          onChange={(checked) => setEdit('active', checked)}
                        />
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
