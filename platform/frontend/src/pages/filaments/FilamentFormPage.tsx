import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { FormField } from '../../components/FormField.js';
import { TextareaField } from '../../components/TextareaField.js';
import { ApiError } from '../../api/client.js';
import {
  useFilament,
  useCreateFilament,
  useUpdateFilament,
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

export function FilamentFormPage() {
  const { id } = useParams();
  const isEditMode = id !== undefined;
  const navigate = useNavigate();
  const { data: existingFilament, isLoading: isLoadingFilament, isError: isFilamentError } = useFilament(id);
  const createMutation = useCreateFilament();
  const updateMutation = useUpdateFilament(id ?? '');
  const [form, setForm] = useState<FilamentFormInput>(emptyForm);
  const [error, setError] = useState<string | null>(null);
  const populatedForIdRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (existingFilament && populatedForIdRef.current !== id) {
      populatedForIdRef.current = id;
      setForm({
        brand: existingFilament.brand,
        materialType: existingFilament.materialType,
        diameterMm: existingFilament.diameterMm as 1.75 | 2.85,
        colour: existingFilament.colour ?? '',
        costPerSpool: existingFilament.costPerSpool ?? undefined,
        costPerKg: existingFilament.costPerKg ?? undefined,
        spoolWeightGrams: existingFilament.spoolWeightGrams ?? undefined,
        remainingWeightGrams: existingFilament.remainingWeightGrams ?? undefined,
        supplier: existingFilament.supplier ?? '',
        purchaseDate: existingFilament.purchaseDate ?? '',
        notes: existingFilament.notes ?? '',
        lowStockThresholdGrams: existingFilament.lowStockThresholdGrams ?? undefined,
      });
    }
  }, [existingFilament, id]);

  function set<K extends keyof FilamentFormInput>(key: K, value: FilamentFormInput[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function setNumber(key: keyof FilamentFormInput, raw: string) {
    set(key, (raw ? Number(raw) : undefined) as never);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      if (isEditMode) {
        await updateMutation.mutateAsync(omitBlankFields(form, OMIT_WHEN_BLANK));
      } else {
        // `brand`, `materialType`, and `diameterMm` are required and never in the omit list,
        // so they're always present on the result — safe to assert back to the full input
        // type for the create endpoint, which (unlike update) doesn't accept a partial payload.
        await createMutation.mutateAsync(omitBlankFields(form, OMIT_WHEN_BLANK) as FilamentFormInput);
      }
      navigate('/filaments');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong. Try again shortly.');
    }
  }

  if (isEditMode && isLoadingFilament) {
    return <p className="text-slate-500">Loading…</p>;
  }
  if (isEditMode && isFilamentError) {
    return <p className="text-red-600">Couldn't load this filament. It may have been deleted.</p>;
  }

  const isPending = createMutation.isPending || updateMutation.isPending;

  return (
    <form onSubmit={handleSubmit} className="flex max-w-xl flex-col gap-4">
      <h1 className="text-2xl font-semibold text-slate-900">{isEditMode ? 'Edit Filament' : 'New Filament'}</h1>
      <FormField id="brand" label="Brand" value={form.brand} onChange={(e) => set('brand', e.target.value)} required />
      <FormField id="materialType" label="Material type" value={form.materialType} onChange={(e) => set('materialType', e.target.value)} required />
      <div className="flex flex-col gap-1">
        <label htmlFor="diameterMm" className="text-sm font-medium text-slate-700">Diameter</label>
        <select
          id="diameterMm"
          value={form.diameterMm}
          onChange={(e) => set('diameterMm', Number(e.target.value) as 1.75 | 2.85)}
          className="rounded border border-slate-300 px-3 py-2 text-sm"
        >
          <option value={1.75}>1.75mm</option>
          <option value={2.85}>2.85mm</option>
        </select>
      </div>
      <FormField id="colour" label="Colour" value={form.colour ?? ''} onChange={(e) => set('colour', e.target.value)} />
      <FormField id="costPerSpool" label="Cost per spool" type="number" value={form.costPerSpool ?? ''} onChange={(e) => setNumber('costPerSpool', e.target.value)} />
      <FormField id="costPerKg" label="Cost per kg" type="number" value={form.costPerKg ?? ''} onChange={(e) => setNumber('costPerKg', e.target.value)} />
      <FormField id="spoolWeightGrams" label="Spool weight (g)" type="number" value={form.spoolWeightGrams ?? ''} onChange={(e) => setNumber('spoolWeightGrams', e.target.value)} />
      <FormField id="remainingWeightGrams" label="Remaining weight (g)" type="number" value={form.remainingWeightGrams ?? ''} onChange={(e) => setNumber('remainingWeightGrams', e.target.value)} />
      <FormField id="lowStockThresholdGrams" label="Low stock threshold (g)" type="number" value={form.lowStockThresholdGrams ?? ''} onChange={(e) => setNumber('lowStockThresholdGrams', e.target.value)} />
      <FormField id="supplier" label="Supplier" value={form.supplier ?? ''} onChange={(e) => set('supplier', e.target.value)} />
      <FormField id="purchaseDate" label="Purchase date" type="date" value={form.purchaseDate ?? ''} onChange={(e) => set('purchaseDate', e.target.value)} />
      <TextareaField id="notes" label="Notes" value={form.notes ?? ''} onChange={(value) => set('notes', value)} />
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
