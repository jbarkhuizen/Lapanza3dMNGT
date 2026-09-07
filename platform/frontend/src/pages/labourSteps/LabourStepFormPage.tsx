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
