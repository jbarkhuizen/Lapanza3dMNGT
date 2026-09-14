import { useState, type ReactNode } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.js';
import { apiPost } from '../api/client.js';
import { useSubscription } from '../api/billing.js';
import { useNotifications, useMarkNotificationRead, type Notification } from '../api/notifications.js';
import { ThemeToggle } from '../theme/ThemeToggle.js';

const NAV_ITEMS = [
  { to: '/', label: 'Dashboard', adminOnly: true },
  { to: '/company-profile', label: 'Company Profile', adminOnly: true },
  { to: '/shop-profile', label: 'Shop Profile', adminOnly: true },
  { to: '/billing', label: 'Billing', adminOnly: true },
  { to: '/team', label: 'Team', adminOnly: true },
  { to: '/customers', label: 'Customers', adminOnly: false },
  { to: '/filaments', label: 'Filaments', adminOnly: false },
  { to: '/labour-steps', label: 'Labour Steps', adminOnly: false },
  { to: '/consumables', label: 'Consumables', adminOnly: false },
  { to: '/materials', label: 'Materials', adminOnly: false },
  { to: '/printers', label: 'Printers', adminOnly: false },
  { to: '/scanners', label: 'Scanners', adminOnly: false },
  { to: '/laser-materials', label: 'Laser Materials', adminOnly: false },
  { to: '/premade-items', label: 'Pre-made Items', adminOnly: false },
  { to: '/products', label: 'Products', adminOnly: false },
  { to: '/costing-templates', label: 'Costing Templates', adminOnly: false },
  { to: '/slicer', label: 'Slicer', adminOnly: false },
  { to: '/jobs', label: 'Jobs', adminOnly: false },
  { to: '/job-cards', label: 'Job Cards (Intake)', adminOnly: false },
  { to: '/quotes', label: 'Quotes', adminOnly: false },
  { to: '/invoices', label: 'Invoices', adminOnly: false },
  // Backed by GET /api/reports/summary, which is gated to admins alongside
  // GET /api/reports/dashboard (see the design spec's "Gate the owner-only
  // areas" section) — hidden here too so a sales actor never lands on a
  // page that can only ever show an error.
  { to: '/reports', label: 'Reports', adminOnly: true },
  { to: '/feature-requests', label: 'Feature Requests', adminOnly: false },
  { to: '/help', label: 'Help', adminOnly: false },
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
      className={`flex w-full flex-col gap-0.5 rounded px-3 py-2 text-left text-sm hover:bg-slate-100 dark:hover:bg-slate-700 ${
        notification.readAt ? 'text-slate-500 dark:text-slate-400' : 'font-medium text-slate-900 dark:text-slate-100'
      }`}
    >
      <span>{notification.message}</span>
      <span className="text-xs text-slate-400 dark:text-slate-500">{formatRelativeTime(notification.createdAt)}</span>
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
        className="relative rounded px-2 py-1 text-sm text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-700"
      >
        🔔
        {unreadCount > 0 && (
          <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-semibold text-white">
            {unreadCount}
          </span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 z-10 mt-2 w-80 rounded border border-slate-200 bg-white shadow-lg dark:border-slate-700 dark:bg-slate-800">
          <div className="flex flex-col gap-1 p-2">
            {(recentNotifications ?? []).length === 0 && (
              <p className="px-3 py-2 text-sm text-slate-500 dark:text-slate-400">No notifications yet.</p>
            )}
            {(recentNotifications ?? []).slice(0, 10).map((notification) => (
              <NotificationItem key={notification.id} notification={notification} onNavigate={handleNavigate} />
            ))}
          </div>
          <div className="border-t border-slate-200 p-2 dark:border-slate-700">
            <button
              type="button"
              onClick={() => handleNavigate('/notification-settings')}
              className="w-full rounded px-3 py-2 text-left text-sm text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-700"
            >
              Settings
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const { tenant, refetch, actorRole, actorName } = useAuth();
  const { data: subscription } = useSubscription();
  const [loggingOut, setLoggingOut] = useState(false);
  // Below the `lg` breakpoint the sidebar is an off-canvas drawer (fixed,
  // slid out of view) instead of always taking up ~60% of a phone-width
  // screen -- see the design note on NAV_ITEMS/this component for why a
  // full responsive redesign wasn't needed, just this one structural
  // change. Closed by default on every screen size; only ever matters
  // below `lg`, since the `lg:` variants below force it open/static above
  // that breakpoint regardless of this state.
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const visibleNavItems = NAV_ITEMS.filter((item) => !item.adminOnly || actorRole === 'admin');

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
    <div className="flex min-h-screen bg-slate-50 dark:bg-slate-900">
      {mobileNavOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/30 lg:hidden"
          onClick={() => setMobileNavOpen(false)}
          aria-hidden="true"
        />
      )}
      <nav
        className={`fixed inset-y-0 left-0 z-40 flex w-56 flex-col gap-1 overflow-y-auto border-r border-slate-200 bg-slate-50 p-4 transition-transform duration-200 dark:border-slate-700 dark:bg-slate-900 lg:static lg:translate-x-0 ${
          mobileNavOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <span className="mb-4 text-lg font-semibold text-slate-900 dark:text-slate-100">Barkie</span>
        {visibleNavItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === '/'}
            onClick={() => setMobileNavOpen(false)}
            className={({ isActive }) =>
              `rounded px-3 py-2 text-sm hover:bg-slate-200 dark:hover:bg-slate-600 ${
                isActive
                  ? 'bg-slate-200 font-medium text-slate-900 dark:bg-slate-700 dark:text-slate-100'
                  : 'text-slate-700 dark:text-slate-300'
              }`
            }
          >
            {item.label}
          </NavLink>
        ))}
      </nav>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-slate-200 px-6 py-3 dark:border-slate-700">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setMobileNavOpen(true)}
              aria-label="Open menu"
              className="rounded p-1 text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-700 lg:hidden"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="3" y1="6" x2="21" y2="6" />
                <line x1="3" y1="12" x2="21" y2="12" />
                <line x1="3" y1="18" x2="21" y2="18" />
              </svg>
            </button>
            <div className="flex flex-col">
              <span className="text-sm text-slate-600 dark:text-slate-400">{tenant?.businessName}</span>
              {actorName && (
                <span className="text-xs text-slate-400 dark:text-slate-500">
                  Signed in as {actorName} ({actorRole === 'admin' ? 'Admin' : 'Sales'})
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <NotificationBell />
            <button
              onClick={handleLogout}
              disabled={loggingOut}
              className="rounded px-3 py-1 text-sm text-slate-600 hover:bg-slate-100 disabled:opacity-50 dark:text-slate-400 dark:hover:bg-slate-700"
            >
              Log out
            </button>
          </div>
        </header>
        {subscription?.status === 'trialing' && (
          <div className="bg-slate-100 px-6 py-2 text-center text-sm text-slate-700 dark:bg-slate-700 dark:text-slate-300">
            {Math.max(0, Math.ceil((new Date(subscription.trialEndsAt).getTime() - Date.now()) / (24 * 60 * 60 * 1000)))} days left in your free trial
          </div>
        )}
        {(subscription?.status === 'past_due' || subscription?.status === 'lapsed') && (
          <div className="bg-red-50 px-6 py-2 text-center text-sm text-red-700 dark:bg-red-950 dark:text-red-400">
            {subscription.status === 'lapsed'
              ? 'Your subscription has lapsed — you can view your data but not make changes. '
              : 'Your last payment failed — update your payment method to keep your subscription active. '}
            <Link to="/billing" className="underline">Manage billing</Link>
          </div>
        )}
        <main className="flex-1 bg-slate-50 p-6 dark:bg-slate-900">{children}</main>
      </div>
    </div>
  );
}
