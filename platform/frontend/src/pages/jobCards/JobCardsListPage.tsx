import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  useJobCards,
  useJobCardStats,
  JOB_CARD_TYPES,
  JOB_CARD_TYPE_LABELS,
  JOB_CARD_STATUS_LABELS,
} from '../../api/jobCards.js';
import { useCustomerLookup } from '../../api/customers.js';
import { StatCard } from '../../components/StatCard.js';

export function JobCardsListPage() {
  const { data: jobCards, isLoading, isError } = useJobCards();
  const { data: stats } = useJobCardStats();
  const { lookup: customerLookup, isError: isCustomerLookupError } = useCustomerLookup();
  const [isTypeMenuOpen, setIsTypeMenuOpen] = useState(false);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-slate-900">Job Cards</h1>
        <div className="relative">
          <button
            type="button"
            onClick={() => setIsTypeMenuOpen((open) => !open)}
            className="rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white"
          >
            New job card
          </button>
          {isTypeMenuOpen && (
            <div className="absolute right-0 z-10 mt-1 w-40 rounded border border-slate-200 bg-white py-1 shadow-md">
              {JOB_CARD_TYPES.map((type) => (
                <Link
                  key={type}
                  to={`/job-cards/new?type=${type}`}
                  onClick={() => setIsTypeMenuOpen(false)}
                  className="block px-3 py-2 text-sm text-slate-700 hover:bg-slate-100"
                >
                  {JOB_CARD_TYPE_LABELS[type]}
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>

      {stats && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
          <StatCard label="Due Soon" value={String(stats.dueSoon)} />
          <StatCard label="Awaiting Quote" value={String(stats.awaitingQuote)} />
          <StatCard label="Quoted" value={String(stats.quoted)} />
          <StatCard label="Invoiced" value={String(stats.invoiced)} />
        </div>
      )}

      {isError && <p className="text-red-600">Couldn't load job cards. Try refreshing the page.</p>}
      {isLoading && <p className="text-slate-500">Loading…</p>}
      {!isLoading && !isError && jobCards?.length === 0 && <p className="text-slate-500">No job cards yet.</p>}
      {!isLoading && !isError && jobCards && jobCards.length > 0 && (
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-slate-500">
              <th className="py-2">Number</th>
              <th className="py-2">Title</th>
              <th className="py-2">Type</th>
              <th className="py-2">Status</th>
              <th className="py-2">Customer</th>
              <th className="py-2">Due</th>
            </tr>
          </thead>
          <tbody>
            {jobCards.map((jobCard) => (
              <tr key={jobCard.id} className="border-b border-slate-100">
                <td className="py-2">
                  <Link to={`/job-cards/${jobCard.id}`} className="text-slate-900 underline">
                    {jobCard.number}
                  </Link>
                </td>
                <td className="py-2">{jobCard.jobTitle}</td>
                <td className="py-2">{JOB_CARD_TYPE_LABELS[jobCard.cardType]}</td>
                <td className="py-2">{JOB_CARD_STATUS_LABELS[jobCard.status]}</td>
                <td className="py-2">
                  {jobCard.customerId == null
                    ? '—'
                    : isCustomerLookupError
                      ? "Couldn't load customer"
                      : (customerLookup.get(jobCard.customerId)?.name ?? 'Unknown customer')}
                </td>
                <td className="py-2">{jobCard.requiredBy?.slice(0, 10) ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
