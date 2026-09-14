import { useState } from 'react';
import { SliceUploadPanel, type SliceResult } from '../../components/SliceUploadPanel.js';

export function SlicerToolPage() {
  const [lastResult, setLastResult] = useState<SliceResult | null>(null);

  return (
    <div className="flex max-w-xl flex-col gap-4">
      <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">Slicer</h1>
      <p className="text-sm text-slate-500 dark:text-slate-400">
        Upload an STL to see its weight, support weight, filament length, and print time — no need to type them in by
        hand.
      </p>
      <SliceUploadPanel onResult={setLastResult} />
      {lastResult && (
        <section className="flex flex-col gap-1 rounded border border-slate-200 p-4 text-sm dark:border-slate-700">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Last result</h2>
          <div className="flex justify-between"><span>Weight</span><span>{lastResult.weightGrams.toFixed(2)} g</span></div>
          <div className="flex justify-between"><span>Support weight</span><span>{lastResult.supportWeightGrams.toFixed(2)} g</span></div>
          <div className="flex justify-between"><span>Filament length</span><span>{lastResult.filamentLengthMm.toFixed(1)} mm</span></div>
          <div className="flex justify-between"><span>Print time</span><span>{lastResult.printTimeHours.toFixed(2)} h</span></div>
        </section>
      )}
    </div>
  );
}
