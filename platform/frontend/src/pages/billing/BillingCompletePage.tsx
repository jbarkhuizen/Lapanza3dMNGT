import { Link } from 'react-router-dom';
import { useSubscription } from '../../api/billing.js';

export function BillingCompletePage() {
  const { data: subscription, isLoading, isError } = useSubscription();

  if (isLoading) {
    return <p className="text-slate-500">Confirming your subscription…</p>;
  }
  if (isError || !subscription) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4">
        <p className="text-red-600">We couldn't confirm your subscription yet. It may take a moment for the payment provider to notify us.</p>
        <Link to="/" className="text-sm text-slate-500 underline">Go to dashboard</Link>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4">
      <h1 className="text-xl font-semibold text-slate-900">You're all set</h1>
      <p className="text-slate-600">
        {subscription.status === 'trialing'
          ? `Your 14-day free trial on ${subscription.plan.name} has started.`
          : `Your ${subscription.plan.name} subscription is active.`}
      </p>
      <Link to="/" className="rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white">Go to dashboard</Link>
    </div>
  );
}
