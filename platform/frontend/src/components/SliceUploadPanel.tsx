import { useEffect, useId, useState } from 'react';
import { usePrinters } from '../api/printers.js';
import { usePrinterPresets } from '../api/printerPresets.js';
import { useFilaments } from '../api/filaments.js';
import { useCreateSliceJob, useSliceJob } from '../api/slicer.js';
import { ApiError } from '../api/client.js';

// The one shared contract every touch point (standalone tool, Costing
// Templates, Job Cards, Quotes) wires up differently on `onResult`. `jobId`
// is included (beyond the four numeric fields) so callers that need
// traceability (Costing Templates' and Job Cards' `sliceJobId` columns) can
// store it without a second round trip.
export interface SliceResult {
  jobId: string;
  fileName: string;
  weightGrams: number;
  supportWeightGrams: number;
  filamentLengthMm: number;
  printTimeHours: number;
}

interface SliceUploadPanelProps {
  onResult?: (result: SliceResult) => void;
}

export function SliceUploadPanel({ onResult }: SliceUploadPanelProps) {
  const idPrefix = useId();
  const { data: printers, isLoading: isLoadingPrinters } = usePrinters();
  const { data: filaments, isLoading: isLoadingFilaments } = useFilaments();

  const [file, setFile] = useState<File | null>(null);
  const [printerId, setPrinterId] = useState('');
  const [printerPresetId, setPrinterPresetId] = useState('');
  const [filamentId, setFilamentId] = useState('');
  const [jobId, setJobId] = useState<string | undefined>(undefined);
  const [notifiedForJobId, setNotifiedForJobId] = useState<string | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);

  const { data: printerPresets } = usePrinterPresets(printerId, { enabled: !!printerId });
  const createMutation = useCreateSliceJob();
  const { data: job } = useSliceJob(jobId);

  // A job is "in flight" from the moment it's created until we see a
  // terminal status -- including the brief window between the create
  // response and the first GET /api/slicer/jobs/:id resolving, when `job`
  // itself is still undefined. Without this, the Slice button would flash
  // back into view for that window.
  const isInFlight = jobId !== undefined && (!job || job.status === 'queued' || job.status === 'processing');
  const isDone = job?.status === 'done';
  const isFailed = job?.status === 'failed';

  // Fires onResult exactly once per completed job, when it first reaches
  // 'done' -- guarded by notifiedForJobId so react-query's ongoing refetches
  // of an already-terminal job (the query itself stops polling once
  // status is terminal, but React may still re-render) never double-fire it.
  useEffect(() => {
    if (job && job.status === 'done' && job.id !== notifiedForJobId) {
      setNotifiedForJobId(job.id);
      onResult?.({
        jobId: job.id,
        fileName: job.originFileName,
        weightGrams: job.resultWeightGrams ?? 0,
        supportWeightGrams: job.resultSupportWeightGrams ?? 0,
        filamentLengthMm: job.resultFilamentLengthMm ?? 0,
        printTimeHours: job.resultPrintTimeHours ?? 0,
      });
    }
  }, [job, notifiedForJobId, onResult]);

  async function handleSlice() {
    if (!file) {
      setError('Choose an .stl file first.');
      return;
    }
    setError(null);
    try {
      const createdJob = await createMutation.mutateAsync({
        file,
        printerId: printerId || undefined,
        printerPresetId: printerPresetId || undefined,
        filamentId: filamentId || undefined,
      });
      setJobId(createdJob.id);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong. Try again shortly.');
    }
  }

  function handleTryAgain() {
    setJobId(undefined);
    setNotifiedForJobId(undefined);
    setFile(null);
    setError(null);
  }

  return (
    <div className="flex flex-col gap-4 rounded border border-slate-200 p-4">
      <div className="flex flex-col gap-1">
        <label htmlFor={`${idPrefix}-file`} className="text-sm font-medium text-slate-700">
          STL file
        </label>
        <input
          id={`${idPrefix}-file`}
          type="file"
          accept=".stl"
          disabled={isInFlight}
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          className="text-sm"
        />
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor={`${idPrefix}-printer`} className="text-sm font-medium text-slate-700">
          Printer (optional)
        </label>
        <select
          id={`${idPrefix}-printer`}
          value={printerId}
          onChange={(e) => {
            setPrinterId(e.target.value);
            setPrinterPresetId('');
          }}
          disabled={isLoadingPrinters || isInFlight}
          className="rounded border border-slate-300 px-3 py-2 text-sm"
        >
          <option value="">No printer selected</option>
          {printers?.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
      </div>

      {printerId && (
        <div className="flex flex-col gap-1">
          <label htmlFor={`${idPrefix}-preset`} className="text-sm font-medium text-slate-700">
            Printer preset (optional)
          </label>
          <select
            id={`${idPrefix}-preset`}
            value={printerPresetId}
            onChange={(e) => setPrinterPresetId(e.target.value)}
            disabled={isInFlight}
            className="rounded border border-slate-300 px-3 py-2 text-sm"
          >
            <option value="">Default profile</option>
            {printerPresets?.map((preset) => (
              <option key={preset.id} value={preset.id}>{preset.name}</option>
            ))}
          </select>
        </div>
      )}

      <div className="flex flex-col gap-1">
        <label htmlFor={`${idPrefix}-filament`} className="text-sm font-medium text-slate-700">
          Filament (optional)
        </label>
        <select
          id={`${idPrefix}-filament`}
          value={filamentId}
          onChange={(e) => setFilamentId(e.target.value)}
          disabled={isLoadingFilaments || isInFlight}
          className="rounded border border-slate-300 px-3 py-2 text-sm"
        >
          <option value="">No filament selected</option>
          {filaments?.map((f) => (
            <option key={f.id} value={f.id}>{f.brand} — {f.materialType}</option>
          ))}
        </select>
      </div>

      {!isInFlight && !isDone && !isFailed && (
        <button
          type="button"
          onClick={handleSlice}
          disabled={createMutation.isPending}
          className="w-fit rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          Slice
        </button>
      )}

      {isInFlight && <p className="text-sm text-slate-500">Slicing… this can take a minute.</p>}

      {isDone && job && (
        <div className="flex flex-col gap-1 rounded bg-slate-50 p-3 text-sm">
          <div className="flex justify-between"><span>Weight</span><span>{job.resultWeightGrams?.toFixed(2)} g</span></div>
          <div className="flex justify-between"><span>Support weight</span><span>{job.resultSupportWeightGrams?.toFixed(2)} g</span></div>
          <div className="flex justify-between"><span>Filament length</span><span>{job.resultFilamentLengthMm?.toFixed(1)} mm</span></div>
          <div className="flex justify-between"><span>Print time</span><span>{job.resultPrintTimeHours?.toFixed(2)} h</span></div>
          <button type="button" onClick={handleTryAgain} className="mt-2 w-fit text-sm text-slate-600 underline">
            Slice another file
          </button>
        </div>
      )}

      {isFailed && job && (
        <div className="flex flex-col gap-2">
          <p className="text-sm text-red-600">{job.errorMessage ?? 'Slicing failed.'}</p>
          <button type="button" onClick={handleTryAgain} className="w-fit rounded bg-slate-100 px-3 py-2 text-sm">
            Try again
          </button>
        </div>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
