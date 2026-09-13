import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiDelete, apiGet, apiPatch, apiPost } from './client.js';

export interface PremadeItem {
  id: string;
  name: string;
  unitCost: number;
  costMultiplier: number;
  createdAt: string;
}

export interface PremadeItemFormInput {
  name: string;
  unitCost: number;
  costMultiplier?: number;
}

const PREMADE_ITEMS_QUERY_KEY = ['premadeItems'] as const;

export function usePremadeItems() {
  return useQuery({
    queryKey: PREMADE_ITEMS_QUERY_KEY,
    queryFn: () => apiGet<{ premadeItems: PremadeItem[] }>('/api/premade-items').then((r) => r.premadeItems),
  });
}

export function usePremadeItem(id: string | undefined) {
  return useQuery({
    queryKey: [...PREMADE_ITEMS_QUERY_KEY, id],
    queryFn: () => apiGet<{ premadeItem: PremadeItem }>(`/api/premade-items/${id}`).then((r) => r.premadeItem),
    enabled: id !== undefined,
  });
}

export function useCreatePremadeItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: PremadeItemFormInput) =>
      apiPost<{ premadeItem: PremadeItem }>('/api/premade-items', data).then((r) => r.premadeItem),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: PREMADE_ITEMS_QUERY_KEY });
    },
  });
}

export function useUpdatePremadeItem(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<PremadeItemFormInput>) => apiPatch(`/api/premade-items/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: PREMADE_ITEMS_QUERY_KEY });
    },
  });
}

export function useDeletePremadeItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiDelete(`/api/premade-items/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: PREMADE_ITEMS_QUERY_KEY });
    },
  });
}
