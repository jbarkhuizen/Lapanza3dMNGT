import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiGet, apiPatch, apiPost } from './client.js';

export interface Filament {
  id: string;
  brand: string;
  materialType: string;
  diameterMm: number;
  colour: string | null;
  costPerSpool: number | null;
  costPerKg: number | null;
  spoolWeightGrams: number | null;
  remainingWeightGrams: number | null;
  supplier: string | null;
  purchaseDate: string | null;
  notes: string | null;
  lowStockThresholdGrams: number | null;
  createdAt: string;
}

export interface FilamentFormInput {
  brand: string;
  materialType: string;
  diameterMm: 1.75 | 2.85;
  colour?: string;
  costPerSpool?: number;
  costPerKg?: number;
  spoolWeightGrams?: number;
  remainingWeightGrams?: number;
  supplier?: string;
  purchaseDate?: string;
  notes?: string;
  lowStockThresholdGrams?: number;
}

const FILAMENTS_QUERY_KEY = ['filaments'] as const;

export function useFilaments() {
  return useQuery({
    queryKey: FILAMENTS_QUERY_KEY,
    queryFn: () => apiGet<{ filaments: Filament[] }>('/api/filaments').then((r) => r.filaments),
  });
}

export function useFilament(id: string | undefined) {
  return useQuery({
    queryKey: [...FILAMENTS_QUERY_KEY, id],
    queryFn: () => apiGet<{ filament: Filament }>(`/api/filaments/${id}`).then((r) => r.filament),
    enabled: id !== undefined,
  });
}

export function useCreateFilament() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: FilamentFormInput) =>
      apiPost<{ filament: Filament }>('/api/filaments', data).then((r) => r.filament),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: FILAMENTS_QUERY_KEY });
    },
  });
}

export function useUpdateFilament(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<FilamentFormInput>) => apiPatch(`/api/filaments/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: FILAMENTS_QUERY_KEY });
    },
  });
}
