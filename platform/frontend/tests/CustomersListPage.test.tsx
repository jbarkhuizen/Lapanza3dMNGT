import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { CustomersListPage } from '../src/pages/customers/CustomersListPage.js';
import * as client from '../src/api/client.js';
import { createTestQueryClient } from './helpers/queryClient.js';

beforeEach(() => {
  vi.restoreAllMocks();
});

function renderPage() {
  const queryClient = createTestQueryClient();
  return render(
    <MemoryRouter>
      <QueryClientProvider client={queryClient}>
        <CustomersListPage />
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

describe('CustomersListPage', () => {
  it('lists customers returned by the API', async () => {
    vi.spyOn(client, 'apiGet').mockResolvedValue({
      ok: true,
      customers: [
        { id: '1', name: 'Bob Client', company: null, email: null, phone: null, billingAddress: '1 Oak St', deliveryAddress: null, vatNumber: null, notes: null, createdAt: '2026-01-01T00:00:00.000Z' },
      ],
    });
    renderPage();
    await waitFor(() => expect(screen.getByText('Bob Client')).toBeInTheDocument());
  });

  it('shows an empty state when there are no customers', async () => {
    vi.spyOn(client, 'apiGet').mockResolvedValue({ ok: true, customers: [] });
    renderPage();
    await waitFor(() => expect(screen.getByText(/no customers yet/i)).toBeInTheDocument());
  });

  it('has a link to create a new customer', async () => {
    vi.spyOn(client, 'apiGet').mockResolvedValue({ ok: true, customers: [] });
    renderPage();
    await waitFor(() => expect(screen.getByRole('link', { name: 'New Customer' })).toHaveAttribute('href', '/customers/new'));
  });

  it('shows an error message when the customers query fails', async () => {
    vi.spyOn(client, 'apiGet').mockRejectedValue(new client.ApiError('Something went wrong.', 500));
    renderPage();
    await waitFor(() => expect(screen.getByText(/couldn't load customers/i)).toBeInTheDocument());
  });
});
