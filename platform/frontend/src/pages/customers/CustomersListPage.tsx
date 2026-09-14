import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useParams } from 'react-router-dom';
import { FormField } from '../../components/FormField.js';
import { TextareaField } from '../../components/TextareaField.js';
import { MoreDetailsToggle } from '../../components/MoreDetailsToggle.js';
import { InlineEditableRow } from '../../components/InlineEditableRow.js';
import { ApiError } from '../../api/client.js';
import {
  useCustomers,
  useCustomer,
  useCustomerStats,
  useCreateCustomer,
  useUpdateCustomer,
  type Customer,
  type CustomerFormInput,
} from '../../api/customers.js';
import { omitBlankFields } from '../../lib/omitBlankFields.js';
import { formatCurrency } from '../../lib/formatCurrency.js';
import { useDisplayCurrency } from '../../lib/useDisplayCurrency.js';
import { StatCard } from '../../components/StatCard.js';

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

export function CustomersListPage() {
  const { id: deepLinkedId } = useParams();
  const { data: customers, isLoading, isError } = useCustomers();
  const { data: stats } = useCustomerStats();
  const currency = useDisplayCurrency();

  // ---- Add form state (essentials always visible + More details) ----
  const [addForm, setAddForm] = useState<CustomerFormInput>(emptyForm);
  const [addError, setAddError] = useState<string | null>(null);
  const createMutation = useCreateCustomer();

  function setAdd<K extends keyof CustomerFormInput>(key: K, value: CustomerFormInput[K]) {
    setAddForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleAdd(e: FormEvent) {
    e.preventDefault();
    setAddError(null);
    try {
      // `name` and `billingAddress` are required and never in the omit list, so they're
      // always present on the result — safe to assert back to the full input type for
      // the create endpoint, which (unlike update) doesn't accept a partial payload.
      await createMutation.mutateAsync(omitBlankFields(addForm, OMIT_WHEN_BLANK) as CustomerFormInput);
      setAddForm(emptyForm);
    } catch (err) {
      setAddError(err instanceof ApiError ? err.message : 'Something went wrong. Try again shortly.');
    }
  }

  // ---- Edit-in-place state ----
  const [editingId, setEditingId] = useState<string | null>(deepLinkedId ?? null);
  const [editForm, setEditForm] = useState<CustomerFormInput>(emptyForm);
  const [editError, setEditError] = useState<string | null>(null);
  const updateMutation = useUpdateCustomer(editingId ?? '');
  const { data: deepLinkedCustomer } = useCustomer(deepLinkedId);
  const populatedForIdRef = useRef<string | undefined>(undefined);

  function startEdit(customer: Customer) {
    setEditingId(customer.id);
    setEditError(null);
    setEditForm({
      name: customer.name,
      billingAddress: customer.billingAddress,
      company: customer.company ?? '',
      email: customer.email ?? '',
      phone: customer.phone ?? '',
      deliveryAddress: customer.deliveryAddress ?? '',
      vatNumber: customer.vatNumber ?? '',
      notes: customer.notes ?? '',
    });
  }

  // Deep-link support: /customers/:id auto-expands that row once its data has loaded.
  useEffect(() => {
    if (deepLinkedId && deepLinkedCustomer && populatedForIdRef.current !== deepLinkedId) {
      populatedForIdRef.current = deepLinkedId;
      startEdit(deepLinkedCustomer);
      document.getElementById(`customer-row-${deepLinkedId}`)?.scrollIntoView({ block: 'center' });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deepLinkedId, deepLinkedCustomer]);

  function setEdit<K extends keyof CustomerFormInput>(key: K, value: CustomerFormInput[K]) {
    setEditForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSaveEdit(e: FormEvent) {
    e.preventDefault();
    setEditError(null);
    try {
      await updateMutation.mutateAsync(omitBlankFields(editForm, OMIT_WHEN_BLANK));
      setEditingId(null);
    } catch (err) {
      setEditError(err instanceof ApiError ? err.message : 'Something went wrong. Try again shortly.');
    }
  }

  function cancelEdit() {
    setEditingId(null);
    setEditError(null);
  }

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">Customers</h1>

      {stats && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <StatCard label="Total Clients" value={String(stats.totalClients)} />
          <StatCard label="Outstanding" value={formatCurrency(stats.outstanding, currency)} />
          <StatCard label="With Overdue" value={String(stats.withOverdue)} />
        </div>
      )}

      <form onSubmit={handleAdd} className="flex flex-col gap-3 rounded border border-slate-200 p-4 dark:border-slate-700">
        <div className="flex flex-wrap items-end gap-3">
          <FormField id="add-name" label="Name" value={addForm.name} onChange={(e) => setAdd('name', e.target.value)} required />
          <FormField
            id="add-billingAddress"
            label="Billing address"
            value={addForm.billingAddress}
            onChange={(e) => setAdd('billingAddress', e.target.value)}
            required
          />
          <button
            type="submit"
            disabled={createMutation.isPending}
            className="rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-slate-100 dark:text-slate-900"
          >
            Add
          </button>
        </div>
        <MoreDetailsToggle>
          <FormField id="add-company" label="Company" value={addForm.company ?? ''} onChange={(e) => setAdd('company', e.target.value)} />
          <FormField
            id="add-email"
            label="Email"
            type="email"
            value={addForm.email ?? ''}
            onChange={(e) => setAdd('email', e.target.value)}
          />
          <FormField id="add-phone" label="Phone" value={addForm.phone ?? ''} onChange={(e) => setAdd('phone', e.target.value)} />
          <FormField
            id="add-deliveryAddress"
            label="Delivery address"
            value={addForm.deliveryAddress ?? ''}
            onChange={(e) => setAdd('deliveryAddress', e.target.value)}
          />
          <FormField id="add-vatNumber" label="VAT number" value={addForm.vatNumber ?? ''} onChange={(e) => setAdd('vatNumber', e.target.value)} />
          <TextareaField id="add-notes" label="Notes" value={addForm.notes ?? ''} onChange={(value) => setAdd('notes', value)} />
        </MoreDetailsToggle>
        {addError && <p className="text-sm text-red-600 dark:text-red-400">{addError}</p>}
      </form>

      {isError && <p className="text-red-600 dark:text-red-400">Couldn't load customers. Try refreshing the page.</p>}
      {isLoading && <p className="text-slate-500 dark:text-slate-400">Loading…</p>}
      {!isLoading && !isError && customers?.length === 0 && <p className="text-slate-500 dark:text-slate-400">No customers yet.</p>}
      {!isLoading && !isError && customers && customers.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-slate-500 dark:border-slate-700 dark:text-slate-400">
              <th className="py-2">Name</th>
              <th className="py-2">Company</th>
              <th className="py-2">Email</th>
              <th className="py-2"></th>
            </tr>
          </thead>
          <tbody>
            {customers.map((customer) => (
              <InlineEditableRow
                key={customer.id}
                isEditing={editingId === customer.id}
                readOnlyContent={
                  <>
                    <td id={`customer-row-${customer.id}`} className="py-2">
                      {customer.name}
                    </td>
                    <td className="py-2">{customer.company ?? '—'}</td>
                    <td className="py-2">{customer.email ?? '—'}</td>
                    <td className="py-2 text-right">
                      <button type="button" onClick={() => startEdit(customer)} className="text-slate-600 underline dark:text-slate-400">
                        Edit
                      </button>
                    </td>
                  </>
                }
                editContent={
                  <td colSpan={4} className="py-3">
                    <form onSubmit={handleSaveEdit} className="flex flex-col gap-3">
                      <div className="flex flex-wrap items-end gap-3">
                        <FormField id="edit-name" label="Name" value={editForm.name} onChange={(e) => setEdit('name', e.target.value)} required />
                        <FormField
                          id="edit-billingAddress"
                          label="Billing address"
                          value={editForm.billingAddress}
                          onChange={(e) => setEdit('billingAddress', e.target.value)}
                          required
                        />
                      </div>
                      <MoreDetailsToggle>
                        <FormField id="edit-company" label="Company" value={editForm.company ?? ''} onChange={(e) => setEdit('company', e.target.value)} />
                        <FormField
                          id="edit-email"
                          label="Email"
                          type="email"
                          value={editForm.email ?? ''}
                          onChange={(e) => setEdit('email', e.target.value)}
                        />
                        <FormField id="edit-phone" label="Phone" value={editForm.phone ?? ''} onChange={(e) => setEdit('phone', e.target.value)} />
                        <FormField
                          id="edit-deliveryAddress"
                          label="Delivery address"
                          value={editForm.deliveryAddress ?? ''}
                          onChange={(e) => setEdit('deliveryAddress', e.target.value)}
                        />
                        <FormField
                          id="edit-vatNumber"
                          label="VAT number"
                          value={editForm.vatNumber ?? ''}
                          onChange={(e) => setEdit('vatNumber', e.target.value)}
                        />
                        <TextareaField id="edit-notes" label="Notes" value={editForm.notes ?? ''} onChange={(value) => setEdit('notes', value)} />
                      </MoreDetailsToggle>
                      {editError && <p className="text-sm text-red-600 dark:text-red-400">{editError}</p>}
                      <div className="flex gap-2">
                        <button
                          type="submit"
                          disabled={updateMutation.isPending}
                          className="w-fit rounded bg-slate-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-slate-100 dark:text-slate-900"
                        >
                          Save
                        </button>
                        <button type="button" onClick={cancelEdit} className="w-fit rounded bg-slate-100 px-3 py-2 text-sm dark:bg-slate-700 dark:text-slate-100">
                          Cancel
                        </button>
                      </div>
                    </form>
                  </td>
                }
              />
            ))}
          </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
