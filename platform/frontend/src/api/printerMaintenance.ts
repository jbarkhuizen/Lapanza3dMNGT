import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiGet, apiPost } from './client.js';

export interface MaintenanceLogEntry {
  id: string;
  date: string;
  description: string;
  cost: number | null;
  performedBy: string | null;
  createdAt: string;
}

export interface MaintenanceLogFormInput {
  date: string;
  description: string;
  cost?: number;
  performedBy?: string;
}

export function useMaintenanceLog(printerId: string) {
  return useQuery({
    queryKey: ['printers', printerId, 'maintenance-log'],
    queryFn: () =>
      apiGet<{ entries: MaintenanceLogEntry[] }>(`/api/printers/${printerId}/maintenance-log`).then((r) => r.entries),
  });
}

export function useCreateMaintenanceLogEntry(printerId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: MaintenanceLogFormInput) =>
      apiPost<{ entry: MaintenanceLogEntry }>(`/api/printers/${printerId}/maintenance-log`, data).then((r) => r.entry),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['printers', printerId, 'maintenance-log'] });
    },
  });
}
