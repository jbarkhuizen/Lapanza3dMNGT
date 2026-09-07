import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { FormField } from '../../components/FormField.js';
import { ApiError } from '../../api/client.js';
import {
  useConsumable,
  useCreateConsumable,
  useUpdateConsumable,
  CONSUMABLE_CATEGORIES,
  type ConsumableFormInput,
} from '../../api/consumables.js';

const emptyForm: ConsumableFormInput = {
  name: '',
  category: CONSUMABLE_CATEGORIES[0],
  unitOfMeasure: '',
  costPerUnit: 0,
  currentStock: undefined,
  reorderThreshold: undefined,
  supplier: '',
};

// The real zod schema in `platform/api/src/routes/consumables.ts` has no `.refine()`,
// `.email()`, or other stricter-than-plain-`.optional()` validation on any field —
// every optional field there is a bare `z.string().optional()` or `z.number().optional()`,
// which accepts ''/undefined fine. So no field needs `omitBlankFields` treatment here.

export function ConsumableFormPage() {
  const { id } = useParams();
  const isEditMode = id !== undefined;
  const navigate = useNavigate();
  const { data: existingConsumable, isLoading: isLoadingConsumable, isError: isConsumableError } = useConsumable(id);
  const createMutation = useCreateConsumable();
  const updateMutation = useUpdateConsumable(id ?? '');
  const [form, setForm] = useState<ConsumableFormInput>(emptyForm);
  const [error, setError] = useState<string | null>(null);
  const populatedForIdRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (existingConsumable && populatedForIdRef.current !== id) {
      populatedForIdRef.current = id;
      setForm({
        name: existingConsumable.name,
        category: existingConsumable.category,
        unitOfMeasure: existingConsumable.unitOfMeasure,
        costPerUnit: existingConsumable.costPerUnit,
        currentStock: existingConsumable.currentStock ?? undefined,
        reorderThreshold: existingConsumable.reorderThreshold ?? undefined,
        supplier: existingConsumable.supplier ?? '',
      });
    }
  }, [existingConsumable, id]);

  function set<K extends keyof ConsumableFormInput>(key: K, value: ConsumableFormInput[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  type NumericConsumableField = 'costPerUnit' | 'currentStock' | 'reorderThreshold';

  function setNumber(key: NumericConsumableField, raw: string) {
    set(key, (raw ? Number(raw) : undefined) as ConsumableFormInput[NumericConsumableField]);
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
      navigate('/consumables');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong. Try again shortly.');
    }
  }

  if (isEditMode && isLoadingConsumable) {
    return <p className="text-slate-500">Loading…</p>;
  }
  if (isEditMode && isConsumableError) {
    return <p className="text-red-600">Couldn't load this consumable. It may have been deleted.</p>;
  }

  const isPending = createMutation.isPending || updateMutation.isPending;

  return (
    <form onSubmit={handleSubmit} className="flex max-w-xl flex-col gap-4">
      <h1 className="text-2xl font-semibold text-slate-900">{isEditMode ? 'Edit Consumable' : 'New Consumable'}</h1>
      <FormField id="name" label="Name" value={form.name} onChange={(e) => set('name', e.target.value)} required />
      <div className="flex flex-col gap-1">
        <label htmlFor="category" className="text-sm font-medium text-slate-700">Category</label>
        <select
          id="category"
          value={form.category}
          onChange={(e) => set('category', e.target.value as ConsumableFormInput['category'])}
          className="rounded border border-slate-300 px-3 py-2 text-sm"
        >
          {CONSUMABLE_CATEGORIES.map((category) => (
            <option key={category} value={category}>
              {category}
            </option>
          ))}
        </select>
      </div>
      <FormField id="unitOfMeasure" label="Unit of measure" value={form.unitOfMeasure} onChange={(e) => set('unitOfMeasure', e.target.value)} required />
      <FormField id="costPerUnit" label="Cost per unit" type="number" value={form.costPerUnit} onChange={(e) => setNumber('costPerUnit', e.target.value)} required />
      <FormField id="currentStock" label="Current stock" type="number" value={form.currentStock ?? ''} onChange={(e) => setNumber('currentStock', e.target.value)} />
      <FormField id="reorderThreshold" label="Reorder threshold" type="number" value={form.reorderThreshold ?? ''} onChange={(e) => setNumber('reorderThreshold', e.target.value)} />
      <FormField id="supplier" label="Supplier" value={form.supplier ?? ''} onChange={(e) => set('supplier', e.target.value)} />
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
