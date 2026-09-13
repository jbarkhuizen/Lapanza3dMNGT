import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiGet, apiPost } from './client.js';

export interface PrinterPreset {
  id: string;
  name: string;
  materialType: string;
  nozzleTempC: number | null;
  bedTempC: number | null;
  printSpeedMmS: number | null;
  layerHeightMm: number | null;
  infillPercent: number | null;
  notes: string | null;
  createdAt: string;
}

export interface PrinterPresetFormInput {
  name: string;
  materialType: string;
  nozzleTempC?: number;
  bedTempC?: number;
  printSpeedMmS?: number;
  layerHeightMm?: number;
  infillPercent?: number;
  notes?: string;
}

export function usePrinterPresets(printerId: string, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: ['printers', printerId, 'presets'],
    queryFn: () => apiGet<{ presets: PrinterPreset[] }>(`/api/printers/${printerId}/presets`).then((r) => r.presets),
    // Callers that don't yet have a printerId selected (e.g. SliceUploadPanel,
    // before the user picks a printer) can pass `enabled: false` to avoid
    // firing a request for a blank id -- defaults to true, matching every
    // pre-existing call site that never passed this option.
    enabled: options?.enabled ?? true,
  });
}

export function useCreatePrinterPreset(printerId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: PrinterPresetFormInput) =>
      apiPost<{ preset: PrinterPreset }>(`/api/printers/${printerId}/presets`, data).then((r) => r.preset),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['printers', printerId, 'presets'] });
    },
  });
}
