import { useId, useState } from 'react';
import { SliceUploadPanel, type SliceResult } from './SliceUploadPanel.js';
import { FormField } from './FormField.js';
import { useFilaments } from '../api/filaments.js';
import { usePrinters } from '../api/printers.js';
import { useCreateCostingTemplate } from '../api/costingTemplates.js';
import { ApiError } from '../api/client.js';

// Quotes has no fields of its own to fill from a slice (QuoteLineItem only
// ever references a costingTemplateId) -- so "slice a file to build this
// line" walks straight into the same create-a-Costing-Template flow already
// used when manually building a quote line from one, just pre-filled with
// the slice's weight/time. See the slicer design spec's Quotes section.
interface SliceToCostingTemplatePanelProps {
  onAttached: (costingTemplateId: string) => void;
  onCancel: () => void;
}

export function SliceToCostingTemplatePanel({ onAttached, onCancel }: SliceToCostingTemplatePanelProps) {
  const idPrefix = useId();
  const { data: filaments, isLoading: isLoadingFilaments } = useFilaments();
  const { data: printers, isLoading: isLoadingPrinters } = usePrinters();
  const createTemplateMutation = useCreateCostingTemplate();

  const [sliceResult, setSliceResult] = useState<SliceResult | null>(null);
  const [name, setName] = useState('');
  const [filamentId, setFilamentId] = useState('');
  const [printerId, setPrinterId] = useState('');
  const [markupPercent, setMarkupPercent] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function handleCreateAndAttach() {
    if (!sliceResult) return;
    setError(null);
    try {
      const created = await createTemplateMutation.mutateAsync({
        process: 'printer',
        name,
        filamentId,
        weightGrams: sliceResult.weightGrams,
        printerId,
        printTimeHours: sliceResult.printTimeHours,
        sliceJobId: sliceResult.jobId,
        markupPercent: Number(markupPercent),
        labourLines: [],
        consumableLines: [],
      });
      onAttached(created.id);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong. Try again shortly.');
    }
  }

  return (
    <div className="flex flex-col gap-3 rounded border border-slate-200 p-3">
      {!sliceResult ? (
        <SliceUploadPanel onResult={setSliceResult} />
      ) : (
        <>
          <p className="text-sm text-slate-500">
            Slice result: {sliceResult.weightGrams.toFixed(2)} g, {sliceResult.printTimeHours.toFixed(2)} h. Fill in
            the rest to save it as a Costing Template and attach it to this line.
          </p>
          <FormField id={`${idPrefix}-name`} label="Template name" value={name} onChange={(e) => setName(e.target.value)} required />
          <div className="flex flex-col gap-1">
            <label htmlFor={`${idPrefix}-filament`} className="text-sm font-medium text-slate-700">Filament</label>
            <select
              id={`${idPrefix}-filament`}
              value={filamentId}
              onChange={(e) => setFilamentId(e.target.value)}
              disabled={isLoadingFilaments}
              required
              className="rounded border border-slate-300 px-3 py-2 text-sm"
            >
              <option value="" disabled>Select a filament…</option>
              {filaments?.map((f) => (
                <option key={f.id} value={f.id}>{f.brand} — {f.materialType}</option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor={`${idPrefix}-printer`} className="text-sm font-medium text-slate-700">Printer</label>
            <select
              id={`${idPrefix}-printer`}
              value={printerId}
              onChange={(e) => setPrinterId(e.target.value)}
              disabled={isLoadingPrinters}
              required
              className="rounded border border-slate-300 px-3 py-2 text-sm"
            >
              <option value="" disabled>Select a printer…</option>
              {printers?.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>
          <FormField
            id={`${idPrefix}-markup`}
            label="Markup (%)"
            type="number"
            min="0"
            max="9999.99"
            value={markupPercent}
            onChange={(e) => setMarkupPercent(e.target.value)}
            required
          />
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleCreateAndAttach}
              disabled={createTemplateMutation.isPending || !name || !filamentId || !printerId || !markupPercent}
              className="w-fit rounded bg-slate-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              Create & attach
            </button>
            <button type="button" onClick={onCancel} className="w-fit rounded bg-slate-100 px-3 py-2 text-sm">
              Cancel
            </button>
          </div>
        </>
      )}
    </div>
  );
}
