import { useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiGet, apiPatch, apiPost } from './client.js';

export interface Customer {
  id: string;
  name: string;
  company: string | null;
  email: string | null;
  phone: string | null;
  billingAddress: string;
  deliveryAddress: string | null;
  vatNumber: string | null;
  notes: string | null;
  createdAt: string;
}

export interface CustomerFormInput {
  name: string;
  billingAddress: string;
  company?: string;
  email?: string;
  phone?: string;
  deliveryAddress?: string;
  vatNumber?: string;
  notes?: string;
}

const CUSTOMERS_QUERY_KEY = ['customers'] as const;

export function useCustomers() {
  return useQuery({
    queryKey: CUSTOMERS_QUERY_KEY,
    queryFn: () => apiGet<{ customers: Customer[] }>('/api/customers').then((r) => r.customers),
  });
}

export function useCustomer(id: string | undefined) {
  return useQuery({
    queryKey: [...CUSTOMERS_QUERY_KEY, id],
    queryFn: () => apiGet<{ customer: Customer }>(`/api/customers/${id}`).then((r) => r.customer),
    enabled: id !== undefined,
  });
}

export function useCreateCustomer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: CustomerFormInput) =>
      apiPost<{ customer: Customer }>('/api/customers', data).then((r) => r.customer),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: CUSTOMERS_QUERY_KEY });
    },
  });
}

export function useUpdateCustomer(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<CustomerFormInput>) => apiPatch(`/api/customers/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: CUSTOMERS_QUERY_KEY });
    },
  });
}

/**
 * Neither `Quote` nor `Invoice` API responses include the related `Customer`
 * record (see platform/api/src/db/scoped.ts), so quote/invoice pages resolve
 * customer names client-side through this Map lookup.
 */
export function useCustomerLookup() {
  const { data: customers, isLoading, isError } = useCustomers();
  const lookup = useMemo(() => new Map(customers?.map((c) => [c.id, c]) ?? []), [customers]);
  return { lookup, isLoading, isError };
}
