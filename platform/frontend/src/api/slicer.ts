import { useMutation, useQuery } from '@tanstack/react-query';
import { apiGet, apiPostFormData } from './client.js';

export type SliceJobStatus = 'queued' | 'processing' | 'done' | 'failed';

export interface SliceJob {
  id: string;
  status: SliceJobStatus;
  originFileName: string;
  printerId: string | null;
  printerPresetId: string | null;
  filamentId: string | null;
  resultWeightGrams: number | null;
  resultSupportWeightGrams: number | null;
  resultFilamentLengthMm: number | null;
  resultPrintTimeHours: number | null;
  errorMessage: string | null;
  createdAt: string;
  completedAt: string | null;
}

export interface CreateSliceJobInput {
  file: File;
  printerId?: string;
  printerPresetId?: string;
  filamentId?: string;
}

// POST /api/slicer/jobs is fire-and-poll -- it returns only the new job's id
// and initial status, not the full SliceJob shape (weight/time/etc. don't
// exist yet). Callers poll GET /api/slicer/jobs/:id (useSliceJob below) for
// the rest.
export interface CreatedSliceJob {
  id: string;
  status: SliceJobStatus;
}

export function useCreateSliceJob() {
  return useMutation({
    mutationFn: (input: CreateSliceJobInput) => {
      const formData = new FormData();
      formData.append('file', input.file);
      if (input.printerId) formData.append('printerId', input.printerId);
      if (input.printerPresetId) formData.append('printerPresetId', input.printerPresetId);
      if (input.filamentId) formData.append('filamentId', input.filamentId);
      return apiPostFormData<{ job: CreatedSliceJob }>('/api/slicer/jobs', formData).then((r) => r.job);
    },
  });
}

export function useSliceJob(id: string | undefined) {
  return useQuery({
    queryKey: ['sliceJobs', id],
    queryFn: () => apiGet<{ job: SliceJob }>(`/api/slicer/jobs/${id}`).then((r) => r.job),
    enabled: id !== undefined,
    // Polls every 2s while the job is still in flight, same react-query
    // refetchInterval pattern used for every other long-running-job UI in
    // this app -- stops once the job reaches a terminal state.
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return status === 'queued' || status === 'processing' ? 2000 : false;
    },
  });
}
