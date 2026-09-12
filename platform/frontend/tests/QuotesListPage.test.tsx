import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { QuotesListPage } from '../src/pages/quotes/QuotesListPage.js';
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

const draftQuote = {
  id: 'q1',
  number: 'QT-0001',
  customerId: 'c1',
  status: 'draft',
  validUntil: '2026-02-01T00:00:00.000Z',
  vatApplied: false,
  subtotal: '100.00',
  vatAmount: '0.00',
  total: '100.00',
  notes: null,
  createdAt: '2026-01-01T00:00:00.000Z',
};

const acceptedQuote = {
  ...draftQuote,
  id: 'q2',
  number: 'QT-0002',
  status: 'accepted',
  total: '200.00',
};

const testCompanyProfile = {
  businessName: 'Acme Prints', contactName: 'Jane Doe', email: 'jane@acmeprints.co.za',
  registrationNumber: null, vatRegistered: false, vatNumber: null, logoUrl: null,
  addressLine1: null, addressLine2: null, city: null, postalCode: null, phone: null, website: null,
  bankName: null, bankAccountHolder: null, bankAccountNumber: null, bankBranchCode: null,
  termsAndConditionsText: null, defaultCurrency: 'ZAR', defaultQuoteValidityDays: null,
  quoteNumberPrefix: 'QT', invoiceNumberPrefix: 'INV',
};

function mockReferenceData(quotes = [draftQuote, acceptedQuote], companyProfile = testCompanyProfile) {
  vi.spyOn(client, 'apiGet').mockImplementation((path: string) => {
    if (path === '/api/quotes') {
      return Promise.resolve({ ok: true, quotes });
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
        <QuotesListPage />
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

describe('QuotesListPage', () => {
  it('renders the stat row from mocked GET /api/quotes/stats', async () => {
    vi.spyOn(client, 'apiGet').mockImplementation((path: string) => {
      if (path === '/api/quotes') return Promise.resolve({ ok: true, quotes: [] });
      if (path === '/api/customers') return Promise.resolve({ ok: true, customers: [] });
      if (path === '/api/company-profile') return Promise.resolve({ ok: true, companyProfile: testCompanyProfile });
      if (path === '/api/quotes/stats') {
        return Promise.resolve({ ok: true, totalQuotes: 3, totalValue: '600.00', expiredCount: 1, convertedCount: 2 });
      }
      return Promise.reject(new client.ApiError('not found', 404));
    });
    renderPage();
    await waitFor(() => expect(screen.getByText('Total Quotes')).toBeInTheDocument());
    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.getByText('R 600.00')).toBeInTheDocument();
    expect(screen.getByText('1')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
  });

  it('lists quotes with customer name, status, and total resolved via useCustomerLookup', async () => {
    mockReferenceData();
    renderPage();
    await waitFor(() => expect(screen.getByText('QT-0001')).toBeInTheDocument());
    expect(screen.getAllByText('Bob Client')).toHaveLength(2);
    expect(screen.getByText(formatCurrency('100.00'))).toBeInTheDocument();
    expect(screen.getByText(formatCurrency('200.00'))).toBeInTheDocument();
  });

  it('shows an empty state when there are no quotes', async () => {
    mockReferenceData([]);
    renderPage();
    await waitFor(() => expect(screen.getByText(/no quotes yet/i)).toBeInTheDocument());
  });

  it('shows an error message when the list fails to load', async () => {
    vi.spyOn(client, 'apiGet').mockRejectedValue(new client.ApiError('Something went wrong.', 500));
    renderPage();
    await waitFor(() => expect(screen.getByText(/couldn't load quotes/i)).toBeInTheDocument());
  });

  it('has a link to create a new quote', async () => {
    mockReferenceData([]);
    renderPage();
    await waitFor(() =>
      expect(screen.getByRole('link', { name: 'New Quote' })).toHaveAttribute('href', '/quotes/new'),
    );
  });

  it('links each row to its detail page', async () => {
    mockReferenceData();
    renderPage();
    await waitFor(() => expect(screen.getByText('QT-0001')).toBeInTheDocument());
    expect(screen.getByRole('link', { name: /QT-0001/ })).toHaveAttribute('href', '/quotes/q1');
  });

  it('filters rows by status via a client-side status filter', async () => {
    mockReferenceData();
    renderPage();
    await waitFor(() => expect(screen.getByText('QT-0001')).toBeInTheDocument());
    expect(screen.getByText('QT-0002')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/status/i), { target: { value: 'accepted' } });

    expect(screen.queryByText('QT-0001')).not.toBeInTheDocument();
    expect(screen.getByText('QT-0002')).toBeInTheDocument();
  });

  it('shows the human-readable status label, not the raw enum value', async () => {
    mockReferenceData();
    renderPage();
    await waitFor(() => expect(screen.getByText('QT-0001')).toBeInTheDocument());
    // "Draft"/"Accepted" also appear as option text in the status filter <select>, so assert
    // against the table cell specifically rather than requiring a page-wide unique match.
    expect(screen.getByRole('cell', { name: 'Draft' })).toBeInTheDocument();
    expect(screen.getByRole('cell', { name: 'Accepted' })).toBeInTheDocument();
    expect(screen.queryByText('draft')).not.toBeInTheDocument();
    expect(screen.queryByText('accepted')).not.toBeInTheDocument();
  });

  it('formats money using the tenant\'s actual currency, not the ZAR default', async () => {
    mockReferenceData([draftQuote, acceptedQuote], { ...testCompanyProfile, defaultCurrency: 'USD' });
    renderPage();
    await waitFor(() => expect(screen.getByText('QT-0001')).toBeInTheDocument());
    expect(screen.getByText('USD 100.00')).toBeInTheDocument();
    expect(screen.getByText('USD 200.00')).toBeInTheDocument();
  });

  it('shows a distinguishable error instead of "Unknown customer" when the customer lookup fails', async () => {
    vi.spyOn(client, 'apiGet').mockImplementation((path: string) => {
      if (path === '/api/quotes') return Promise.resolve({ ok: true, quotes: [draftQuote] });
      if (path === '/api/customers') return Promise.reject(new client.ApiError('Something went wrong.', 500));
      if (path === '/api/company-profile') return Promise.resolve({ ok: true, companyProfile: testCompanyProfile });
      return Promise.reject(new client.ApiError('not found', 404));
    });
    renderPage();
    await waitFor(() => expect(screen.getByText('QT-0001')).toBeInTheDocument());
    expect(screen.getByText("Couldn't load customer")).toBeInTheDocument();
    expect(screen.queryByText('Unknown customer')).not.toBeInTheDocument();
  });
});
