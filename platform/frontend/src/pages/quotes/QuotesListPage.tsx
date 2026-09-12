import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuotes, useQuoteStats, QUOTE_STATUS_LABELS, type QuoteStatus } from '../../api/quotes.js';
import { useCustomerLookup } from '../../api/customers.js';
import { formatCurrency } from '../../lib/formatCurrency.js';
import { useDisplayCurrency } from '../../lib/useDisplayCurrency.js';
import { StatCard } from '../../components/StatCard.js';

const STATUS_OPTIONS: Array<QuoteStatus | 'all'> = ['all', 'draft', 'sent', 'accepted', 'expired'];

export function QuotesListPage() {
  const { data: quotes, isLoading, isError } = useQuotes();
  const { lookup: customerLookup, isError: isCustomerLookupError } = useCustomerLookup();
  const { data: stats } = useQuoteStats();
  const currency = useDisplayCurrency();
  const [statusFilter, setStatusFilter] = useState<QuoteStatus | 'all'>('all');

  const filteredQuotes = quotes?.filter((quote) => statusFilter === 'all' || quote.status === statusFilter);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-slate-900">Quotes</h1>
        <Link to="/quotes/new" className="rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white">
          New Quote
        </Link>
      </div>

      {stats && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
          <StatCard label="Total Quotes" value={String(stats.totalQuotes)} />
          <StatCard label="Total Value" value={formatCurrency(stats.totalValue, currency)} />
          <StatCard label="Expired" value={String(stats.expiredCount)} />
          <StatCard label="Converted" value={String(stats.convertedCount)} />
        </div>
      )}

      <div className="flex items-center gap-2 text-sm">
        <label htmlFor="status-filter" className="text-slate-500">
          Status
        </label>
        <select
          id="status-filter"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as QuoteStatus | 'all')}
          className="rounded border border-slate-300 px-2 py-1"
        >
          {STATUS_OPTIONS.map((option) => (
            <option key={option} value={option}>
              {option === 'all' ? 'All' : QUOTE_STATUS_LABELS[option]}
            </option>
          ))}
        </select>
      </div>

      {isLoading && <p className="text-slate-500">Loading…</p>}
      {isError && <p className="text-red-600">Couldn't load quotes. Try refreshing the page.</p>}
      {!isLoading && !isError && filteredQuotes?.length === 0 && <p className="text-slate-500">No quotes yet.</p>}
      {!isLoading && !isError && filteredQuotes && filteredQuotes.length > 0 && (
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-slate-500">
              <th className="py-2">Number</th>
              <th className="py-2">Customer</th>
              <th className="py-2">Status</th>
              <th className="py-2">Valid until</th>
              <th className="py-2">Total</th>
            </tr>
          </thead>
          <tbody>
            {filteredQuotes.map((quote) => (
              <tr key={quote.id} className="border-b border-slate-100">
                <td className="py-2">
                  <Link to={`/quotes/${quote.id}`} className="text-slate-900 underline">
                    {quote.number}
                  </Link>
                </td>
                <td className="py-2">
                  {isCustomerLookupError ? "Couldn't load customer" : (customerLookup.get(quote.customerId)?.name ?? 'Unknown customer')}
                </td>
                <td className="py-2">{QUOTE_STATUS_LABELS[quote.status]}</td>
                <td className="py-2">{quote.validUntil?.slice(0, 10) ?? '—'}</td>
                <td className="py-2">{formatCurrency(quote.total, currency)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
