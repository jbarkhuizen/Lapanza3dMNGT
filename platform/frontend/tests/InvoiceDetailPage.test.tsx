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
  vatApplied: false, subtotal: '100.00',
  discountPercent: null as string | null, discountAppliesTo: null as 'total' | 'per_line' | null, discountAmount: '0.00',
  vatAmount: '0.00', total: '100.00', amountPaid: '0.00', balanceDue: '100.00',
  notes: null as string | null,
  paymentTerms: null as string | null, termsAndConditionsText: null as string | null, paymentLinkUrl: null as string | null,
  createdAt: '2026-01-01T00:00:00.000Z',
  lineItems: [{ id: 'li1', costingTemplateId: null, quoteLineItemId: null, description: 'Custom bracket', quantity: 1, unitPrice: '100.00', lineTotal: '100.00' }],
};

const testCompanyProfile = {
  businessName: 'Acme Prints', contactName: 'Jane Doe', email: 'jane@acmeprints.co.za',
  registrationNumber: null, vatRegistered: false, vatNumber: null, logoUrl: null,
  addressLine1: null, addressLine2: null, city: null, postalCode: null, phone: null, website: null,
  bankName: null, bankAccountHolder: null, bankAccountNumber: null, bankBranchCode: null,
  termsAndConditionsText: null, defaultCurrency: 'ZAR', defaultQuoteValidityDays: null,
  quoteNumberPrefix: 'QT', invoiceNumberPrefix: 'INV',
};

