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

export function usePrinterPresets(printerId: string) {
  return useQuery({
    queryKey: ['printers', printerId, 'presets'],
    queryFn: () => apiGet<{ presets: PrinterPreset[] }>(`/api/printers/${printerId}/presets`).then((r) => r.presets),
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
