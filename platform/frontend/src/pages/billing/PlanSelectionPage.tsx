import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { usePlans, useCheckout, useSubscription, type Plan } from '../../api/billing.js';
import { ApiError } from '../../api/client.js';

type Provider = 'payfast' | 'paypal';

// This page serves two entry points that both end at the same safe backend
// mechanism (POST /api/billing/checkout's resubscribe branch — best-effort
// cancels any old provider subscription, then transactionally replaces the
// local row): a brand-new tenant's first plan choice ("signup" mode, the
// default — no query param), and an existing subscriber updating their
// payment method ("update" mode, ?mode=update). Neither PayFast's nor
// PayPal's API exposes a way to change a stored card in place (verified
// against PayFast's official PHP SDK, which has no such endpoint, and
// PayPal's subscription "revise" endpoint is for plan/quantity changes,
// not payment method) — re-running checkout with a fresh card entry at
// the provider's own hosted page is the only safe mechanism available, so
// "update payment method" is this same flow with honest copy and the
// tenant's current plan pre-selected, not a different feature.
export function PlanSelectionPage() {
  const [searchParams] = useSearchParams();
  const isUpdateMode = searchParams.get('mode') === 'update';
  const { data: plans, isLoading, isError } = usePlans();
  const { data: currentSubscription } = useSubscription();
  const checkoutMutation = useCheckout();
  const [selectedProvider, setSelectedProvider] = useState<Provider>('payfast');
  const [error, setError] = useState<string | null>(null);

  if (isLoading) {
    return <p className="text-slate-500">Loading…</p>;
  }
  if (isError || !plans) {
    return <p className="text-red-600">Couldn't load plans.</p>;
  }

  async function handleStart(plan: Plan) {
    setError(null);
    try {
      const redirectUrl = await checkoutMutation.mutateAsync({ planId: plan.id, provider: selectedProvider });
      window.location.href = redirectUrl;
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong. Try again shortly.');
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center gap-8 bg-slate-50 p-8">
      <div className="max-w-md text-center">
        <h1 className="text-2xl font-semibold text-slate-900">{isUpdateMode ? 'Update payment method' : 'Choose a plan'}</h1>
        {isUpdateMode && (
          <p className="mt-2 text-sm text-slate-500">
            We'll set up a fresh subscription with your new card — your current one is canceled automatically as part of this.
          </p>
        )}
      </div>

      <div className="flex gap-2">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="radio"
            name="provider"
            checked={selectedProvider === 'payfast'}
            onChange={() => setSelectedProvider('payfast')}
          />
          PayFast
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="radio"
            name="provider"
            checked={selectedProvider === 'paypal'}
            onChange={() => setSelectedProvider('paypal')}
          />
          PayPal
        </label>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="grid grid-cols-3 gap-6">
        {plans.map((plan) => {
          const isCurrentPlan = isUpdateMode && currentSubscription?.plan.id === plan.id;
          return (
            <div
              key={plan.id}
              className={`flex w-64 flex-col gap-3 rounded-lg bg-white p-6 shadow ${isCurrentPlan ? 'ring-2 ring-slate-900' : ''}`}
            >
              {isCurrentPlan && <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Your current plan</span>}
              <h2 className="text-lg font-semibold text-slate-900">{plan.name}</h2>
              <p className="text-2xl font-bold text-slate-900">R {plan.monthlyPrice}<span className="text-sm font-normal text-slate-500">/mo</span></p>
              {!isUpdateMode && <p className="text-sm text-slate-500">14-day free trial</p>}
              <button
                onClick={() => handleStart(plan)}
                disabled={checkoutMutation.isPending}
                className="rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
              >
                {isUpdateMode ? 'Update payment method' : 'Start free trial'}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
