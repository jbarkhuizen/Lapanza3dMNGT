import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { FilamentFormPage } from '../src/pages/filaments/FilamentFormPage.js';
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

  it('only populates the form once from the fetched filament, even if the query result reference changes', async () => {
    // Regression test for the ref-guard mechanism: without it, an effect keyed on
    // `existingFilament` re-running whenever a referentially-new (but same-data) object
    // arrives (e.g. a background refetch) would clobber whatever the user has since typed
    // into the form.
    const filament = {
      id: '1', brand: 'eSun', materialType: 'PLA', diameterMm: 1.75, colour: null,
      costPerSpool: null, costPerKg: 300, spoolWeightGrams: null, remainingWeightGrams: null,
      supplier: null, purchaseDate: null, notes: null, lowStockThresholdGrams: null,
      createdAt: '2026-01-01T00:00:00.000Z',
    };
    vi.spyOn(client, 'apiGet').mockResolvedValue({ ok: true, filament });
    const queryClient = createTestQueryClient();
    renderAt('/filaments/1', queryClient);

    await waitFor(() => expect(screen.getByDisplayValue('eSun')).toBeInTheDocument());

    // Simulate the user typing after the initial populate.
    fireEvent.change(screen.getByLabelText('Brand'), { target: { value: 'eSun Pro' } });
    expect(screen.getByDisplayValue('eSun Pro')).toBeInTheDocument();

    // Push a referentially-distinct object with the same data directly into the query
    // cache — the same effect a background refetch would have — and confirm it does not
    // overwrite the user's edit.
    queryClient.setQueryData(['filaments', '1'], { ...filament });
    await waitFor(() => expect(screen.getByDisplayValue('eSun Pro')).toBeInTheDocument());
  });

  it('can load different filaments and populate correctly for each', async () => {
    // Regression test verifying the populate guard is keyed to filament id.
    // Without the id in the dependency array, the second filament would show stale data.
    const filament1 = {
      id: '1', brand: 'eSun', materialType: 'PLA', diameterMm: 1.75, colour: null,
      costPerSpool: null, costPerKg: null, spoolWeightGrams: null, remainingWeightGrams: null,
      supplier: null, purchaseDate: null, notes: null, lowStockThresholdGrams: null,
      createdAt: '2026-01-01T00:00:00.000Z',
    };
    const filament2 = {
      id: '2', brand: 'Prusament', materialType: 'PETG', diameterMm: 2.85, colour: null,
      costPerSpool: null, costPerKg: null, spoolWeightGrams: null, remainingWeightGrams: null,
      supplier: null, purchaseDate: null, notes: null, lowStockThresholdGrams: null,
      createdAt: '2026-01-02T00:00:00.000Z',
    };

    vi.spyOn(client, 'apiGet').mockImplementation((path) => {
      if (path === '/api/filaments/1') {
        return Promise.resolve({ ok: true, filament: filament1 });
      } else if (path === '/api/filaments/2') {
        return Promise.resolve({ ok: true, filament: filament2 });
      }
      return Promise.reject(new Error(`Unexpected path: ${path}`));
    });

    // Load filament 1
    const { unmount } = renderAt('/filaments/1');
    await waitFor(() => expect(screen.getByDisplayValue('eSun')).toBeInTheDocument());
    expect(screen.getByDisplayValue('PLA')).toBeInTheDocument();
    unmount();

    // Load filament 2 and verify it shows filament 2's data, not filament 1's stale data
    renderAt('/filaments/2');
    await waitFor(() => expect(screen.getByDisplayValue('Prusament')).toBeInTheDocument());
    expect(screen.getByDisplayValue('PETG')).toBeInTheDocument();
  });
});
