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

const testCompanyProfile = {
  businessName: 'Acme Prints', contactName: 'Jane Doe', email: 'jane@acmeprints.co.za',
  registrationNumber: null, vatRegistered: false, vatNumber: null, logoUrl: null,
  addressLine1: null, addressLine2: null, city: null, postalCode: null, phone: null, website: null,
  bankName: null, bankAccountHolder: null, bankAccountNumber: null, bankBranchCode: null,
  termsAndConditionsText: null, defaultCurrency: 'ZAR', defaultQuoteValidityDays: null,
  quoteNumberPrefix: 'QT', invoiceNumberPrefix: 'INV',
};

function mockReferenceData(invoices = [unpaidInvoice, paidInvoice], companyProfile = testCompanyProfile) {
  vi.spyOn(client, 'apiGet').mockImplementation((path: string) => {
    if (path === '/api/invoices') {
      return Promise.resolve({ ok: true, invoices });
    }
    if (path === '/api/customers') {
      return Promise.resolve({ ok: true, customers: [customer] });
    }
    if (path === '/api/company-profile') {
      return Promise.resolve({ ok: true, companyProfile });
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
  it('renders the stat row from mocked GET /api/invoices/stats', async () => {
    vi.spyOn(client, 'apiGet').mockImplementation((path: string) => {
      if (path === '/api/invoices') return Promise.resolve({ ok: true, invoices: [] });
      if (path === '/api/customers') return Promise.resolve({ ok: true, customers: [] });
      if (path === '/api/company-profile') return Promise.resolve({ ok: true, companyProfile: testCompanyProfile });
      if (path === '/api/invoices/stats') {
        return Promise.resolve({
          ok: true,
          totalOutstanding: '230.00',
          totalPaid: '300.00',
          paidCount: 1,
          unpaidCount: 2,
          overdueCount: 3,
        });
      }
      return Promise.reject(new client.ApiError('not found', 404));
    });
    renderPage();
    await waitFor(() => expect(screen.getByText('Total Outstanding')).toBeInTheDocument());
    expect(screen.getByText('R 230.00')).toBeInTheDocument();
    expect(screen.getByText('R 300.00')).toBeInTheDocument();
    expect(screen.getByText('1')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
  });

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

  it('shows the human-readable status label, not the raw enum value', async () => {
    mockReferenceData();
    renderPage();
    await waitFor(() => expect(screen.getByText('INV-0001')).toBeInTheDocument());
    // "Unpaid"/"Paid" also appear as option text in the status filter <select>, so assert
    // against the table cell specifically rather than requiring a page-wide unique match.
    expect(screen.getByRole('cell', { name: 'Unpaid' })).toBeInTheDocument();
    expect(screen.getByRole('cell', { name: 'Paid' })).toBeInTheDocument();
    expect(screen.queryByText('unpaid')).not.toBeInTheDocument();
  });

  it('formats money using the tenant\'s actual currency, not the ZAR default', async () => {
    mockReferenceData([unpaidInvoice, paidInvoice], { ...testCompanyProfile, defaultCurrency: 'USD' });
    renderPage();
    await waitFor(() => expect(screen.getByText('INV-0001')).toBeInTheDocument());
    expect(screen.getByText('USD 150.00')).toBeInTheDocument();
    expect(screen.getByText('USD 100.00')).toBeInTheDocument();
    expect(screen.getByText('USD 200.00')).toBeInTheDocument();
    expect(screen.getByText('USD 0.00')).toBeInTheDocument();
  });

  it('shows a distinguishable error instead of "Unknown customer" when the customer lookup fails', async () => {
    vi.spyOn(client, 'apiGet').mockImplementation((path: string) => {
      if (path === '/api/invoices') return Promise.resolve({ ok: true, invoices: [unpaidInvoice] });
      if (path === '/api/customers') return Promise.reject(new client.ApiError('Something went wrong.', 500));
      if (path === '/api/company-profile') return Promise.resolve({ ok: true, companyProfile: testCompanyProfile });
      return Promise.reject(new client.ApiError('not found', 404));
    });
    renderPage();
    await waitFor(() => expect(screen.getByText('INV-0001')).toBeInTheDocument());
    expect(screen.getByText("Couldn't load customer")).toBeInTheDocument();
    expect(screen.queryByText('Unknown customer')).not.toBeInTheDocument();
  });
});
