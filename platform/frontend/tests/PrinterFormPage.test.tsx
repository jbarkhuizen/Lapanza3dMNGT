import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { PrinterFormPage } from '../src/pages/printers/PrinterFormPage.js';
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
          <Route path="/printers/new" element={<PrinterFormPage />} />
          <Route path="/printers/:id" element={<PrinterFormPage />} />
          <Route path="/printers" element={<div>printers list</div>} />
        </Routes>
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

describe('PrinterFormPage — create mode', () => {
  it('creates a printer with an optional numeric field left blank (omitted, not NaN or empty string)', async () => {
    const postSpy = vi.spyOn(client, 'apiPost').mockResolvedValue({ ok: true, printer: { id: '1' } });
    renderAt('/printers/new');

    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Prusa MK4' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(postSpy).toHaveBeenCalled());
    const [, body] = postSpy.mock.calls[0];
    expect(body).toMatchObject({ name: 'Prusa MK4', status: 'active' });
    expect((body as Record<string, unknown>).powerDrawWatts).toBeUndefined();
  });

  it('sends a filled-in optional numeric field as a real number, not a string', async () => {
    const postSpy = vi.spyOn(client, 'apiPost').mockResolvedValue({ ok: true, printer: { id: '1' } });
    renderAt('/printers/new');

    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Prusa MK4' } });
    fireEvent.change(screen.getByLabelText('Power draw (W)'), { target: { value: '250' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(postSpy).toHaveBeenCalled());
    const [, body] = postSpy.mock.calls[0];
    expect((body as Record<string, unknown>).powerDrawWatts).toBe(250);
  });

  it('omits a blank purchase date instead of sending an empty string that fails server validation', async () => {
    const postSpy = vi.spyOn(client, 'apiPost').mockResolvedValue({ ok: true, printer: { id: '1' } });
    renderAt('/printers/new');

    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Prusa MK4' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(postSpy).toHaveBeenCalled());
    const [, body] = postSpy.mock.calls[0];
    expect((body as Record<string, unknown>).purchaseDate).toBeUndefined();
  });
});

describe('PrinterFormPage — edit mode', () => {
  it('loads an existing printer (null optional fields become blank inputs, not "null" text) and saves changes', async () => {
    vi.spyOn(client, 'apiGet').mockResolvedValue({
      ok: true,
      printer: {
        id: '1', name: 'Prusa MK4', make: null, model: null,
        buildVolumeXMm: null, buildVolumeYMm: null, buildVolumeZMm: null,
        purchaseDate: null, purchaseCost: null, powerDrawWatts: null,
        electricityRatePerKwh: null, expectedLifetimeHours: null,
        status: 'active', createdAt: '2026-01-01T00:00:00.000Z',
      },
    });
    const patchSpy = vi.spyOn(client, 'apiPatch').mockResolvedValue({ ok: true });
    renderAt('/printers/1');

    await waitFor(() => expect(screen.getByDisplayValue('Prusa MK4')).toBeInTheDocument());
    expect(screen.getByLabelText('Make')).toHaveValue('');
    fireEvent.change(screen.getByLabelText('Make'), { target: { value: 'Prusa' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() =>
      expect(patchSpy).toHaveBeenCalledWith('/api/printers/1', expect.objectContaining({ make: 'Prusa' })),
    );
  });

  it('displays purchaseDate in YYYY-MM-DD format when editing a printer with an ISO datetime from backend', async () => {
    vi.spyOn(client, 'apiGet').mockResolvedValue({
      ok: true,
      printer: {
        id: '1', name: 'Prusa MK4', make: null, model: null,
        buildVolumeXMm: null, buildVolumeYMm: null, buildVolumeZMm: null,
        purchaseDate: '2026-03-15T00:00:00.000Z', purchaseCost: null, powerDrawWatts: null,
        electricityRatePerKwh: null, expectedLifetimeHours: null,
        status: 'active', createdAt: '2026-01-01T00:00:00.000Z',
      },
    });
    renderAt('/printers/1');

    await waitFor(() => expect(screen.getByDisplayValue('Prusa MK4')).toBeInTheDocument());
    expect((screen.getByLabelText('Purchase date') as HTMLInputElement).value).toBe('2026-03-15');
  });

  it('converts electricityRatePerKwh from a formatted API string to a number on load, and back to a number on save', async () => {
    vi.spyOn(client, 'apiGet').mockResolvedValue({
      ok: true,
      printer: {
        id: '1', name: 'Prusa MK4', make: null, model: null,
        buildVolumeXMm: null, buildVolumeYMm: null, buildVolumeZMm: null,
        purchaseDate: null, purchaseCost: null, powerDrawWatts: null,
        electricityRatePerKwh: '2.5000', expectedLifetimeHours: null,
        status: 'active', createdAt: '2026-01-01T00:00:00.000Z',
      },
    });
    const patchSpy = vi.spyOn(client, 'apiPatch').mockResolvedValue({ ok: true });
    renderAt('/printers/1');

    await waitFor(() => expect(screen.getByLabelText('Electricity rate per kWh')).toHaveValue(2.5));
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() =>
      expect(patchSpy).toHaveBeenCalledWith('/api/printers/1', expect.objectContaining({ electricityRatePerKwh: 2.5 })),
    );
  });
});
