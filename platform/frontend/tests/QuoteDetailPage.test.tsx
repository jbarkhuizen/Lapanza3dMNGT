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

function mockData(quote = draftQuote) {
  vi.spyOn(client, 'apiGet').mockImplementation((path: string) => {
    if (path === `/api/quotes/${quote.id}`) return Promise.resolve({ ok: true, quote });
    if (path === '/api/customers') return Promise.resolve({ ok: true, customers: [{ id: 'c1', name: 'Bob Client', company: null, email: null, phone: null, billingAddress: '1 Oak St', deliveryAddress: null, vatNumber: null, notes: null, createdAt: '2026-01-01T00:00:00.000Z' }] });
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
});
