import { useState, type ReactNode } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.js';
import { apiPost } from '../api/client.js';
import { useSubscription } from '../api/billing.js';
import { useNotifications, useMarkNotificationRead, type Notification } from '../api/notifications.js';

const NAV_ITEMS = [
  { to: '/', label: 'Dashboard' },
  { to: '/company-profile', label: 'Company Profile' },
  { to: '/shop-profile', label: 'Shop Profile' },
  { to: '/billing', label: 'Billing' },
  { to: '/customers', label: 'Customers' },
  { to: '/filaments', label: 'Filaments' },
  { to: '/labour-steps', label: 'Labour Steps' },
  { to: '/consumables', label: 'Consumables' },
  { to: '/materials', label: 'Materials' },
  { to: '/printers', label: 'Printers' },
  { to: '/costing-templates', label: 'Costing Templates' },
  { to: '/jobs', label: 'Jobs' },
  { to: '/quotes', label: 'Quotes' },
  { to: '/invoices', label: 'Invoices' },
  { to: '/reports', label: 'Reports' },
];

const RELATED_ENTITY_ROUTES: Record<string, string> = {
  filament: '/filaments',
  consumable: '/consumables',
  invoice: '/invoices',
};

function formatRelativeTime(isoDate: string): string {
  const diffMs = Date.now() - new Date(isoDate).getTime();
  const diffMinutes = Math.round(diffMs / (60 * 1000));
  if (diffMinutes < 1) {
    return 'just now';
  }
  if (diffMinutes < 60) {
    return `${diffMinutes}m ago`;
  }
  const diffHours = Math.round(diffMinutes / 60);
  if (diffHours < 24) {
    return `${diffHours}h ago`;
  }
  const diffDays = Math.round(diffHours / 24);
  return `${diffDays}d ago`;
}

function NotificationItem({ notification, onNavigate }: { notification: Notification; onNavigate: (path: string) => void }) {
  const markReadMutation = useMarkNotificationRead(notification.id);

  function handleClick() {
    if (!notification.readAt) {
      markReadMutation.mutate();
    }
    if (notification.relatedEntityType && notification.relatedEntityId) {
      const base = RELATED_ENTITY_ROUTES[notification.relatedEntityType];
      if (base) {
        onNavigate(`${base}/${notification.relatedEntityId}`);
      }
    }
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      className={`flex w-full flex-col gap-0.5 rounded px-3 py-2 text-left text-sm hover:bg-slate-100 ${
        notification.readAt ? 'text-slate-500' : 'font-medium text-slate-900'
      }`}
    >
      <span>{notification.message}</span>
      <span className="text-xs text-slate-400">{formatRelativeTime(notification.createdAt)}</span>
    </button>
  );
}

function NotificationBell() {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const { data: unreadNotifications } = useNotifications(true);
  const { data: recentNotifications } = useNotifications();
  const unreadCount = unreadNotifications?.length ?? 0;

  function handleNavigate(path: string) {
    setOpen(false);
    navigate(path);
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-label="Notifications"
        className="relative rounded px-2 py-1 text-sm text-slate-600 hover:bg-slate-100"
      >
        🔔
        {unreadCount > 0 && (
          <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-semibold text-white">
            {unreadCount}
          </span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 z-10 mt-2 w-80 rounded border border-slate-200 bg-white shadow-lg">
          <div className="flex flex-col gap-1 p-2">
            {(recentNotifications ?? []).length === 0 && (
              <p className="px-3 py-2 text-sm text-slate-500">No notifications yet.</p>
            )}
            {(recentNotifications ?? []).slice(0, 10).map((notification) => (
              <NotificationItem key={notification.id} notification={notification} onNavigate={handleNavigate} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

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
          <div className="flex items-center gap-2">
            <NotificationBell />
            <button
              onClick={handleLogout}
              disabled={loggingOut}
              className="rounded px-3 py-1 text-sm text-slate-600 hover:bg-slate-100 disabled:opacity-50"
            >
              Log out
            </button>
          </div>
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
              : 'Your last payment failed — update your payment method to keep your subscription active. '}
            <Link to="/billing" className="underline">Manage billing</Link>
          </div>
        )}
        <main className="flex-1 p-6">{children}</main>
      </div>
    </div>
  );
}
