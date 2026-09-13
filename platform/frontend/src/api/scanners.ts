import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiDelete, apiGet, apiPatch, apiPost } from './client.js';

export interface Scanner {
  id: string;
  name: string;
  scannerCost: number;
  expectedScanHours: number;
  powerCostPerHour: number;
  createdAt: string;
}

export interface ScannerFormInput {
  name: string;
  scannerCost: number;
  expectedScanHours: number;
  powerCostPerHour?: number;
}

const SCANNERS_QUERY_KEY = ['scanners'] as const;

export function useScanners() {
  return useQuery({
    queryKey: SCANNERS_QUERY_KEY,
    queryFn: () => apiGet<{ scanners: Scanner[] }>('/api/scanners').then((r) => r.scanners),
  });
}

export function useScanner(id: string | undefined) {
  return useQuery({
    queryKey: [...SCANNERS_QUERY_KEY, id],
    queryFn: () => apiGet<{ scanner: Scanner }>(`/api/scanners/${id}`).then((r) => r.scanner),
    enabled: id !== undefined,
  });
}

export function useCreateScanner() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: ScannerFormInput) => apiPost<{ scanner: Scanner }>('/api/scanners', data).then((r) => r.scanner),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: SCANNERS_QUERY_KEY });
    },
  });
}

export function useUpdateScanner(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<ScannerFormInput>) => apiPatch(`/api/scanners/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: SCANNERS_QUERY_KEY });
    },
  });
}

export function useDeleteScanner() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiDelete(`/api/scanners/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: SCANNERS_QUERY_KEY });
    },
  });
}
