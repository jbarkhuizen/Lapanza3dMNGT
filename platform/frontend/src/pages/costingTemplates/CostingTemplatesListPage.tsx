import { Link } from 'react-router-dom';
import { useCostingTemplates, type CostingTemplate } from '../../api/costingTemplates.js';
import { formatCurrency } from '../../lib/formatCurrency.js';
import { useDisplayCurrency } from '../../lib/useDisplayCurrency.js';

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString();
}

// Each process variant snapshots a different source entity's name -- show
// whichever one this row actually has, rather than a printer-only column.
function sourceLabel(template: CostingTemplate): string {
  switch (template.process) {
    case 'scanner':
      return template.scannerSnapshotName ?? '—';
    case 'laser_sheet':
      return template.laserMaterialSnapshotName ?? '—';
    case 'laser_premade':
      return template.premadeItemSnapshotName ?? '—';
    default:
      return template.printerSnapshotName ?? '—';
  }
}

export function CostingTemplatesListPage() {
  const { data: costingTemplates, isLoading, isError } = useCostingTemplates();
  const currency = useDisplayCurrency();

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">Costing Templates</h1>
        <Link to="/costing-templates/new" className="rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white dark:bg-slate-100 dark:text-slate-900">
          New Costing Template
        </Link>
      </div>
      {isLoading && <p className="text-slate-500 dark:text-slate-400">Loading…</p>}
      {isError && <p className="text-red-600 dark:text-red-400">Couldn't load costing templates. Try refreshing the page.</p>}
      {!isLoading && !isError && costingTemplates?.length === 0 && (
        <p className="text-slate-500 dark:text-slate-400">No costing templates yet.</p>
      )}
      {!isLoading && !isError && costingTemplates && costingTemplates.length > 0 && (
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-slate-500 dark:border-slate-700 dark:text-slate-400">
              <th className="py-2">Name</th>
              <th className="py-2">Process</th>
              <th className="py-2">Source</th>
              <th className="py-2">Total cost</th>
              <th className="py-2">Suggested price</th>
              <th className="py-2">Created</th>
              <th className="py-2"></th>
            </tr>
          </thead>
          <tbody>
            {costingTemplates.map((template) => (
              <tr key={template.id} className="border-b border-slate-100 dark:border-slate-800">
                <td className="py-2">{template.name}</td>
                <td className="py-2">{template.process}</td>
                <td className="py-2">{sourceLabel(template)}</td>
                <td className="py-2">{formatCurrency(template.totalCost, currency)}</td>
                <td className="py-2">{formatCurrency(template.suggestedPrice, currency)}</td>
                <td className="py-2">{formatDate(template.createdAt)}</td>
                <td className="py-2 text-right">
                  <Link to={`/costing-templates/${template.id}`} className="text-slate-600 underline dark:text-slate-400">
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
