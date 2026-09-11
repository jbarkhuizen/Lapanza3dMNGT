import type { ChangeEvent } from 'react';
import { JOB_STATUSES, JOB_STATUS_LABELS, useJobs, useUpdateJobStatus, type Job, type JobStatus } from '../../api/jobs.js';

function JobCard({ job }: { job: Job }) {
  const updateStatusMutation = useUpdateJobStatus(job.id);

  function handleStatusChange(event: ChangeEvent<HTMLSelectElement>) {
    updateStatusMutation.mutate(event.target.value as JobStatus);
  }

  return (
    <div className="flex flex-col gap-2 rounded border border-slate-200 bg-white p-3 text-sm shadow-sm">
      <div className="font-medium text-slate-900">{job.name}</div>
      {job.notes && <p className="text-slate-600">{job.notes}</p>}
      <div className="text-xs text-slate-500">
        <div>Created {job.createdAt.slice(0, 10)}</div>
        {job.startedAt && <div>Started {job.startedAt.slice(0, 10)}</div>}
      </div>
      <select
        aria-label={`Status for ${job.name}`}
        value={job.status}
        onChange={handleStatusChange}
        disabled={updateStatusMutation.isPending}
        className="rounded border border-slate-300 px-2 py-1 text-sm disabled:opacity-50"
      >
        {JOB_STATUSES.map((status) => (
          <option key={status} value={status}>
            {JOB_STATUS_LABELS[status]}
          </option>
        ))}
      </select>
    </div>
  );
}

export function JobsBoardPage() {
  const { data: jobs, isLoading, isError } = useJobs();

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold text-slate-900">Jobs</h1>
      {isLoading && <p className="text-slate-500">Loading…</p>}
      {isError && <p className="text-red-600">Couldn't load jobs. Try refreshing the page.</p>}
      {!isLoading && !isError && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {JOB_STATUSES.map((status) => {
            const jobsInColumn = (jobs ?? []).filter((job) => job.status === status);
            return (
              <div key={status} className="flex flex-col gap-3 rounded bg-slate-50 p-3">
                <h2 className="text-sm font-semibold text-slate-700">
                  {JOB_STATUS_LABELS[status]} <span className="text-slate-400">({jobsInColumn.length})</span>
                </h2>
                <div className="flex flex-col gap-3">
                  {jobsInColumn.map((job) => (
                    <JobCard key={job.id} job={job} />
                  ))}
                  {jobsInColumn.length === 0 && <p className="text-xs text-slate-400">No jobs</p>}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
