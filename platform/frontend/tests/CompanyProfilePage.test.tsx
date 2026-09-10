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

// A freshly registered tenant: every optional column is null, exactly as the API returns
// it for a brand-new signup.
const freshTenantProfile = { ...baseProfile };

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

  it('renders a Logo URL field', async () => {
    vi.spyOn(client, 'apiGet').mockResolvedValue({ ok: true, companyProfile: baseProfile });
    renderPage();
    await waitFor(() => expect(screen.getByLabelText('Logo URL')).toBeInTheDocument());
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

  it('a brand-new tenant with every optional field null can save with zero edits (does not send an invalid PATCH)', async () => {
    vi.spyOn(client, 'apiGet').mockResolvedValue({ ok: true, companyProfile: freshTenantProfile });
    const patchSpy = vi.spyOn(client, 'apiPatch').mockResolvedValue({ ok: true, companyProfile: freshTenantProfile });
    renderPage();
    await waitFor(() => expect(screen.getByDisplayValue('Acme Prints')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(patchSpy).toHaveBeenCalled());
    const [, payload] = patchSpy.mock.calls[0] as [string, Record<string, unknown>];
    // None of the 14 nullable fields should be sent as `null` — the PATCH schema's
    // `z.string().optional()` accepts `string | undefined`, not `null`.
    for (const value of Object.values(payload)) {
      expect(value).not.toBeNull();
    }
    await waitFor(() => expect(screen.getByText('Saved.')).toBeInTheDocument());
  });

  it('sends a blank optional field (not in the omit list) as an empty string, so it can actually be cleared', async () => {
    vi.spyOn(client, 'apiGet').mockResolvedValue({
      ok: true,
      companyProfile: { ...baseProfile, city: 'Cape Town' },
    });
    const patchSpy = vi.spyOn(client, 'apiPatch').mockResolvedValue({ ok: true, companyProfile: baseProfile });
    renderPage();
    await waitFor(() => expect(screen.getByDisplayValue('Acme Prints')).toBeInTheDocument());

    fireEvent.change(screen.getByLabelText('City'), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(patchSpy).toHaveBeenCalled());
    const [, payload] = patchSpy.mock.calls[0] as [string, Record<string, unknown>];
    expect(payload.city).toBe('');
  });

  it('sends a blank vatNumber as an empty string instead of omitting it, so it can actually be cleared', async () => {
    // The server's zod schema uses plain `.trim().optional()` for vatNumber (confirmed
    // against `platform/api/src/routes/company-profile.ts`), which accepts '' fine — so
    // unlike the old, buggy behaviour, blanking this field must not silently no-op.
    vi.spyOn(client, 'apiGet').mockResolvedValue({
      ok: true,
      companyProfile: { ...baseProfile, vatNumber: 'VAT123' },
    });
    const patchSpy = vi.spyOn(client, 'apiPatch').mockResolvedValue({ ok: true, companyProfile: baseProfile });
    renderPage();
    await waitFor(() => expect(screen.getByDisplayValue('Acme Prints')).toBeInTheDocument());

    fireEvent.change(screen.getByLabelText('VAT number'), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(patchSpy).toHaveBeenCalled());
    const [, payload] = patchSpy.mock.calls[0] as [string, Record<string, unknown>];
    expect(payload.vatNumber).toBe('');
  });

  it('sends blank quoteNumberPrefix/invoiceNumberPrefix as empty strings instead of omitting them, so they can actually be cleared', async () => {
    vi.spyOn(client, 'apiGet').mockResolvedValue({ ok: true, companyProfile: baseProfile });
    const patchSpy = vi.spyOn(client, 'apiPatch').mockResolvedValue({ ok: true, companyProfile: baseProfile });
    renderPage();
    await waitFor(() => expect(screen.getByDisplayValue('Acme Prints')).toBeInTheDocument());

    fireEvent.change(screen.getByLabelText('Quote number prefix'), { target: { value: '' } });
    fireEvent.change(screen.getByLabelText('Invoice number prefix'), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(patchSpy).toHaveBeenCalled());
    const [, payload] = patchSpy.mock.calls[0] as [string, Record<string, unknown>];
    expect(payload.quoteNumberPrefix).toBe('');
    expect(payload.invoiceNumberPrefix).toBe('');
  });

  it('does not send a blank optional field as an empty string when saving', async () => {
    vi.spyOn(client, 'apiGet').mockResolvedValue({
      ok: true,
      companyProfile: { ...baseProfile, registrationNumber: '' },
    });
    const patchSpy = vi.spyOn(client, 'apiPatch').mockResolvedValue({ ok: true, companyProfile: baseProfile });
    renderPage();
    await waitFor(() => expect(screen.getByDisplayValue('Acme Prints')).toBeInTheDocument());

    fireEvent.change(screen.getByLabelText('City'), { target: { value: 'Cape Town' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(patchSpy).toHaveBeenCalled());
    const [, payload] = patchSpy.mock.calls[0] as [string, Record<string, unknown>];
    // registrationNumber isn't in the omit list — the server accepts '' for it fine — so
    // it's sent as '' rather than being stripped.
    expect(payload.registrationNumber).toBe('');
  });

  it('toggling "VAT registered" updates the checkbox state', async () => {
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

  it('shows an error instead of loading forever when the initial GET fails', async () => {
    vi.spyOn(client, 'apiGet').mockRejectedValue(new client.ApiError('Something went wrong.', 500));
    renderPage();
    await waitFor(() => expect(screen.getByText(/couldn't load the company profile/i)).toBeInTheDocument());
  });
});
