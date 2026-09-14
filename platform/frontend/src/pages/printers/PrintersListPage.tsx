import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useParams } from 'react-router-dom';
import { FormField } from '../../components/FormField.js';
import { NumberField } from '../../components/NumberField.js';
import { MoreDetailsToggle } from '../../components/MoreDetailsToggle.js';
import { InlineEditableRow } from '../../components/InlineEditableRow.js';
import { ApiError } from '../../api/client.js';
import {
  usePrinters,
  usePrinter,
  useCreatePrinter,
  useUpdatePrinter,
  type Printer,
  type PrinterFormInput,
} from '../../api/printers.js';
import { omitBlankFields } from '../../lib/omitBlankFields.js';
import { PresetsSection } from '../../components/printers/PresetsSection.js';
import { MaintenanceLogSection } from '../../components/printers/MaintenanceLogSection.js';

const STATUSES = ['active', 'maintenance', 'retired'] as const;
// A laser cutter/engraver is tracked as a Printer row too -- see the design
// spec's "Data model" section.
const PROCESSES = ['fdm', 'resin', 'laser'] as const;

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
  process: 'fdm',
};

// `purchaseDate` is the only field on the printers route with stricter-than-plain-optional
// validation (a date-parse refine that rejects ''), confirmed against `platform/api/src/routes/printers.ts`.
// `make`/`model` are plain `z.string().optional()` and accept '' fine. `status`/`process` are
// `<select>`s defaulted to 'active'/'fdm', so they're never blank-submitted. Every numeric field
// is sent as a real number, `null` (explicit clear, via the NumberField "x" button), or omitted
// (never '') -- so `.nonnegative()`/`.positive()` refinements on `electricityRatePerKwh`/
// `expectedLifetimeHours` never see a blank value either.
const OMIT_WHEN_BLANK: (keyof PrinterFormInput)[] = ['purchaseDate'];

type NumericPrinterField =
  | 'buildVolumeXMm'
  | 'buildVolumeYMm'
  | 'buildVolumeZMm'
  | 'purchaseCost'
  | 'powerDrawWatts'
  | 'electricityRatePerKwh'
  | 'expectedLifetimeHours';

