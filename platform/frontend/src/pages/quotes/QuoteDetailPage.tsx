import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuote, useUpdateQuoteStatus, useUpdateQuote, useConvertQuoteToInvoice, useSendQuote, VALID_QUOTE_STATUS_TRANSITIONS, QUOTE_STATUS_LABELS, type QuoteStatus } from '../../api/quotes.js';
import { useCustomerLookup } from '../../api/customers.js';
import { formatCurrency } from '../../lib/formatCurrency.js';
import { useDisplayCurrency } from '../../lib/useDisplayCurrency.js';
import { useSendDocument } from '../../lib/useSendDocument.js';
import { SendToCustomerButton } from '../../components/SendToCustomerButton.js';
import { FormField } from '../../components/FormField.js';
import { TextareaField } from '../../components/TextareaField.js';
import { ApiError } from '../../api/client.js';

export function QuoteDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { data: quote, isLoading, isError } = useQuote(id);
  const { lookup: customerLookup, isError: isCustomerLookupError } = useCustomerLookup();
  const currency = useDisplayCurrency();
  const updateStatusMutation = useUpdateQuoteStatus(id ?? '');
  const updateMutation = useUpdateQuote(id ?? '');
  const convertMutation = useConvertQuoteToInvoice(id ?? '');
  const sendMutation = useSendQuote(id ?? '');
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const handleSend = useSendDocument(sendMutation, quote?.number ?? '', setError, setSuccessMessage);

  const [isEditingDetails, setIsEditingDetails] = useState(false);
  const [notesDraft, setNotesDraft] = useState('');
  const [paymentTermsDraft, setPaymentTermsDraft] = useState('');
  const [termsDraft, setTermsDraft] = useState('');

  useEffect(() => {
    if (quote) {
      setNotesDraft(quote.notes ?? '');
      setPaymentTermsDraft(quote.paymentTerms ?? '');
      setTermsDraft(quote.termsAndConditionsText ?? '');
    }
  }, [quote?.notes, quote?.paymentTerms, quote?.termsAndConditionsText]);

  if (isLoading) {
    return <p className="text-slate-500">Loading…</p>;
  }
  if (isError || !quote) {
    return <p className="text-red-600">Couldn't load this quote.</p>;
  }

  const customer = customerLookup.get(quote.customerId);
  const customerDisplayName = isCustomerLookupError ? "Couldn't load customer" : (customer?.name ?? 'Unknown customer');
  const nextStatuses = VALID_QUOTE_STATUS_TRANSITIONS[quote.status] ?? [];

  async function handleStatusChange(status: QuoteStatus) {
    setError(null);
    setSuccessMessage(null);
    try {
      await updateStatusMutation.mutateAsync(status);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong. Try again shortly.');
    }
  }

  async function handleSaveDetails() {
    setError(null);
    setSuccessMessage(null);
    try {
      await updateMutation.mutateAsync({
        notes: notesDraft,
        paymentTerms: paymentTermsDraft,
        termsAndConditionsText: termsDraft,
      });
      setIsEditingDetails(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong. Try again shortly.');
    }
  }

  async function handleConvert() {
    setError(null);
    setSuccessMessage(null);
    try {
      const invoice = await convertMutation.mutateAsync();
      navigate(`/invoices/${invoice.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong. Try again shortly.');
    }
  }

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">{quote.number}</h1>
          <p className="text-sm text-slate-500">Issued {quote.createdAt.slice(0, 10)}</p>
        </div>
        <span className="rounded bg-slate-100 px-2 py-1 text-sm">{QUOTE_STATUS_LABELS[quote.status]}</span>
      </div>

      <section className="grid grid-cols-2 gap-4 text-sm">
        <div><div className="text-slate-500">Customer</div><div>{customerDisplayName}</div></div>
        <div><div className="text-slate-500">Valid until</div><div>{quote.validUntil?.slice(0, 10) ?? '—'}</div></div>
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
            {quote.lineItems?.map((line) => (
              <tr key={line.id}>
                <td className="py-1">{line.description}</td>
                <td className="py-1 text-right">{line.quantity}</td>
                <td className="py-1 text-right">{formatCurrency(line.unitPrice, currency)}</td>
                <td className="py-1 text-right">{formatCurrency(line.lineTotal, currency)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="flex justify-between border-t border-slate-200 pt-2"><span>Subtotal</span><span>{formatCurrency(quote.subtotal, currency)}</span></div>
        {Number(quote.discountAmount) > 0 && (
          <div className="flex justify-between"><span>Discount</span><span>- {formatCurrency(quote.discountAmount, currency)}</span></div>
        )}
        {quote.vatApplied && <div className="flex justify-between"><span>VAT (15%)</span><span>{formatCurrency(quote.vatAmount, currency)}</span></div>}
        <div className="flex justify-between font-semibold text-slate-900"><span>Total</span><span>{formatCurrency(quote.total, currency)}</span></div>
      </section>

      <section className="flex flex-col gap-3 border-t border-slate-200 pt-4 text-sm">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900">Notes & Terms</h2>
          {!isEditingDetails && (
            <button type="button" onClick={() => setIsEditingDetails(true)} className="text-sm text-slate-600 underline">
              Edit
            </button>
          )}
        </div>
        {isEditingDetails ? (
          <div className="flex flex-col gap-3">
            <TextareaField id="quoteNotes" label="Notes" value={notesDraft} onChange={setNotesDraft} rows={3} />
            <FormField
              id="quotePaymentTerms"
              label="Payment terms"
              value={paymentTermsDraft}
              onChange={(e) => setPaymentTermsDraft(e.target.value)}
            />
            <TextareaField
              id="quoteTerms"
              label="Terms & conditions"
              value={termsDraft}
              onChange={setTermsDraft}
              rows={3}
            />
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleSaveDetails}
                disabled={updateMutation.isPending}
                className="w-fit rounded bg-slate-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
              >
                Save
              </button>
              <button type="button" onClick={() => setIsEditingDetails(false)} className="w-fit rounded bg-slate-100 px-3 py-2 text-sm">
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <>
            {quote.notes && (
              <div>
                <div className="text-slate-500">Notes</div>
                <p className="whitespace-pre-wrap text-slate-700">{quote.notes}</p>
              </div>
            )}
            {quote.paymentTerms && (
              <div>
                <div className="text-slate-500">Payment terms</div>
                <p className="whitespace-pre-wrap text-slate-700">{quote.paymentTerms}</p>
              </div>
            )}
            {quote.termsAndConditionsText && (
              <div>
                <div className="text-slate-500">Terms & conditions</div>
                <p className="whitespace-pre-wrap text-slate-700">{quote.termsAndConditionsText}</p>
              </div>
            )}
          </>
        )}
      </section>

      {error && <p className="text-sm text-red-600">{error}</p>}
      {successMessage && <p className="text-sm text-green-700">{successMessage}</p>}

      <div className="flex gap-3">
        <SendToCustomerButton onSend={handleSend} isPending={sendMutation.isPending} hasCustomerEmail={!!customer?.email} />
        {nextStatuses.map((status) => (
          <button
            key={status}
            onClick={() => handleStatusChange(status)}
            disabled={updateStatusMutation.isPending}
            className="rounded bg-slate-100 px-3 py-2 text-sm disabled:opacity-50"
          >
            Mark as {QUOTE_STATUS_LABELS[status]}
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
