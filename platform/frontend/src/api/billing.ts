import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiGet, apiPost } from './client.js';

export interface Plan {
  id: string;
  name: string;
  monthlyPrice: string;
  sortOrder: number;
}

export type SubscriptionStatus = 'trialing' | 'active' | 'past_due' | 'lapsed' | 'canceled';

export interface Subscription {
  id: string;
  status: SubscriptionStatus;
  paymentProvider: 'payfast' | 'paypal';
  trialEndsAt: string;
  currentPeriodEnd: string | null;
  plan: Plan;
}

const SUBSCRIPTION_QUERY_KEY = ['billing', 'subscription'] as const;

export function usePlans() {
  return useQuery({
    queryKey: ['billing', 'plans'],
    queryFn: () => apiGet<{ plans: Plan[] }>('/api/plans').then((r) => r.plans),
  });
}

export function useSubscription() {
  return useQuery({
    queryKey: SUBSCRIPTION_QUERY_KEY,
    queryFn: () => apiGet<{ subscription: Subscription | null }>('/api/billing/subscription').then((r) => r.subscription),
  });
}

export function useCheckout() {
  return useMutation({
    mutationFn: (data: { planId: string; provider: 'payfast' | 'paypal' }) =>
      apiPost<{ redirectUrl: string }>('/api/billing/checkout', data).then((r) => r.redirectUrl),
  });
}

export function useCancelSubscription() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => apiPost('/api/billing/cancel'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: SUBSCRIPTION_QUERY_KEY });
    },
  });
}
