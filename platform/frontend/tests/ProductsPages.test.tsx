import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { ProductsListPage } from '../src/pages/products/ProductsListPage.js';
import { ProductFormPage } from '../src/pages/products/ProductFormPage.js';
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
        <ProductsListPage />
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
          <Route path="/products/new" element={<ProductFormPage />} />
          <Route path="/products/:id" element={<ProductFormPage />} />
          <Route path="/products" element={<div>products list</div>} />
        </Routes>
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

describe('ProductsListPage', () => {
  it('lists products returned by the API', async () => {
    vi.spyOn(client, 'apiGet').mockResolvedValue({
      ok: true,
      products: [{ id: '1', name: 'Engraved keychain', category: 'Laser', cost: '30.00', sellingPrice: '75.00', createdAt: '2026-01-01T00:00:00.000Z' }],
    });
    renderList();
    await waitFor(() => expect(screen.getByText('Engraved keychain')).toBeInTheDocument());
  });

  it('shows an empty state when there are no products', async () => {
    vi.spyOn(client, 'apiGet').mockResolvedValue({ ok: true, products: [] });
    renderList();
    await waitFor(() => expect(screen.getByText(/no products yet/i)).toBeInTheDocument());
  });

  it('shows an error message when the list fails to load', async () => {
    vi.spyOn(client, 'apiGet').mockRejectedValue(new client.ApiError('Something went wrong.', 500));
    renderList();
    await waitFor(() => expect(screen.getByText(/couldn't load products/i)).toBeInTheDocument());
  });
});

describe('ProductFormPage', () => {
  it('creates a product with the expected payload', async () => {
    const postSpy = vi.spyOn(client, 'apiPost').mockResolvedValue({ ok: true, product: { id: '1' } });
    renderFormAt('/products/new');

    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Engraved keychain' } });
    fireEvent.change(screen.getByLabelText('Category'), { target: { value: 'Laser' } });
    fireEvent.change(screen.getByLabelText('Cost'), { target: { value: '30' } });
    fireEvent.change(screen.getByLabelText('Selling price'), { target: { value: '75' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() =>
      expect(postSpy).toHaveBeenCalledWith('/api/products', {
        name: 'Engraved keychain',
        category: 'Laser',
        cost: 30,
        sellingPrice: 75,
      }),
    );
  });

  it('blocks submitting when cost is left blank', async () => {
    const postSpy = vi.spyOn(client, 'apiPost').mockResolvedValue({ ok: true, product: { id: '1' } });
    renderFormAt('/products/new');

    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Engraved keychain' } });
    fireEvent.change(screen.getByLabelText('Selling price'), { target: { value: '75' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(postSpy).not.toHaveBeenCalled();
  });

  it('loads an existing product and saves changes', async () => {
    vi.spyOn(client, 'apiGet').mockResolvedValue({
      ok: true,
      product: { id: '1', name: 'Engraved keychain', category: 'Laser', cost: '30.00', sellingPrice: '75.00', createdAt: '2026-01-01T00:00:00.000Z' },
    });
    const patchSpy = vi.spyOn(client, 'apiPatch').mockResolvedValue({ ok: true });
    renderFormAt('/products/1');

    await waitFor(() => expect(screen.getByDisplayValue('Engraved keychain')).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText('Selling price'), { target: { value: '80' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() =>
      expect(patchSpy).toHaveBeenCalledWith('/api/products/1', expect.objectContaining({ sellingPrice: 80 })),
    );
  });

  it('clears the category field back to null', async () => {
    vi.spyOn(client, 'apiGet').mockResolvedValue({
      ok: true,
      product: { id: '1', name: 'Engraved keychain', category: 'Laser', cost: '30.00', sellingPrice: '75.00', createdAt: '2026-01-01T00:00:00.000Z' },
    });
    const patchSpy = vi.spyOn(client, 'apiPatch').mockResolvedValue({ ok: true });
    renderFormAt('/products/1');

    await waitFor(() => expect(screen.getByDisplayValue('Engraved keychain')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'Clear' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() =>
      expect(patchSpy).toHaveBeenCalledWith('/api/products/1', expect.objectContaining({ category: null })),
    );
  });
});
