import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiGet, apiPatch, apiPost } from './client.js';

export const CONSUMABLE_CATEGORIES = [
  'resin', 'nozzle', 'build-plate-adhesive', 'post-processing', 'packaging', 'other',
] as const;

export type ConsumableCategory = (typeof CONSUMABLE_CATEGORIES)[number];

export interface Consumable {
  id: string;
  name: string;
  category: ConsumableCategory;
  unitOfMeasure: string;
  costPerUnit: number;
  currentStock: number;
  reorderThreshold: number | null;
  supplier: string | null;
  createdAt: string;
}

export interface ConsumableFormInput {
  name: string;
  category: ConsumableCategory;
  unitOfMeasure: string;
  costPerUnit: number;
  currentStock?: number;
  // number to set, null to explicitly clear (edit mode only), undefined to leave unset/untouched.
  reorderThreshold?: number | null;
  supplier?: string;
}

const CONSUMABLES_QUERY_KEY = ['consumables'] as const;

export function useConsumables() {
  return useQuery({
    queryKey: CONSUMABLES_QUERY_KEY,
    queryFn: () => apiGet<{ consumables: Consumable[] }>('/api/consumables').then((r) => r.consumables),
  });
}

export function useConsumable(id: string | undefined) {
  return useQuery({
    queryKey: [...CONSUMABLES_QUERY_KEY, id],
    queryFn: () => apiGet<{ consumable: Consumable }>(`/api/consumables/${id}`).then((r) => r.consumable),
    enabled: id !== undefined,
  });
}

export function useCreateConsumable() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: ConsumableFormInput) =>
      apiPost<{ consumable: Consumable }>('/api/consumables', data).then((r) => r.consumable),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: CONSUMABLES_QUERY_KEY });
    },
  });
}

export function useUpdateConsumable(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<ConsumableFormInput>) => apiPatch(`/api/consumables/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: CONSUMABLES_QUERY_KEY });
    },
  });
}
