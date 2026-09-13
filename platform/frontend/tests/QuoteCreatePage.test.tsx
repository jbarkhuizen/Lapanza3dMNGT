import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { QuoteCreatePage } from '../src/pages/quotes/QuoteCreatePage.js';
import * as client from '../src/api/client.js';
import { createTestQueryClient } from './helpers/queryClient.js';

beforeEach(() => {
  vi.restoreAllMocks();
});

const testCompanyProfile = {
  businessName: 'Acme Prints', contactName: 'Jane Doe', email: 'jane@acmeprints.co.za',
  registrationNumber: null, vatRegistered: false, vatNumber: null, logoUrl: null,
  addressLine1: null, addressLine2: null, city: null, postalCode: null, phone: null, website: null,
  bankName: null, bankAccountHolder: null, bankAccountNumber: null, bankBranchCode: null,
  termsAndConditionsText: null, defaultCurrency: 'ZAR', defaultQuoteValidityDays: null,
  quoteNumberPrefix: 'QT', invoiceNumberPrefix: 'INV',
  pricingNotesText: null, defaultPaymentTerms: null, defaultNotes: null,
};

function mockReferenceData(companyProfile: Record<string, unknown> = testCompanyProfile) {
  vi.spyOn(client, 'apiGet').mockImplementation((path: string) => {
    if (path === '/api/customers') {
      return Promise.resolve({ ok: true, customers: [{ id: 'c1', name: 'Bob Client', company: null, email: null, phone: null, billingAddress: '1 Oak St', deliveryAddress: null, vatNumber: null, notes: null, createdAt: '2026-01-01T00:00:00.000Z' }] });
    }
    if (path === '/api/costing-templates') {
      return Promise.resolve({ ok: true, costingTemplates: [{ id: 'ct1', name: 'Standard bracket', filamentId: 'f1', filamentSnapshotBrand: 'eSun', filamentSnapshotMaterialType: 'PLA', filamentSnapshotCostPerGram: '0.300000', weightGrams: 50, printerId: 'p1', printerSnapshotName: 'Prusa MK4', printerSnapshotElectricityRatePerKwh: '2.5000', printerSnapshotDepreciationPerHour: '0.8000', printTimeHours: 2, markupPercent: '50.00', filamentCost: '15.00', electricityCost: '1.25', depreciationCost: '1.60', labourCost: '0.00', consumablesCost: '0.00', totalCost: '17.85', suggestedPrice: '26.78', createdAt: '2026-01-01T00:00:00.000Z' }] });
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
    <MemoryRouter initialEntries={['/quotes/new']}>
      <QueryClientProvider client={queryClient}>
        <Routes>
          <Route path="/quotes/new" element={<QuoteCreatePage />} />
          <Route path="/quotes/:id" element={<div>quote detail page</div>} />
        </Routes>
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

describe('QuoteCreatePage', () => {
  it('creates a quote with an ad-hoc line item', async () => {
    mockReferenceData();
    const postSpy = vi.spyOn(client, 'apiPost').mockResolvedValue({ ok: true, quote: { id: 'q1' } });
    renderPage();
    await waitFor(() => expect(screen.getByRole('option', { name: 'Bob Client' })).toBeInTheDocument());

    fireEvent.change(screen.getByLabelText('Customer'), { target: { value: 'c1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add Line Item' }));
    fireEvent.change(screen.getByLabelText('Description'), { target: { value: 'Custom part' } });
    fireEvent.change(screen.getByLabelText('Unit price'), { target: { value: '150' } });
    fireEvent.change(screen.getByLabelText('Quantity'), { target: { value: '2' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create Quote' }));

    await waitFor(() =>
      expect(postSpy).toHaveBeenCalledWith('/api/quotes', {
        customerId: 'c1',
        lineItems: [{ description: 'Custom part', unitPrice: 150, quantity: 2 }],
      }),
    );
    await waitFor(() => expect(screen.getByText('quote detail page')).toBeInTheDocument());
  });

  it('creates a quote with a line item picked from a costing template', async () => {
    mockReferenceData();
    const postSpy = vi.spyOn(client, 'apiPost').mockResolvedValue({ ok: true, quote: { id: 'q1' } });
    renderPage();
    await waitFor(() => expect(screen.getByRole('option', { name: 'Bob Client' })).toBeInTheDocument());

    fireEvent.change(screen.getByLabelText('Customer'), { target: { value: 'c1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add Line Item' }));
    fireEvent.click(screen.getByLabelText('From a costing template'));
    fireEvent.change(screen.getByLabelText('Costing template'), { target: { value: 'ct1' } });
    fireEvent.change(screen.getByLabelText('Quantity'), { target: { value: '1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create Quote' }));

    await waitFor(() =>
      expect(postSpy).toHaveBeenCalledWith('/api/quotes', {
        customerId: 'c1',
        lineItems: [{ costingTemplateId: 'ct1', quantity: 1 }],
      }),
    );
  });

  it('slices a file to build a line: creates a costing template, attaches it, and submits the quote', async () => {
    // Starts empty; the mocked POST below pushes the newly created template
    // into it, so the query invalidation this hook fires on success (see
    // useCreateCostingTemplate) refetches a list that actually contains a
    // matching <option> for the <select>'s now-attached value -- otherwise
    // the <select required> would have no matching option and the browser's
    // own constraint validation would silently block form submission.
    const costingTemplatesList: Array<{ id: string; name: string }> = [];
    vi.spyOn(client, 'apiGet').mockImplementation((path: string) => {
      if (path === '/api/customers') {
        return Promise.resolve({ ok: true, customers: [{ id: 'c1', name: 'Bob Client', company: null, email: null, phone: null, billingAddress: '1 Oak St', deliveryAddress: null, vatNumber: null, notes: null, createdAt: '2026-01-01T00:00:00.000Z' }] });
      }
      if (path === '/api/costing-templates') {
        return Promise.resolve({ ok: true, costingTemplates: costingTemplatesList });
      }
      if (path === '/api/company-profile') {
        return Promise.resolve({ ok: true, companyProfile: testCompanyProfile });
      }
      if (path === '/api/printers') {
        return Promise.resolve({ ok: true, printers: [{ id: 'p1', name: 'Prusa MK4' }] });
      }
      if (path === '/api/filaments') {
        return Promise.resolve({ ok: true, filaments: [{ id: 'f1', brand: 'eSun', materialType: 'PLA' }] });
      }
      if (path === '/api/slicer/jobs/job1') {
        return Promise.resolve({
          ok: true,
          job: {
            id: 'job1',
            status: 'done',
            originFileName: 'bracket.stl',
            resultWeightGrams: 30,
            resultSupportWeightGrams: 2,
            resultFilamentLengthMm: 900,
            resultPrintTimeHours: 2.5,
            errorMessage: null,
          },
        });
      }
      return Promise.reject(new client.ApiError('not found', 404));
    });
    vi.spyOn(client, 'apiPostFormData').mockResolvedValue({ ok: true, job: { id: 'job1', status: 'queued' } });
    const postSpy = vi.spyOn(client, 'apiPost').mockImplementation((path: string, body?: unknown) => {
      if (path === '/api/costing-templates') {
        costingTemplatesList.push({ id: 'ct-new', name: (body as { name: string }).name });
        return Promise.resolve({ ok: true, costingTemplate: { id: 'ct-new', ...(body as object) } });
      }
      if (path === '/api/quotes') {
        return Promise.resolve({ ok: true, quote: { id: 'q1' } });
      }
      return Promise.reject(new client.ApiError('unexpected', 400));
    });
    renderPage();
    await waitFor(() => expect(screen.getByRole('option', { name: 'Bob Client' })).toBeInTheDocument());

    fireEvent.change(screen.getByLabelText('Customer'), { target: { value: 'c1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add Line Item' }));
    fireEvent.click(screen.getByLabelText('From a costing template'));
    fireEvent.click(screen.getByRole('button', { name: 'Slice a file to build this line' }));

    const file = new File(['solid stub'], 'bracket.stl', { type: 'model/stl' });
    fireEvent.change(screen.getByLabelText('STL file'), { target: { files: [file] } });
    fireEvent.click(screen.getByRole('button', { name: 'Slice' }));

    await waitFor(() => expect(screen.getByLabelText('Template name')).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText('Template name'), { target: { value: 'Sliced bracket' } });
    fireEvent.change(screen.getByLabelText('Filament'), { target: { value: 'f1' } });
    fireEvent.change(screen.getByLabelText('Printer'), { target: { value: 'p1' } });
    fireEvent.change(screen.getByLabelText('Markup (%)'), { target: { value: '50' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create & attach' }));

    await waitFor(() =>
      expect(postSpy).toHaveBeenCalledWith('/api/costing-templates', expect.objectContaining({
        process: 'printer',
        name: 'Sliced bracket',
        filamentId: 'f1',
        weightGrams: 30,
        printerId: 'p1',
        printTimeHours: 2.5,
        sliceJobId: 'job1',
        markupPercent: 50,
      })),
    );

    // Slice flow closes and the line now points at the newly created
    // template -- wait for the invalidated list to refetch and give the
    // <select> a matching option before submitting.
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Create & attach' })).not.toBeInTheDocument());
    await waitFor(() => expect(screen.getByRole('option', { name: 'Sliced bracket' })).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText('Quantity'), { target: { value: '1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create Quote' }));

    await waitFor(() =>
      expect(postSpy).toHaveBeenCalledWith('/api/quotes', {
        customerId: 'c1',
        lineItems: [{ costingTemplateId: 'ct-new', quantity: 1 }],
      }),
    );
  });

  it('sends discountPercent/discountAppliesTo when a discount mode other than None is selected', async () => {
    mockReferenceData();
    const postSpy = vi.spyOn(client, 'apiPost').mockResolvedValue({ ok: true, quote: { id: 'q1' } });
    renderPage();
    await waitFor(() => expect(screen.getByRole('option', { name: 'Bob Client' })).toBeInTheDocument());

    fireEvent.change(screen.getByLabelText('Customer'), { target: { value: 'c1' } });
    fireEvent.change(screen.getByLabelText('Discount'), { target: { value: 'per_line' } });
    fireEvent.change(screen.getByLabelText('Discount percent'), { target: { value: '10' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add Line Item' }));
    fireEvent.change(screen.getByLabelText('Description'), { target: { value: 'Custom part' } });
    fireEvent.change(screen.getByLabelText('Unit price'), { target: { value: '150' } });
    fireEvent.change(screen.getByLabelText('Quantity'), { target: { value: '2' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create Quote' }));

    await waitFor(() =>
      expect(postSpy).toHaveBeenCalledWith('/api/quotes', {
        customerId: 'c1',
        discountAppliesTo: 'per_line',
        discountPercent: 10,
        lineItems: [{ description: 'Custom part', unitPrice: 150, quantity: 2 }],
      }),
    );
  });

  it('does not show the discount percent input when Discount is None, and does not send discount fields', async () => {
    mockReferenceData();
    const postSpy = vi.spyOn(client, 'apiPost').mockResolvedValue({ ok: true, quote: { id: 'q1' } });
    renderPage();
    await waitFor(() => expect(screen.getByRole('option', { name: 'Bob Client' })).toBeInTheDocument());
    expect(screen.queryByLabelText('Discount percent')).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Customer'), { target: { value: 'c1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add Line Item' }));
    fireEvent.change(screen.getByLabelText('Description'), { target: { value: 'Custom part' } });
    fireEvent.change(screen.getByLabelText('Unit price'), { target: { value: '150' } });
    fireEvent.change(screen.getByLabelText('Quantity'), { target: { value: '1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create Quote' }));

    await waitFor(() =>
      expect(postSpy).toHaveBeenCalledWith('/api/quotes', {
        customerId: 'c1',
        lineItems: [{ description: 'Custom part', unitPrice: 150, quantity: 1 }],
      }),
    );
  });

  it('pre-fills payment terms and terms & conditions from the tenant\'s company-profile defaults', async () => {
    mockReferenceData({
      ...testCompanyProfile,
      defaultPaymentTerms: '50% deposit, balance on delivery.',
      termsAndConditionsText: 'Standard tenant T&Cs.',
    });
    renderPage();
    await waitFor(() => expect(screen.getByLabelText('Payment terms (optional)')).toHaveValue('50% deposit, balance on delivery.'));
    expect(screen.getByLabelText('Terms & conditions (optional)')).toHaveValue('Standard tenant T&Cs.');
  });

  it('shows the server error message when creation fails', async () => {
    mockReferenceData();
    vi.spyOn(client, 'apiPost').mockRejectedValue(new client.ApiError('Customer not found.', 400));
    renderPage();
    await waitFor(() => expect(screen.getByRole('option', { name: 'Bob Client' })).toBeInTheDocument());

    fireEvent.change(screen.getByLabelText('Customer'), { target: { value: 'c1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add Line Item' }));
    fireEvent.change(screen.getByLabelText('Description'), { target: { value: 'Custom part' } });
    fireEvent.change(screen.getByLabelText('Unit price'), { target: { value: '150' } });
    fireEvent.change(screen.getByLabelText('Quantity'), { target: { value: '1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create Quote' }));

    await waitFor(() => expect(screen.getByText('Customer not found.')).toBeInTheDocument());
  });
});
