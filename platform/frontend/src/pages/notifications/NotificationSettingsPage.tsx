import { Fragment, useEffect, useState } from 'react';
import { ApiError } from '../../api/client.js';
import {
  useNotificationPreferences,
  useUpdateNotificationPreferences,
  type NotificationPreferences,
} from '../../api/notifications.js';

interface PreferenceRow {
  key: string;
  label: string;
  inAppField: keyof NotificationPreferences;
  // Billing categories have no separate email opt-out (transactional email
  // is always sent) -- `null` here renders a static "Always sent" label
  // instead of a checkbox, per the design spec's scope decision.
  emailField: keyof NotificationPreferences | null;
}

interface PreferenceSection {
  title: string;
  rows: PreferenceRow[];
}

const SECTIONS: PreferenceSection[] = [
  {
    title: 'Trials & Stock',
    rows: [
      { key: 'trialEnding', label: 'Trial ending', inAppField: 'trialEndingInApp', emailField: 'trialEndingEmail' },
      { key: 'lowStock', label: 'Low stock', inAppField: 'lowStockInApp', emailField: 'lowStockEmail' },
    ],
  },
  {
    title: 'Invoices',
    rows: [
      {
        key: 'invoiceOverdue',
        label: 'Invoice overdue',
        inAppField: 'invoiceOverdueInApp',
        emailField: 'invoiceOverdueEmail',
      },
    ],
  },
  {
    title: 'Billing',
    rows: [
      { key: 'paymentReceipt', label: 'Payment receipt', inAppField: 'paymentReceiptInApp', emailField: null },
      {
        key: 'subscriptionCancelled',
        label: 'Subscription cancelled',
        inAppField: 'subscriptionCancelledInApp',
        emailField: null,
      },
      { key: 'paymentFailed', label: 'Payment failed', inAppField: 'paymentFailedInApp', emailField: null },
    ],
  },
];

export function NotificationSettingsPage() {
  const { data: preferences, isLoading, isError } = useNotificationPreferences();
  const updateMutation = useUpdateNotificationPreferences();
  const [form, setForm] = useState<NotificationPreferences | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (preferences && !form) {
      setForm(preferences);
    }
  }, [preferences, form]);

  async function handleToggle(field: keyof NotificationPreferences, checked: boolean) {
    if (!form) return;
    const previous = form;
    setForm({ ...form, [field]: checked });
    setError(null);
    setSaved(false);
    try {
      const updated = await updateMutation.mutateAsync({ [field]: checked });
      setForm(updated);
      setSaved(true);
    } catch (err) {
      setForm(previous);
      setError(err instanceof ApiError ? err.message : 'Something went wrong. Try again shortly.');
    }
  }

  if (isError) {
    return <p className="text-red-600">Couldn't load notification settings. Try refreshing the page.</p>;
  }

  if (isLoading || !form) {
    return <p className="text-slate-500">Loading…</p>;
  }

  return (
    <div className="flex max-w-2xl flex-col gap-8">
      <h1 className="text-2xl font-semibold text-slate-900">Notification Settings</h1>

      {SECTIONS.map((section) => (
        <section key={section.title} className="flex flex-col gap-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">{section.title}</h2>
          <div className="grid grid-cols-[1fr_5rem_5rem] items-center gap-x-4 gap-y-3">
            <span />
            <span className="text-xs font-medium uppercase tracking-wide text-slate-400">In-app</span>
            <span className="text-xs font-medium uppercase tracking-wide text-slate-400">Email</span>
            {section.rows.map((row) => (
              <Fragment key={row.key}>
                <span className="text-sm text-slate-700">{row.label}</span>
                <input
                  type="checkbox"
                  aria-label={`${row.label} in-app`}
                  checked={form[row.inAppField]}
                  onChange={(e) => handleToggle(row.inAppField, e.target.checked)}
                  className="h-4 w-4 rounded border-slate-300"
                />
                {row.emailField ? (
                  <input
                    type="checkbox"
                    aria-label={`${row.label} email`}
                    checked={form[row.emailField]}
                    onChange={(e) => handleToggle(row.emailField as keyof NotificationPreferences, e.target.checked)}
                    className="h-4 w-4 rounded border-slate-300"
                  />
                ) : (
                  <span className="text-xs text-slate-400">Always sent</span>
                )}
              </Fragment>
            ))}
          </div>
        </section>
      ))}

      {error && <p className="text-sm text-red-600">{error}</p>}
      {saved && !error && <p className="text-sm text-green-600">Saved.</p>}
    </div>
  );
}
