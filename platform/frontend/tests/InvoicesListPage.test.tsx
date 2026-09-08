import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { InvoicesListPage } from '../src/pages/invoices/InvoicesListPage.js';
import * as client from '../src/api/client.js';
import { createTestQueryClient } from './helpers/queryClient.js';
import { formatCurrency } from '../src/lib/formatCurrency.js';

beforeEach(() => {
  vi.restoreAllMocks();
});

const customer = {
  id: 'c1',
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

const unpaidInvoice = {
  id: 'inv1',
  number: 'INV-0001',
  customerId: 'c1',
  quoteId: null,
  status: 'unpaid',
  dueDate: '2026-02-01T00:00:00.000Z',
  vatApplied: false,
  subtotal: '150.00',
  vatAmount: '0.00',
  total: '150.00',
  amountPaid: '50.00',
  balanceDue: '100.00',
  notes: null,
  createdAt: '2026-01-01T00:00:00.000Z',
};

const paidInvoice = {
  ...unpaidInvoice,
  id: 'inv2',
  number: 'INV-0002',
  status: 'paid',
  total: '200.00',
  amountPaid: '200.00',
  balanceDue: '0.00',
};

function mockReferenceData(invoices = [unpaidInvoice, paidInvoice]) {
  vi.spyOn(client, 'apiGet').mockImplementation((path: string) => {
    if (path === '/api/invoices') {
      return Promise.resolve({ ok: true, invoices });
    }
    if (path === '/api/customers') {
      return Promise.resolve({ ok: true, customers: [customer] });
    }
    return Promise.reject(new client.ApiError('not found', 404));
  });
}

function renderPage() {
  const queryClient = createTestQueryClient();
  return render(
    <MemoryRouter>
      <QueryClientProvider client={queryClient}>
        <InvoicesListPage />
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

describe('InvoicesListPage', () => {
  it('lists invoices with customer name, status, total, and balance due resolved via useCustomerLookup', async () => {
    mockReferenceData();
    renderPage();
    await waitFor(() => expect(screen.getByText('INV-0001')).toBeInTheDocument());
    expect(screen.getAllByText('Bob Client')).toHaveLength(2);
    expect(screen.getByText(formatCurrency('150.00'))).toBeInTheDocument();
    expect(screen.getByText(formatCurrency('100.00'))).toBeInTheDocument();
    expect(screen.getByText(formatCurrency('200.00'))).toBeInTheDocument();
    expect(screen.getByText(formatCurrency('0.00'))).toBeInTheDocument();
  });

  it('shows an empty state when there are no invoices', async () => {
    mockReferenceData([]);
    renderPage();
    await waitFor(() => expect(screen.getByText(/no invoices yet/i)).toBeInTheDocument());
  });

  it('shows an error message when the list fails to load', async () => {
    vi.spyOn(client, 'apiGet').mockRejectedValue(new client.ApiError('Something went wrong.', 500));
    renderPage();
    await waitFor(() => expect(screen.getByText(/couldn't load invoices/i)).toBeInTheDocument());
  });

  it('has no link to create a new invoice', async () => {
    mockReferenceData([]);
    renderPage();
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Invoices' })).toBeInTheDocument());
    expect(screen.queryByRole('link', { name: /new invoice/i })).not.toBeInTheDocument();
  });

  it('links each row to its detail page', async () => {
    mockReferenceData();
    renderPage();
    await waitFor(() => expect(screen.getByText('INV-0001')).toBeInTheDocument());
    expect(screen.getByRole('link', { name: /INV-0001/ })).toHaveAttribute('href', '/invoices/inv1');
  });

  it('filters rows by status via a client-side status filter', async () => {
    mockReferenceData();
    renderPage();
    await waitFor(() => expect(screen.getByText('INV-0001')).toBeInTheDocument());
    expect(screen.getByText('INV-0002')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/status/i), { target: { value: 'paid' } });

    expect(screen.queryByText('INV-0001')).not.toBeInTheDocument();
    expect(screen.getByText('INV-0002')).toBeInTheDocument();
  });
});
