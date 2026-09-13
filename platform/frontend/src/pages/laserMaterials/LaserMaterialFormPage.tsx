import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { FormField } from '../../components/FormField.js';
import { ApiError } from '../../api/client.js';
import {
  useLaserMaterial,
  useCreateLaserMaterial,
  useUpdateLaserMaterial,
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

export function LaserMaterialFormPage() {
  const { id } = useParams();
  const isEditMode = id !== undefined;
  const navigate = useNavigate();
  const { data: existingLaserMaterial, isLoading: isLoadingLaserMaterial, isError: isLaserMaterialError } =
    useLaserMaterial(id);
  const createMutation = useCreateLaserMaterial();
  const updateMutation = useUpdateLaserMaterial(id ?? '');
  const [form, setForm] = useState<LaserMaterialFormState>(emptyForm);
  const [error, setError] = useState<string | null>(null);
  const populatedForIdRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (existingLaserMaterial && populatedForIdRef.current !== id) {
      populatedForIdRef.current = id;
      setForm({
        name: existingLaserMaterial.name,
        sheetPrice: existingLaserMaterial.sheetPrice,
        sheetAreaM2: existingLaserMaterial.sheetAreaM2,
        usableSheetAreaM2: existingLaserMaterial.usableSheetAreaM2,
        costMultiplier: existingLaserMaterial.costMultiplier,
      });
    }
  }, [existingLaserMaterial, id]);

  function set<K extends keyof LaserMaterialFormState>(key: K, value: LaserMaterialFormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      if (isEditMode) {
        await updateMutation.mutateAsync(form);
      } else {
        await createMutation.mutateAsync(form as LaserMaterialFormInput);
      }
      navigate('/laser-materials');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong. Try again shortly.');
    }
  }

  if (isEditMode && isLoadingLaserMaterial) {
    return <p className="text-slate-500">Loading…</p>;
  }
  if (isEditMode && isLaserMaterialError) {
    return <p className="text-red-600">Couldn't load this laser material. It may have been deleted.</p>;
  }

  const isPending = createMutation.isPending || updateMutation.isPending;

  return (
    <form onSubmit={handleSubmit} className="flex max-w-xl flex-col gap-4">
      <h1 className="text-2xl font-semibold text-slate-900">{isEditMode ? 'Edit Laser Material' : 'New Laser Material'}</h1>
      <FormField id="name" label="Name" value={form.name} onChange={(e) => set('name', e.target.value)} required />
      <FormField
        id="sheetPrice"
        label="Sheet price"
        type="number"
        value={form.sheetPrice ?? ''}
        onChange={(e) => set('sheetPrice', e.target.value ? Number(e.target.value) : undefined)}
        required
      />
      <FormField
        id="sheetAreaM2"
        label="Sheet area (m²)"
        type="number"
        min="0.01"
        value={form.sheetAreaM2 ?? ''}
        onChange={(e) => set('sheetAreaM2', e.target.value ? Number(e.target.value) : undefined)}
        required
      />
      <FormField
        id="usableSheetAreaM2"
        label="Usable sheet area (m²)"
        type="number"
        min="0.01"
        value={form.usableSheetAreaM2 ?? ''}
        onChange={(e) => set('usableSheetAreaM2', e.target.value ? Number(e.target.value) : undefined)}
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
