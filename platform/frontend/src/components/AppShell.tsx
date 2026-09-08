import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.js';
import { apiPost } from '../api/client.js';

const NAV_ITEMS = [
  { to: '/', label: 'Dashboard' },
  { to: '/company-profile', label: 'Company Profile' },
  { to: '/customers', label: 'Customers' },
  { to: '/filaments', label: 'Filaments' },
  { to: '/labour-steps', label: 'Labour Steps' },
  { to: '/consumables', label: 'Consumables' },
  { to: '/printers', label: 'Printers' },
  { to: '/costing-templates', label: 'Costing Templates' },
  { to: '/quotes', label: 'Quotes' },
  { to: '/invoices', label: 'Invoices' },
];

export function AppShell({ children }: { children: ReactNode }) {
  const { tenant, refetch } = useAuth();
  const [loggingOut, setLoggingOut] = useState(false);

  async function handleLogout() {
    setLoggingOut(true);
    try {
      await apiPost('/api/auth/logout');
    } finally {
      await refetch();
      setLoggingOut(false);
    }
  }

  return (
    <div className="flex min-h-screen">
      <nav className="flex w-56 flex-col gap-1 border-r border-slate-200 bg-slate-50 p-4">
        <span className="mb-4 text-lg font-semibold text-slate-900">Barkie</span>
        {NAV_ITEMS.map((item) => (
          <Link
            key={item.to}
            to={item.to}
            className="rounded px-3 py-2 text-sm text-slate-700 hover:bg-slate-200"
          >
            {item.label}
          </Link>
        ))}
      </nav>
      <div className="flex flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-slate-200 px-6 py-3">
          <span className="text-sm text-slate-600">{tenant?.businessName}</span>
          <button
            onClick={handleLogout}
            disabled={loggingOut}
            className="rounded px-3 py-1 text-sm text-slate-600 hover:bg-slate-100 disabled:opacity-50"
          >
            Log out
          </button>
        </header>
        <main className="flex-1 p-6">{children}</main>
      </div>
    </div>
  );
}
