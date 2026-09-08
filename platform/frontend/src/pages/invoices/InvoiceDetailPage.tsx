import { useParams } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { useInvoice, useUpdateInvoiceStatus, useSendInvoice, VALID_INVOICE_STATUS_TRANSITIONS, type InvoiceStatus } from '../../api/invoices.js';
import { useCustomerLookup } from '../../api/customers.js';
import { formatCurrency } from '../../lib/formatCurrency.js';
import { downloadBase64Pdf } from '../../lib/downloadPdf.js';
import { FormField } from '../../components/FormField.js';
import { ApiError } from '../../api/client.js';

const STATUS_LABELS: Record<InvoiceStatus, string> = {
  unpaid: 'Unpaid',
  partially_paid: 'Partially Paid',
  paid: 'Paid',
  overdue: 'Overdue',
};

export function InvoiceDetailPage() {
  const { id } = useParams();
  const { data: invoice, isLoading, isError } = useInvoice(id);
  const { lookup: customerLookup } = useCustomerLookup();
  const updateStatusMutation = useUpdateInvoiceStatus(id ?? '');
  const sendMutation = useSendInvoice(id ?? '');
  const [amountPaid, setAmountPaid] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

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
  const nextStatuses = VALID_INVOICE_STATUS_TRANSITIONS[invoice.status] ?? [];
  const invoiceTotal = Number(invoice.total);
  const invoiceNumber = invoice.number;

  async function handleStatusChange(status: InvoiceStatus, requiresAmount: boolean) {
    setError(null);
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

  async function handleSend() {
    setError(null);
    setSuccessMessage(null);
    try {
      const result = await sendMutation.mutateAsync();
      downloadBase64Pdf(result.pdfBase64, `${invoiceNumber}.pdf`);
      setSuccessMessage(`Emailed to ${result.sentTo} (dev mode — check server console for the email log).`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong. Try again shortly.');
    }
  }

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-slate-900">{invoice.number}</h1>
        <span className="rounded bg-slate-100 px-2 py-1 text-sm">{STATUS_LABELS[invoice.status]}</span>
      </div>

      <section className="grid grid-cols-2 gap-4 text-sm">
        <div><div className="text-slate-500">Customer</div><div>{customer?.name ?? 'Unknown customer'}</div></div>
        <div><div className="text-slate-500">Due date</div><div>{invoice.dueDate.slice(0, 10)}</div></div>
      </section>

      <section className="flex flex-col gap-2 border-t border-slate-200 pt-4 text-sm">
        <h2 className="text-lg font-semibold text-slate-900">Line items</h2>
        {invoice.lineItems?.map((line) => (
          <div key={line.id} className="flex justify-between">
            <span>
              <span>{line.description}</span>
              <span className="text-slate-500"> × {line.quantity}</span>
            </span>
            <span>{formatCurrency(line.lineTotal)}</span>
          </div>
        ))}
        <div className="flex justify-between border-t border-slate-200 pt-2"><span>Subtotal</span><span>{formatCurrency(invoice.subtotal)}</span></div>
        {invoice.vatApplied && <div className="flex justify-between"><span>VAT</span><span>{formatCurrency(invoice.vatAmount)}</span></div>}
        <div className="flex justify-between font-semibold text-slate-900"><span>Total</span><span>{formatCurrency(invoice.total)}</span></div>
        <div className="flex justify-between"><span>Amount paid to date</span><span>{formatCurrency(invoice.amountPaid)}</span></div>
        <div className="flex justify-between font-semibold text-slate-900"><span>Balance due</span><span>{formatCurrency(invoice.balanceDue)}</span></div>
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
        <button
          onClick={handleSend}
          disabled={sendMutation.isPending || !customer?.email}
          title={!customer?.email ? 'Add a customer email to enable sending' : undefined}
          className="rounded bg-slate-100 px-3 py-2 text-sm disabled:opacity-50"
        >
          Send to Customer
        </button>
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
            {nextStatuses.includes('overdue') && (
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
