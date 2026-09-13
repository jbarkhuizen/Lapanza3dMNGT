import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { FormField } from '../../components/FormField.js';
import { ApiError } from '../../api/client.js';
import {
  usePremadeItem,
  useCreatePremadeItem,
  useUpdatePremadeItem,
  type PremadeItemFormInput,
} from '../../api/premadeItems.js';

type PremadeItemFormState = Omit<PremadeItemFormInput, 'unitCost'> & { unitCost: number | undefined };

const emptyForm: PremadeItemFormState = { name: '', unitCost: undefined, costMultiplier: undefined };

export function PremadeItemFormPage() {
  const { id } = useParams();
  const isEditMode = id !== undefined;
  const navigate = useNavigate();
  const { data: existingPremadeItem, isLoading: isLoadingPremadeItem, isError: isPremadeItemError } =
    usePremadeItem(id);
  const createMutation = useCreatePremadeItem();
  const updateMutation = useUpdatePremadeItem(id ?? '');
  const [form, setForm] = useState<PremadeItemFormState>(emptyForm);
  const [error, setError] = useState<string | null>(null);
  const populatedForIdRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (existingPremadeItem && populatedForIdRef.current !== id) {
      populatedForIdRef.current = id;
      setForm({
        name: existingPremadeItem.name,
        unitCost: existingPremadeItem.unitCost,
        costMultiplier: existingPremadeItem.costMultiplier,
      });
    }
  }, [existingPremadeItem, id]);

  function set<K extends keyof PremadeItemFormState>(key: K, value: PremadeItemFormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      if (isEditMode) {
        await updateMutation.mutateAsync(form);
      } else {
        await createMutation.mutateAsync(form as PremadeItemFormInput);
      }
      navigate('/premade-items');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong. Try again shortly.');
    }
  }

  if (isEditMode && isLoadingPremadeItem) {
    return <p className="text-slate-500">Loading…</p>;
  }
  if (isEditMode && isPremadeItemError) {
    return <p className="text-red-600">Couldn't load this premade item. It may have been deleted.</p>;
  }

  const isPending = createMutation.isPending || updateMutation.isPending;

  return (
    <form onSubmit={handleSubmit} className="flex max-w-xl flex-col gap-4">
      <h1 className="text-2xl font-semibold text-slate-900">{isEditMode ? 'Edit Pre-made Item' : 'New Pre-made Item'}</h1>
      <FormField id="name" label="Name" value={form.name} onChange={(e) => set('name', e.target.value)} required />
      <FormField
        id="unitCost"
        label="Unit cost"
        type="number"
        value={form.unitCost ?? ''}
        onChange={(e) => set('unitCost', e.target.value ? Number(e.target.value) : undefined)}
        required
      />
      <FormField
        id="costMultiplier"
        label="Cost multiplier"
        type="number"
        value={form.costMultiplier ?? ''}
        onChange={(e) => set('costMultiplier', e.target.value ? Number(e.target.value) : undefined)}
      />
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
