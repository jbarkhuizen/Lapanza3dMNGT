import { useState, type FormEvent } from 'react';
import { FormField } from '../FormField.js';
import { ApiError } from '../../api/client.js';
import { usePrinterPresets, useCreatePrinterPreset, type PrinterPresetFormInput } from '../../api/printerPresets.js';

const emptyForm: PrinterPresetFormInput = { name: '', materialType: '' };

export function PresetsSection({ printerId }: { printerId: string }) {
  const { data: presets, isLoading, isError } = usePrinterPresets(printerId);
  const createMutation = useCreatePrinterPreset(printerId);
  const [form, setForm] = useState<PrinterPresetFormInput>(emptyForm);
  const [error, setError] = useState<string | null>(null);

  function set<K extends keyof PrinterPresetFormInput>(key: K, value: PrinterPresetFormInput[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await createMutation.mutateAsync(form);
      setForm(emptyForm);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong. Try again shortly.');
    }
  }

  return (
    <section className="flex flex-col gap-3 border-t border-slate-200 pt-6">
      <h2 className="text-lg font-semibold text-slate-900">Printer Presets</h2>
      {isLoading && <p className="text-slate-500">Loading…</p>}
      {isError && <p className="text-red-600">Couldn't load presets.</p>}
      {!isLoading && !isError && presets?.length === 0 && <p className="text-slate-500">No presets yet.</p>}
      {!isLoading && !isError && presets && presets.length > 0 && (
        <ul className="flex flex-col gap-2 text-sm">
          {presets.map((preset) => (
            <li key={preset.id} className="flex justify-between border-b border-slate-100 py-1">
              <span>{preset.name}</span>
              <span className="text-slate-500">{preset.materialType}</span>
            </li>
          ))}
        </ul>
      )}
      <form onSubmit={handleSubmit} className="flex flex-wrap items-end gap-3">
        <FormField id="presetName" label="Preset name" value={form.name} onChange={(e) => set('name', e.target.value)} required />
        <FormField id="presetMaterialType" label="Material type" value={form.materialType} onChange={(e) => set('materialType', e.target.value)} required />
        <button
          type="submit"
          disabled={createMutation.isPending}
          className="rounded bg-slate-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          Add Preset
        </button>
      </form>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </section>
  );
}
