import { useParams } from 'react-router-dom';
import { useCostingTemplate } from '../../api/costingTemplates.js';
import { ApiError } from '../../api/client.js';
import { formatCurrency as money } from '../../lib/formatCurrency.js';

export function CostingTemplateDetailPage() {
  const { id } = useParams();
  const { data: template, isLoading, isError, error } = useCostingTemplate(id);

  if (isLoading) {
    return <p className="text-slate-500">Loading…</p>;
  }
  if (isError || !template) {
    return (
      <p className="text-red-600">
        {error instanceof ApiError ? error.message : "Couldn't load this costing template."}
      </p>
    );
  }

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <h1 className="text-2xl font-semibold text-slate-900">{template.name}</h1>

      <section className="grid grid-cols-2 gap-4 text-sm">
        <div>
          <div className="text-slate-500">Filament</div>
          <div>
            <span>{template.filamentSnapshotBrand}</span> — <span>{template.filamentSnapshotMaterialType}</span>
          </div>
        </div>
        <div>
          <div className="text-slate-500">Printer</div>
          <div>{template.printerSnapshotName}</div>
        </div>
        <div>
          <div className="text-slate-500">Weight</div>
          <div>{template.weightGrams}g</div>
        </div>
        <div>
          <div className="text-slate-500">Print time</div>
          <div>{template.printTimeHours}h</div>
        </div>
        <div>
          <div className="text-slate-500">Markup</div>
          <div>{template.markupPercent}%</div>
        </div>
      </section>

      <section className="flex flex-col gap-2 border-t border-slate-200 pt-4 text-sm">
        <h2 className="text-lg font-semibold text-slate-900">Cost breakdown</h2>
        <div className="flex justify-between"><span>Filament cost</span><span>{money(template.filamentCost)}</span></div>
        <div className="flex justify-between"><span>Electricity cost</span><span>{money(template.electricityCost)}</span></div>
        <div className="flex justify-between"><span>Depreciation cost</span><span>{money(template.depreciationCost)}</span></div>
        <div className="flex justify-between"><span>Labour cost</span><span>{money(template.labourCost)}</span></div>
        <div className="flex justify-between"><span>Consumables cost</span><span>{money(template.consumablesCost)}</span></div>
        <div className="flex justify-between border-t border-slate-200 pt-2 font-semibold"><span>Total cost</span><span>{money(template.totalCost)}</span></div>
        <div className="flex justify-between font-semibold text-slate-900"><span>Suggested price</span><span>{money(template.suggestedPrice)}</span></div>
      </section>

      {template.labourLines && template.labourLines.length > 0 && (
        <section className="flex flex-col gap-2 border-t border-slate-200 pt-4 text-sm">
          <h2 className="text-lg font-semibold text-slate-900">Labour lines</h2>
          {template.labourLines.map((line) => (
            <div key={line.id} className="flex justify-between">
              <span>
                <span>{line.labourStepSnapshotName}</span> ({line.hours}h @ {money(line.hourlyRateSnapshot)})
              </span>
              <span>{money(line.lineCost)}</span>
            </div>
          ))}
        </section>
      )}

      {template.consumableLines && template.consumableLines.length > 0 && (
        <section className="flex flex-col gap-2 border-t border-slate-200 pt-4 text-sm">
          <h2 className="text-lg font-semibold text-slate-900">Consumable lines</h2>
          {template.consumableLines.map((line) => (
            <div key={line.id} className="flex justify-between">
              <span>
                <span>{line.consumableSnapshotName}</span> ({line.quantity} @ {money(line.costPerUnitSnapshot)})
              </span>
              <span>{money(line.lineCost)}</span>
            </div>
          ))}
        </section>
      )}
    </div>
  );
}
