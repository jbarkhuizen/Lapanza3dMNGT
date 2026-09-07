import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { ConsumableFormPage } from '../src/pages/consumables/ConsumableFormPage.js';
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
          <Route path="/consumables/new" element={<ConsumableFormPage />} />
          <Route path="/consumables/:id" element={<ConsumableFormPage />} />
          <Route path="/consumables" element={<div>consumables list</div>} />
        </Routes>
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

describe('ConsumableFormPage — create mode', () => {
  it('creates a consumable with an optional numeric field left blank (omitted, not NaN or empty string)', async () => {
    const postSpy = vi.spyOn(client, 'apiPost').mockResolvedValue({ ok: true, consumable: { id: '1' } });
    renderAt('/consumables/new');

    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Standard Resin' } });
    fireEvent.change(screen.getByLabelText('Unit of measure'), { target: { value: 'ml' } });
    fireEvent.change(screen.getByLabelText('Cost per unit'), { target: { value: '0.5' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(postSpy).toHaveBeenCalled());
    const [, body] = postSpy.mock.calls[0];
    expect(body).toMatchObject({ name: 'Standard Resin', unitOfMeasure: 'ml', costPerUnit: 0.5, category: 'resin' });
    expect((body as Record<string, unknown>).reorderThreshold).toBeUndefined();
  });

  it('sends a filled-in optional numeric field as a real number, not a string', async () => {
    const postSpy = vi.spyOn(client, 'apiPost').mockResolvedValue({ ok: true, consumable: { id: '1' } });
    renderAt('/consumables/new');

    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Standard Resin' } });
    fireEvent.change(screen.getByLabelText('Unit of measure'), { target: { value: 'ml' } });
    fireEvent.change(screen.getByLabelText('Cost per unit'), { target: { value: '0.5' } });
    fireEvent.change(screen.getByLabelText('Reorder threshold'), { target: { value: '200' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(postSpy).toHaveBeenCalled());
    const [, body] = postSpy.mock.calls[0];
    expect((body as Record<string, unknown>).reorderThreshold).toBe(200);
  });

  it('sends one of the valid CONSUMABLE_CATEGORIES values from the category select, not an arbitrary string', async () => {
    const postSpy = vi.spyOn(client, 'apiPost').mockResolvedValue({ ok: true, consumable: { id: '1' } });
    renderAt('/consumables/new');

    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'PEI sheet' } });
    fireEvent.change(screen.getByLabelText('Unit of measure'), { target: { value: 'unit' } });
    fireEvent.change(screen.getByLabelText('Cost per unit'), { target: { value: '15' } });
    fireEvent.change(screen.getByLabelText('Category'), { target: { value: 'build-plate-adhesive' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(postSpy).toHaveBeenCalled());
    const [, body] = postSpy.mock.calls[0];
    expect((body as Record<string, unknown>).category).toBe('build-plate-adhesive');
  });
});

describe('ConsumableFormPage — edit mode', () => {
  it('loads an existing consumable (null optional fields become blank inputs, not "null" text) and saves changes', async () => {
    vi.spyOn(client, 'apiGet').mockResolvedValue({
      ok: true,
      consumable: {
        id: '1', name: 'Standard Resin', category: 'resin', unitOfMeasure: 'ml', costPerUnit: 0.5,
        currentStock: 1000, reorderThreshold: null, supplier: null,
        createdAt: '2026-01-01T00:00:00.000Z',
      },
    });
    const patchSpy = vi.spyOn(client, 'apiPatch').mockResolvedValue({ ok: true });
    renderAt('/consumables/1');

    await waitFor(() => expect(screen.getByDisplayValue('Standard Resin')).toBeInTheDocument());
    expect(screen.getByLabelText('Supplier')).toHaveValue('');
    fireEvent.change(screen.getByLabelText('Supplier'), { target: { value: 'ACME Supplies' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() =>
      expect(patchSpy).toHaveBeenCalledWith('/api/consumables/1', expect.objectContaining({ supplier: 'ACME Supplies' })),
    );
  });
});
