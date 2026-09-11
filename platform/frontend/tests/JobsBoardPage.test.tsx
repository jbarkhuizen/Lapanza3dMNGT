import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { JobsBoardPage } from '../src/pages/jobs/JobsBoardPage.js';
import * as client from '../src/api/client.js';
import { createTestQueryClient } from './helpers/queryClient.js';

beforeEach(() => {
  vi.restoreAllMocks();
});

const jobs = [
  {
    id: 'j1',
    costingTemplateId: 't1',
    name: 'Standard PLA bracket',
    status: 'backlog',
    notes: null as string | null,
    createdAt: '2026-01-01T00:00:00.000Z',
    startedAt: null as string | null,
    completedAt: null as string | null,
  },
  {
    id: 'j2',
    costingTemplateId: 't2',
    name: 'Custom vase',
    status: 'printing',
    notes: 'Rush order',
    createdAt: '2026-01-02T00:00:00.000Z',
    startedAt: '2026-01-03T00:00:00.000Z',
    completedAt: null as string | null,
  },
];

function renderPage() {
  const queryClient = createTestQueryClient();
  return render(
    <MemoryRouter>
      <QueryClientProvider client={queryClient}>
        <JobsBoardPage />
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

describe('JobsBoardPage', () => {
  it('renders jobs grouped into their status columns', async () => {
    vi.spyOn(client, 'apiGet').mockResolvedValue({ ok: true, jobs });
    renderPage();

    await waitFor(() => expect(screen.getByText('Standard PLA bracket')).toBeInTheDocument());
    expect(screen.getByText('Custom vase')).toBeInTheDocument();
    expect(screen.getByText('Rush order')).toBeInTheDocument();

    // Each of the 5 board columns renders as a heading.
    expect(screen.getByRole('heading', { name: /Backlog/ })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /Slicing/ })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /Printing/ })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /Post-processing/ })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /Done/ })).toBeInTheDocument();
  });

  it('calls the update-status mutation with the right id and status when a card\'s select changes', async () => {
    vi.spyOn(client, 'apiGet').mockResolvedValue({ ok: true, jobs });
    const patchSpy = vi.spyOn(client, 'apiPatch').mockResolvedValue({ ok: true, job: { ...jobs[0], status: 'slicing' } });
    renderPage();

    await waitFor(() => expect(screen.getByText('Standard PLA bracket')).toBeInTheDocument());
    const select = screen.getByLabelText('Status for Standard PLA bracket');
    fireEvent.change(select, { target: { value: 'slicing' } });

    await waitFor(() => expect(patchSpy).toHaveBeenCalledWith('/api/jobs/j1/status', { status: 'slicing' }));
  });

  it('shows a message when a column has no jobs', async () => {
    vi.spyOn(client, 'apiGet').mockResolvedValue({ ok: true, jobs: [] });
    renderPage();

    await waitFor(() => expect(screen.getAllByText('No jobs').length).toBe(5));
  });

  it('shows an error message when jobs fail to load', async () => {
    vi.spyOn(client, 'apiGet').mockRejectedValue(new client.ApiError('Something went wrong.', 500));
    renderPage();
    await waitFor(() => expect(screen.getByText("Couldn't load jobs. Try refreshing the page.")).toBeInTheDocument());
  });
});
