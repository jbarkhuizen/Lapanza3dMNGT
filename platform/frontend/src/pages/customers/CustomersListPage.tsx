import { Link } from 'react-router-dom';
import { useCustomers, useCustomerStats } from '../../api/customers.js';
import { formatCurrency } from '../../lib/formatCurrency.js';
import { useDisplayCurrency } from '../../lib/useDisplayCurrency.js';
import { StatCard } from '../../components/StatCard.js';

export function CustomersListPage() {
  const { data: customers, isLoading, isError } = useCustomers();
  const { data: stats } = useCustomerStats();
  const currency = useDisplayCurrency();

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-slate-900">Customers</h1>
        <Link to="/customers/new" className="rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white">
          New Customer
        </Link>
      </div>

      {stats && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <StatCard label="Total Clients" value={String(stats.totalClients)} />
          <StatCard label="Outstanding" value={formatCurrency(stats.outstanding, currency)} />
          <StatCard label="With Overdue" value={String(stats.withOverdue)} />
        </div>
      )}

      {isError && <p className="text-red-600">Couldn't load customers. Try refreshing the page.</p>}
      {isLoading && <p className="text-slate-500">Loading…</p>}
      {!isLoading && !isError && customers?.length === 0 && <p className="text-slate-500">No customers yet.</p>}
      {!isLoading && !isError && customers && customers.length > 0 && (
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-slate-500">
              <th className="py-2">Name</th>
              <th className="py-2">Company</th>
              <th className="py-2">Email</th>
              <th className="py-2"></th>
            </tr>
          </thead>
          <tbody>
            {customers.map((customer) => (
              <tr key={customer.id} className="border-b border-slate-100">
                <td className="py-2">{customer.name}</td>
                <td className="py-2">{customer.company ?? '—'}</td>
                <td className="py-2">{customer.email ?? '—'}</td>
                <td className="py-2 text-right">
                  <Link to={`/customers/${customer.id}`} className="text-slate-600 underline">
                    Edit
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
