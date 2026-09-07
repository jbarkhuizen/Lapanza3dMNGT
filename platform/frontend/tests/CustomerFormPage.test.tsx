import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { CustomerFormPage } from '../src/pages/customers/CustomerFormPage.js';
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

  it('omits the email field instead of sending it as an empty string when left blank', async () => {
    const postSpy = vi.spyOn(client, 'apiPost').mockResolvedValue({ ok: true, customer: { id: '1' } });
    renderAt('/customers/new');

    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Bob Client' } });
    fireEvent.change(screen.getByLabelText('Billing address'), { target: { value: '1 Oak St' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(postSpy).toHaveBeenCalled());
    const [, payload] = postSpy.mock.calls[0] as [string, Record<string, unknown>];
    expect(payload.email).not.toBe('');
    expect(payload.email).toBeUndefined();
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

  it('sends a cleared, non-omit-listed field (notes) as an empty string, so it can actually be cleared', async () => {
    vi.spyOn(client, 'apiGet').mockResolvedValue({
      ok: true,
      customer: { id: '1', name: 'Bob Client', company: null, email: null, phone: null, billingAddress: '1 Oak St', deliveryAddress: null, vatNumber: null, notes: 'Call before delivery', createdAt: '2026-01-01T00:00:00.000Z' },
    });
    const patchSpy = vi.spyOn(client, 'apiPatch').mockResolvedValue({ ok: true });
    renderAt('/customers/1');

    await waitFor(() => expect(screen.getByDisplayValue('Call before delivery')).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText('Notes'), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(patchSpy).toHaveBeenCalled());
    const [, payload] = patchSpy.mock.calls[0] as [string, Record<string, unknown>];
    // notes isn't in the omit list — the server accepts '' for it fine — so clearing it
    // sends '' rather than silently discarding the edit, unlike email above.
    expect(payload.notes).toBe('');
  });

  it('shows a loading state while the existing customer is being fetched', async () => {
    let resolveGet!: (value: unknown) => void;
    vi.spyOn(client, 'apiGet').mockReturnValue(new Promise((resolve) => (resolveGet = resolve)));
    renderAt('/customers/1');

    expect(screen.getByText('Loading…')).toBeInTheDocument();
    expect(screen.queryByLabelText('Name')).not.toBeInTheDocument();

    resolveGet({
      ok: true,
      customer: { id: '1', name: 'Bob Client', company: null, email: null, phone: null, billingAddress: '1 Oak St', deliveryAddress: null, vatNumber: null, notes: null, createdAt: '2026-01-01T00:00:00.000Z' },
    });
    await waitFor(() => expect(screen.getByDisplayValue('Bob Client')).toBeInTheDocument());
  });

  it('shows an error instead of a blank form when the customer fails to load (e.g. 404)', async () => {
    vi.spyOn(client, 'apiGet').mockRejectedValue(new client.ApiError('Customer not found.', 404));
    renderAt('/customers/1');

    await waitFor(() => expect(screen.getByText(/couldn't load this customer/i)).toBeInTheDocument());
    expect(screen.queryByLabelText('Name')).not.toBeInTheDocument();
  });

  it('only populates the form once from the fetched customer, even if the query result reference changes', async () => {
    // Regression test for the ref-guard mechanism: without it, an effect keyed on
    // `existingCustomer` re-running whenever a referentially-new (but same-data) object
    // arrives (e.g. a background refetch) would clobber whatever the user has since typed
    // into the form.
    const customer = {
      id: '1',
      name: 'Bob Client',
      company: null,
      email: null,
      phone: null,
      billingAddress: '1 Oak St',
      deliveryAddress: null,
      vatNumber: null,
      notes: null,
      createdAt: '2026-01-01T00:00:00.000Z',
    };
    vi.spyOn(client, 'apiGet').mockResolvedValue({ ok: true, customer });
    const queryClient = createTestQueryClient();
    renderAt('/customers/1', queryClient);

    await waitFor(() => expect(screen.getByDisplayValue('Bob Client')).toBeInTheDocument());

    // Simulate the user typing after the initial populate.
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Bob Client Jr' } });
    expect(screen.getByDisplayValue('Bob Client Jr')).toBeInTheDocument();

    // Push a referentially-distinct object with the same data directly into the query
    // cache — the same effect a background refetch would have — and confirm it does not
    // overwrite the user's edit.
    queryClient.setQueryData(['customers', '1'], { ...customer });
    await waitFor(() => expect(screen.getByDisplayValue('Bob Client Jr')).toBeInTheDocument());
  });

  it('can load different customers and populate correctly for each', async () => {
    // Regression test verifying the populate guard is keyed to customer id.
    // Without the id in the dependency array, the second customer would show stale data.
    const customer1 = {
      id: '1',
      name: 'Bob Client',
      company: null,
      email: null,
      phone: null,
      billingAddress: '1 Oak St',
      deliveryAddress: null,
      vatNumber: null,
      notes: null,
      createdAt: '2026-01-01T00:00:00.000Z',
    };
    const customer2 = {
      id: '2',
      name: 'Alice Supplier',
      company: null,
      email: null,
      phone: null,
      billingAddress: '2 Elm Ave',
      deliveryAddress: null,
      vatNumber: null,
      notes: null,
      createdAt: '2026-01-02T00:00:00.000Z',
    };

    vi.spyOn(client, 'apiGet').mockImplementation((path) => {
      if (path === '/api/customers/1') {
        return Promise.resolve({ ok: true, customer: customer1 });
      } else if (path === '/api/customers/2') {
        return Promise.resolve({ ok: true, customer: customer2 });
      }
      return Promise.reject(new Error(`Unexpected path: ${path}`));
    });

    // Load customer 1
    const { unmount } = renderAt('/customers/1');
    await waitFor(() => expect(screen.getByDisplayValue('Bob Client')).toBeInTheDocument());
    expect(screen.getByDisplayValue('1 Oak St')).toBeInTheDocument();
    unmount();

    // Load customer 2 and verify it shows customer 2's data, not customer 1's stale data
    renderAt('/customers/2');
    await waitFor(() => expect(screen.getByDisplayValue('Alice Supplier')).toBeInTheDocument());
    expect(screen.getByDisplayValue('2 Elm Ave')).toBeInTheDocument();
  });
});
