import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { CustomerFormPage } from '../src/pages/customers/CustomerFormPage.js';
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
          <Route path="/customers/new" element={<CustomerFormPage />} />
          <Route path="/customers/:id" element={<CustomerFormPage />} />
          <Route path="/customers" element={<div>customers list</div>} />
        </Routes>
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

describe('CustomerFormPage — create mode', () => {
  it('creates a customer and navigates back to the list', async () => {
    const postSpy = vi.spyOn(client, 'apiPost').mockResolvedValue({ ok: true, customer: { id: '1' } });
    renderAt('/customers/new');

    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Bob Client' } });
    fireEvent.change(screen.getByLabelText('Billing address'), { target: { value: '1 Oak St' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() =>
      expect(postSpy).toHaveBeenCalledWith('/api/customers', expect.objectContaining({ name: 'Bob Client', billingAddress: '1 Oak St' })),
    );
    await waitFor(() => expect(screen.getByText('customers list')).toBeInTheDocument());
  });
});

describe('CustomerFormPage — edit mode', () => {
  it('loads the existing customer and saves changes via PATCH', async () => {
    vi.spyOn(client, 'apiGet').mockResolvedValue({
      ok: true,
      customer: { id: '1', name: 'Bob Client', company: null, email: null, phone: null, billingAddress: '1 Oak St', deliveryAddress: null, vatNumber: null, notes: null, createdAt: '2026-01-01T00:00:00.000Z' },
    });
    const patchSpy = vi.spyOn(client, 'apiPatch').mockResolvedValue({ ok: true });
    renderAt('/customers/1');

    await waitFor(() => expect(screen.getByDisplayValue('Bob Client')).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText('Company'), { target: { value: 'Acme Co' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() =>
      expect(patchSpy).toHaveBeenCalledWith('/api/customers/1', expect.objectContaining({ company: 'Acme Co' })),
    );
  });
});
