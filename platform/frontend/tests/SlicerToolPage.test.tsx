import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { SlicerToolPage } from '../src/pages/slicer/SlicerToolPage.js';
import * as client from '../src/api/client.js';
import { createTestQueryClient } from './helpers/queryClient.js';

beforeEach(() => {
  vi.restoreAllMocks();
});

function renderPage() {
  const queryClient = createTestQueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <SlicerToolPage />
    </QueryClientProvider>,
  );
}

describe('SlicerToolPage', () => {
  it('renders the upload panel', async () => {
    vi.spyOn(client, 'apiGet').mockImplementation((path: string) => {
      if (path === '/api/printers') return Promise.resolve({ ok: true, printers: [] });
      if (path === '/api/filaments') return Promise.resolve({ ok: true, filaments: [] });
      return Promise.reject(new client.ApiError('not found', 404));
    });
    renderPage();
    expect(screen.getByText('Slicer')).toBeInTheDocument();
    expect(screen.getByLabelText('STL file')).toBeInTheDocument();
  });

  it('shows a "Last result" summary once a slice completes', async () => {
    vi.spyOn(client, 'apiGet').mockImplementation((path: string) => {
      if (path === '/api/printers') return Promise.resolve({ ok: true, printers: [] });
      if (path === '/api/filaments') return Promise.resolve({ ok: true, filaments: [] });
      if (path === '/api/slicer/jobs/job1') {
        return Promise.resolve({
          ok: true,
          job: {
            id: 'job1',
            status: 'done',
            originFileName: 'bracket.stl',
            resultWeightGrams: 10,
            resultSupportWeightGrams: 0,
            resultFilamentLengthMm: 300,
            resultPrintTimeHours: 1,
            errorMessage: null,
          },
        });
      }
      return Promise.reject(new client.ApiError('not found', 404));
    });
    vi.spyOn(client, 'apiPostFormData').mockResolvedValue({ ok: true, job: { id: 'job1', status: 'queued' } });
    renderPage();

    const file = new File(['solid stub'], 'bracket.stl', { type: 'model/stl' });
    fireEvent.change(screen.getByLabelText('STL file'), { target: { files: [file] } });
    fireEvent.click(screen.getByRole('button', { name: 'Slice' }));

    await waitFor(() => expect(screen.getByText('Last result')).toBeInTheDocument());
    // "10.00 g" appears both in the panel's own inline result and in this
    // page's summary card -- just confirm both copies rendered.
    expect(screen.getAllByText('10.00 g')).toHaveLength(2);
  });
});
