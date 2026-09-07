import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { LabourStepFormPage } from '../src/pages/labourSteps/LabourStepFormPage.js';
import * as client from '../src/api/client.js';
import { createTestQueryClient } from './helpers/queryClient.js';

beforeEach(() => {
  vi.restoreAllMocks();
});

function renderAt(path: string) {
  const queryClient = createTestQueryClient();
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
});
