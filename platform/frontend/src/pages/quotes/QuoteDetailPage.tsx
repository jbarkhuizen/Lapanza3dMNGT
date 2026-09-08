import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuote, useUpdateQuoteStatus, useConvertQuoteToInvoice, useSendQuote, VALID_QUOTE_STATUS_TRANSITIONS, type QuoteStatus } from '../../api/quotes.js';
import { useCustomerLookup } from '../../api/customers.js';
import { formatCurrency } from '../../lib/formatCurrency.js';
import { downloadBase64Pdf } from '../../lib/downloadPdf.js';
import { ApiError } from '../../api/client.js';

const STATUS_LABELS: Record<QuoteStatus, string> = {
  draft: 'Draft',
  sent: 'Sent',
  accepted: 'Accepted',
  expired: 'Expired',
};

export function QuoteDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { data: quote, isLoading, isError } = useQuote(id);
  const { lookup: customerLookup } = useCustomerLookup();
  const updateStatusMutation = useUpdateQuoteStatus(id ?? '');
  const convertMutation = useConvertQuoteToInvoice(id ?? '');
  const sendMutation = useSendQuote(id ?? '');
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  if (isLoading) {
    return <p className="text-slate-500">Loading…</p>;
  }
  if (isError || !quote) {
    return <p className="text-red-600">Couldn't load this quote.</p>;
  }

  const customer = customerLookup.get(quote.customerId);
  const nextStatuses = VALID_QUOTE_STATUS_TRANSITIONS[quote.status] ?? [];
  const quoteNumber = quote.number;

  async function handleStatusChange(status: QuoteStatus) {
    setError(null);
    try {
      await updateStatusMutation.mutateAsync(status);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong. Try again shortly.');
    }
  }

  async function handleConvert() {
    setError(null);
    try {
      const invoice = await convertMutation.mutateAsync();
      navigate(`/invoices/${invoice.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong. Try again shortly.');
    }
  }

  async function handleSend() {
    setError(null);
    setSuccessMessage(null);
    try {
      const result = await sendMutation.mutateAsync();
      downloadBase64Pdf(result.pdfBase64, `${quoteNumber}.pdf`);
      setSuccessMessage(
        result.devMode
          ? `Emailed to ${result.sentTo} (dev mode — check server console for the email log).`
          : `Emailed to ${result.sentTo}.`,
      );
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong. Try again shortly.');
    }
  }

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-slate-900">{quote.number}</h1>
        <span className="rounded bg-slate-100 px-2 py-1 text-sm">{STATUS_LABELS[quote.status]}</span>
      </div>

      <section className="grid grid-cols-2 gap-4 text-sm">
        <div><div className="text-slate-500">Customer</div><div>{customer?.name ?? 'Unknown customer'}</div></div>
        <div><div className="text-slate-500">Valid until</div><div>{quote.validUntil?.slice(0, 10) ?? '—'}</div></div>
      </section>

      <section className="flex flex-col gap-2 border-t border-slate-200 pt-4 text-sm">
        <h2 className="text-lg font-semibold text-slate-900">Line items</h2>
        {quote.lineItems?.map((line) => (
          <div key={line.id} className="flex justify-between">
            <span>
              <span>{line.description}</span> × {line.quantity}
            </span>
            <span>{formatCurrency(line.lineTotal)}</span>
          </div>
        ))}
        <div className="flex justify-between border-t border-slate-200 pt-2"><span>Subtotal</span><span>{formatCurrency(quote.subtotal)}</span></div>
        {quote.vatApplied && <div className="flex justify-between"><span>VAT</span><span>{formatCurrency(quote.vatAmount)}</span></div>}
        <div className="flex justify-between font-semibold text-slate-900"><span>Total</span><span>{formatCurrency(quote.total)}</span></div>
      </section>

      {quote.notes && (
        <section className="flex flex-col gap-2 border-t border-slate-200 pt-4 text-sm">
          <h2 className="text-lg font-semibold text-slate-900">Notes</h2>
          <p className="whitespace-pre-wrap text-slate-700">{quote.notes}</p>
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
        {nextStatuses.map((status) => (
          <button
            key={status}
            onClick={() => handleStatusChange(status)}
            disabled={updateStatusMutation.isPending}
            className="rounded bg-slate-100 px-3 py-2 text-sm disabled:opacity-50"
          >
            Mark as {STATUS_LABELS[status]}
          </button>
        ))}
        {quote.status === 'accepted' && (
          <button
            onClick={handleConvert}
            disabled={convertMutation.isPending}
            className="rounded bg-slate-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            Convert to Invoice
          </button>
        )}
      </div>
    </div>
  );
}
