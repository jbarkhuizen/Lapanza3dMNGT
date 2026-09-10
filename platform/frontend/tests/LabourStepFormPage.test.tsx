import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { LabourStepFormPage } from '../src/pages/labourSteps/LabourStepFormPage.js';
import * as client from '../src/api/client.js';
import { createTestQueryClient } from './helpers/queryClient.js';

beforeEach(() => {
  vi.restoreAllMocks();
});

function renderAt(path: string, queryClient: QueryClient = createTestQueryClient()) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <QueryClientProvider client={queryClient}>
        <Routes>
          <Route path="/labour-steps/new" element={<LabourStepFormPage />} />
          <Route path="/labour-steps/:id" element={<LabourStepFormPage />} />
          <Route path="/labour-steps" element={<div>labour steps list</div>} />
        </Routes>
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

describe('LabourStepFormPage — create mode', () => {
  it('creates a labour step with the active checkbox defaulting to checked', async () => {
    const postSpy = vi.spyOn(client, 'apiPost').mockResolvedValue({ ok: true, labourStep: { id: '1' } });
    renderAt('/labour-steps/new');

    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Slicing' } });
    fireEvent.change(screen.getByLabelText('Hourly rate'), { target: { value: '150' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(postSpy).toHaveBeenCalled());
    const [, body] = postSpy.mock.calls[0];
    expect(body).toMatchObject({ name: 'Slicing', hourlyRate: 150, active: true });
  });

  it('sends hourlyRate as a real number, not a string', async () => {
    const postSpy = vi.spyOn(client, 'apiPost').mockResolvedValue({ ok: true, labourStep: { id: '1' } });
    renderAt('/labour-steps/new');

    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Slicing' } });
    fireEvent.change(screen.getByLabelText('Hourly rate'), { target: { value: '150' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(postSpy).toHaveBeenCalled());
    const [, body] = postSpy.mock.calls[0];
    expect((body as Record<string, unknown>).hourlyRate).toBe(150);
  });

  it('does not coerce a cleared hourlyRate to 0 — clearing it leaves the input blank, not "0"', async () => {
    // Regression test: `Number('') === 0`, so a naive `onChange={(e) => set('hourlyRate',
    // Number(e.target.value))}` would snap a cleared field to 0 immediately, making the
    // input non-empty and silently defeating the `required` attribute on submit.
    renderAt('/labour-steps/new');

    const hourlyRateInput = screen.getByLabelText('Hourly rate');
    fireEvent.change(hourlyRateInput, { target: { value: '150' } });
    expect(hourlyRateInput).toHaveValue(150);

    fireEvent.change(hourlyRateInput, { target: { value: '' } });
    expect(hourlyRateInput).toHaveValue(null);
  });

  it('blocks submitting the create form when hourlyRate is left blank', async () => {
    const postSpy = vi.spyOn(client, 'apiPost').mockResolvedValue({ ok: true, labourStep: { id: '1' } });
    renderAt('/labour-steps/new');

    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Slicing' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(postSpy).not.toHaveBeenCalled();
  });

  it('can uncheck the active checkbox before creating', async () => {
    const postSpy = vi.spyOn(client, 'apiPost').mockResolvedValue({ ok: true, labourStep: { id: '1' } });
    renderAt('/labour-steps/new');

    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Slicing' } });
    fireEvent.change(screen.getByLabelText('Hourly rate'), { target: { value: '150' } });
    fireEvent.click(screen.getByLabelText('Active'));
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(postSpy).toHaveBeenCalled());
    const [, body] = postSpy.mock.calls[0];
    expect((body as Record<string, unknown>).active).toBe(false);
  });
});

describe('LabourStepFormPage — edit mode', () => {
  it('loads an existing labour step via GET /api/labour-steps/:id and saves changes', async () => {
    vi.spyOn(client, 'apiGet').mockResolvedValue({
      ok: true,
      labourStep: { id: '1', name: 'Slicing', hourlyRate: 150, active: true, createdAt: '2026-01-01T00:00:00.000Z' },
    });
    const patchSpy = vi.spyOn(client, 'apiPatch').mockResolvedValue({ ok: true });
    renderAt('/labour-steps/1');

    await waitFor(() => expect(screen.getByDisplayValue('Slicing')).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText('Hourly rate'), { target: { value: '175' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() =>
      expect(patchSpy).toHaveBeenCalledWith('/api/labour-steps/1', expect.objectContaining({ hourlyRate: 175 })),
    );
  });

  it('shows an error message when the labour step fails to load', async () => {
    vi.spyOn(client, 'apiGet').mockRejectedValue(new client.ApiError('Something went wrong.', 500));
    renderAt('/labour-steps/1');
    await waitFor(() => expect(screen.getByText(/couldn't load this labour step/i)).toBeInTheDocument());
  });

  it('only populates the form once from the fetched labour step, even if the query result reference changes', async () => {
    // Regression test for the ref-guard mechanism: without it, an effect keyed on
    // `existingStep` re-running whenever a referentially-new (but same-data) object arrives
    // (e.g. a background refetch) would clobber whatever the user has since typed into the
    // form.
    const step = { id: '1', name: 'Slicing', hourlyRate: 150, active: true, createdAt: '2026-01-01T00:00:00.000Z' };
    vi.spyOn(client, 'apiGet').mockResolvedValue({ ok: true, labourStep: step });
    const queryClient = createTestQueryClient();
    renderAt('/labour-steps/1', queryClient);

    await waitFor(() => expect(screen.getByDisplayValue('Slicing')).toBeInTheDocument());

    // Simulate the user typing after the initial populate.
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Slicing Jr' } });
    expect(screen.getByDisplayValue('Slicing Jr')).toBeInTheDocument();

    // Push a referentially-distinct object with the same data directly into the query
    // cache — the same effect a background refetch would have — and confirm it does not
    // overwrite the user's edit.
    queryClient.setQueryData(['labourSteps', '1'], { ...step });
    await waitFor(() => expect(screen.getByDisplayValue('Slicing Jr')).toBeInTheDocument());
  });

  it('can load different labour steps and populate correctly for each', async () => {
    // Regression test verifying the populate guard is keyed to labour step id.
    // Without the id in the dependency array, the second labour step would show stale data.
    const step1 = { id: '1', name: 'Slicing', hourlyRate: 150, active: true, createdAt: '2026-01-01T00:00:00.000Z' };
    const step2 = { id: '2', name: 'Post-processing', hourlyRate: 200, active: false, createdAt: '2026-01-02T00:00:00.000Z' };

    vi.spyOn(client, 'apiGet').mockImplementation((path) => {
      if (path === '/api/labour-steps/1') {
        return Promise.resolve({ ok: true, labourStep: step1 });
      } else if (path === '/api/labour-steps/2') {
        return Promise.resolve({ ok: true, labourStep: step2 });
      }
      return Promise.reject(new Error(`Unexpected path: ${path}`));
    });

    // Load labour step 1
    const { unmount } = renderAt('/labour-steps/1');
    await waitFor(() => expect(screen.getByDisplayValue('Slicing')).toBeInTheDocument());
    expect(screen.getByDisplayValue('150')).toBeInTheDocument();
    unmount();

    // Load labour step 2 and verify it shows labour step 2's data, not labour step 1's stale data
    renderAt('/labour-steps/2');
    await waitFor(() => expect(screen.getByDisplayValue('Post-processing')).toBeInTheDocument());
    expect(screen.getByDisplayValue('200')).toBeInTheDocument();
  });
});
