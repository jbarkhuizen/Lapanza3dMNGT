import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { CompanyProfilePage } from '../src/pages/CompanyProfilePage.js';
import * as client from '../src/api/client.js';
import { createTestQueryClient } from './helpers/queryClient.js';

const baseProfile = {
  businessName: 'Acme Prints',
  contactName: 'Jane Doe',
  email: 'jane@acme.co.za',
  registrationNumber: null,
  vatRegistered: false,
  vatNumber: null,
  logoUrl: null,
  addressLine1: null,
  addressLine2: null,
  city: null,
  postalCode: null,
  phone: null,
  website: null,
  bankName: null,
  bankAccountHolder: null,
  bankAccountNumber: null,
  bankBranchCode: null,
  termsAndConditionsText: null,
  defaultCurrency: 'ZAR',
  defaultQuoteValidityDays: null,
  quoteNumberPrefix: 'QT',
  invoiceNumberPrefix: 'INV',
};

beforeEach(() => {
  vi.restoreAllMocks();
});

function renderPage() {
  const queryClient = createTestQueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <CompanyProfilePage />
    </QueryClientProvider>,
  );
}

describe('CompanyProfilePage', () => {
  it('loads and displays the current company profile', async () => {
    vi.spyOn(client, 'apiGet').mockResolvedValue({ ok: true, companyProfile: baseProfile });
    renderPage();
    await waitFor(() => expect(screen.getByDisplayValue('Acme Prints')).toBeInTheDocument());
    expect(screen.getByDisplayValue('QT')).toBeInTheDocument();
    expect(screen.getByDisplayValue('INV')).toBeInTheDocument();
  });

  it('saves changes via PATCH and reflects the updated value', async () => {
    vi.spyOn(client, 'apiGet').mockResolvedValue({ ok: true, companyProfile: baseProfile });
    const patchSpy = vi.spyOn(client, 'apiPatch').mockResolvedValue({
      ok: true,
      companyProfile: { ...baseProfile, city: 'Cape Town' },
    });
    renderPage();
    await waitFor(() => expect(screen.getByDisplayValue('Acme Prints')).toBeInTheDocument());

    fireEvent.change(screen.getByLabelText('City'), { target: { value: 'Cape Town' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() =>
      expect(patchSpy).toHaveBeenCalledWith('/api/company-profile', expect.objectContaining({ city: 'Cape Town' })),
    );
    await waitFor(() => expect(screen.getByText('Saved.')).toBeInTheDocument());
  });

  it('checking "VAT registered" reveals the VAT number field as required', async () => {
    vi.spyOn(client, 'apiGet').mockResolvedValue({ ok: true, companyProfile: baseProfile });
    renderPage();
    await waitFor(() => expect(screen.getByDisplayValue('Acme Prints')).toBeInTheDocument());

    const vatCheckbox = screen.getByLabelText('VAT registered') as HTMLInputElement;
    expect(vatCheckbox.checked).toBe(false);
    fireEvent.click(vatCheckbox);
    expect(vatCheckbox.checked).toBe(true);
  });

  it('shows the server error message when saving fails', async () => {
    vi.spyOn(client, 'apiGet').mockResolvedValue({ ok: true, companyProfile: baseProfile });
    vi.spyOn(client, 'apiPatch').mockRejectedValue(
      new client.ApiError('VAT number is required when VAT-registered.', 400),
    );
    renderPage();
    await waitFor(() => expect(screen.getByDisplayValue('Acme Prints')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(screen.getByText('VAT number is required when VAT-registered.')).toBeInTheDocument(),
    );
  });
});
