import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { FormField } from '../../components/FormField.js';
import { TextareaField } from '../../components/TextareaField.js';
import { ApiError } from '../../api/client.js';
import { useCreateQuote, type DiscountAppliesTo, type QuoteLineItemInput } from '../../api/quotes.js';
import { useCustomers } from '../../api/customers.js';
import { useCostingTemplates } from '../../api/costingTemplates.js';
import { useCompanyProfile } from '../../api/companyProfile.js';

type LineMode = 'adhoc' | 'costingTemplate';
type DiscountMode = 'none' | DiscountAppliesTo;

interface LineItemDraft {
  mode: LineMode;
  costingTemplateId: string;
  description: string;
  unitPrice: string;
  quantity: string;
}

function blankLine(): LineItemDraft {
  return { mode: 'adhoc', costingTemplateId: '', description: '', unitPrice: '', quantity: '1' };
}

export function QuoteCreatePage() {
  const navigate = useNavigate();
  const { data: customers, isLoading: isLoadingCustomers } = useCustomers();
  const { data: costingTemplates, isLoading: isLoadingCostingTemplates } = useCostingTemplates();
  const { data: companyProfile } = useCompanyProfile();
  const createMutation = useCreateQuote();

  const [customerId, setCustomerId] = useState('');
  const [validUntil, setValidUntil] = useState('');
  const [notes, setNotes] = useState('');
  const [paymentTerms, setPaymentTerms] = useState('');
  const [termsAndConditionsText, setTermsAndConditionsText] = useState('');
  const [discountMode, setDiscountMode] = useState<DiscountMode>('none');
  const [discountPercent, setDiscountPercent] = useState('');
  const [lines, setLines] = useState<LineItemDraft[]>([]);
  const [error, setError] = useState<string | null>(null);
  // Pre-fill from the tenant's current defaults once, on load -- a one-time
  // snapshot for this new quote, same as the server does at creation time.
  // Only fills blank fields, so it doesn't clobber anything the user already typed.
  useEffect(() => {
    if (companyProfile) {
      setPaymentTerms((prev) => prev || (companyProfile.defaultPaymentTerms ?? ''));
      setTermsAndConditionsText((prev) => prev || (companyProfile.termsAndConditionsText ?? ''));
      setNotes((prev) => prev || (companyProfile.defaultNotes ?? ''));
    }
  }, [companyProfile]);

  function addLine() {
    setLines((prev) => [...prev, blankLine()]);
  }
  function updateLine(index: number, patch: Partial<LineItemDraft>) {
    setLines((prev) => prev.map((line, i) => (i === index ? { ...line, ...patch } : line)));
  }
  function removeLine(index: number) {
    setLines((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const lineItems: QuoteLineItemInput[] = lines.map((line) =>
      line.mode === 'costingTemplate'
        ? { costingTemplateId: line.costingTemplateId, quantity: Number(line.quantity) }
        : { description: line.description, unitPrice: Number(line.unitPrice), quantity: Number(line.quantity) },
    );
    try {
      const created = await createMutation.mutateAsync({
        customerId,
        validUntil: validUntil || undefined,
        notes: notes || undefined,
        paymentTerms: paymentTerms || undefined,
        termsAndConditionsText: termsAndConditionsText || undefined,
        discountAppliesTo: discountMode === 'none' ? undefined : discountMode,
        discountPercent: discountMode === 'none' || discountPercent === '' ? undefined : Number(discountPercent),
        lineItems,
      });
      navigate(`/quotes/${created.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong. Try again shortly.');
    }
  }

  const isLoadingReferenceData = isLoadingCustomers || isLoadingCostingTemplates;

  return (
    <form onSubmit={handleSubmit} className="flex max-w-xl flex-col gap-4">
      <h1 className="text-2xl font-semibold text-slate-900">New Quote</h1>

      <div className="flex flex-col gap-1">
        <label htmlFor="customerId" className="text-sm font-medium text-slate-700">Customer</label>
        <select
          id="customerId"
          value={customerId}
          onChange={(e) => setCustomerId(e.target.value)}
          disabled={isLoadingCustomers}
          required
          className="rounded border border-slate-300 px-3 py-2 text-sm"
        >
          <option value="" disabled>Select a customer…</option>
          {customers?.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
      </div>

      <FormField id="validUntil" label="Valid until (optional)" type="date" value={validUntil} onChange={(e) => setValidUntil(e.target.value)} />

      <TextareaField id="notes" label="Notes (optional)" value={notes} onChange={setNotes} rows={3} />

      <FormField
        id="paymentTerms"
        label="Payment terms (optional)"
        value={paymentTerms}
        onChange={(e) => setPaymentTerms(e.target.value)}
      />
      <TextareaField
        id="termsAndConditionsText"
        label="Terms & conditions (optional)"
        value={termsAndConditionsText}
        onChange={setTermsAndConditionsText}
        rows={3}
      />

      <div className="flex flex-col gap-2">
        <label htmlFor="discountMode" className="text-sm font-medium text-slate-700">Discount</label>
        <select
          id="discountMode"
          value={discountMode}
          onChange={(e) => setDiscountMode(e.target.value as DiscountMode)}
          className="rounded border border-slate-300 px-3 py-2 text-sm"
        >
          <option value="none">None</option>
          <option value="total">Invoice total</option>
          <option value="per_line">Per line item</option>
        </select>
        {discountMode !== 'none' && (
          <FormField
            id="discountPercent"
            label="Discount percent"
            type="number"
            min={0}
            max={100}
            value={discountPercent}
            onChange={(e) => setDiscountPercent(e.target.value)}
          />
        )}
      </div>

      <section className="flex flex-col gap-4 border-t border-slate-200 pt-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900">Line items</h2>
          <button type="button" onClick={addLine} className="rounded bg-slate-100 px-3 py-1 text-sm">
            Add Line Item
          </button>
        </div>
        {lines.map((line, i) => (
          <div key={i} className="flex flex-col gap-2 rounded border border-slate-200 p-3">
            <div className="flex gap-4 text-sm">
              <label className="flex items-center gap-1">
                <input
                  type="radio"
                  name={`lineMode-${i}`}
                  checked={line.mode === 'adhoc'}
                  onChange={() => updateLine(i, { mode: 'adhoc' })}
                />
                Ad-hoc description
              </label>
              <label className="flex items-center gap-1">
                <input
                  type="radio"
                  name={`lineMode-${i}`}
                  checked={line.mode === 'costingTemplate'}
                  onChange={() => updateLine(i, { mode: 'costingTemplate' })}
                  disabled={isLoadingCostingTemplates || !costingTemplates?.length}
                />
                From a costing template
              </label>
            </div>
            {line.mode === 'adhoc' ? (
              <>
                <FormField
                  id={`description-${i}`}
                  label="Description"
                  value={line.description}
                  onChange={(e) => updateLine(i, { description: e.target.value })}
                  required
                />
                <FormField
                  id={`unitPrice-${i}`}
                  label="Unit price"
                  type="number"
                  value={line.unitPrice}
                  onChange={(e) => updateLine(i, { unitPrice: e.target.value })}
                  required
                />
              </>
            ) : (
              <div className="flex flex-col gap-1">
                <label htmlFor={`costingTemplate-${i}`} className="text-sm font-medium text-slate-700">Costing template</label>
                <select
                  id={`costingTemplate-${i}`}
                  value={line.costingTemplateId}
                  onChange={(e) => updateLine(i, { costingTemplateId: e.target.value })}
                  required
                  className="rounded border border-slate-300 px-3 py-2 text-sm"
                >
                  <option value="" disabled>Select a costing template…</option>
                  {costingTemplates?.map((ct) => (
                    <option key={ct.id} value={ct.id}>{ct.name}</option>
                  ))}
                </select>
              </div>
            )}
            <FormField
              id={`quantity-${i}`}
              label="Quantity"
              type="number"
              value={line.quantity}
              onChange={(e) => updateLine(i, { quantity: e.target.value })}
              required
            />
            <button type="button" onClick={() => removeLine(i)} className="w-fit text-sm text-red-600">Remove</button>
          </div>
        ))}
      </section>

      {error && <p className="text-sm text-red-600">{error}</p>}
      <button
        type="submit"
        disabled={createMutation.isPending || isLoadingReferenceData || lines.length === 0}
        className="w-fit rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
      >
        Create Quote
      </button>
    </form>
  );
}
