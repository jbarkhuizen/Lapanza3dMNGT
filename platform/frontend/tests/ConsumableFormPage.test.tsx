import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ConsumableFormPage } from '../src/pages/consumables/ConsumableFormPage.js';
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

  it('does not coerce a cleared costPerUnit to 0 — clearing it leaves the input blank, not "0"', async () => {
    // Regression test: `Number('') === 0`, so a naive onChange that always ran
    // `Number(e.target.value)` would snap a cleared required field to 0 immediately, making
    // the input non-empty and silently defeating the `required` attribute on submit.
    renderAt('/consumables/new');

    const costPerUnitInput = screen.getByLabelText('Cost per unit');
    fireEvent.change(costPerUnitInput, { target: { value: '0.5' } });
    expect(costPerUnitInput).toHaveValue(0.5);

    fireEvent.change(costPerUnitInput, { target: { value: '' } });
    expect(costPerUnitInput).toHaveValue(null);
  });

  it('blocks submitting the create form when costPerUnit is left blank', async () => {
    const postSpy = vi.spyOn(client, 'apiPost').mockResolvedValue({ ok: true, consumable: { id: '1' } });
    renderAt('/consumables/new');

    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Standard Resin' } });
    fireEvent.change(screen.getByLabelText('Unit of measure'), { target: { value: 'ml' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(postSpy).not.toHaveBeenCalled();
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

  it('only populates the form once from the fetched consumable, even if the query result reference changes', async () => {
    // Regression test for the ref-guard mechanism: without it, an effect keyed on
    // `existingConsumable` re-running whenever a referentially-new (but same-data) object
    // arrives (e.g. a background refetch) would clobber whatever the user has since typed
    // into the form.
    const consumable = {
      id: '1', name: 'Standard Resin', category: 'resin', unitOfMeasure: 'ml', costPerUnit: 0.5,
      currentStock: 1000, reorderThreshold: null, supplier: null,
      createdAt: '2026-01-01T00:00:00.000Z',
    };
    vi.spyOn(client, 'apiGet').mockResolvedValue({ ok: true, consumable });
    const queryClient = createTestQueryClient();
    renderAt('/consumables/1', queryClient);

    await waitFor(() => expect(screen.getByDisplayValue('Standard Resin')).toBeInTheDocument());

    // Simulate the user typing after the initial populate.
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Standard Resin XL' } });
    expect(screen.getByDisplayValue('Standard Resin XL')).toBeInTheDocument();

    // Push a referentially-distinct object with the same data directly into the query
    // cache — the same effect a background refetch would have — and confirm it does not
    // overwrite the user's edit.
    queryClient.setQueryData(['consumables', '1'], { ...consumable });
    await waitFor(() => expect(screen.getByDisplayValue('Standard Resin XL')).toBeInTheDocument());
  });

  it('can load different consumables and populate correctly for each', async () => {
    // Regression test verifying the populate guard is keyed to consumable id.
    // Without the id in the dependency array, the second consumable would show stale data.
    const consumable1 = {
      id: '1', name: 'Standard Resin', category: 'resin', unitOfMeasure: 'ml', costPerUnit: 0.5,
      currentStock: 1000, reorderThreshold: null, supplier: null,
      createdAt: '2026-01-01T00:00:00.000Z',
    };
    const consumable2 = {
      id: '2', name: 'PEI Sheet', category: 'build-plate-adhesive', unitOfMeasure: 'unit', costPerUnit: 15,
      currentStock: 5, reorderThreshold: 2, supplier: 'ACME',
      createdAt: '2026-01-02T00:00:00.000Z',
    };

    vi.spyOn(client, 'apiGet').mockImplementation((path) => {
      if (path === '/api/consumables/1') {
        return Promise.resolve({ ok: true, consumable: consumable1 });
      } else if (path === '/api/consumables/2') {
        return Promise.resolve({ ok: true, consumable: consumable2 });
      }
      return Promise.reject(new Error(`Unexpected path: ${path}`));
    });

    const { unmount } = renderAt('/consumables/1');
    await waitFor(() => expect(screen.getByDisplayValue('Standard Resin')).toBeInTheDocument());
    unmount();

    renderAt('/consumables/2');
    await waitFor(() => expect(screen.getByDisplayValue('PEI Sheet')).toBeInTheDocument());
  });
});
