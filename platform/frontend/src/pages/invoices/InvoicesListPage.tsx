import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useInvoices, INVOICE_STATUS_LABELS, type InvoiceStatus } from '../../api/invoices.js';
import { useCustomerLookup } from '../../api/customers.js';
import { formatCurrency } from '../../lib/formatCurrency.js';
import { useDisplayCurrency } from '../../lib/useDisplayCurrency.js';

const STATUS_OPTIONS: Array<InvoiceStatus | 'all'> = ['all', 'unpaid', 'partially_paid', 'paid', 'overdue'];

export function InvoicesListPage() {
  const { data: invoices, isLoading, isError } = useInvoices();
  const { lookup: customerLookup, isError: isCustomerLookupError } = useCustomerLookup();
  const currency = useDisplayCurrency();
  const [statusFilter, setStatusFilter] = useState<InvoiceStatus | 'all'>('all');

  const filteredInvoices = invoices?.filter((invoice) => statusFilter === 'all' || invoice.status === statusFilter);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-slate-900">Invoices</h1>
      </div>

      <div className="flex items-center gap-2 text-sm">
        <label htmlFor="status-filter" className="text-slate-500">
          Status
        </label>
        <select
          id="status-filter"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as InvoiceStatus | 'all')}
          className="rounded border border-slate-300 px-2 py-1"
        >
          {STATUS_OPTIONS.map((option) => (
            <option key={option} value={option}>
              {option === 'all' ? 'All' : INVOICE_STATUS_LABELS[option]}
            </option>
          ))}
        </select>
      </div>

      {isLoading && <p className="text-slate-500">Loading…</p>}
      {isError && <p className="text-red-600">Couldn't load invoices. Try refreshing the page.</p>}
      {!isLoading && !isError && filteredInvoices?.length === 0 && <p className="text-slate-500">No invoices yet.</p>}
      {!isLoading && !isError && filteredInvoices && filteredInvoices.length > 0 && (
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-slate-500">
              <th className="py-2">Number</th>
              <th className="py-2">Customer</th>
              <th className="py-2">Status</th>
              <th className="py-2">Total</th>
              <th className="py-2">Balance due</th>
              <th className="py-2">Due date</th>
            </tr>
          </thead>
          <tbody>
            {filteredInvoices.map((invoice) => (
              <tr key={invoice.id} className="border-b border-slate-100">
                <td className="py-2">
                  <Link to={`/invoices/${invoice.id}`} className="text-slate-900 underline">
                    {invoice.number}
                  </Link>
                </td>
                <td className="py-2">
                  {isCustomerLookupError ? "Couldn't load customer" : (customerLookup.get(invoice.customerId)?.name ?? 'Unknown customer')}
                </td>
                <td className="py-2">{INVOICE_STATUS_LABELS[invoice.status]}</td>
                <td className="py-2">{formatCurrency(invoice.total, currency)}</td>
                <td className="py-2">{formatCurrency(invoice.balanceDue, currency)}</td>
                <td className="py-2">{invoice.dueDate.slice(0, 10)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
