import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiGet, apiPatch, apiPost } from './client.js';

export const JOB_STATUSES = ['backlog', 'slicing', 'printing', 'post-processing', 'done'] as const;
export type JobStatus = (typeof JOB_STATUSES)[number];

export const JOB_STATUS_LABELS: Record<JobStatus, string> = {
  backlog: 'Backlog',
  slicing: 'Slicing',
  printing: 'Printing',
  'post-processing': 'Post-processing',
  done: 'Done',
};

export interface Job {
  id: string;
  costingTemplateId: string;
  name: string;
  status: JobStatus;
  notes: string | null;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
}

const JOBS_QUERY_KEY = ['jobs'] as const;

export function useJobs() {
  return useQuery({
    queryKey: JOBS_QUERY_KEY,
    queryFn: () => apiGet<{ jobs: Job[] }>('/api/jobs').then((r) => r.jobs),
  });
}

export function useCreateJob() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: { costingTemplateId: string }) =>
      apiPost<{ job: Job }>('/api/jobs', data).then((r) => r.job),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: JOBS_QUERY_KEY });
    },
  });
}

export function useUpdateJobStatus(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (status: JobStatus) =>
      apiPatch<{ job: Job }>(`/api/jobs/${id}/status`, { status }).then((r) => r.job),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: JOBS_QUERY_KEY });
    },
  });
}

export function useUpdateJobNotes(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (notes: string) =>
      apiPatch<{ job: Job }>(`/api/jobs/${id}`, { notes }).then((r) => r.job),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: JOBS_QUERY_KEY });
    },
  });
}
