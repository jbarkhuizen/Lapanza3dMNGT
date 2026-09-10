import { useParams } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { useInvoice, useUpdateInvoiceStatus, useSendInvoice, VALID_INVOICE_STATUS_TRANSITIONS, INVOICE_STATUS_LABELS, type InvoiceStatus } from '../../api/invoices.js';
import { useCustomerLookup } from '../../api/customers.js';
import { formatCurrency } from '../../lib/formatCurrency.js';
import { useDisplayCurrency } from '../../lib/useDisplayCurrency.js';
import { useSendDocument } from '../../lib/useSendDocument.js';
import { SendToCustomerButton } from '../../components/SendToCustomerButton.js';
import { FormField } from '../../components/FormField.js';
import { ApiError } from '../../api/client.js';

export function InvoiceDetailPage() {
  const { id } = useParams();
  const { data: invoice, isLoading, isError } = useInvoice(id);
  const { lookup: customerLookup, isError: isCustomerLookupError } = useCustomerLookup();
  const currency = useDisplayCurrency();
  const updateStatusMutation = useUpdateInvoiceStatus(id ?? '');
  const sendMutation = useSendInvoice(id ?? '');
  const [amountPaid, setAmountPaid] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const handleSend = useSendDocument(sendMutation, invoice?.number ?? '', setError, setSuccessMessage);

  // Keep the amount input pre-filled with the CURRENT cumulative amount paid to date,
  // since PATCH /status sets amountPaid rather than incrementing it. Re-sync whenever
  // the invoice's amountPaid changes (initial load, or after a successful status update).
  useEffect(() => {
    if (invoice) {
      setAmountPaid(invoice.amountPaid);
    }
  }, [invoice?.amountPaid]);

  if (isLoading) {
    return <p className="text-slate-500">Loading…</p>;
  }
  if (isError || !invoice) {
    return <p className="text-red-600">Couldn't load this invoice.</p>;
  }

  const customer = customerLookup.get(invoice.customerId);
  const customerDisplayName = isCustomerLookupError ? "Couldn't load customer" : (customer?.name ?? 'Unknown customer');
  const nextStatuses = VALID_INVOICE_STATUS_TRANSITIONS[invoice.status] ?? [];
  const invoiceTotal = Number(invoice.total);

  async function handleStatusChange(status: InvoiceStatus, requiresAmount: boolean) {
    setError(null);
    setSuccessMessage(null);
    try {
      // "Mark as Paid" must send the invoice's exact total — the backend requires an exact
      // match for the `paid` status — not whatever happens to be in the amount input.
      const amount = status === 'paid' ? invoiceTotal : Number(amountPaid);
      await updateStatusMutation.mutateAsync({
        status,
        amountPaid: requiresAmount ? amount : undefined,
      });
      // The amount input is re-synced to the new invoice.amountPaid by the useEffect above
      // once the mutation's success invalidates the query and the invoice refetches.
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong. Try again shortly.');
    }
  }

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">{invoice.number}</h1>
          <p className="text-sm text-slate-500">Issued {invoice.createdAt.slice(0, 10)}</p>
        </div>
        <span className="rounded bg-slate-100 px-2 py-1 text-sm">{INVOICE_STATUS_LABELS[invoice.status]}</span>
      </div>

      <section className="grid grid-cols-2 gap-4 text-sm">
        <div><div className="text-slate-500">Customer</div><div>{customerDisplayName}</div></div>
        <div><div className="text-slate-500">Due date</div><div>{invoice.dueDate.slice(0, 10)}</div></div>
      </section>

      <section className="flex flex-col gap-2 border-t border-slate-200 pt-4 text-sm">
        <h2 className="text-lg font-semibold text-slate-900">Line items</h2>
        <table className="w-full text-left">
          <thead>
            <tr className="text-slate-500">
              <th className="py-1 font-normal">Description</th>
              <th className="py-1 text-right font-normal">Qty</th>
              <th className="py-1 text-right font-normal">Unit price</th>
              <th className="py-1 text-right font-normal">Line total</th>
            </tr>
          </thead>
          <tbody>
            {invoice.lineItems?.map((line) => (
              <tr key={line.id}>
                <td className="py-1">{line.description}</td>
                <td className="py-1 text-right">{line.quantity}</td>
                <td className="py-1 text-right">{formatCurrency(line.unitPrice, currency)}</td>
                <td className="py-1 text-right">{formatCurrency(line.lineTotal, currency)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="flex justify-between border-t border-slate-200 pt-2"><span>Subtotal</span><span>{formatCurrency(invoice.subtotal, currency)}</span></div>
        {invoice.vatApplied && <div className="flex justify-between"><span>VAT (15%)</span><span>{formatCurrency(invoice.vatAmount, currency)}</span></div>}
        <div className="flex justify-between font-semibold text-slate-900"><span>Total</span><span>{formatCurrency(invoice.total, currency)}</span></div>
        <div className="flex justify-between"><span>Amount paid to date</span><span>{formatCurrency(invoice.amountPaid, currency)}</span></div>
        <div className="flex justify-between font-semibold text-slate-900"><span>Balance due</span><span>{formatCurrency(invoice.balanceDue, currency)}</span></div>
      </section>

      {invoice.notes && (
        <section className="flex flex-col gap-2 border-t border-slate-200 pt-4 text-sm">
          <h2 className="text-lg font-semibold text-slate-900">Notes</h2>
          <p className="whitespace-pre-wrap text-slate-700">{invoice.notes}</p>
        </section>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}
      {successMessage && <p className="text-sm text-green-700">{successMessage}</p>}

      <div className="flex gap-3">
        <SendToCustomerButton onSend={handleSend} isPending={sendMutation.isPending} hasCustomerEmail={!!customer?.email} />
      </div>

      {nextStatuses.length > 0 && (
        <section className="flex flex-col gap-3 border-t border-slate-200 pt-4">
          {(nextStatuses.includes('partially_paid') || nextStatuses.includes('paid')) && (
            <FormField
              id="amountPaid"
              label="Total amount paid to date"
              type="number"
              value={amountPaid}
              onChange={(e) => setAmountPaid(e.target.value)}
              onFocus={(e) => e.target.select()}
            />
          )}
          <div className="flex gap-3">
            {nextStatuses.includes('partially_paid') && (
              <button
                onClick={() => handleStatusChange('partially_paid', true)}
                disabled={updateStatusMutation.isPending}
                className="rounded bg-slate-100 px-3 py-2 text-sm disabled:opacity-50"
              >
                Record Partial Payment
              </button>
            )}
            {nextStatuses.includes('paid') && (
              <button
                onClick={() => handleStatusChange('paid', true)}
                disabled={updateStatusMutation.isPending}
                className="rounded bg-slate-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
              >
                Mark as Paid
              </button>
            )}
            {nextStatuses.includes('overdue') && invoice.status !== 'overdue' && (
              <button
                onClick={() => handleStatusChange('overdue', false)}
                disabled={updateStatusMutation.isPending}
                className="rounded bg-slate-100 px-3 py-2 text-sm disabled:opacity-50"
              >
                Mark as Overdue
              </button>
            )}
          </div>
        </section>
      )}
    </div>
  );
}
