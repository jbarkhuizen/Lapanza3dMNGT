import { Link } from 'react-router-dom';
import { useSubscription, useCancelSubscription } from '../../api/billing.js';

const STATUS_LABELS: Record<string, string> = {
  trialing: 'Trial',
  active: 'Active',
  past_due: 'Payment past due',
  lapsed: 'Lapsed',
  canceled: 'Canceled',
};

export function BillingSettingsPage() {
  const { data: subscription, isLoading, isError } = useSubscription();
  const cancelMutation = useCancelSubscription();

  if (isLoading) {
    return <p className="text-slate-500">Loading…</p>;
  }
  if (isError || !subscription) {
    return <p className="text-red-600">Couldn't load your subscription.</p>;
  }

  return (
    <div className="flex max-w-md flex-col gap-4">
      <h1 className="text-2xl font-semibold text-slate-900">Billing</h1>
      <div className="rounded-lg bg-white p-4 shadow">
        <div className="text-lg font-medium text-slate-900">{subscription.plan.name}</div>
        <div className="text-sm text-slate-500">R {subscription.plan.monthlyPrice}/mo</div>
        <div className="mt-2 text-sm">{STATUS_LABELS[subscription.status] ?? subscription.status}</div>
      </div>
      {subscription.status !== 'canceled' && (
        <button
          onClick={() => cancelMutation.mutate()}
          disabled={cancelMutation.isPending}
          className="rounded bg-slate-100 px-4 py-2 text-sm text-slate-700 disabled:opacity-50"
        >
          Cancel subscription
        </button>
      )}
      {(subscription.status === 'canceled' || subscription.status === 'lapsed' || subscription.status === 'past_due') && (
        <Link
          to="/plans"
          className="rounded bg-slate-900 px-4 py-2 text-center text-sm font-medium text-white"
        >
          Choose a plan
        </Link>
      )}
    </div>
  );
}
