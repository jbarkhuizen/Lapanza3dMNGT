import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ConsumablesListPage } from '../src/pages/consumables/ConsumablesListPage.js';
import * as client from '../src/api/client.js';
import { createTestQueryClient } from './helpers/queryClient.js';

beforeEach(() => {
  vi.restoreAllMocks();
});

function renderPage(queryClient: QueryClient = createTestQueryClient()) {
  return render(
    <MemoryRouter>
      <QueryClientProvider client={queryClient}>
        <ConsumablesListPage />
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

function renderAt(path: string, queryClient: QueryClient = createTestQueryClient()) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <QueryClientProvider client={queryClient}>
        <Routes>
          <Route path="/consumables" element={<ConsumablesListPage />} />
          <Route path="/consumables/:id" element={<ConsumablesListPage />} />
        </Routes>
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

const baseConsumable = {
  id: '1',
  name: 'Standard Resin',
  category: 'resin',
  unitOfMeasure: 'ml',
  costPerUnit: 0.5,
  currentStock: 1000,
  reorderThreshold: null,
  supplier: null,
  createdAt: '2026-01-01T00:00:00.000Z',
};

function mockGet(consumables: unknown[]) {
  vi.spyOn(client, 'apiGet').mockImplementation((path: string) => {
    if (path === '/api/consumables') {
      return Promise.resolve({ ok: true, consumables });
    }
    if (path === '/api/consumables/1') {
      return Promise.resolve({ ok: true, consumable: consumables.find((c) => (c as { id: string }).id === '1') });
    }
    return Promise.reject(new Error(`Unexpected path: ${path}`));
  });
}

describe('ConsumablesListPage — list rendering', () => {
  it('lists consumables returned by the API', async () => {
    mockGet([baseConsumable]);
    renderPage();
    await waitFor(() => expect(screen.getByText('Standard Resin')).toBeInTheDocument());
  });

  it('shows an empty state when there are no consumables', async () => {
    mockGet([]);
    renderPage();
    await waitFor(() => expect(screen.getByText(/no consumables yet/i)).toBeInTheDocument());
  });

  it('shows an error message when the list fails to load', async () => {
    vi.spyOn(client, 'apiGet').mockRejectedValue(new client.ApiError('Something went wrong.', 500));
    renderPage();
    await waitFor(() => expect(screen.getByText(/couldn't load consumables/i)).toBeInTheDocument());
  });
});

describe('ConsumablesListPage — inline add form', () => {
  it('shows an always-visible essentials-only add form with "More details" collapsed', async () => {
    mockGet([]);
    renderPage();
    await waitFor(() => expect(screen.getByLabelText('Name')).toBeInTheDocument());
    expect(screen.getByLabelText('Category')).toBeInTheDocument();
    expect(screen.getByLabelText('Unit of measure')).toBeInTheDocument();
    expect(screen.getByLabelText('Cost per unit')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '+ More details' })).toBeInTheDocument();
    expect(screen.queryByLabelText('Supplier')).not.toBeInTheDocument();
  });

  it('creates a consumable via the essentials-only form and shows the new row without a manual refetch', async () => {
    mockGet([]);
    const postSpy = vi.spyOn(client, 'apiPost').mockResolvedValue({ ok: true, consumable: { id: '1' } });
    renderPage();

    await waitFor(() => expect(screen.getByText(/no consumables yet/i)).toBeInTheDocument());

    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Standard Resin' } });
    fireEvent.change(screen.getByLabelText('Unit of measure'), { target: { value: 'ml' } });
    fireEvent.change(screen.getByLabelText('Cost per unit'), { target: { value: '0.5' } });

    mockGet([baseConsumable]);
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));

    await waitFor(() => expect(postSpy).toHaveBeenCalled());
    const [, body] = postSpy.mock.calls[0];
    expect(body).toMatchObject({ name: 'Standard Resin', unitOfMeasure: 'ml', costPerUnit: 0.5, category: 'resin' });
    expect((body as Record<string, unknown>).reorderThreshold).toBeUndefined();

    await waitFor(() => expect(screen.getByText('Standard Resin')).toBeInTheDocument());
  });

  it('includes an optional field from the expanded "More details" section in the create payload', async () => {
    mockGet([]);
    const postSpy = vi.spyOn(client, 'apiPost').mockResolvedValue({ ok: true, consumable: { id: '1' } });
    renderPage();

    await waitFor(() => expect(screen.getByLabelText('Name')).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Standard Resin' } });
    fireEvent.change(screen.getByLabelText('Unit of measure'), { target: { value: 'ml' } });
    fireEvent.change(screen.getByLabelText('Cost per unit'), { target: { value: '0.5' } });
    fireEvent.click(screen.getByRole('button', { name: '+ More details' }));
    fireEvent.change(screen.getByLabelText('Reorder threshold'), { target: { value: '200' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));

    await waitFor(() => expect(postSpy).toHaveBeenCalled());
    const [, body] = postSpy.mock.calls[0];
    expect((body as Record<string, unknown>).reorderThreshold).toBe(200);
  });

  it('does not coerce a cleared costPerUnit to 0 — clearing it leaves the input blank, not "0"', async () => {
    mockGet([]);
    renderPage();
    await waitFor(() => expect(screen.getByLabelText('Name')).toBeInTheDocument());

    const costPerUnitInput = screen.getByLabelText('Cost per unit');
    fireEvent.change(costPerUnitInput, { target: { value: '0.5' } });
    expect(costPerUnitInput).toHaveValue(0.5);

    fireEvent.change(costPerUnitInput, { target: { value: '' } });
    expect(costPerUnitInput).toHaveValue(null);
  });

  it('blocks submitting the add form when costPerUnit is left blank', async () => {
    mockGet([]);
    const postSpy = vi.spyOn(client, 'apiPost').mockResolvedValue({ ok: true, consumable: { id: '1' } });
    renderPage();

    await waitFor(() => expect(screen.getByLabelText('Name')).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Standard Resin' } });
    fireEvent.change(screen.getByLabelText('Unit of measure'), { target: { value: 'ml' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));

    expect(postSpy).not.toHaveBeenCalled();
  });

  it('sends one of the valid CONSUMABLE_CATEGORIES values from the category select, not an arbitrary string', async () => {
    mockGet([]);
    const postSpy = vi.spyOn(client, 'apiPost').mockResolvedValue({ ok: true, consumable: { id: '1' } });
    renderPage();

    await waitFor(() => expect(screen.getByLabelText('Name')).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'PEI sheet' } });
    fireEvent.change(screen.getByLabelText('Unit of measure'), { target: { value: 'unit' } });
    fireEvent.change(screen.getByLabelText('Cost per unit'), { target: { value: '15' } });
    fireEvent.change(screen.getByLabelText('Category'), { target: { value: 'build-plate-adhesive' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));

    await waitFor(() => expect(postSpy).toHaveBeenCalled());
    const [, body] = postSpy.mock.calls[0];
    expect((body as Record<string, unknown>).category).toBe('build-plate-adhesive');
  });
});

describe('ConsumablesListPage — edit in place', () => {
  it('clicking Edit shows that row pre-filled with its current values (null optional fields become blank inputs)', async () => {
    mockGet([baseConsumable]);
    renderPage();

    await waitFor(() => expect(screen.getByText('Standard Resin')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));

    expect(screen.getByLabelText('Name', { selector: '#edit-name' })).toHaveValue('Standard Resin');
    expect(screen.getByLabelText('Cost per unit', { selector: '#edit-costPerUnit' })).toHaveValue(0.5);

    const editForm = screen.getByLabelText('Name', { selector: '#edit-name' }).closest('form')!;
    fireEvent.click(within(editForm).getByRole('button', { name: '+ More details' }));
    expect(within(editForm).getByLabelText('Supplier')).toHaveValue('');
  });

  it('Cancel reverts to read-only without calling update', async () => {
    mockGet([baseConsumable]);
    const patchSpy = vi.spyOn(client, 'apiPatch').mockResolvedValue({ ok: true });
    renderPage();

    await waitFor(() => expect(screen.getByText('Standard Resin')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));

    const nameInput = screen.getByLabelText('Name', { selector: '#edit-name' });
    fireEvent.change(nameInput, { target: { value: 'Changed Name' } });
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(screen.getByText('Standard Resin')).toBeInTheDocument();
    expect(screen.queryByText('Changed Name')).not.toBeInTheDocument();
    expect(patchSpy).not.toHaveBeenCalled();
  });

  it('Save calls update and returns to read-only reflecting new values', async () => {
    mockGet([baseConsumable]);
    const patchSpy = vi.spyOn(client, 'apiPatch').mockResolvedValue({ ok: true });
    renderPage();

    await waitFor(() => expect(screen.getByText('Standard Resin')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));

    const editForm = screen.getByLabelText('Name', { selector: '#edit-name' }).closest('form')!;
    fireEvent.click(within(editForm).getByRole('button', { name: '+ More details' }));
    const supplierInput = within(editForm).getByLabelText('Supplier');
    fireEvent.change(supplierInput, { target: { value: 'ACME Supplies' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() =>
      expect(patchSpy).toHaveBeenCalledWith('/api/consumables/1', expect.objectContaining({ supplier: 'ACME Supplies' })),
    );
    await waitFor(() => expect(screen.queryByLabelText('Name', { selector: '#edit-name' })).not.toBeInTheDocument());
  });

  it('clearing reorderThreshold via the × button sends an explicit null', async () => {
    mockGet([{ ...baseConsumable, reorderThreshold: 200 }]);
    const patchSpy = vi.spyOn(client, 'apiPatch').mockResolvedValue({ ok: true });
    renderPage();

    await waitFor(() => expect(screen.getByText('Standard Resin')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));

    const editForm = screen.getByLabelText('Name', { selector: '#edit-name' }).closest('form')!;
    fireEvent.click(within(editForm).getByRole('button', { name: '+ More details' }));

    fireEvent.click(within(editForm).getByRole('button', { name: 'Clear Reorder threshold' }));
    fireEvent.click(within(editForm).getByRole('button', { name: 'Save' }));

    await waitFor(() =>
      expect(patchSpy).toHaveBeenCalledWith('/api/consumables/1', expect.objectContaining({ reorderThreshold: null })),
    );
  });
});

describe('ConsumablesListPage — deep link', () => {
  it('navigating to /consumables/:id auto-expands the matching row', async () => {
    mockGet([baseConsumable]);
    renderAt('/consumables/1');

    await waitFor(() =>
      expect(screen.getByLabelText('Name', { selector: '#edit-name' })).toHaveValue('Standard Resin'),
    );
  });
});
