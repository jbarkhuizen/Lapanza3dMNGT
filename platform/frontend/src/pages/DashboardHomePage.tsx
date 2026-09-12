import { useAuth } from '../context/AuthContext.js';
import { useDashboardSummary, type InvoiceStatusCounts } from '../api/reports.js';
import { formatCurrency } from '../lib/formatCurrency.js';
import { useDisplayCurrency } from '../lib/useDisplayCurrency.js';
import { StatCard } from '../components/StatCard.js';

const INVOICE_STATUS_ROWS: Array<{ key: keyof InvoiceStatusCounts; label: string }> = [
  { key: 'paid', label: 'Paid' },
  { key: 'unpaid', label: 'Unpaid' },
  { key: 'overdue', label: 'Overdue' },
];

export function DashboardHomePage() {
  const { tenant } = useAuth();
  const { data, isLoading, isError } = useDashboardSummary();
  const currency = useDisplayCurrency();

  const totalInvoices = data
    ? data.invoiceStatusCounts.paid + data.invoiceStatusCounts.unpaid + data.invoiceStatusCounts.overdue
    : 0;

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold text-slate-900">Welcome back, {tenant?.businessName}</h1>

      {isLoading && <p className="text-slate-500">Loading…</p>}
      {isError && <p className="text-red-600">Couldn't load the dashboard. Try refreshing the page.</p>}

      {!isLoading && !isError && data && (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
            <StatCard label="Open Invoices" value={String(data.openInvoicesCount)} />
            <StatCard label="Open Quotes" value={String(data.openQuotesCount)} />
            <StatCard label="Paid Invoices" value={String(data.paidInvoicesCount)} />
            <StatCard label="Revenue This Month" value={formatCurrency(data.revenueThisMonth, currency)} />
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <div className="rounded border border-slate-200 bg-white p-4 shadow-sm">
              <h2 className="mb-3 text-lg font-semibold text-slate-900">Invoice status</h2>
              <div className="flex flex-col gap-3">
                {INVOICE_STATUS_ROWS.map((row) => {
                  const count = data.invoiceStatusCounts[row.key];
                  const percent = totalInvoices === 0 ? 0 : Math.round((count / totalInvoices) * 100);
                  return (
                    <div key={row.key} className="flex flex-col gap-1">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-slate-600">{row.label}</span>
                        <span className="text-slate-900">{count}</span>
                      </div>
                      <div className="h-2 w-full rounded bg-slate-100">
                        <div className="h-2 rounded bg-slate-900" style={{ width: `${percent}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <StatCard label="Converted Quotes" value={String(data.convertedQuotesCount)} />
          </div>
        </>
      )}
    </div>
  );
}
