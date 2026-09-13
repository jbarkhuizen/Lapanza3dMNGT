import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { FormField } from '../../components/FormField.js';
import { ApiError } from '../../api/client.js';
import { useCreateCostingTemplate, type CostingTemplateFormInput } from '../../api/costingTemplates.js';
import { useFilaments } from '../../api/filaments.js';
import { usePrinters } from '../../api/printers.js';
import { useLabourSteps } from '../../api/labourSteps.js';
import { useConsumables } from '../../api/consumables.js';
import { useScanners } from '../../api/scanners.js';
import { useLaserMaterials } from '../../api/laserMaterials.js';
import { usePremadeItems } from '../../api/premadeItems.js';

interface LabourLineDraft {
  labourStepId: string;
  hours: string;
}

interface ConsumableLineDraft {
  consumableId: string;
  quantity: string;
}

// The four backend process variants -- see the design spec's "Data model"
// section. Each swaps in its own input group below; only one group's
// fields are sent to the server, matching the backend's discriminated
// union on `process`.
const PROCESSES = [
  { value: 'printer', label: 'Printer' },
  { value: 'scanner', label: 'Scanner' },
  { value: 'laser_sheet', label: 'Laser — sheet' },
  { value: 'laser_premade', label: 'Laser — premade item' },
] as const;
type Process = (typeof PROCESSES)[number]['value'];

