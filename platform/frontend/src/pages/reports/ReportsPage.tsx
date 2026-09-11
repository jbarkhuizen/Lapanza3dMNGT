import { Link } from 'react-router-dom';
import { useReportsSummary } from '../../api/reports.js';
import { formatCurrency } from '../../lib/formatCurrency.js';
import { useDisplayCurrency } from '../../lib/useDisplayCurrency.js';

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1 rounded border border-slate-200 bg-white p-4 shadow-sm">
      <span className="text-sm text-slate-500">{label}</span>
      <span className="text-2xl font-semibold text-slate-900">{value}</span>
    </div>
  );
}

export function ReportsPage() {
  const { data, isLoading, isError } = useReportsSummary();
  const currency = useDisplayCurrency();

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold text-slate-900">Reports</h1>

      {isLoading && <p className="text-slate-500">Loading…</p>}
      {isError && <p className="text-red-600">Couldn't load reports. Try refreshing the page.</p>}

      {!isLoading && !isError && data && (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <SummaryCard label="Total Revenue" value={formatCurrency(data.totalRevenue, currency)} />
            <SummaryCard label="Open Quotes" value={String(data.openQuotesCount)} />
            <SummaryCard label="Jobs In Progress" value={String(data.jobsInProgress)} />
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <div className="rounded border border-slate-200 bg-white p-4 shadow-sm">
              <h2 className="mb-3 text-lg font-semibold text-slate-900">Overdue Invoices</h2>
              {data.overdueInvoices.length === 0 && <p className="text-sm text-slate-500">No overdue invoices.</p>}
              {data.overdueInvoices.length > 0 && (
                <ul className="flex flex-col gap-2">
                  {data.overdueInvoices.map((invoice) => (
                    <li key={invoice.id} className="flex items-center justify-between text-sm">
                      <Link to={`/invoices/${invoice.id}`} className="text-slate-900 underline">
                        {invoice.number}
                      </Link>
                      <span className="text-slate-600">{formatCurrency(invoice.balanceDue, currency)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="rounded border border-slate-200 bg-white p-4 shadow-sm">
              <h2 className="mb-3 text-lg font-semibold text-slate-900">Low Stock Items</h2>
              {data.lowStockItems.length === 0 && <p className="text-sm text-slate-500">Nothing running low.</p>}
              {data.lowStockItems.length > 0 && (
                <ul className="flex flex-col gap-2">
                  {data.lowStockItems.map((item) => (
                    <li key={`${item.kind}-${item.id}`} className="flex items-center justify-between text-sm">
                      <Link to={`/${item.kind === 'filament' ? 'filaments' : 'consumables'}/${item.id}`} className="text-slate-900 underline">
                        {item.name}
                      </Link>
                      <span className="text-slate-600">
                        {item.remaining} / {item.threshold}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
