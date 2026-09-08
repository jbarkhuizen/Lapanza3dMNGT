import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { InvoiceDetailPage } from '../src/pages/invoices/InvoiceDetailPage.js';
import * as client from '../src/api/client.js';
import * as downloadPdf from '../src/lib/downloadPdf.js';
import { createTestQueryClient } from './helpers/queryClient.js';

beforeEach(() => {
  vi.restoreAllMocks();
});

const unpaidInvoice = {
  id: 'inv1', number: 'INV-0001', customerId: 'c1', quoteId: null, status: 'unpaid', dueDate: '2026-02-01T00:00:00.000Z',
  vatApplied: false, subtotal: '100.00', vatAmount: '0.00', total: '100.00', amountPaid: '0.00', balanceDue: '100.00',
  notes: null as string | null, createdAt: '2026-01-01T00:00:00.000Z',
  lineItems: [{ id: 'li1', costingTemplateId: null, quoteLineItemId: null, description: 'Custom bracket', quantity: 1, unitPrice: '100.00', lineTotal: '100.00' }],
};

function mockData(invoice = unpaidInvoice) {
  vi.spyOn(client, 'apiGet').mockImplementation((path: string) => {
    if (path === `/api/invoices/${invoice.id}`) return Promise.resolve({ ok: true, invoice });
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
          <Route path="/invoices/:id" element={<InvoiceDetailPage />} />
        </Routes>
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

describe('InvoiceDetailPage', () => {
  it('renders invoice details, customer name, line items, and balance due', async () => {
    mockData();
    renderAt('/invoices/inv1');
    await waitFor(() => expect(screen.getByRole('heading', { name: 'INV-0001' })).toBeInTheDocument());
    expect(screen.getByText('Bob Client')).toBeInTheDocument();
    expect(screen.getByText('Custom bracket')).toBeInTheDocument();
  });

  it('records a partial payment with an amount input', async () => {
    mockData();
    const patchSpy = vi.spyOn(client, 'apiPatch').mockResolvedValue({ ok: true, invoice: { ...unpaidInvoice, status: 'partially_paid', amountPaid: '40.00', balanceDue: '60.00' } });
    renderAt('/invoices/inv1');
    await waitFor(() => expect(screen.getByRole('button', { name: 'Record Partial Payment' })).toBeInTheDocument());

    fireEvent.change(screen.getByLabelText(/amount paid/i), { target: { value: '40' } });
    fireEvent.click(screen.getByRole('button', { name: 'Record Partial Payment' }));

    await waitFor(() =>
      expect(patchSpy).toHaveBeenCalledWith('/api/invoices/inv1/status', { status: 'partially_paid', amountPaid: 40 }),
    );
  });

  it('pre-fills the amount input with the invoice\'s current amountPaid, not blank', async () => {
    mockData({ ...unpaidInvoice, status: 'partially_paid', amountPaid: '40.00', balanceDue: '60.00' });
    renderAt('/invoices/inv1');
    await waitFor(() => expect(screen.getByRole('button', { name: 'Record Partial Payment' })).toBeInTheDocument());
    expect(screen.getByLabelText(/amount paid/i)).toHaveValue(40);
  });

  it('sends the invoice\'s exact total for "Mark as Paid", regardless of the amount input', async () => {
    mockData({ ...unpaidInvoice, status: 'partially_paid', amountPaid: '40.00', balanceDue: '60.00' });
    const patchSpy = vi.spyOn(client, 'apiPatch').mockResolvedValue({ ok: true, invoice: { ...unpaidInvoice, status: 'paid', amountPaid: '100.00', balanceDue: '0.00' } });
    renderAt('/invoices/inv1');
    await waitFor(() => expect(screen.getByRole('button', { name: 'Mark as Paid' })).toBeInTheDocument());

    // Do not touch the amount input — it starts pre-filled with 40.00, the OLD amount.
    fireEvent.click(screen.getByRole('button', { name: 'Mark as Paid' }));

    await waitFor(() =>
      expect(patchSpy).toHaveBeenCalledWith('/api/invoices/inv1/status', { status: 'paid', amountPaid: 100 }),
    );
  });

  it('records a new partial payment starting from the correct pre-filled base amount', async () => {
    mockData({ ...unpaidInvoice, status: 'partially_paid', amountPaid: '40.00', balanceDue: '60.00' });
    const patchSpy = vi.spyOn(client, 'apiPatch').mockResolvedValue({ ok: true, invoice: { ...unpaidInvoice, status: 'partially_paid', amountPaid: '70.00', balanceDue: '30.00' } });
    renderAt('/invoices/inv1');
    await waitFor(() => expect(screen.getByRole('button', { name: 'Record Partial Payment' })).toBeInTheDocument());
    expect(screen.getByLabelText(/amount paid/i)).toHaveValue(40);

    fireEvent.change(screen.getByLabelText(/amount paid/i), { target: { value: '70' } });
    fireEvent.click(screen.getByRole('button', { name: 'Record Partial Payment' }));

    await waitFor(() =>
      expect(patchSpy).toHaveBeenCalledWith('/api/invoices/inv1/status', { status: 'partially_paid', amountPaid: 70 }),
    );
  });

  it('renders invoice notes when present', async () => {
    mockData({ ...unpaidInvoice, notes: 'Deliver after 5pm.' });
    renderAt('/invoices/inv1');
    await waitFor(() => expect(screen.getByRole('heading', { name: 'INV-0001' })).toBeInTheDocument());
    expect(screen.getByText('Deliver after 5pm.')).toBeInTheDocument();
  });

  it('marks an invoice overdue with no amount input required', async () => {
    mockData();
    const patchSpy = vi.spyOn(client, 'apiPatch').mockResolvedValue({ ok: true, invoice: { ...unpaidInvoice, status: 'overdue' } });
    renderAt('/invoices/inv1');
    await waitFor(() => expect(screen.getByRole('button', { name: 'Mark as Overdue' })).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'Mark as Overdue' }));
    await waitFor(() => expect(patchSpy).toHaveBeenCalledWith('/api/invoices/inv1/status', { status: 'overdue', amountPaid: undefined }));
  });

  it('shows no status-transition actions for a paid (terminal) invoice', async () => {
    mockData({ ...unpaidInvoice, status: 'paid', amountPaid: '100.00', balanceDue: '0.00' });
    renderAt('/invoices/inv1');
    await waitFor(() => expect(screen.getByRole('heading', { name: 'INV-0001' })).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: /Mark as|Record/ })).not.toBeInTheDocument();
  });

  it('shows "Send to Customer" disabled when the customer has no email on file', async () => {
    mockData();
    renderAt('/invoices/inv1');
    await waitFor(() => expect(screen.getByRole('button', { name: 'Send to Customer' })).toBeInTheDocument());
    expect(screen.getByRole('button', { name: 'Send to Customer' })).toBeDisabled();
  });

  it('sends the invoice, downloads the PDF, and shows a dev-mode success message', async () => {
    vi.spyOn(client, 'apiGet').mockImplementation((path: string) => {
      if (path === '/api/invoices/inv1') return Promise.resolve({ ok: true, invoice: unpaidInvoice });
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

    renderAt('/invoices/inv1');
    await waitFor(() => expect(screen.getByRole('button', { name: 'Send to Customer' })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: 'Send to Customer' }));

    await waitFor(() => expect(postSpy).toHaveBeenCalledWith('/api/invoices/inv1/send'));
    expect(downloadSpy).toHaveBeenCalledWith('ZmFrZQ==', 'INV-0001.pdf');
    await waitFor(() => expect(screen.getByText(/Emailed to bob@example\.com/)).toBeInTheDocument());
  });
});