export function CostingTemplateCreatePage() {
  const navigate = useNavigate();
  const { data: filaments, isLoading: isLoadingFilaments } = useFilaments();
  const { data: printers, isLoading: isLoadingPrinters } = usePrinters();
  const { data: labourSteps, isLoading: isLoadingLabourSteps } = useLabourSteps();
  const { data: consumables, isLoading: isLoadingConsumables } = useConsumables();
  const { data: scanners, isLoading: isLoadingScanners } = useScanners();
  const { data: laserMaterials, isLoading: isLoadingLaserMaterials } = useLaserMaterials();
  const { data: premadeItems, isLoading: isLoadingPremadeItems } = usePremadeItems();
  const createMutation = useCreateCostingTemplate();

  const [process, setProcess] = useState<Process>('printer');
  const [name, setName] = useState('');
  const [filamentId, setFilamentId] = useState('');
  const [weightGrams, setWeightGrams] = useState('');
  const [printerId, setPrinterId] = useState('');
  const [printTimeHours, setPrintTimeHours] = useState('');
  const [scannerId, setScannerId] = useState('');
  const [scanHours, setScanHours] = useState('');
  const [laserMaterialId, setLaserMaterialId] = useState('');
  const [sheetAreaUsedM2, setSheetAreaUsedM2] = useState('');
  const [premadeItemId, setPremadeItemId] = useState('');
  const [premadeItemQuantity, setPremadeItemQuantity] = useState('');
  const [markupPercent, setMarkupPercent] = useState('');
  const [labourLines, setLabourLines] = useState<LabourLineDraft[]>([]);
  const [consumableLines, setConsumableLines] = useState<ConsumableLineDraft[]>([]);
  const [error, setError] = useState<string | null>(null);

  function addLabourLine() {
    setLabourLines((prev) => [...prev, { labourStepId: labourSteps?.[0]?.id ?? '', hours: '' }]);
  }
  function updateLabourLine(index: number, patch: Partial<LabourLineDraft>) {
    setLabourLines((prev) => prev.map((line, i) => (i === index ? { ...line, ...patch } : line)));
  }
  function removeLabourLine(index: number) {
    setLabourLines((prev) => prev.filter((_, i) => i !== index));
  }

  function addConsumableLine() {
    setConsumableLines((prev) => [...prev, { consumableId: consumables?.[0]?.id ?? '', quantity: '' }]);
  }
  function updateConsumableLine(index: number, patch: Partial<ConsumableLineDraft>) {
    setConsumableLines((prev) => prev.map((line, i) => (i === index ? { ...line, ...patch } : line)));
  }
  function removeConsumableLine(index: number) {
    setConsumableLines((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const sharedFields = {
      name,
      markupPercent: Number(markupPercent),
      labourLines: labourLines.map((line) => ({ labourStepId: line.labourStepId, hours: Number(line.hours) })),
      consumableLines: consumableLines.map((line) => ({ consumableId: line.consumableId, quantity: Number(line.quantity) })),
    };
    let payload: CostingTemplateFormInput;
    if (process === 'printer') {
      payload = {
        process: 'printer',
        ...sharedFields,
        filamentId,
        weightGrams: Number(weightGrams),
        printerId,
        printTimeHours: Number(printTimeHours),
      };
    } else if (process === 'scanner') {
      payload = {
        process: 'scanner',
        ...sharedFields,
        scannerId,
        scanHours: Number(scanHours),
      };
    } else if (process === 'laser_sheet') {
      payload = {
        process: 'laser_sheet',
        ...sharedFields,
        laserMaterialId,
        sheetAreaUsedM2: Number(sheetAreaUsedM2),
      };
    } else {
      payload = {
        process: 'laser_premade',
        ...sharedFields,
        premadeItemId,
        premadeItemQuantity: Number(premadeItemQuantity),
      };
    }
    try {
      const created = await createMutation.mutateAsync(payload);
      navigate(`/costing-templates/${created.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong. Try again shortly.');
    }
  }

  const isLoadingReferenceData = isLoadingFilaments || isLoadingPrinters || isLoadingLabourSteps || isLoadingConsumables
    || isLoadingScanners || isLoadingLaserMaterials || isLoadingPremadeItems;

  return (
    <form onSubmit={handleSubmit} className="flex max-w-xl flex-col gap-4">
      <h1 className="text-2xl font-semibold text-slate-900">New Costing Template</h1>
      <FormField id="templateName" label="Template name" value={name} onChange={(e) => setName(e.target.value)} required />

      <div className="flex flex-col gap-1">
        <label htmlFor="process" className="text-sm font-medium text-slate-700">Process</label>
        <select
          id="process"
          value={process}
          onChange={(e) => setProcess(e.target.value as Process)}
          className="rounded border border-slate-300 px-3 py-2 text-sm"
        >
          {PROCESSES.map((p) => (
            <option key={p.value} value={p.value}>{p.label}</option>
          ))}
        </select>
      </div>

      {process === 'printer' && (
        <>
          <div className="flex flex-col gap-1">
            <label htmlFor="filamentId" className="text-sm font-medium text-slate-700">Filament</label>
            <select
              id="filamentId"
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

          <FormField id="weightGrams" label="Weight (g)" type="number" min="0.01" value={weightGrams} onChange={(e) => setWeightGrams(e.target.value)} required />

          <div className="flex flex-col gap-1">
            <label htmlFor="printerId" className="text-sm font-medium text-slate-700">Printer</label>
            <select
              id="printerId"
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

          <FormField id="printTimeHours" label="Print time (hours)" type="number" min="0.01" value={printTimeHours} onChange={(e) => setPrintTimeHours(e.target.value)} required />
        </>
      )}

      {process === 'scanner' && (
        <>
          <div className="flex flex-col gap-1">
            <label htmlFor="scannerId" className="text-sm font-medium text-slate-700">Scanner</label>
            <select
              id="scannerId"
              value={scannerId}
              onChange={(e) => setScannerId(e.target.value)}
              disabled={isLoadingScanners}
              required
              className="rounded border border-slate-300 px-3 py-2 text-sm"
            >
              <option value="" disabled>Select a scanner…</option>
              {scanners?.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>
          <FormField id="scanHours" label="Scan hours" type="number" min="0.01" value={scanHours} onChange={(e) => setScanHours(e.target.value)} required />
        </>
      )}

      {process === 'laser_sheet' && (
        <>
          <div className="flex flex-col gap-1">
            <label htmlFor="laserMaterialId" className="text-sm font-medium text-slate-700">Laser material</label>
            <select
              id="laserMaterialId"
              value={laserMaterialId}
              onChange={(e) => setLaserMaterialId(e.target.value)}
              disabled={isLoadingLaserMaterials}
              required
              className="rounded border border-slate-300 px-3 py-2 text-sm"
            >
              <option value="" disabled>Select a laser material…</option>
              {laserMaterials?.map((m) => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
            </select>
          </div>
          <FormField id="sheetAreaUsedM2" label="Sheet area used (m²)" type="number" min="0.01" value={sheetAreaUsedM2} onChange={(e) => setSheetAreaUsedM2(e.target.value)} required />
        </>
      )}

      {process === 'laser_premade' && (
        <>
          <div className="flex flex-col gap-1">
            <label htmlFor="premadeItemId" className="text-sm font-medium text-slate-700">Pre-made item</label>
            <select
              id="premadeItemId"
              value={premadeItemId}
              onChange={(e) => setPremadeItemId(e.target.value)}
              disabled={isLoadingPremadeItems}
              required
              className="rounded border border-slate-300 px-3 py-2 text-sm"
            >
              <option value="" disabled>Select a pre-made item…</option>
              {premadeItems?.map((item) => (
                <option key={item.id} value={item.id}>{item.name}</option>
              ))}
            </select>
          </div>
          <FormField id="premadeItemQuantity" label="Quantity" type="number" min="1" step="1" value={premadeItemQuantity} onChange={(e) => setPremadeItemQuantity(e.target.value)} required />
        </>
      )}

      <FormField id="markupPercent" label="Markup (%)" type="number" min="0" max="9999.99" value={markupPercent} onChange={(e) => setMarkupPercent(e.target.value)} required />

      <section className="flex flex-col gap-3 border-t border-slate-200 pt-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900">Labour lines</h2>
          <button type="button" onClick={addLabourLine} disabled={isLoadingLabourSteps || !labourSteps?.length} className="rounded bg-slate-100 px-3 py-1 text-sm">
            Add Labour Line
          </button>
        </div>
        {!isLoadingLabourSteps && labourSteps?.length === 0 && (
          <p className="text-sm text-slate-500">Add a labour step first (Labour Steps page) before adding one here.</p>
        )}
        {labourLines.map((line, i) => (
          <div key={i} className="flex items-end gap-3">
            <div className="flex flex-col gap-1">
              <label htmlFor={`labourStep-${i}`} className="text-sm font-medium text-slate-700">Labour step</label>
              <select
                id={`labourStep-${i}`}
                aria-label={`Labour step (line ${i + 1})`}
                value={line.labourStepId}
                onChange={(e) => updateLabourLine(i, { labourStepId: e.target.value })}
                className="rounded border border-slate-300 px-3 py-2 text-sm"
              >
                {labourSteps?.map((step) => (
                  <option key={step.id} value={step.id}>{step.name}</option>
                ))}
              </select>
            </div>
            <FormField
              id={`labourHours-${i}`}
              label="Hours"
              type="number"
              min="0.01"
              aria-label={`Hours (labour line ${i + 1})`}
              value={line.hours}
              onChange={(e) => updateLabourLine(i, { hours: e.target.value })}
              required
            />
            <button type="button" onClick={() => removeLabourLine(i)} className="text-sm text-red-600">Remove</button>
          </div>
        ))}
      </section>

      <section className="flex flex-col gap-3 border-t border-slate-200 pt-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900">Consumable lines</h2>
          <button type="button" onClick={addConsumableLine} disabled={isLoadingConsumables || !consumables?.length} className="rounded bg-slate-100 px-3 py-1 text-sm">
            Add Consumable Line
          </button>
        </div>
        {!isLoadingConsumables && consumables?.length === 0 && (
          <p className="text-sm text-slate-500">Add a consumable first (Consumables page) before adding one here.</p>
        )}
        {consumableLines.map((line, i) => (
          <div key={i} className="flex items-end gap-3">
            <div className="flex flex-col gap-1">
              <label htmlFor={`consumable-${i}`} className="text-sm font-medium text-slate-700">Consumable</label>
              <select
                id={`consumable-${i}`}
                aria-label={`Consumable (line ${i + 1})`}
                value={line.consumableId}
                onChange={(e) => updateConsumableLine(i, { consumableId: e.target.value })}
                className="rounded border border-slate-300 px-3 py-2 text-sm"
              >
                {consumables?.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
            <FormField
              id={`consumableQuantity-${i}`}
              label="Quantity"
              type="number"
              min="0.01"
              aria-label={`Quantity (consumable line ${i + 1})`}
              value={line.quantity}
              onChange={(e) => updateConsumableLine(i, { quantity: e.target.value })}
              required
            />
            <button type="button" onClick={() => removeConsumableLine(i)} className="text-sm text-red-600">Remove</button>
          </div>
        ))}
      </section>

      {error && <p className="text-sm text-red-600">{error}</p>}
      <button
        type="submit"
        disabled={createMutation.isPending || isLoadingReferenceData}
        className="w-fit rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
      >
        Create Costing Template
      </button>
    </form>
  );
}