export function PrintersListPage() {
  const { id: deepLinkedId } = useParams();
  const { data: printers, isLoading, isError } = usePrinters();

  // ---- Add form state (essentials always visible + More details) ----
  const [addForm, setAddForm] = useState<PrinterFormInput>(emptyForm);
  const [addError, setAddError] = useState<string | null>(null);
  const createMutation = useCreatePrinter();

  function setAdd<K extends keyof PrinterFormInput>(key: K, value: PrinterFormInput[K]) {
    setAddForm((prev) => ({ ...prev, [key]: value }));
  }
  function setAddNumber(key: NumericPrinterField, raw: string) {
    setAdd(key, raw ? Number(raw) : undefined);
  }

  async function handleAdd(e: FormEvent) {
    e.preventDefault();
    setAddError(null);
    try {
      // `name` is required and never in the omit list, so it's always present on the
      // result — safe to assert back to the full input type for the create endpoint,
      // which (unlike update) doesn't accept a partial payload.
      await createMutation.mutateAsync(omitBlankFields(addForm, OMIT_WHEN_BLANK) as PrinterFormInput);
      setAddForm(emptyForm);
    } catch (err) {
      setAddError(err instanceof ApiError ? err.message : 'Something went wrong. Try again shortly.');
    }
  }

  // ---- Edit-in-place state ----
  const [editingId, setEditingId] = useState<string | null>(deepLinkedId ?? null);
  const [editForm, setEditForm] = useState<PrinterFormInput>(emptyForm);
  const [editError, setEditError] = useState<string | null>(null);
  const updateMutation = useUpdatePrinter(editingId ?? '');
  const { data: deepLinkedPrinter } = usePrinter(deepLinkedId);
  const populatedForIdRef = useRef<string | undefined>(undefined);

  function startEdit(printer: Printer) {
    setEditingId(printer.id);
    setEditError(null);
    setEditForm({
      name: printer.name,
      make: printer.make ?? '',
      model: printer.model ?? '',
      buildVolumeXMm: printer.buildVolumeXMm ?? undefined,
      buildVolumeYMm: printer.buildVolumeYMm ?? undefined,
      buildVolumeZMm: printer.buildVolumeZMm ?? undefined,
      purchaseDate: printer.purchaseDate?.slice(0, 10) ?? '',
      purchaseCost: printer.purchaseCost ?? undefined,
      powerDrawWatts: printer.powerDrawWatts ?? undefined,
      electricityRatePerKwh: printer.electricityRatePerKwh != null ? Number(printer.electricityRatePerKwh) : undefined,
      expectedLifetimeHours: printer.expectedLifetimeHours ?? undefined,
      status: printer.status,
      process: printer.process,
    });
  }

  // Deep-link support: /printers/:id auto-expands that row once its data has loaded.
  useEffect(() => {
    if (deepLinkedId && deepLinkedPrinter && populatedForIdRef.current !== deepLinkedId) {
      populatedForIdRef.current = deepLinkedId;
      startEdit(deepLinkedPrinter);
      document.getElementById(`printer-row-${deepLinkedId}`)?.scrollIntoView({ block: 'center' });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deepLinkedId, deepLinkedPrinter]);

  function setEdit<K extends keyof PrinterFormInput>(key: K, value: PrinterFormInput[K]) {
    setEditForm((prev) => ({ ...prev, [key]: value }));
  }
  function setEditNumber(key: NumericPrinterField, raw: string) {
    setEdit(key, raw ? Number(raw) : undefined);
  }
  // Explicit "clear" affordance for optional numeric fields (edit mode only):
  // sends `null`, which -- unlike `undefined` -- survives JSON.stringify and
  // tells the PATCH endpoint to actually clear the stored value instead of
  // leaving it untouched.
  function clearEditNumber(key: NumericPrinterField) {
    setEdit(key, null);
  }

  async function handleSaveEdit(e: FormEvent) {
    e.preventDefault();
    setEditError(null);
    try {
      await updateMutation.mutateAsync(omitBlankFields(editForm, OMIT_WHEN_BLANK));
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
      <h1 className="text-2xl font-semibold text-slate-900">Printers</h1>

      <form onSubmit={handleAdd} className="flex flex-col gap-3 rounded border border-slate-200 p-4">
        <div className="flex flex-wrap items-end gap-3">
          <FormField id="add-name" label="Name" value={addForm.name} onChange={(e) => setAdd('name', e.target.value)} required />
          <div className="flex flex-col gap-1">
            <label htmlFor="add-status" className="text-sm font-medium text-slate-700">
              Status
            </label>
            <select
              id="add-status"
              value={addForm.status}
              onChange={(e) => setAdd('status', e.target.value as (typeof STATUSES)[number])}
              className="rounded border border-slate-300 px-3 py-2 text-sm"
            >
              {STATUSES.map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="add-process" className="text-sm font-medium text-slate-700">
              Process
            </label>
            <select
              id="add-process"
              value={addForm.process}
              onChange={(e) => setAdd('process', e.target.value as (typeof PROCESSES)[number])}
              className="rounded border border-slate-300 px-3 py-2 text-sm"
            >
              {PROCESSES.map((process) => (
                <option key={process} value={process}>
                  {process}
                </option>
              ))}
            </select>
          </div>
          <button
            type="submit"
            disabled={createMutation.isPending}
            className="rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            Add
          </button>
        </div>
        <MoreDetailsToggle>
          <FormField id="add-make" label="Make" value={addForm.make ?? ''} onChange={(e) => setAdd('make', e.target.value)} />
          <FormField id="add-model" label="Model" value={addForm.model ?? ''} onChange={(e) => setAdd('model', e.target.value)} />
          <NumberField
            id="add-buildVolumeXMm"
            label="Build volume X (mm)"
            value={addForm.buildVolumeXMm ?? ''}
            onChange={(raw) => setAddNumber('buildVolumeXMm', raw)}
          />
          <NumberField
            id="add-buildVolumeYMm"
            label="Build volume Y (mm)"
            value={addForm.buildVolumeYMm ?? ''}
            onChange={(raw) => setAddNumber('buildVolumeYMm', raw)}
          />
          <NumberField
            id="add-buildVolumeZMm"
            label="Build volume Z (mm)"
            value={addForm.buildVolumeZMm ?? ''}
            onChange={(raw) => setAddNumber('buildVolumeZMm', raw)}
          />
          <FormField
            id="add-purchaseDate"
            label="Purchase date"
            type="date"
            value={addForm.purchaseDate ?? ''}
            onChange={(e) => setAdd('purchaseDate', e.target.value)}
          />
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Required for job costing</p>
          <NumberField
            id="add-purchaseCost"
            label="Purchase cost"
            value={addForm.purchaseCost ?? ''}
            onChange={(raw) => setAddNumber('purchaseCost', raw)}
          />
          <NumberField
            id="add-powerDrawWatts"
            label="Power draw (W)"
            value={addForm.powerDrawWatts ?? ''}
            onChange={(raw) => setAddNumber('powerDrawWatts', raw)}
          />
          <NumberField
            id="add-electricityRatePerKwh"
            label="Electricity rate per kWh"
            min="0"
            value={addForm.electricityRatePerKwh ?? ''}
            onChange={(raw) => setAddNumber('electricityRatePerKwh', raw)}
          />
          <NumberField
            id="add-expectedLifetimeHours"
            label="Expected lifetime (hours)"
            min="0.01"
            value={addForm.expectedLifetimeHours ?? ''}
            onChange={(raw) => setAddNumber('expectedLifetimeHours', raw)}
          />
        </MoreDetailsToggle>
        {addError && <p className="text-sm text-red-600">{addError}</p>}
      </form>

      {isLoading && <p className="text-slate-500">Loading…</p>}
      {isError && <p className="text-red-600">Couldn't load printers. Try refreshing the page.</p>}
      {!isLoading && !isError && printers?.length === 0 && <p className="text-slate-500">No printers yet.</p>}
      {!isLoading && !isError && printers && printers.length > 0 && (
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-slate-500">
              <th className="py-2">Name</th>
              <th className="py-2">Make</th>
              <th className="py-2">Model</th>
              <th className="py-2">Status</th>
              <th className="py-2"></th>
            </tr>
          </thead>
          <tbody>
            {printers.map((printer) => (
              <InlineEditableRow
                key={printer.id}
                isEditing={editingId === printer.id}
                readOnlyContent={
                  <>
                    <td id={`printer-row-${printer.id}`} className="py-2">
                      {printer.name}
                    </td>
                    <td className="py-2">{printer.make ?? '—'}</td>
                    <td className="py-2">{printer.model ?? '—'}</td>
                    <td className="py-2">{printer.status}</td>
                    <td className="py-2 text-right">
                      <button type="button" onClick={() => startEdit(printer)} className="text-slate-600 underline">
                        Edit
                      </button>
                    </td>
                  </>
                }
                editContent={
                  <td colSpan={5} className="py-3">
                    <form onSubmit={handleSaveEdit} className="flex flex-col gap-3 pb-6">
                      <div className="flex flex-wrap items-end gap-3">
                        <FormField id="edit-name" label="Name" value={editForm.name} onChange={(e) => setEdit('name', e.target.value)} required />
                        <div className="flex flex-col gap-1">
                          <label htmlFor="edit-status" className="text-sm font-medium text-slate-700">
                            Status
                          </label>
                          <select
                            id="edit-status"
                            value={editForm.status}
                            onChange={(e) => setEdit('status', e.target.value as (typeof STATUSES)[number])}
                            className="rounded border border-slate-300 px-3 py-2 text-sm"
                          >
                            {STATUSES.map((status) => (
                              <option key={status} value={status}>
                                {status}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div className="flex flex-col gap-1">
                          <label htmlFor="edit-process" className="text-sm font-medium text-slate-700">
                            Process
                          </label>
                          <select
                            id="edit-process"
                            value={editForm.process}
                            onChange={(e) => setEdit('process', e.target.value as (typeof PROCESSES)[number])}
                            className="rounded border border-slate-300 px-3 py-2 text-sm"
                          >
                            {PROCESSES.map((process) => (
                              <option key={process} value={process}>
                                {process}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>
                      <MoreDetailsToggle>
                        <FormField id="edit-make" label="Make" value={editForm.make ?? ''} onChange={(e) => setEdit('make', e.target.value)} />
                        <FormField id="edit-model" label="Model" value={editForm.model ?? ''} onChange={(e) => setEdit('model', e.target.value)} />
                        <NumberField
                          id="edit-buildVolumeXMm"
                          label="Build volume X (mm)"
                          value={editForm.buildVolumeXMm ?? ''}
                          onChange={(raw) => setEditNumber('buildVolumeXMm', raw)}
                          onClear={() => clearEditNumber('buildVolumeXMm')}
                        />
                        <NumberField
                          id="edit-buildVolumeYMm"
                          label="Build volume Y (mm)"
                          value={editForm.buildVolumeYMm ?? ''}
                          onChange={(raw) => setEditNumber('buildVolumeYMm', raw)}
                          onClear={() => clearEditNumber('buildVolumeYMm')}
                        />
                        <NumberField
                          id="edit-buildVolumeZMm"
                          label="Build volume Z (mm)"
                          value={editForm.buildVolumeZMm ?? ''}
                          onChange={(raw) => setEditNumber('buildVolumeZMm', raw)}
                          onClear={() => clearEditNumber('buildVolumeZMm')}
                        />
                        <FormField
                          id="edit-purchaseDate"
                          label="Purchase date"
                          type="date"
                          value={editForm.purchaseDate ?? ''}
                          onChange={(e) => setEdit('purchaseDate', e.target.value)}
                        />
                        <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Required for job costing</p>
                        <NumberField
                          id="edit-purchaseCost"
                          label="Purchase cost"
                          value={editForm.purchaseCost ?? ''}
                          onChange={(raw) => setEditNumber('purchaseCost', raw)}
                          onClear={() => clearEditNumber('purchaseCost')}
                        />
                        <NumberField
                          id="edit-powerDrawWatts"
                          label="Power draw (W)"
                          value={editForm.powerDrawWatts ?? ''}
                          onChange={(raw) => setEditNumber('powerDrawWatts', raw)}
                          onClear={() => clearEditNumber('powerDrawWatts')}
                        />
                        <NumberField
                          id="edit-electricityRatePerKwh"
                          label="Electricity rate per kWh"
                          min="0"
                          value={editForm.electricityRatePerKwh ?? ''}
                          onChange={(raw) => setEditNumber('electricityRatePerKwh', raw)}
                          onClear={() => clearEditNumber('electricityRatePerKwh')}
                        />
                        <NumberField
                          id="edit-expectedLifetimeHours"
                          label="Expected lifetime (hours)"
                          min="0.01"
                          value={editForm.expectedLifetimeHours ?? ''}
                          onChange={(raw) => setEditNumber('expectedLifetimeHours', raw)}
                          onClear={() => clearEditNumber('expectedLifetimeHours')}
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
                    <PresetsSection printerId={printer.id} />
                    <MaintenanceLogSection printerId={printer.id} />
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
