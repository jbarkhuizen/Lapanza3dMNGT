interface SendToCustomerButtonProps {
  onSend: () => void;
  isPending: boolean;
  hasCustomerEmail: boolean;
}

/**
 * Shared "Send to Customer" button for QuoteDetailPage/InvoiceDetailPage (backlog #54)
 * — the JSX was previously duplicated near-verbatim across both pages.
 */
export function SendToCustomerButton({ onSend, isPending, hasCustomerEmail }: SendToCustomerButtonProps) {
  return (
    <button
      onClick={onSend}
      disabled={isPending || !hasCustomerEmail}
      title={!hasCustomerEmail ? 'Add a customer email to enable sending' : undefined}
      className="rounded bg-slate-100 px-3 py-2 text-sm disabled:opacity-50"
    >
      Send to Customer
    </button>
  );
}
