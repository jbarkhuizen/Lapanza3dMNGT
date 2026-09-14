import { useState, type FormEvent } from 'react';
import { FormField } from '../FormField.js';
import { ApiError } from '../../api/client.js';
import {
  useMaintenanceLog,
  useCreateMaintenanceLogEntry,
  type MaintenanceLogFormInput,
} from '../../api/printerMaintenance.js';

const emptyForm: MaintenanceLogFormInput = { date: '', description: '' };

export function MaintenanceLogSection({ printerId }: { printerId: string }) {
  const { data: entries, isLoading, isError } = useMaintenanceLog(printerId);
  const createMutation = useCreateMaintenanceLogEntry(printerId);
  const [form, setForm] = useState<MaintenanceLogFormInput>(emptyForm);
  const [error, setError] = useState<string | null>(null);

  function set<K extends keyof MaintenanceLogFormInput>(key: K, value: MaintenanceLogFormInput[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function setCost(raw: string) {
    set('cost', raw ? Number(raw) : undefined);
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
    <section className="flex flex-col gap-3 border-t border-slate-200 pt-6 dark:border-slate-700">
      <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Maintenance Log</h2>
      {isLoading && <p className="text-slate-500 dark:text-slate-400">Loading…</p>}
      {isError && <p className="text-red-600 dark:text-red-400">Couldn't load maintenance entries.</p>}
      {!isLoading && !isError && entries?.length === 0 && <p className="text-slate-500 dark:text-slate-400">No maintenance entries yet.</p>}
      {!isLoading && !isError && entries && entries.length > 0 && (
        <ul className="flex flex-col gap-2 text-sm">
          {entries.map((entry) => (
            <li key={entry.id} className="flex justify-between border-b border-slate-100 py-1 dark:border-slate-800">
              <span>{entry.date.slice(0, 10)} — {entry.description}</span>
              <span className="text-slate-500 dark:text-slate-400">{entry.performedBy ?? ''}</span>
            </li>
          ))}
        </ul>
      )}
      <form onSubmit={handleSubmit} className="flex flex-wrap items-end gap-3">
        <FormField id="maintenanceDate" label="Date" type="date" value={form.date} onChange={(e) => set('date', e.target.value)} required />
        <FormField id="maintenanceDescription" label="Description" value={form.description} onChange={(e) => set('description', e.target.value)} required />
        <FormField id="maintenanceCost" label="Cost" type="number" value={form.cost ?? ''} onChange={(e) => setCost(e.target.value)} />
        <FormField id="maintenancePerformedBy" label="Performed by" value={form.performedBy ?? ''} onChange={(e) => set('performedBy', e.target.value)} />
        <button
          type="submit"
          disabled={createMutation.isPending}
          className="rounded bg-slate-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-slate-100 dark:text-slate-900"
        >
          Add Entry
        </button>
      </form>
      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
    </section>
  );
}
