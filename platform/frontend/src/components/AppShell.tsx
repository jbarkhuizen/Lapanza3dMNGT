import { useState, type ReactNode } from 'react';
import { Link, NavLink } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.js';
import { apiPost } from '../api/client.js';
import { useSubscription } from '../api/billing.js';

const NAV_ITEMS = [
  { to: '/', label: 'Dashboard' },
  { to: '/company-profile', label: 'Company Profile' },
  { to: '/billing', label: 'Billing' },
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
  const { data: subscription } = useSubscription();
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
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === '/'}
            className={({ isActive }) =>
              `rounded px-3 py-2 text-sm hover:bg-slate-200 ${
                isActive ? 'bg-slate-200 font-medium text-slate-900' : 'text-slate-700'
              }`
            }
          >
            {item.label}
          </NavLink>
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
        {subscription?.status === 'trialing' && (
          <div className="bg-slate-100 px-6 py-2 text-center text-sm text-slate-700">
            {Math.max(0, Math.ceil((new Date(subscription.trialEndsAt).getTime() - Date.now()) / (24 * 60 * 60 * 1000)))} days left in your free trial
          </div>
        )}
        {(subscription?.status === 'past_due' || subscription?.status === 'lapsed') && (
          <div className="bg-red-50 px-6 py-2 text-center text-sm text-red-700">
            {subscription.status === 'lapsed'
              ? 'Your subscription has lapsed — you can view your data but not make changes. '
              : 'Your last payment failed — please check your payment method. '}
            <Link to="/billing" className="underline">Manage billing</Link>
          </div>
        )}
        <main className="flex-1 p-6">{children}</main>
      </div>
    </div>
  );
}
