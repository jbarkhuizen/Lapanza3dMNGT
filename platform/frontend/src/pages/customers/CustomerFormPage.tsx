import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { FormField } from '../../components/FormField.js';
import { TextareaField } from '../../components/TextareaField.js';
import { ApiError } from '../../api/client.js';
import {
  useCustomer,
  useCreateCustomer,
  useUpdateCustomer,
  type CustomerFormInput,
} from '../../api/customers.js';
import { omitBlankStrings } from '../../lib/omitBlankStrings.js';

const emptyForm: CustomerFormInput = {
  name: '',
  billingAddress: '',
  company: '',
  email: '',
  phone: '',
  deliveryAddress: '',
  vatNumber: '',
  notes: '',
};

export function CustomerFormPage() {
  const { id } = useParams();
  const isEditMode = id !== undefined;
  const navigate = useNavigate();
  const { data: existingCustomer } = useCustomer(id);
  const createMutation = useCreateCustomer();
  const updateMutation = useUpdateCustomer(id ?? '');
  const [form, setForm] = useState<CustomerFormInput>(emptyForm);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (existingCustomer) {
      setForm({
        name: existingCustomer.name,
        billingAddress: existingCustomer.billingAddress,
        company: existingCustomer.company ?? '',
        email: existingCustomer.email ?? '',
        phone: existingCustomer.phone ?? '',
        deliveryAddress: existingCustomer.deliveryAddress ?? '',
        vatNumber: existingCustomer.vatNumber ?? '',
        notes: existingCustomer.notes ?? '',
      });
    }
  }, [existingCustomer]);

  function set<K extends keyof CustomerFormInput>(key: K, value: CustomerFormInput[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      if (isEditMode) {
        await updateMutation.mutateAsync(omitBlankStrings(form));
      } else {
        await createMutation.mutateAsync(omitBlankStrings(form));
      }
      navigate('/customers');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong. Try again shortly.');
    }
  }

  const isPending = createMutation.isPending || updateMutation.isPending;

  return (
    <form onSubmit={handleSubmit} className="flex max-w-xl flex-col gap-4">
      <h1 className="text-2xl font-semibold text-slate-900">{isEditMode ? 'Edit Customer' : 'New Customer'}</h1>
      <FormField id="name" label="Name" value={form.name} onChange={(e) => set('name', e.target.value)} required />
      <FormField id="company" label="Company" value={form.company ?? ''} onChange={(e) => set('company', e.target.value)} />
      <FormField id="email" label="Email" type="email" value={form.email ?? ''} onChange={(e) => set('email', e.target.value)} />
      <FormField id="phone" label="Phone" value={form.phone ?? ''} onChange={(e) => set('phone', e.target.value)} />
      <FormField id="billingAddress" label="Billing address" value={form.billingAddress} onChange={(e) => set('billingAddress', e.target.value)} required />
      <FormField id="deliveryAddress" label="Delivery address" value={form.deliveryAddress ?? ''} onChange={(e) => set('deliveryAddress', e.target.value)} />
      <FormField id="vatNumber" label="VAT number" value={form.vatNumber ?? ''} onChange={(e) => set('vatNumber', e.target.value)} />
      <TextareaField id="notes" label="Notes" value={form.notes ?? ''} onChange={(value) => set('notes', value)} />
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button
        type="submit"
        disabled={isPending}
        className="w-fit rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
      >
        Save
      </button>
    </form>
  );
}
