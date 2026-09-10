import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { QuoteDetailPage } from '../src/pages/quotes/QuoteDetailPage.js';
import * as client from '../src/api/client.js';
import * as downloadPdf from '../src/lib/downloadPdf.js';
import { createTestQueryClient } from './helpers/queryClient.js';

beforeEach(() => {
  vi.restoreAllMocks();
});

const draftQuote = {
  id: 'q1', number: 'QT-0001', customerId: 'c1', status: 'draft', validUntil: null,
  vatApplied: false, subtotal: '100.00', vatAmount: '0.00', total: '100.00', notes: null as string | null,
  createdAt: '2026-01-01T00:00:00.000Z',
  lineItems: [{ id: 'li1', costingTemplateId: null, description: 'Custom bracket', quantity: 1, unitPrice: '100.00', lineTotal: '100.00' }],
};

const testCompanyProfile = {
  businessName: 'Acme Prints', contactName: 'Jane Doe', email: 'jane@acmeprints.co.za',
  registrationNumber: null, vatRegistered: false, vatNumber: null, logoUrl: null,
  addressLine1: null, addressLine2: null, city: null, postalCode: null, phone: null, website: null,
  bankName: null, bankAccountHolder: null, bankAccountNumber: null, bankBranchCode: null,
  termsAndConditionsText: null, defaultCurrency: 'ZAR', defaultQuoteValidityDays: null,
  quoteNumberPrefix: 'QT', invoiceNumberPrefix: 'INV',
};

function mockData(quote = draftQuote, companyProfile = testCompanyProfile) {
  vi.spyOn(client, 'apiGet').mockImplementation((path: string) => {
    if (path === `/api/quotes/${quote.id}`) return Promise.resolve({ ok: true, quote });
    if (path === '/api/customers') return Promise.resolve({ ok: true, customers: [{ id: 'c1', name: 'Bob Client', company: null, email: null, phone: null, billingAddress: '1 Oak St', deliveryAddress: null, vatNumber: null, notes: null, createdAt: '2026-01-01T00:00:00.000Z' }] });
    if (path === '/api/company-profile') return Promise.resolve({ ok: true, companyProfile });
    return Promise.reject(new client.ApiError('not found', 404));
  });
}

