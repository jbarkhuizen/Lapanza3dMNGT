import { useEffect, useRef, useState, type FormEvent } from 'react';
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
import { omitBlankFields } from '../../lib/omitBlankFields.js';

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

// Only `email` has stricter-than-plain-optional validation on the customers route
// (`.email()`, which rejects ''). Every other optional field accepts '' fine and is sent
// as-is, so a user can actually clear it.
const OMIT_WHEN_BLANK: (keyof CustomerFormInput)[] = ['email'];

export function CustomerFormPage() {
  const { id } = useParams();
  const isEditMode = id !== undefined;
  const navigate = useNavigate();
  const { data: existingCustomer, isLoading: isLoadingCustomer, isError: isCustomerError } = useCustomer(id);
  const createMutation = useCreateCustomer();
  const updateMutation = useUpdateCustomer(id ?? '');
  const [form, setForm] = useState<CustomerFormInput>(emptyForm);
  const [error, setError] = useState<string | null>(null);
  const populatedForIdRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (existingCustomer && populatedForIdRef.current !== id) {
      populatedForIdRef.current = id;
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
  }, [existingCustomer, id]);

  function set<K extends keyof CustomerFormInput>(key: K, value: CustomerFormInput[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      if (isEditMode) {
        await updateMutation.mutateAsync(omitBlankFields(form, OMIT_WHEN_BLANK));
      } else {
        // `name` and `billingAddress` are required and never in the omit list, so they're
        // always present on the result — safe to assert back to the full input type for
        // the create endpoint, which (unlike update) doesn't accept a partial payload.
        await createMutation.mutateAsync(omitBlankFields(form, OMIT_WHEN_BLANK) as CustomerFormInput);
      }
      navigate('/customers');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong. Try again shortly.');
    }
  }

  if (isEditMode && isLoadingCustomer) {
    return <p className="text-slate-500">Loading…</p>;
  }

  if (isEditMode && isCustomerError) {
    return <p className="text-red-600">Couldn't load this customer. It may have been deleted.</p>;
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
