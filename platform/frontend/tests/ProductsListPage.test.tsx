import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ProductsListPage } from '../src/pages/products/ProductsListPage.js';
import * as client from '../src/api/client.js';
import { createTestQueryClient } from './helpers/queryClient.js';

beforeEach(() => {
  vi.restoreAllMocks();
});

function renderPage(queryClient: QueryClient = createTestQueryClient()) {
  return render(
    <MemoryRouter>
      <QueryClientProvider client={queryClient}>
        <ProductsListPage />
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

function renderAt(path: string, queryClient: QueryClient = createTestQueryClient()) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <QueryClientProvider client={queryClient}>
        <Routes>
          <Route path="/products" element={<ProductsListPage />} />
          <Route path="/products/:id" element={<ProductsListPage />} />
        </Routes>
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

const baseProduct = {
  id: '1',
  name: 'Engraved keychain',
  category: 'Laser',
  cost: '30.00',
  sellingPrice: '75.00',
  createdAt: '2026-01-01T00:00:00.000Z',
};

describe('ProductsListPage — list rendering', () => {
  it('lists products returned by the API', async () => {
    vi.spyOn(client, 'apiGet').mockResolvedValue({ ok: true, products: [baseProduct] });
    renderPage();
    await waitFor(() => expect(screen.getByText('Engraved keychain')).toBeInTheDocument());
  });

  it('shows an empty state when there are no products', async () => {
    vi.spyOn(client, 'apiGet').mockResolvedValue({ ok: true, products: [] });
    renderPage();
    await waitFor(() => expect(screen.getByText(/no products yet/i)).toBeInTheDocument());
  });

  it('shows an error message when the list fails to load', async () => {
    vi.spyOn(client, 'apiGet').mockRejectedValue(new client.ApiError('Something went wrong.', 500));
    renderPage();
    await waitFor(() => expect(screen.getByText(/couldn't load products/i)).toBeInTheDocument());
  });

  it('deletes a product when confirmed', async () => {
    vi.spyOn(client, 'apiGet').mockResolvedValue({ ok: true, products: [baseProduct] });
    const deleteSpy = vi.spyOn(client, 'apiDelete').mockResolvedValue({ ok: true });
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    renderPage();
    await waitFor(() => expect(screen.getByText('Engraved keychain')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(deleteSpy).toHaveBeenCalledWith('/api/products/1'));
  });
});

describe('ProductsListPage — inline add form', () => {
  it('shows an always-visible essentials-only add form with "More details" collapsed', async () => {
    vi.spyOn(client, 'apiGet').mockResolvedValue({ ok: true, products: [] });
    renderPage();
    await waitFor(() => expect(screen.getByLabelText('Name', { selector: '#add-name' })).toBeInTheDocument());
    expect(screen.getByLabelText('Cost', { selector: '#add-cost' })).toBeInTheDocument();
    expect(screen.getByLabelText('Selling price', { selector: '#add-sellingPrice' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '+ More details' })).toBeInTheDocument();
    expect(screen.queryByLabelText('Category', { selector: '#add-category' })).not.toBeInTheDocument();
  });

  it('creates a product via the essentials-only form and shows the new row without a manual refetch', async () => {
    const getSpy = vi.spyOn(client, 'apiGet').mockResolvedValue({ ok: true, products: [] });
    const postSpy = vi.spyOn(client, 'apiPost').mockResolvedValue({ ok: true, product: { id: '1' } });
    renderPage();

    await waitFor(() => expect(screen.getByText(/no products yet/i)).toBeInTheDocument());

    fireEvent.change(screen.getByLabelText('Name', { selector: '#add-name' }), { target: { value: 'Engraved keychain' } });
    fireEvent.change(screen.getByLabelText('Cost', { selector: '#add-cost' }), { target: { value: '30' } });
    fireEvent.change(screen.getByLabelText('Selling price', { selector: '#add-sellingPrice' }), { target: { value: '75' } });

    getSpy.mockResolvedValue({ ok: true, products: [baseProduct] });
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));

    await waitFor(() => expect(postSpy).toHaveBeenCalled());
    const [, body] = postSpy.mock.calls[0];
    expect(body).toMatchObject({ name: 'Engraved keychain', cost: 30, sellingPrice: 75 });

    await waitFor(() => expect(screen.getByText('Engraved keychain')).toBeInTheDocument());
  });

  it('includes the optional category field from the expanded "More details" section in the create payload', async () => {
    vi.spyOn(client, 'apiGet').mockResolvedValue({ ok: true, products: [] });
    const postSpy = vi.spyOn(client, 'apiPost').mockResolvedValue({ ok: true, product: { id: '1' } });
    renderPage();

    await waitFor(() => expect(screen.getByLabelText('Name', { selector: '#add-name' })).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText('Name', { selector: '#add-name' }), { target: { value: 'Engraved keychain' } });
    fireEvent.change(screen.getByLabelText('Cost', { selector: '#add-cost' }), { target: { value: '30' } });
    fireEvent.change(screen.getByLabelText('Selling price', { selector: '#add-sellingPrice' }), { target: { value: '75' } });
    fireEvent.click(screen.getByRole('button', { name: '+ More details' }));
    fireEvent.change(screen.getByLabelText('Category', { selector: '#add-category' }), { target: { value: 'Laser' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));

    await waitFor(() => expect(postSpy).toHaveBeenCalled());
    const [, body] = postSpy.mock.calls[0];
    expect((body as Record<string, unknown>).category).toBe('Laser');
  });

  it('blocks submitting the add form when cost is left blank', async () => {
    vi.spyOn(client, 'apiGet').mockResolvedValue({ ok: true, products: [] });
    const postSpy = vi.spyOn(client, 'apiPost').mockResolvedValue({ ok: true, product: { id: '1' } });
    renderPage();

    await waitFor(() => expect(screen.getByLabelText('Name', { selector: '#add-name' })).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText('Name', { selector: '#add-name' }), { target: { value: 'Engraved keychain' } });
    fireEvent.change(screen.getByLabelText('Selling price', { selector: '#add-sellingPrice' }), { target: { value: '75' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));

    expect(postSpy).not.toHaveBeenCalled();
  });
});

describe('ProductsListPage — edit in place', () => {
  it('clicking Edit shows that row pre-filled with its current values', async () => {
    vi.spyOn(client, 'apiGet').mockResolvedValue({ ok: true, products: [baseProduct] });
    renderPage();

    await waitFor(() => expect(screen.getByText('Engraved keychain')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));

    expect(screen.getByLabelText('Name', { selector: '#edit-name' })).toHaveValue('Engraved keychain');
    expect(screen.getByLabelText('Cost', { selector: '#edit-cost' })).toHaveValue(30);
  });

  it('Cancel reverts to read-only without calling update', async () => {
    vi.spyOn(client, 'apiGet').mockResolvedValue({ ok: true, products: [baseProduct] });
    const patchSpy = vi.spyOn(client, 'apiPatch').mockResolvedValue({ ok: true });
    renderPage();

    await waitFor(() => expect(screen.getByText('Engraved keychain')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));

    fireEvent.change(screen.getByLabelText('Name', { selector: '#edit-name' }), { target: { value: 'Changed Name' } });
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(screen.getByText('Engraved keychain')).toBeInTheDocument();
    expect(screen.queryByText('Changed Name')).not.toBeInTheDocument();
    expect(patchSpy).not.toHaveBeenCalled();
  });

  it('Save calls update and returns to read-only reflecting new values', async () => {
    vi.spyOn(client, 'apiGet').mockResolvedValue({ ok: true, products: [baseProduct] });
    const patchSpy = vi.spyOn(client, 'apiPatch').mockResolvedValue({ ok: true });
    renderPage();

    await waitFor(() => expect(screen.getByText('Engraved keychain')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));

    fireEvent.change(screen.getByLabelText('Selling price', { selector: '#edit-sellingPrice' }), { target: { value: '80' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() =>
      expect(patchSpy).toHaveBeenCalledWith('/api/products/1', expect.objectContaining({ sellingPrice: 80 })),
    );
    await waitFor(() => expect(screen.queryByLabelText('Name', { selector: '#edit-name' })).not.toBeInTheDocument());
  });

  it('clears the category field back to null', async () => {
    vi.spyOn(client, 'apiGet').mockResolvedValue({ ok: true, products: [baseProduct] });
    const patchSpy = vi.spyOn(client, 'apiPatch').mockResolvedValue({ ok: true });
    renderPage();

    await waitFor(() => expect(screen.getByText('Engraved keychain')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    const editForm = screen.getByLabelText('Name', { selector: '#edit-name' }).closest('form');
    expect(editForm).not.toBeNull();
    const scopedEditForm = within(editForm as HTMLElement);
    fireEvent.click(scopedEditForm.getByRole('button', { name: '+ More details' }));
    fireEvent.click(scopedEditForm.getByRole('button', { name: 'Clear' }));
    fireEvent.click(scopedEditForm.getByRole('button', { name: 'Save' }));

    await waitFor(() =>
      expect(patchSpy).toHaveBeenCalledWith('/api/products/1', expect.objectContaining({ category: null })),
    );
  });
});

describe('ProductsListPage — deep link', () => {
  it('navigating to /products/:id auto-expands the matching row', async () => {
    vi.spyOn(client, 'apiGet').mockImplementation((path) => {
      if (path === '/api/products') {
        return Promise.resolve({ ok: true, products: [baseProduct] });
      }
      if (path === '/api/products/1') {
        return Promise.resolve({ ok: true, product: baseProduct });
      }
      return Promise.reject(new Error(`Unexpected path: ${path}`));
    });
    renderAt('/products/1');

    await waitFor(() => expect(screen.getByLabelText('Name', { selector: '#edit-name' })).toHaveValue('Engraved keychain'));
  });
});