function renderAt(path: string) {
  const queryClient = createTestQueryClient();
  return render(
    <MemoryRouter initialEntries={[path]}>
      <QueryClientProvider client={queryClient}>
        <Routes>
          <Route path="/quotes/:id" element={<QuoteDetailPage />} />
          <Route path="/invoices/:id" element={<div>invoice detail page</div>} />
        </Routes>
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

describe('QuoteDetailPage', () => {
  it('renders quote details, customer name, and line items', async () => {
    mockData();
    renderAt('/quotes/q1');
    await waitFor(() => expect(screen.getByRole('heading', { name: 'QT-0001' })).toBeInTheDocument());
    expect(screen.getByText('Bob Client')).toBeInTheDocument();
    expect(screen.getByText('Custom bracket')).toBeInTheDocument();
  });

  it('shows only legal next-status buttons for a draft quote (sent, expired — not accepted)', async () => {
    mockData();
    renderAt('/quotes/q1');
    await waitFor(() => expect(screen.getByRole('heading', { name: 'QT-0001' })).toBeInTheDocument());
    expect(screen.getByRole('button', { name: 'Mark as Sent' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Mark as Expired' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Mark as Accepted' })).not.toBeInTheDocument();
  });

  it('transitions status via PATCH when a status button is clicked', async () => {
    mockData();
    const patchSpy = vi.spyOn(client, 'apiPatch').mockResolvedValue({ ok: true, quote: { ...draftQuote, status: 'sent' } });
    renderAt('/quotes/q1');
    await waitFor(() => expect(screen.getByRole('button', { name: 'Mark as Sent' })).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'Mark as Sent' }));
    await waitFor(() => expect(patchSpy).toHaveBeenCalledWith('/api/quotes/q1/status', { status: 'sent' }));
  });

  it('shows a "Convert to Invoice" button only when status is accepted, and navigates to the new invoice on success', async () => {
    mockData({ ...draftQuote, status: 'accepted' });
    const postSpy = vi.spyOn(client, 'apiPost').mockResolvedValue({ ok: true, invoice: { id: 'inv1' } });
    renderAt('/quotes/q1');
    await waitFor(() => expect(screen.getByRole('button', { name: 'Convert to Invoice' })).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'Convert to Invoice' }));
    await waitFor(() => expect(postSpy).toHaveBeenCalledWith('/api/quotes/q1/convert-to-invoice'));
    await waitFor(() => expect(screen.getByText('invoice detail page')).toBeInTheDocument());
  });

  it('does not show a "Convert to Invoice" button for a draft quote', async () => {
    mockData();
    renderAt('/quotes/q1');
    await waitFor(() => expect(screen.getByRole('heading', { name: 'QT-0001' })).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: 'Convert to Invoice' })).not.toBeInTheDocument();
  });

  it('renders quote notes when present', async () => {
    mockData({ ...draftQuote, notes: 'Rush order, please confirm colour.' });
    renderAt('/quotes/q1');
    await waitFor(() => expect(screen.getByRole('heading', { name: 'QT-0001' })).toBeInTheDocument());
    expect(screen.getByText('Rush order, please confirm colour.')).toBeInTheDocument();
  });

  it('shows "Send to Customer" disabled when the customer has no email on file', async () => {
    mockData();
    renderAt('/quotes/q1');
    await waitFor(() => expect(screen.getByRole('button', { name: 'Send to Customer' })).toBeInTheDocument());
    expect(screen.getByRole('button', { name: 'Send to Customer' })).toBeDisabled();
  });

  it('sends the quote, downloads the PDF, and shows a dev-mode success message', async () => {
    vi.spyOn(client, 'apiGet').mockImplementation((path: string) => {
      if (path === '/api/quotes/q1') return Promise.resolve({ ok: true, quote: draftQuote });
      if (path === '/api/customers') {
        return Promise.resolve({
          ok: true,
          customers: [{ id: 'c1', name: 'Bob Client', company: null, email: 'bob@example.com', phone: null, billingAddress: '1 Oak St', deliveryAddress: null, vatNumber: null, notes: null, createdAt: '2026-01-01T00:00:00.000Z' }],
        });
      }
      if (path === '/api/company-profile') return Promise.resolve({ ok: true, companyProfile: testCompanyProfile });
      return Promise.reject(new client.ApiError('not found', 404));
    });
    const postSpy = vi.spyOn(client, 'apiPost').mockResolvedValue({ pdfBase64: 'ZmFrZQ==', sentTo: 'bob@example.com', devMode: true });
    const downloadSpy = vi.spyOn(downloadPdf, 'downloadBase64Pdf').mockImplementation(() => {});

    renderAt('/quotes/q1');
    await waitFor(() => expect(screen.getByRole('button', { name: 'Send to Customer' })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: 'Send to Customer' }));

    await waitFor(() => expect(postSpy).toHaveBeenCalledWith('/api/quotes/q1/send'));
    expect(downloadSpy).toHaveBeenCalledWith('ZmFrZQ==', 'QT-0001.pdf');
    await waitFor(() => expect(screen.getByText(/Emailed to bob@example\.com/)).toBeInTheDocument());
  });

  it('labels the VAT row "VAT (15%)" to match the generated PDF', async () => {
    mockData({ ...draftQuote, vatApplied: true, vatAmount: '15.00' });
    renderAt('/quotes/q1');
    await waitFor(() => expect(screen.getByText('VAT (15%)')).toBeInTheDocument());
  });

  it('formats money using the tenant\'s actual currency, not the ZAR default', async () => {
    mockData(draftQuote, { ...testCompanyProfile, defaultCurrency: 'USD' });
    renderAt('/quotes/q1');
    await waitFor(() => expect(screen.getByRole('heading', { name: 'QT-0001' })).toBeInTheDocument());
    // Subtotal/total/lineTotal are all '100.00' in this fixture, so multiple elements render
    // "USD 100.00" — assert at least one exists rather than requiring a single unique match.
    expect(screen.getAllByText('USD 100.00').length).toBeGreaterThan(0);
  });

  it('sends the quote, downloads the PDF, and shows the real (non-dev-mode) success message when devMode is false', async () => {
    vi.spyOn(client, 'apiGet').mockImplementation((path: string) => {
      if (path === '/api/quotes/q1') return Promise.resolve({ ok: true, quote: draftQuote });
      if (path === '/api/customers') {
        return Promise.resolve({
          ok: true,
          customers: [{ id: 'c1', name: 'Bob Client', company: null, email: 'bob@example.com', phone: null, billingAddress: '1 Oak St', deliveryAddress: null, vatNumber: null, notes: null, createdAt: '2026-01-01T00:00:00.000Z' }],
        });
      }
      if (path === '/api/company-profile') return Promise.resolve({ ok: true, companyProfile: testCompanyProfile });
      return Promise.reject(new client.ApiError('not found', 404));
    });
    const postSpy = vi.spyOn(client, 'apiPost').mockResolvedValue({ pdfBase64: 'ZmFrZQ==', sentTo: 'bob@example.com', devMode: false });
    const downloadSpy = vi.spyOn(downloadPdf, 'downloadBase64Pdf').mockImplementation(() => {});

    renderAt('/quotes/q1');
    await waitFor(() => expect(screen.getByRole('button', { name: 'Send to Customer' })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: 'Send to Customer' }));

    await waitFor(() => expect(postSpy).toHaveBeenCalledWith('/api/quotes/q1/send'));
    expect(downloadSpy).toHaveBeenCalledWith('ZmFrZQ==', 'QT-0001.pdf');
    await waitFor(() => expect(screen.getByText('Emailed to bob@example.com.')).toBeInTheDocument());
    expect(screen.queryByText(/dev mode/i)).not.toBeInTheDocument();
  });

  it('displays the issue date (createdAt) prominently near the top', async () => {
    mockData();
    renderAt('/quotes/q1');
    await waitFor(() => expect(screen.getByRole('heading', { name: 'QT-0001' })).toBeInTheDocument());
    expect(screen.getByText(/Issued 2026-01-01/)).toBeInTheDocument();
  });

  it('shows a unit-price column alongside the line total for each line item', async () => {
    mockData();
    renderAt('/quotes/q1');
    await waitFor(() => expect(screen.getByRole('heading', { name: 'QT-0001' })).toBeInTheDocument());
    expect(screen.getByRole('columnheader', { name: 'Unit price' })).toBeInTheDocument();
    // Unit price and line total are both '100.00' in this fixture (quantity 1), so two cells
    // render "R 100.00" — assert both are present rather than requiring a single unique match.
    expect(screen.getAllByRole('cell', { name: 'R 100.00' })).toHaveLength(2);
  });

  it('shows a distinguishable error instead of "Unknown customer" when the customer lookup fails', async () => {
    vi.spyOn(client, 'apiGet').mockImplementation((path: string) => {
      if (path === '/api/quotes/q1') return Promise.resolve({ ok: true, quote: draftQuote });
      if (path === '/api/customers') return Promise.reject(new client.ApiError('Something went wrong.', 500));
      if (path === '/api/company-profile') return Promise.resolve({ ok: true, companyProfile: testCompanyProfile });
      return Promise.reject(new client.ApiError('not found', 404));
    });
    renderAt('/quotes/q1');
    await waitFor(() => expect(screen.getByRole('heading', { name: 'QT-0001' })).toBeInTheDocument());
    expect(screen.getByText("Couldn't load customer")).toBeInTheDocument();
  });

  it('clears a stale send success banner when an unrelated status-changing action runs', async () => {
    vi.spyOn(client, 'apiGet').mockImplementation((path: string) => {
      if (path === '/api/quotes/q1') return Promise.resolve({ ok: true, quote: draftQuote });
      if (path === '/api/customers') {
        return Promise.resolve({
          ok: true,
          customers: [{ id: 'c1', name: 'Bob Client', company: null, email: 'bob@example.com', phone: null, billingAddress: '1 Oak St', deliveryAddress: null, vatNumber: null, notes: null, createdAt: '2026-01-01T00:00:00.000Z' }],
        });
      }
      if (path === '/api/company-profile') return Promise.resolve({ ok: true, companyProfile: testCompanyProfile });
      return Promise.reject(new client.ApiError('not found', 404));
    });
    vi.spyOn(client, 'apiPost').mockResolvedValue({ pdfBase64: 'ZmFrZQ==', sentTo: 'bob@example.com', devMode: true });
    vi.spyOn(downloadPdf, 'downloadBase64Pdf').mockImplementation(() => {});
    const patchSpy = vi.spyOn(client, 'apiPatch').mockResolvedValue({ ok: true, quote: { ...draftQuote, status: 'sent' } });

    renderAt('/quotes/q1');
    await waitFor(() => expect(screen.getByRole('button', { name: 'Send to Customer' })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: 'Send to Customer' }));
    await waitFor(() => expect(screen.getByText(/Emailed to bob@example\.com/)).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'Mark as Sent' }));
    await waitFor(() => expect(patchSpy).toHaveBeenCalled());
    expect(screen.queryByText(/Emailed to/)).not.toBeInTheDocument();
  });
});
