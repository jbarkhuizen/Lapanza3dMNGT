import { Link } from 'react-router-dom';
import { useSubscription } from '../../api/billing.js';

export function BillingCompletePage() {
  const { data: subscription, isLoading, isError } = useSubscription();

  if (isLoading) {
    return <p className="text-slate-500 dark:text-slate-400">Confirming your subscription…</p>;
  }
  if (isError || !subscription) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4">
        <p className="text-red-600 dark:text-red-400">We couldn't confirm your subscription yet. It may take a moment for the payment provider to notify us.</p>
        <Link to="/" className="text-sm text-slate-500 underline dark:text-slate-400">Go to dashboard</Link>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4">
      <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">You're all set</h1>
      <p className="text-slate-600 dark:text-slate-400">
        {subscription.status === 'trialing'
          ? `Your 14-day free trial on ${subscription.plan.name} has started.`
          : `Your ${subscription.plan.name} subscription is active.`}
      </p>
      <Link to="/" className="rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white dark:bg-slate-100 dark:text-slate-900">Go to dashboard</Link>
    </div>
  );
}
