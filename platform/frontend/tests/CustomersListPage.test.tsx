import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { CustomersListPage } from '../src/pages/customers/CustomersListPage.js';
import * as client from '../src/api/client.js';
import { createTestQueryClient } from './helpers/queryClient.js';

beforeEach(() => {
  vi.restoreAllMocks();
});

function renderPage(queryClient: QueryClient = createTestQueryClient()) {
  return render(
    <MemoryRouter>
      <QueryClientProvider client={queryClient}>
        <CustomersListPage />
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

function renderAt(path: string, queryClient: QueryClient = createTestQueryClient()) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <QueryClientProvider client={queryClient}>
        <Routes>
          <Route path="/customers" element={<CustomersListPage />} />
          <Route path="/customers/:id" element={<CustomersListPage />} />
        </Routes>
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

const baseCustomer = {
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

function mockGet(customers: unknown[], stats?: unknown) {
  vi.spyOn(client, 'apiGet').mockImplementation((path: string) => {
    if (path === '/api/customers') {
      return Promise.resolve({ ok: true, customers });
    }
    if (path === '/api/customers/stats') {
      return stats
        ? Promise.resolve({ ok: true, ...(stats as object) })
        : Promise.reject(new client.ApiError('not found', 404));
    }
    if (path === '/api/customers/1') {
      return Promise.resolve({ ok: true, customer: customers.find((c) => (c as { id: string }).id === '1') });
    }
    return Promise.reject(new Error(`Unexpected path: ${path}`));
  });
}

describe('CustomersListPage — list rendering', () => {
  it('lists customers returned by the API', async () => {
    mockGet([baseCustomer]);
    renderPage();
    await waitFor(() => expect(screen.getByText('Bob Client')).toBeInTheDocument());
  });

  it('renders the stat row from mocked GET /api/customers/stats', async () => {
    mockGet([], { totalClients: 5, outstanding: '340.50', withOverdue: 2 });
    renderPage();
    await waitFor(() => expect(screen.getByText('Total Clients')).toBeInTheDocument());
    expect(screen.getByText('5')).toBeInTheDocument();
    expect(screen.getByText('R 340.50')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
  });

  it('shows an empty state when there are no customers', async () => {
    mockGet([]);
    renderPage();
    await waitFor(() => expect(screen.getByText(/no customers yet/i)).toBeInTheDocument());
  });

  it('shows an error message when the customers query fails', async () => {
    vi.spyOn(client, 'apiGet').mockRejectedValue(new client.ApiError('Something went wrong.', 500));
    renderPage();
    await waitFor(() => expect(screen.getByText(/couldn't load customers/i)).toBeInTheDocument());
  });
});

describe('CustomersListPage — inline add form', () => {
  it('shows an always-visible essentials-only add form with "More details" collapsed', async () => {
    mockGet([]);
    renderPage();
    await waitFor(() => expect(screen.getByLabelText('Name')).toBeInTheDocument());
    expect(screen.getByLabelText('Billing address')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '+ More details' })).toBeInTheDocument();
    expect(screen.queryByLabelText('Company')).not.toBeInTheDocument();
  });

  it('creates a customer via the essentials-only form and shows the new row without a manual refetch', async () => {
    mockGet([]);
    const postSpy = vi.spyOn(client, 'apiPost').mockResolvedValue({ ok: true, customer: { id: '1' } });
    renderPage();

    await waitFor(() => expect(screen.getByText(/no customers yet/i)).toBeInTheDocument());

    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Bob Client' } });
    fireEvent.change(screen.getByLabelText('Billing address'), { target: { value: '1 Oak St' } });

    mockGet([baseCustomer]);
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));

    await waitFor(() =>
      expect(postSpy).toHaveBeenCalledWith('/api/customers', expect.objectContaining({ name: 'Bob Client', billingAddress: '1 Oak St' })),
    );
    await waitFor(() => expect(screen.getByText('Bob Client')).toBeInTheDocument());
  });

  it('includes an optional field from the expanded "More details" section in the create payload', async () => {
    mockGet([]);
    const postSpy = vi.spyOn(client, 'apiPost').mockResolvedValue({ ok: true, customer: { id: '1' } });
    renderPage();

    await waitFor(() => expect(screen.getByLabelText('Name')).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Bob Client' } });
    fireEvent.change(screen.getByLabelText('Billing address'), { target: { value: '1 Oak St' } });
    fireEvent.click(screen.getByRole('button', { name: '+ More details' }));
    fireEvent.change(screen.getByLabelText('Company'), { target: { value: 'Acme Co' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));

    await waitFor(() => expect(postSpy).toHaveBeenCalled());
    const [, body] = postSpy.mock.calls[0];
    expect((body as Record<string, unknown>).company).toBe('Acme Co');
  });

  it('omits a blank email instead of sending an empty string that fails server validation', async () => {
    mockGet([]);
    const postSpy = vi.spyOn(client, 'apiPost').mockResolvedValue({ ok: true, customer: { id: '1' } });
    renderPage();

    await waitFor(() => expect(screen.getByLabelText('Name')).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Bob Client' } });
    fireEvent.change(screen.getByLabelText('Billing address'), { target: { value: '1 Oak St' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));

    await waitFor(() => expect(postSpy).toHaveBeenCalled());
    const [, body] = postSpy.mock.calls[0];
    expect((body as Record<string, unknown>).email).toBeUndefined();
  });
});

describe('CustomersListPage — edit in place', () => {
  it('clicking Edit shows that row pre-filled with its current values', async () => {
    mockGet([baseCustomer]);
    renderPage();

    await waitFor(() => expect(screen.getByText('Bob Client')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));

    expect(screen.getByLabelText('Name', { selector: '#edit-name' })).toHaveValue('Bob Client');
    expect(screen.getByLabelText('Billing address', { selector: '#edit-billingAddress' })).toHaveValue('1 Oak St');
  });

  it('Cancel reverts to read-only without calling update', async () => {
    mockGet([baseCustomer]);
    const patchSpy = vi.spyOn(client, 'apiPatch').mockResolvedValue({ ok: true });
    renderPage();

    await waitFor(() => expect(screen.getByText('Bob Client')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));

    const nameInput = screen.getByLabelText('Name', { selector: '#edit-name' });
    fireEvent.change(nameInput, { target: { value: 'Changed Name' } });
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(screen.getByText('Bob Client')).toBeInTheDocument();
    expect(screen.queryByText('Changed Name')).not.toBeInTheDocument();
    expect(patchSpy).not.toHaveBeenCalled();
  });

  it('Save calls update and returns to read-only reflecting new values', async () => {
    mockGet([baseCustomer]);
    const patchSpy = vi.spyOn(client, 'apiPatch').mockResolvedValue({ ok: true });
    renderPage();

    await waitFor(() => expect(screen.getByText('Bob Client')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));

    const editForm = screen.getByLabelText('Name', { selector: '#edit-name' }).closest('form')!;
    fireEvent.click(within(editForm).getByRole('button', { name: '+ More details' }));
    const companyInput = within(editForm).getByLabelText('Company');
    fireEvent.change(companyInput, { target: { value: 'Acme Co' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() =>
      expect(patchSpy).toHaveBeenCalledWith('/api/customers/1', expect.objectContaining({ company: 'Acme Co' })),
    );
    await waitFor(() => expect(screen.queryByLabelText('Name', { selector: '#edit-name' })).not.toBeInTheDocument());
  });

  it('sends a cleared, non-omit-listed field (notes) as an empty string, so it can actually be cleared', async () => {
    mockGet([{ ...baseCustomer, notes: 'Call before delivery' }]);
    const patchSpy = vi.spyOn(client, 'apiPatch').mockResolvedValue({ ok: true });
    renderPage();

    await waitFor(() => expect(screen.getByText('Bob Client')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));

    const editForm = screen.getByLabelText('Name', { selector: '#edit-name' }).closest('form')!;
    fireEvent.click(within(editForm).getByRole('button', { name: '+ More details' }));

    const notesInput = within(editForm).getByLabelText('Notes');
    expect(notesInput).toHaveValue('Call before delivery');
    fireEvent.change(notesInput, { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(patchSpy).toHaveBeenCalled());
    const [, payload] = patchSpy.mock.calls[0] as [string, Record<string, unknown>];
    expect(payload.notes).toBe('');
  });
});

describe('CustomersListPage — deep link', () => {
  it('navigating to /customers/:id auto-expands the matching row', async () => {
    mockGet([baseCustomer]);
    renderAt('/customers/1');

    await waitFor(() => expect(screen.getByLabelText('Name', { selector: '#edit-name' })).toHaveValue('Bob Client'));
  });
});