function mockData(invoice = unpaidInvoice, companyProfile = testCompanyProfile) {
  vi.spyOn(client, 'apiGet').mockImplementation((path: string) => {
    if (path === `/api/invoices/${invoice.id}`) return Promise.resolve({ ok: true, invoice });
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
      if (path === '/api/company-profile') return Promise.resolve({ ok: true, companyProfile: testCompanyProfile });
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

  it('labels the VAT row "VAT (15%)" to match the generated PDF', async () => {
    mockData({ ...unpaidInvoice, vatApplied: true, vatAmount: '15.00' });
    renderAt('/invoices/inv1');
    await waitFor(() => expect(screen.getByText('VAT (15%)')).toBeInTheDocument());
  });

  it('formats money using the tenant\'s actual currency, not the ZAR default', async () => {
    mockData(unpaidInvoice, { ...testCompanyProfile, defaultCurrency: 'USD' });
    renderAt('/invoices/inv1');
    await waitFor(() => expect(screen.getByRole('heading', { name: 'INV-0001' })).toBeInTheDocument());
    // Subtotal/total/lineTotal/balanceDue are all '100.00' in this fixture, so multiple elements
    // render "USD 100.00" — assert at least one exists rather than requiring a single unique match.
    expect(screen.getAllByText('USD 100.00').length).toBeGreaterThan(0);
  });

  it('sends the invoice, downloads the PDF, and shows the real (non-dev-mode) success message when devMode is false', async () => {
    vi.spyOn(client, 'apiGet').mockImplementation((path: string) => {
      if (path === '/api/invoices/inv1') return Promise.resolve({ ok: true, invoice: unpaidInvoice });
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

    renderAt('/invoices/inv1');
    await waitFor(() => expect(screen.getByRole('button', { name: 'Send to Customer' })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: 'Send to Customer' }));

    await waitFor(() => expect(postSpy).toHaveBeenCalledWith('/api/invoices/inv1/send'));
    expect(downloadSpy).toHaveBeenCalledWith('ZmFrZQ==', 'INV-0001.pdf');
    await waitFor(() => expect(screen.getByText('Emailed to bob@example.com.')).toBeInTheDocument());
    expect(screen.queryByText(/dev mode/i)).not.toBeInTheDocument();
  });

  it('displays the issue date (createdAt) prominently near the top', async () => {
    mockData();
    renderAt('/invoices/inv1');
    await waitFor(() => expect(screen.getByRole('heading', { name: 'INV-0001' })).toBeInTheDocument());
    expect(screen.getByText(/Issued 2026-01-01/)).toBeInTheDocument();
  });

  it('shows a unit-price column alongside the line total for each line item', async () => {
    mockData();
    renderAt('/invoices/inv1');
    await waitFor(() => expect(screen.getByRole('heading', { name: 'INV-0001' })).toBeInTheDocument());
    expect(screen.getByRole('columnheader', { name: 'Unit price' })).toBeInTheDocument();
    // Unit price and line total are both '100.00' in this fixture (quantity 1), so two cells
    // render "R 100.00" — assert both are present rather than requiring a single unique match.
    expect(screen.getAllByRole('cell', { name: 'R 100.00' })).toHaveLength(2);
  });

  it('shows a distinguishable error instead of "Unknown customer" when the customer lookup fails', async () => {
    vi.spyOn(client, 'apiGet').mockImplementation((path: string) => {
      if (path === '/api/invoices/inv1') return Promise.resolve({ ok: true, invoice: unpaidInvoice });
      if (path === '/api/customers') return Promise.reject(new client.ApiError('Something went wrong.', 500));
      if (path === '/api/company-profile') return Promise.resolve({ ok: true, companyProfile: testCompanyProfile });
      return Promise.reject(new client.ApiError('not found', 404));
    });
    renderAt('/invoices/inv1');
    await waitFor(() => expect(screen.getByRole('heading', { name: 'INV-0001' })).toBeInTheDocument());
    expect(screen.getByText("Couldn't load customer")).toBeInTheDocument();
  });

  it('hides the "Mark as Overdue" button once the invoice is already overdue', async () => {
    mockData({ ...unpaidInvoice, status: 'overdue' });
    renderAt('/invoices/inv1');
    await waitFor(() => expect(screen.getByRole('heading', { name: 'INV-0001' })).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: 'Mark as Overdue' })).not.toBeInTheDocument();
    // The other legal transitions out of "overdue" should still be offered.
    expect(screen.getByRole('button', { name: 'Record Partial Payment' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Mark as Paid' })).toBeInTheDocument();
  });

  it('clears a stale send success banner when an unrelated status-changing action runs', async () => {
    vi.spyOn(client, 'apiGet').mockImplementation((path: string) => {
      if (path === '/api/invoices/inv1') return Promise.resolve({ ok: true, invoice: unpaidInvoice });
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
    const patchSpy = vi.spyOn(client, 'apiPatch').mockResolvedValue({ ok: true, invoice: { ...unpaidInvoice, status: 'overdue' } });

    renderAt('/invoices/inv1');
    await waitFor(() => expect(screen.getByRole('button', { name: 'Send to Customer' })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: 'Send to Customer' }));
    await waitFor(() => expect(screen.getByText(/Emailed to bob@example\.com/)).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'Mark as Overdue' }));
    await waitFor(() => expect(patchSpy).toHaveBeenCalled());
    expect(screen.queryByText(/Emailed to/)).not.toBeInTheDocument();
  });

  it('shows a Discount line between Subtotal and VAT only when discountAmount > 0', async () => {
    mockData({ ...unpaidInvoice, discountAmount: '15.00' });
    renderAt('/invoices/inv1');
    await waitFor(() => expect(screen.getByText('Discount')).toBeInTheDocument());
    expect(screen.getByText('- R 15.00')).toBeInTheDocument();
  });

  it('does not show a Discount line when discountAmount is 0.00', async () => {
    mockData();
    renderAt('/invoices/inv1');
    await waitFor(() => expect(screen.getByRole('heading', { name: 'INV-0001' })).toBeInTheDocument());
    expect(screen.queryByText('Discount')).not.toBeInTheDocument();
  });

  it('displays paymentTerms, termsAndConditionsText, and a clickable paymentLinkUrl when present', async () => {
    mockData({
      ...unpaidInvoice,
      paymentTerms: '50% deposit.',
      termsAndConditionsText: 'Standard terms apply.',
      paymentLinkUrl: 'https://pay.example.com/inv1',
    });
    renderAt('/invoices/inv1');
    await waitFor(() => expect(screen.getByText('50% deposit.')).toBeInTheDocument());
    expect(screen.getByText('Standard terms apply.')).toBeInTheDocument();
    const link = screen.getByRole('link', { name: 'https://pay.example.com/inv1' });
    expect(link).toHaveAttribute('href', 'https://pay.example.com/inv1');
  });

  it('edits notes/paymentTerms/termsAndConditionsText/paymentLinkUrl via PATCH /api/invoices/:id', async () => {
    mockData({ ...unpaidInvoice, notes: 'Old notes.' });
    const patchSpy = vi.spyOn(client, 'apiPatch').mockResolvedValue({
      ok: true,
      invoice: { ...unpaidInvoice, notes: 'New notes.', paymentLinkUrl: 'https://pay.example.com/new' },
    });
    renderAt('/invoices/inv1');
    await waitFor(() => expect(screen.getByText('Old notes.')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    fireEvent.change(screen.getByLabelText('Notes'), { target: { value: 'New notes.' } });
    fireEvent.change(screen.getByLabelText('Payment terms'), { target: { value: 'New terms.' } });
    fireEvent.change(screen.getByLabelText('Terms & conditions'), { target: { value: 'New T&Cs.' } });
    fireEvent.change(screen.getByLabelText('Payment link URL'), { target: { value: 'https://pay.example.com/new' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() =>
      expect(patchSpy).toHaveBeenCalledWith('/api/invoices/inv1', {
        notes: 'New notes.',
        paymentTerms: 'New terms.',
        termsAndConditionsText: 'New T&Cs.',
        paymentLinkUrl: 'https://pay.example.com/new',
      }),
    );
  });

  it('pre-fills the amount-paid input with onFocus-select behaviour to reduce typo risk', async () => {
    mockData({ ...unpaidInvoice, status: 'partially_paid', amountPaid: '40.00', balanceDue: '60.00' });
    renderAt('/invoices/inv1');
    await waitFor(() => expect(screen.getByLabelText(/amount paid/i)).toBeInTheDocument());
    const input = screen.getByLabelText(/amount paid/i) as HTMLInputElement;
    const selectSpy = vi.spyOn(input, 'select');
    fireEvent.focus(input);
    expect(selectSpy).toHaveBeenCalled();
  });
});
