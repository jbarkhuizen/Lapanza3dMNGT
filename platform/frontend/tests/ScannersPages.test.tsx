import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { ScannersListPage } from '../src/pages/scanners/ScannersListPage.js';
import { ScannerFormPage } from '../src/pages/scanners/ScannerFormPage.js';
import * as client from '../src/api/client.js';
import { createTestQueryClient } from './helpers/queryClient.js';

beforeEach(() => {
  vi.restoreAllMocks();
});

function renderList() {
  const queryClient = createTestQueryClient();
  return render(
    <MemoryRouter>
      <QueryClientProvider client={queryClient}>
        <ScannersListPage />
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

function renderFormAt(path: string) {
  const queryClient = createTestQueryClient();
  return render(
    <MemoryRouter initialEntries={[path]}>
      <QueryClientProvider client={queryClient}>
        <Routes>
          <Route path="/scanners/new" element={<ScannerFormPage />} />
          <Route path="/scanners/:id" element={<ScannerFormPage />} />
          <Route path="/scanners" element={<div>scanners list</div>} />
        </Routes>
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

describe('ScannersListPage', () => {
  it('lists scanners returned by the API', async () => {
    vi.spyOn(client, 'apiGet').mockResolvedValue({
      ok: true,
      scanners: [{ id: '1', name: 'Handheld scanner', scannerCost: 6000, expectedScanHours: 1000, powerCostPerHour: 0.5, createdAt: '2026-01-01T00:00:00.000Z' }],
    });
    renderList();
    await waitFor(() => expect(screen.getByText('Handheld scanner')).toBeInTheDocument());
  });

  it('shows an empty state when there are no scanners', async () => {
    vi.spyOn(client, 'apiGet').mockResolvedValue({ ok: true, scanners: [] });
    renderList();
    await waitFor(() => expect(screen.getByText(/no scanners yet/i)).toBeInTheDocument());
  });

  it('shows an error message when the list fails to load', async () => {
    vi.spyOn(client, 'apiGet').mockRejectedValue(new client.ApiError('Something went wrong.', 500));
    renderList();
    await waitFor(() => expect(screen.getByText(/couldn't load scanners/i)).toBeInTheDocument());
  });

  it('deletes a scanner when confirmed', async () => {
    vi.spyOn(client, 'apiGet').mockResolvedValue({
      ok: true,
      scanners: [{ id: '1', name: 'Handheld scanner', scannerCost: 6000, expectedScanHours: 1000, powerCostPerHour: 0.5, createdAt: '2026-01-01T00:00:00.000Z' }],
    });
    const deleteSpy = vi.spyOn(client, 'apiDelete').mockResolvedValue({ ok: true });
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    renderList();
    await waitFor(() => expect(screen.getByText('Handheld scanner')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(deleteSpy).toHaveBeenCalledWith('/api/scanners/1'));
  });
});

describe('ScannerFormPage', () => {
  it('creates a scanner with the expected payload', async () => {
    const postSpy = vi.spyOn(client, 'apiPost').mockResolvedValue({ ok: true, scanner: { id: '1' } });
    renderFormAt('/scanners/new');

    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Handheld scanner' } });
    fireEvent.change(screen.getByLabelText('Scanner cost'), { target: { value: '6000' } });
    fireEvent.change(screen.getByLabelText('Expected scan hours'), { target: { value: '1000' } });
    fireEvent.change(screen.getByLabelText('Power cost per hour'), { target: { value: '0.5' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() =>
      expect(postSpy).toHaveBeenCalledWith('/api/scanners', {
        name: 'Handheld scanner',
        scannerCost: 6000,
        expectedScanHours: 1000,
        powerCostPerHour: 0.5,
      }),
    );
  });

  it('blocks submitting when expectedScanHours is left blank', async () => {
    const postSpy = vi.spyOn(client, 'apiPost').mockResolvedValue({ ok: true, scanner: { id: '1' } });
    renderFormAt('/scanners/new');

    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Handheld scanner' } });
    fireEvent.change(screen.getByLabelText('Scanner cost'), { target: { value: '6000' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(postSpy).not.toHaveBeenCalled();
  });

  it('loads an existing scanner via GET /api/scanners/:id and saves changes', async () => {
    vi.spyOn(client, 'apiGet').mockResolvedValue({
      ok: true,
      scanner: { id: '1', name: 'Handheld scanner', scannerCost: 6000, expectedScanHours: 1000, powerCostPerHour: 0.5, createdAt: '2026-01-01T00:00:00.000Z' },
    });
    const patchSpy = vi.spyOn(client, 'apiPatch').mockResolvedValue({ ok: true });
    renderFormAt('/scanners/1');

    await waitFor(() => expect(screen.getByDisplayValue('Handheld scanner')).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText('Scanner cost'), { target: { value: '6500' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() =>
      expect(patchSpy).toHaveBeenCalledWith('/api/scanners/1', expect.objectContaining({ scannerCost: 6500 })),
    );
  });
});
