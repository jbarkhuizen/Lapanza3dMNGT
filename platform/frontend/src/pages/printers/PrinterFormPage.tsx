import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { FormField } from '../../components/FormField.js';
import { NumberField } from '../../components/NumberField.js';
import { ApiError } from '../../api/client.js';
import {
  usePrinter,
  useCreatePrinter,
  useUpdatePrinter,
  type PrinterFormInput,
} from '../../api/printers.js';
import { omitBlankFields } from '../../lib/omitBlankFields.js';
import { PresetsSection } from '../../components/printers/PresetsSection.js';
import { MaintenanceLogSection } from '../../components/printers/MaintenanceLogSection.js';

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
// number, `null` (explicit clear, via the NumberField "x" button), or omitted (never '') -- so
// `.nonnegative()`/`.positive()` refinements on `electricityRatePerKwh`/`expectedLifetimeHours`
// never see a blank value either.
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

  // Explicit "clear" affordance for optional numeric fields (edit mode only):
  // sends `null`, which -- unlike `undefined` -- survives JSON.stringify and
  // tells the PATCH endpoint to actually clear the stored value instead of
  // leaving it untouched.
  function clearNumber(key: NumericPrinterField) {
    set(key, null);
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
        <NumberField id="buildVolumeXMm" label="Build volume X (mm)" value={form.buildVolumeXMm ?? ''} onChange={(raw) => setNumber('buildVolumeXMm', raw)} onClear={isEditMode ? () => clearNumber('buildVolumeXMm') : undefined} />
        <NumberField id="buildVolumeYMm" label="Build volume Y (mm)" value={form.buildVolumeYMm ?? ''} onChange={(raw) => setNumber('buildVolumeYMm', raw)} onClear={isEditMode ? () => clearNumber('buildVolumeYMm') : undefined} />
        <NumberField id="buildVolumeZMm" label="Build volume Z (mm)" value={form.buildVolumeZMm ?? ''} onChange={(raw) => setNumber('buildVolumeZMm', raw)} onClear={isEditMode ? () => clearNumber('buildVolumeZMm') : undefined} />
        <FormField id="purchaseDate" label="Purchase date" type="date" value={form.purchaseDate ?? ''} onChange={(e) => set('purchaseDate', e.target.value)} />
        <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Required for job costing</p>
        <NumberField id="purchaseCost" label="Purchase cost" value={form.purchaseCost ?? ''} onChange={(raw) => setNumber('purchaseCost', raw)} onClear={isEditMode ? () => clearNumber('purchaseCost') : undefined} />
        <NumberField id="powerDrawWatts" label="Power draw (W)" value={form.powerDrawWatts ?? ''} onChange={(raw) => setNumber('powerDrawWatts', raw)} onClear={isEditMode ? () => clearNumber('powerDrawWatts') : undefined} />
        <NumberField id="electricityRatePerKwh" label="Electricity rate per kWh" min="0" value={form.electricityRatePerKwh ?? ''} onChange={(raw) => setNumber('electricityRatePerKwh', raw)} onClear={isEditMode ? () => clearNumber('electricityRatePerKwh') : undefined} />
        <NumberField id="expectedLifetimeHours" label="Expected lifetime (hours)" min="0.01" value={form.expectedLifetimeHours ?? ''} onChange={(raw) => setNumber('expectedLifetimeHours', raw)} onClear={isEditMode ? () => clearNumber('expectedLifetimeHours') : undefined} />
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
      {isEditMode && id && (
        <>
          <PresetsSection printerId={id} />
          <MaintenanceLogSection printerId={id} />
        </>
      )}
    </div>
  );
}
