import { Link } from 'react-router-dom';
import { useCostingTemplates } from '../../api/costingTemplates.js';
import { formatCurrency } from '../../lib/formatCurrency.js';

export function CostingTemplatesListPage() {
  const { data: costingTemplates, isLoading, isError } = useCostingTemplates();

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-slate-900">Costing Templates</h1>
        <Link to="/costing-templates/new" className="rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white">
          New Costing Template
        </Link>
      </div>
      {isLoading && <p className="text-slate-500">Loading…</p>}
      {isError && <p className="text-red-600">Couldn't load costing templates. Try refreshing the page.</p>}
      {!isLoading && !isError && costingTemplates?.length === 0 && (
        <p className="text-slate-500">No costing templates yet.</p>
      )}
      {!isLoading && !isError && costingTemplates && costingTemplates.length > 0 && (
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-slate-500">
              <th className="py-2">Name</th>
              <th className="py-2">Filament</th>
              <th className="py-2">Printer</th>
              <th className="py-2">Total cost</th>
              <th className="py-2">Suggested price</th>
              <th className="py-2"></th>
            </tr>
          </thead>
          <tbody>
            {costingTemplates.map((template) => (
              <tr key={template.id} className="border-b border-slate-100">
                <td className="py-2">{template.name}</td>
                <td className="py-2">{template.filamentSnapshotBrand ?? '—'}</td>
                <td className="py-2">{template.printerSnapshotName ?? '—'}</td>
                <td className="py-2">{formatCurrency(template.totalCost)}</td>
                <td className="py-2">{formatCurrency(template.suggestedPrice)}</td>
                <td className="py-2 text-right">
                  <Link to={`/costing-templates/${template.id}`} className="text-slate-600 underline">
                    View
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
