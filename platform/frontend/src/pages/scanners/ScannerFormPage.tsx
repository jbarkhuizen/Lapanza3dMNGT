import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { FormField } from '../../components/FormField.js';
import { ApiError } from '../../api/client.js';
import { useScanner, useCreateScanner, useUpdateScanner, type ScannerFormInput } from '../../api/scanners.js';

// scannerCost/expectedScanHours are required by the real API contract, but the form needs
// to represent "cleared, mid-edit" as `undefined` rather than coercing to `0` -- same
// convention as LabourStepFormPage's hourlyRate.
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

export function ScannerFormPage() {
  const { id } = useParams();
  const isEditMode = id !== undefined;
  const navigate = useNavigate();
  const { data: existingScanner, isLoading: isLoadingScanner, isError: isScannerError } = useScanner(id);
  const createMutation = useCreateScanner();
  const updateMutation = useUpdateScanner(id ?? '');
  const [form, setForm] = useState<ScannerFormState>(emptyForm);
  const [error, setError] = useState<string | null>(null);
  const populatedForIdRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (existingScanner && populatedForIdRef.current !== id) {
      populatedForIdRef.current = id;
      setForm({
        name: existingScanner.name,
        scannerCost: existingScanner.scannerCost,
        expectedScanHours: existingScanner.expectedScanHours,
        powerCostPerHour: existingScanner.powerCostPerHour,
      });
    }
  }, [existingScanner, id]);

  function set<K extends keyof ScannerFormState>(key: K, value: ScannerFormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      if (isEditMode) {
        await updateMutation.mutateAsync(form);
      } else {
        // `name`, `scannerCost`, and `expectedScanHours` are required and guaranteed
        // non-undefined here because the inputs' `required` attribute blocks submitting
        // while blank -- safe to assert back to the full input type for create.
        await createMutation.mutateAsync(form as ScannerFormInput);
      }
      navigate('/scanners');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong. Try again shortly.');
    }
  }

  if (isEditMode && isLoadingScanner) {
    return <p className="text-slate-500">Loading…</p>;
  }
  if (isEditMode && isScannerError) {
    return <p className="text-red-600">Couldn't load this scanner. It may have been deleted.</p>;
  }

  const isPending = createMutation.isPending || updateMutation.isPending;

  return (
    <form onSubmit={handleSubmit} className="flex max-w-xl flex-col gap-4">
      <h1 className="text-2xl font-semibold text-slate-900">{isEditMode ? 'Edit Scanner' : 'New Scanner'}</h1>
      <FormField id="name" label="Name" value={form.name} onChange={(e) => set('name', e.target.value)} required />
      <FormField
        id="scannerCost"
        label="Scanner cost"
        type="number"
        value={form.scannerCost ?? ''}
        onChange={(e) => set('scannerCost', e.target.value ? Number(e.target.value) : undefined)}
        required
      />
      <FormField
        id="expectedScanHours"
        label="Expected scan hours"
        type="number"
        min="0.01"
        value={form.expectedScanHours ?? ''}
        onChange={(e) => set('expectedScanHours', e.target.value ? Number(e.target.value) : undefined)}
        required
      />
      <FormField
        id="powerCostPerHour"
        label="Power cost per hour"
        type="number"
        value={form.powerCostPerHour ?? ''}
        onChange={(e) => set('powerCostPerHour', e.target.value ? Number(e.target.value) : undefined)}
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
