import { useState } from 'react';
import { usePlans, useCheckout, type Plan } from '../../api/billing.js';
import { ApiError } from '../../api/client.js';

type Provider = 'payfast' | 'paypal';

export function PlanSelectionPage() {
  const { data: plans, isLoading, isError } = usePlans();
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
      <h1 className="text-2xl font-semibold text-slate-900">Choose a plan</h1>

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
        {plans.map((plan) => (
          <div key={plan.id} className="flex w-64 flex-col gap-3 rounded-lg bg-white p-6 shadow">
            <h2 className="text-lg font-semibold text-slate-900">{plan.name}</h2>
            <p className="text-2xl font-bold text-slate-900">R {plan.monthlyPrice}<span className="text-sm font-normal text-slate-500">/mo</span></p>
            <p className="text-sm text-slate-500">14-day free trial</p>
            <button
              onClick={() => handleStart(plan)}
              disabled={checkoutMutation.isPending}
              className="rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              Start free trial
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
