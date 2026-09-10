import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiGet, apiPatch, apiPost } from './client.js';

export type PrinterStatus = 'active' | 'maintenance' | 'retired';

export interface Printer {
  id: string;
  name: string;
  make: string | null;
  model: string | null;
  buildVolumeXMm: number | null;
  buildVolumeYMm: number | null;
  buildVolumeZMm: number | null;
  purchaseDate: string | null;
  purchaseCost: number | null;
  powerDrawWatts: number | null;
  electricityRatePerKwh: string | null;
  expectedLifetimeHours: number | null;
  status: PrinterStatus;
  createdAt: string;
}

export interface PrinterFormInput {
  name: string;
  make?: string;
  model?: string;
  // number to set, null to explicitly clear (edit mode only), undefined to leave unset/untouched.
  buildVolumeXMm?: number | null;
  buildVolumeYMm?: number | null;
  buildVolumeZMm?: number | null;
  purchaseDate?: string;
  purchaseCost?: number | null;
  powerDrawWatts?: number | null;
  electricityRatePerKwh?: number | null;
  expectedLifetimeHours?: number | null;
  status?: PrinterStatus;
}

const PRINTERS_QUERY_KEY = ['printers'] as const;

export function usePrinters() {
  return useQuery({
    queryKey: PRINTERS_QUERY_KEY,
    queryFn: () => apiGet<{ printers: Printer[] }>('/api/printers').then((r) => r.printers),
  });
}

export function usePrinter(id: string | undefined) {
  return useQuery({
    queryKey: [...PRINTERS_QUERY_KEY, id],
    queryFn: () => apiGet<{ printer: Printer }>(`/api/printers/${id}`).then((r) => r.printer),
    enabled: id !== undefined,
  });
}

export function useCreatePrinter() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: PrinterFormInput) =>
      apiPost<{ printer: Printer }>('/api/printers', data).then((r) => r.printer),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: PRINTERS_QUERY_KEY });
    },
  });
}

export function useUpdatePrinter(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<PrinterFormInput>) => apiPatch(`/api/printers/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: PRINTERS_QUERY_KEY });
    },
  });
}
