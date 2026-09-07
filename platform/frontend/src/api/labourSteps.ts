import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiGet, apiPatch, apiPost } from './client.js';

export interface LabourStep {
  id: string;
  name: string;
  hourlyRate: number;
  active: boolean;
  createdAt: string;
}

export interface LabourStepFormInput {
  name: string;
  hourlyRate: number;
  active?: boolean;
}

const LABOUR_STEPS_QUERY_KEY = ['labourSteps'] as const;

export function useLabourSteps() {
  return useQuery({
    queryKey: LABOUR_STEPS_QUERY_KEY,
    queryFn: () => apiGet<{ labourSteps: LabourStep[] }>('/api/labour-steps').then((r) => r.labourSteps),
  });
}

export function useLabourStep(id: string | undefined) {
  return useQuery({
    queryKey: [...LABOUR_STEPS_QUERY_KEY, id],
    queryFn: () => apiGet<{ labourStep: LabourStep }>(`/api/labour-steps/${id}`).then((r) => r.labourStep),
    enabled: id !== undefined,
  });
}

export function useCreateLabourStep() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: LabourStepFormInput) =>
      apiPost<{ labourStep: LabourStep }>('/api/labour-steps', data).then((r) => r.labourStep),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: LABOUR_STEPS_QUERY_KEY });
    },
  });
}

export function useUpdateLabourStep(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<LabourStepFormInput>) => apiPatch(`/api/labour-steps/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: LABOUR_STEPS_QUERY_KEY });
    },
  });
}
