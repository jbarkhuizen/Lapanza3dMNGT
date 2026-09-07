import { useEffect, useState, type FormEvent } from 'react';
import { FormField } from '../components/FormField.js';
import { Checkbox } from '../components/Checkbox.js';
import { TextareaField } from '../components/TextareaField.js';
import { ApiError } from '../api/client.js';
import { useCompanyProfile, useUpdateCompanyProfile, type UpdateCompanyProfileInput } from '../api/companyProfile.js';
import { omitBlankStrings } from '../lib/omitBlankStrings.js';

type FormState = UpdateCompanyProfileInput;

export function CompanyProfilePage() {
  const { data: profile, isLoading } = useCompanyProfile();
  const updateMutation = useUpdateCompanyProfile();
  const [form, setForm] = useState<FormState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (profile && !form) {
      setForm(profile);
    }
  }, [profile, form]);

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => (prev ? { ...prev, [key]: value } : prev));
    setSaved(false);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!form) return;
    setError(null);
    setSaved(false);
    try {
      await updateMutation.mutateAsync(omitBlankStrings(form));
      setSaved(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong. Try again shortly.');
    }
  }

  if (isLoading || !form) {
    return <p className="text-slate-500">Loading…</p>;
  }

  return (
    <form onSubmit={handleSubmit} className="flex max-w-2xl flex-col gap-8">
      <h1 className="text-2xl font-semibold text-slate-900">Company Profile</h1>

      <section className="flex flex-col gap-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Business</h2>
        <FormField
          id="businessName"
          label="Business name"
          value={form.businessName ?? ''}
          onChange={(e) => set('businessName', e.target.value)}
        />
        <FormField
          id="contactName"
          label="Contact name"
          value={form.contactName ?? ''}
          onChange={(e) => set('contactName', e.target.value)}
        />
        <FormField id="registrationNumber" label="Registration number" value={form.registrationNumber ?? ''} onChange={(e) => set('registrationNumber', e.target.value)} />
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">VAT / Legal</h2>
        <Checkbox
          id="vatRegistered"
          label="VAT registered"
          checked={form.vatRegistered ?? false}
          onChange={(checked) => set('vatRegistered', checked)}
        />
        <FormField id="vatNumber" label="VAT number" value={form.vatNumber ?? ''} onChange={(e) => set('vatNumber', e.target.value)} />
        <TextareaField
          id="termsAndConditionsText"
          label="Terms & conditions"
          value={form.termsAndConditionsText ?? ''}
          onChange={(value) => set('termsAndConditionsText', value)}
        />
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Address</h2>
        <FormField id="addressLine1" label="Address line 1" value={form.addressLine1 ?? ''} onChange={(e) => set('addressLine1', e.target.value)} />
        <FormField id="addressLine2" label="Address line 2" value={form.addressLine2 ?? ''} onChange={(e) => set('addressLine2', e.target.value)} />
        <FormField id="city" label="City" value={form.city ?? ''} onChange={(e) => set('city', e.target.value)} />
        <FormField id="postalCode" label="Postal code" value={form.postalCode ?? ''} onChange={(e) => set('postalCode', e.target.value)} />
        <FormField id="phone" label="Phone" value={form.phone ?? ''} onChange={(e) => set('phone', e.target.value)} />
        <FormField id="website" label="Website" value={form.website ?? ''} onChange={(e) => set('website', e.target.value)} />
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Banking</h2>
        <FormField id="bankName" label="Bank name" value={form.bankName ?? ''} onChange={(e) => set('bankName', e.target.value)} />
        <FormField id="bankAccountHolder" label="Account holder" value={form.bankAccountHolder ?? ''} onChange={(e) => set('bankAccountHolder', e.target.value)} />
        <FormField id="bankAccountNumber" label="Account number" value={form.bankAccountNumber ?? ''} onChange={(e) => set('bankAccountNumber', e.target.value)} />
        <FormField id="bankBranchCode" label="Branch code" value={form.bankBranchCode ?? ''} onChange={(e) => set('bankBranchCode', e.target.value)} />
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Numbering</h2>
        <FormField id="quoteNumberPrefix" label="Quote number prefix" value={form.quoteNumberPrefix ?? ''} onChange={(e) => set('quoteNumberPrefix', e.target.value)} />
        <FormField id="invoiceNumberPrefix" label="Invoice number prefix" value={form.invoiceNumberPrefix ?? ''} onChange={(e) => set('invoiceNumberPrefix', e.target.value)} />
        <FormField
          id="defaultQuoteValidityDays"
          label="Default quote validity (days)"
          type="number"
          value={form.defaultQuoteValidityDays ?? ''}
          onChange={(e) => set('defaultQuoteValidityDays', e.target.value ? Number(e.target.value) : null)}
        />
      </section>

      {error && <p className="text-sm text-red-600">{error}</p>}
      {saved && !error && <p className="text-sm text-green-600">Saved.</p>}
      <button
        type="submit"
        disabled={updateMutation.isPending}
        className="w-fit rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
      >
        Save
      </button>
    </form>
  );
}
