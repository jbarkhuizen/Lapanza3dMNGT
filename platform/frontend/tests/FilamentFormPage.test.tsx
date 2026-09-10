import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { FilamentFormPage } from '../src/pages/filaments/FilamentFormPage.js';
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
          <Route path="/filaments/new" element={<FilamentFormPage />} />
          <Route path="/filaments/:id" element={<FilamentFormPage />} />
          <Route path="/filaments" element={<div>filaments list</div>} />
        </Routes>
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

describe('FilamentFormPage — create mode', () => {
  it('creates a filament with an optional numeric field left blank (omitted, not NaN or empty string)', async () => {
    const postSpy = vi.spyOn(client, 'apiPost').mockResolvedValue({ ok: true, filament: { id: '1' } });
    renderAt('/filaments/new');

    fireEvent.change(screen.getByLabelText('Brand'), { target: { value: 'eSun' } });
    fireEvent.change(screen.getByLabelText('Material type'), { target: { value: 'PLA' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(postSpy).toHaveBeenCalled());
    const [, body] = postSpy.mock.calls[0];
    expect(body).toMatchObject({ brand: 'eSun', materialType: 'PLA', diameterMm: 1.75 });
    expect((body as Record<string, unknown>).costPerKg).toBeUndefined();
  });

  it('sends a filled-in optional numeric field as a real number, not a string', async () => {
    const postSpy = vi.spyOn(client, 'apiPost').mockResolvedValue({ ok: true, filament: { id: '1' } });
    renderAt('/filaments/new');

    fireEvent.change(screen.getByLabelText('Brand'), { target: { value: 'eSun' } });
    fireEvent.change(screen.getByLabelText('Material type'), { target: { value: 'PLA' } });
    fireEvent.change(screen.getByLabelText('Cost per kg'), { target: { value: '300' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(postSpy).toHaveBeenCalled());
    const [, body] = postSpy.mock.calls[0];
    expect((body as Record<string, unknown>).costPerKg).toBe(300);
  });

  it('omits a blank purchase date instead of sending an empty string that fails server validation', async () => {
    const postSpy = vi.spyOn(client, 'apiPost').mockResolvedValue({ ok: true, filament: { id: '1' } });
    renderAt('/filaments/new');

    fireEvent.change(screen.getByLabelText('Brand'), { target: { value: 'eSun' } });
    fireEvent.change(screen.getByLabelText('Material type'), { target: { value: 'PLA' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(postSpy).toHaveBeenCalled());
    const [, body] = postSpy.mock.calls[0];
    expect((body as Record<string, unknown>).purchaseDate).toBeUndefined();
  });
});

describe('FilamentFormPage — edit mode', () => {
  it('loads an existing filament (null optional fields become blank inputs, not "null" text) and saves changes', async () => {
    vi.spyOn(client, 'apiGet').mockResolvedValue({
      ok: true,
      filament: {
        id: '1', brand: 'eSun', materialType: 'PLA', diameterMm: 1.75, colour: null,
        costPerSpool: null, costPerKg: 300, spoolWeightGrams: null, remainingWeightGrams: null,
        supplier: null, purchaseDate: null, notes: null, lowStockThresholdGrams: null,
        createdAt: '2026-01-01T00:00:00.000Z',
      },
    });
    const patchSpy = vi.spyOn(client, 'apiPatch').mockResolvedValue({ ok: true });
    renderAt('/filaments/1');

    await waitFor(() => expect(screen.getByDisplayValue('eSun')).toBeInTheDocument());
    expect(screen.getByLabelText('Colour')).toHaveValue('');
    fireEvent.change(screen.getByLabelText('Colour'), { target: { value: 'Black' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() =>
      expect(patchSpy).toHaveBeenCalledWith('/api/filaments/1', expect.objectContaining({ colour: 'Black' })),
    );
  });

  it('displays purchaseDate in YYYY-MM-DD format when editing a filament with an ISO datetime from backend', async () => {
    vi.spyOn(client, 'apiGet').mockResolvedValue({
      ok: true,
      filament: {
        id: '1', brand: 'eSun', materialType: 'PLA', diameterMm: 1.75, colour: null,
        costPerSpool: null, costPerKg: null, spoolWeightGrams: null, remainingWeightGrams: null,
        supplier: null, purchaseDate: '2026-03-15T00:00:00.000Z', notes: null, lowStockThresholdGrams: null,
        createdAt: '2026-01-01T00:00:00.000Z',
      },
    });
    renderAt('/filaments/1');

    await waitFor(() => expect(screen.getByDisplayValue('eSun')).toBeInTheDocument());
    expect((screen.getByLabelText('Purchase date') as HTMLInputElement).value).toBe('2026-03-15');
  });

  it('sends an explicit null (not an omitted key) when the "Clear" button on a previously-set optional numeric field is used', async () => {
    vi.spyOn(client, 'apiGet').mockResolvedValue({
      ok: true,
      filament: {
        id: '1', brand: 'eSun', materialType: 'PLA', diameterMm: 1.75, colour: null,
        costPerSpool: null, costPerKg: 300, spoolWeightGrams: null, remainingWeightGrams: null,
        supplier: null, purchaseDate: null, notes: null, lowStockThresholdGrams: null,
        createdAt: '2026-01-01T00:00:00.000Z',
      },
    });
    const patchSpy = vi.spyOn(client, 'apiPatch').mockResolvedValue({ ok: true });
    renderAt('/filaments/1');

    await waitFor(() => expect(screen.getByLabelText('Cost per kg')).toHaveValue(300));
    fireEvent.click(screen.getByRole('button', { name: 'Clear Cost per kg' }));
    expect(screen.getByLabelText('Cost per kg')).toHaveValue(null);

    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() =>
      expect(patchSpy).toHaveBeenCalledWith('/api/filaments/1', expect.objectContaining({ costPerKg: null })),
    );
    // A bare backspace-to-empty (never touching Clear) must still omit the key, not send
    // null -- that's the pre-existing, intentional "leave it untouched" behaviour for an
    // in-progress edit. Only the explicit Clear affordance sends null.
    const [, body] = patchSpy.mock.calls[0];
    expect(Object.keys(body as Record<string, unknown>)).toContain('costPerKg');
  });

  it('does not render a "Clear" button for an optional numeric field that has no value set', async () => {
    vi.spyOn(client, 'apiGet').mockResolvedValue({
      ok: true,
      filament: {
        id: '1', brand: 'eSun', materialType: 'PLA', diameterMm: 1.75, colour: null,
        costPerSpool: null, costPerKg: null, spoolWeightGrams: null, remainingWeightGrams: null,
        supplier: null, purchaseDate: null, notes: null, lowStockThresholdGrams: null,
        createdAt: '2026-01-01T00:00:00.000Z',
      },
    });
    renderAt('/filaments/1');

    await waitFor(() => expect(screen.getByDisplayValue('eSun')).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: 'Clear Cost per kg' })).not.toBeInTheDocument();
  });
});

describe('FilamentFormPage — create mode clear affordance', () => {
  it('never renders a "Clear" button on the create form (nothing saved yet to clear)', async () => {
    renderAt('/filaments/new');
    fireEvent.change(screen.getByLabelText('Cost per kg'), { target: { value: '300' } });
    expect(screen.queryByRole('button', { name: 'Clear Cost per kg' })).not.toBeInTheDocument();
  });
});
