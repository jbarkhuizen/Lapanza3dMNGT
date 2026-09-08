import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { FormField } from '../../components/FormField.js';
import { ApiError } from '../../api/client.js';
import {
  usePrinter,
  useCreatePrinter,
  useUpdatePrinter,
  type PrinterFormInput,
} from '../../api/printers.js';
import { omitBlankFields } from '../../lib/omitBlankFields.js';

const STATUSES = ['active', 'maintenance', 'retired'] as const;

const emptyForm: PrinterFormInput = {
  name: '',
  make: '',
  model: '',
  buildVolumeXMm: undefined,
  buildVolumeYMm: undefined,
  buildVolumeZMm: undefined,
  purchaseDate: '',
  purchaseCost: undefined,
  powerDrawWatts: undefined,
  electricityRatePerKwh: undefined,
  expectedLifetimeHours: undefined,
  status: 'active',
};

// `purchaseDate` is the only field on the printers route with stricter-than-plain-optional
// validation (a date-parse refine that rejects ''), confirmed against `platform/api/src/routes/printers.ts`.
// `make`/`model` are plain `z.string().optional()` and accept '' fine. `status` is a `<select>`
// defaulted to 'active', so it's never blank-submitted. Every numeric field is sent as a real
// number or omitted (never ''), so `.nonnegative()`/`.positive()` refinements on
// `electricityRatePerKwh`/`expectedLifetimeHours` never see a blank value either.
const OMIT_WHEN_BLANK: (keyof PrinterFormInput)[] = ['purchaseDate'];

export function PrinterFormPage() {
  const { id } = useParams();
  const isEditMode = id !== undefined;
  const navigate = useNavigate();
  const { data: existingPrinter, isLoading: isLoadingPrinter, isError: isPrinterError } = usePrinter(id);
  const createMutation = useCreatePrinter();
  const updateMutation = useUpdatePrinter(id ?? '');
  const [form, setForm] = useState<PrinterFormInput>(emptyForm);
  const [error, setError] = useState<string | null>(null);
  const populatedForIdRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (existingPrinter && populatedForIdRef.current !== id) {
      populatedForIdRef.current = id;
      setForm({
        name: existingPrinter.name,
        make: existingPrinter.make ?? '',
        model: existingPrinter.model ?? '',
        buildVolumeXMm: existingPrinter.buildVolumeXMm ?? undefined,
        buildVolumeYMm: existingPrinter.buildVolumeYMm ?? undefined,
        buildVolumeZMm: existingPrinter.buildVolumeZMm ?? undefined,
        purchaseDate: existingPrinter.purchaseDate?.slice(0, 10) ?? '',
        purchaseCost: existingPrinter.purchaseCost ?? undefined,
        powerDrawWatts: existingPrinter.powerDrawWatts ?? undefined,
        electricityRatePerKwh:
          existingPrinter.electricityRatePerKwh != null ? Number(existingPrinter.electricityRatePerKwh) : undefined,
        expectedLifetimeHours: existingPrinter.expectedLifetimeHours ?? undefined,
        status: existingPrinter.status,
      });
    }
  }, [existingPrinter, id]);

  function set<K extends keyof PrinterFormInput>(key: K, value: PrinterFormInput[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  type NumericPrinterField =
    | 'buildVolumeXMm'
    | 'buildVolumeYMm'
    | 'buildVolumeZMm'
    | 'purchaseCost'
    | 'powerDrawWatts'
    | 'electricityRatePerKwh'
    | 'expectedLifetimeHours';

  function setNumber(key: NumericPrinterField, raw: string) {
    set(key, raw ? Number(raw) : undefined);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      if (isEditMode) {
        await updateMutation.mutateAsync(omitBlankFields(form, OMIT_WHEN_BLANK));
      } else {
        // `name` is required and never in the omit list, so it's always present on the
        // result — safe to assert back to the full input type for the create endpoint,
        // which (unlike update) doesn't accept a partial payload.
        await createMutation.mutateAsync(omitBlankFields(form, OMIT_WHEN_BLANK) as PrinterFormInput);
      }
      navigate('/printers');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong. Try again shortly.');
    }
  }

  if (isEditMode && isLoadingPrinter) {
    return <p className="text-slate-500">Loading…</p>;
  }
  if (isEditMode && isPrinterError) {
    return <p className="text-red-600">Couldn't load this printer. It may have been deleted.</p>;
  }

  const isPending = createMutation.isPending || updateMutation.isPending;

  return (
    <div className="flex flex-col gap-8">
      <form onSubmit={handleSubmit} className="flex max-w-xl flex-col gap-4">
        <h1 className="text-2xl font-semibold text-slate-900">{isEditMode ? 'Edit Printer' : 'New Printer'}</h1>
        <FormField id="name" label="Name" value={form.name} onChange={(e) => set('name', e.target.value)} required />
        <FormField id="make" label="Make" value={form.make ?? ''} onChange={(e) => set('make', e.target.value)} />
        <FormField id="model" label="Model" value={form.model ?? ''} onChange={(e) => set('model', e.target.value)} />
        <FormField id="buildVolumeXMm" label="Build volume X (mm)" type="number" value={form.buildVolumeXMm ?? ''} onChange={(e) => setNumber('buildVolumeXMm', e.target.value)} />
        <FormField id="buildVolumeYMm" label="Build volume Y (mm)" type="number" value={form.buildVolumeYMm ?? ''} onChange={(e) => setNumber('buildVolumeYMm', e.target.value)} />
        <FormField id="buildVolumeZMm" label="Build volume Z (mm)" type="number" value={form.buildVolumeZMm ?? ''} onChange={(e) => setNumber('buildVolumeZMm', e.target.value)} />
        <FormField id="purchaseDate" label="Purchase date" type="date" value={form.purchaseDate ?? ''} onChange={(e) => set('purchaseDate', e.target.value)} />
        <FormField id="purchaseCost" label="Purchase cost" type="number" value={form.purchaseCost ?? ''} onChange={(e) => setNumber('purchaseCost', e.target.value)} />
        <FormField id="powerDrawWatts" label="Power draw (W)" type="number" value={form.powerDrawWatts ?? ''} onChange={(e) => setNumber('powerDrawWatts', e.target.value)} />
        <FormField id="electricityRatePerKwh" label="Electricity rate per kWh" type="number" value={form.electricityRatePerKwh ?? ''} onChange={(e) => setNumber('electricityRatePerKwh', e.target.value)} />
        <FormField id="expectedLifetimeHours" label="Expected lifetime (hours)" type="number" value={form.expectedLifetimeHours ?? ''} onChange={(e) => setNumber('expectedLifetimeHours', e.target.value)} />
        <div className="flex flex-col gap-1">
          <label htmlFor="status" className="text-sm font-medium text-slate-700">Status</label>
          <select
            id="status"
            value={form.status}
            onChange={(e) => set('status', e.target.value as (typeof STATUSES)[number])}
            className="rounded border border-slate-300 px-3 py-2 text-sm"
          >
            {STATUSES.map((status) => (
              <option key={status} value={status}>
                {status}
              </option>
            ))}
          </select>
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button
          type="submit"
          disabled={isPending}
          className="w-fit rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          Save
        </button>
      </form>
    </div>
  );
}
