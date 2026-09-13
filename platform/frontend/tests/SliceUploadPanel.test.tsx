import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { SliceUploadPanel } from '../src/components/SliceUploadPanel.js';
import * as client from '../src/api/client.js';
import { createTestQueryClient } from './helpers/queryClient.js';

beforeEach(() => {
  vi.restoreAllMocks();
});

function mockReferenceData() {
  vi.spyOn(client, 'apiGet').mockImplementation((path: string) => {
    if (path === '/api/printers') {
      return Promise.resolve({ ok: true, printers: [{ id: 'p1', name: 'Prusa MK4' }] });
    }
    if (path === '/api/filaments') {
      return Promise.resolve({ ok: true, filaments: [{ id: 'f1', brand: 'eSun', materialType: 'PLA' }] });
    }
    return Promise.reject(new client.ApiError('not found', 404));
  });
}

function renderPanel(onResult?: (result: unknown) => void) {
  const queryClient = createTestQueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <SliceUploadPanel onResult={onResult} />
    </QueryClientProvider>,
  );
}

function selectFile() {
  const file = new File(['solid stub'], 'bracket.stl', { type: 'model/stl' });
  fireEvent.change(screen.getByLabelText('STL file'), { target: { files: [file] } });
}

describe('SliceUploadPanel', () => {
  it('uploads the selected file via apiPostFormData when Slice is clicked', async () => {
    mockReferenceData();
    const postFormDataSpy = vi
      .spyOn(client, 'apiPostFormData')
      .mockResolvedValue({ ok: true, job: { id: 'job1', status: 'queued' } });
    // Leave the poll pending so we only assert on the upload call itself here.
    vi.spyOn(client, 'apiGet').mockImplementation((path: string) => {
      if (path === '/api/printers') return Promise.resolve({ ok: true, printers: [] });
      if (path === '/api/filaments') return Promise.resolve({ ok: true, filaments: [] });
      return new Promise(() => {});
    });
    renderPanel();

    selectFile();
    fireEvent.click(screen.getByRole('button', { name: 'Slice' }));

    await waitFor(() => expect(postFormDataSpy).toHaveBeenCalled());
    const [path, formData] = postFormDataSpy.mock.calls[0] as [string, FormData];
    expect(path).toBe('/api/slicer/jobs');
    expect((formData.get('file') as File).name).toBe('bracket.stl');
  });

  it('shows a loading state while the job is queued/processing', async () => {
    mockReferenceData();
    vi.spyOn(client, 'apiPostFormData').mockResolvedValue({ ok: true, job: { id: 'job1', status: 'queued' } });
    let resolvePoll!: (value: unknown) => void;
    vi.spyOn(client, 'apiGet').mockImplementation((path: string) => {
      if (path === '/api/printers') return Promise.resolve({ ok: true, printers: [] });
      if (path === '/api/filaments') return Promise.resolve({ ok: true, filaments: [] });
      if (path === '/api/slicer/jobs/job1') {
        return new Promise((resolve) => { resolvePoll = resolve; });
      }
      return Promise.reject(new client.ApiError('not found', 404));
    });
    renderPanel();

    selectFile();
    fireEvent.click(screen.getByRole('button', { name: 'Slice' }));

    await waitFor(() => expect(screen.getByText(/slicing…/i)).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: 'Slice' })).not.toBeInTheDocument();

    resolvePoll({
      ok: true,
      job: {
        id: 'job1',
        status: 'done',
        resultWeightGrams: 12.5,
        resultSupportWeightGrams: 1.2,
        resultFilamentLengthMm: 456.7,
        resultPrintTimeHours: 1.5,
        errorMessage: null,
      },
    });
    await waitFor(() => expect(screen.queryByText(/slicing…/i)).not.toBeInTheDocument());
  });

  it('calls onResult and renders the parsed numbers once the job is done', async () => {
    mockReferenceData();
    vi.spyOn(client, 'apiPostFormData').mockResolvedValue({ ok: true, job: { id: 'job1', status: 'queued' } });
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
            resultWeightGrams: 12.5,
            resultSupportWeightGrams: 1.2,
            resultFilamentLengthMm: 456.7,
            resultPrintTimeHours: 1.5,
            errorMessage: null,
          },
        });
      }
      return Promise.reject(new client.ApiError('not found', 404));
    });
    const onResult = vi.fn();
    renderPanel(onResult);

    selectFile();
    fireEvent.click(screen.getByRole('button', { name: 'Slice' }));

    await waitFor(() =>
      expect(onResult).toHaveBeenCalledWith({
        jobId: 'job1',
        fileName: 'bracket.stl',
        weightGrams: 12.5,
        supportWeightGrams: 1.2,
        filamentLengthMm: 456.7,
        printTimeHours: 1.5,
      }),
    );
    expect(screen.getByText('12.50 g')).toBeInTheDocument();
    expect(screen.getByText('456.7 mm')).toBeInTheDocument();
  });

  it('shows the error message when the job fails', async () => {
    mockReferenceData();
    vi.spyOn(client, 'apiPostFormData').mockResolvedValue({ ok: true, job: { id: 'job1', status: 'queued' } });
    vi.spyOn(client, 'apiGet').mockImplementation((path: string) => {
      if (path === '/api/printers') return Promise.resolve({ ok: true, printers: [] });
      if (path === '/api/filaments') return Promise.resolve({ ok: true, filaments: [] });
      if (path === '/api/slicer/jobs/job1') {
        return Promise.resolve({ ok: true, job: { id: 'job1', status: 'failed', errorMessage: 'slicing timed out' } });
      }
      return Promise.reject(new client.ApiError('not found', 404));
    });
    renderPanel();

    selectFile();
    fireEvent.click(screen.getByRole('button', { name: 'Slice' }));

    await waitFor(() => expect(screen.getByText('slicing timed out')).toBeInTheDocument());
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });
});
