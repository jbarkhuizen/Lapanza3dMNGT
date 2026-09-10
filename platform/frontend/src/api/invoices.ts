import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiGet, apiPatch, apiPost } from './client.js';
import type { SendDocumentResponse } from './sendDocument.js';

export type { SendDocumentResponse } from './sendDocument.js';

export type InvoiceStatus = 'unpaid' | 'partially_paid' | 'paid' | 'overdue';

export interface InvoiceLineItem {
  id: string;
  costingTemplateId: string | null;
  quoteLineItemId: string | null;
  description: string;
  quantity: number;
  unitPrice: string;
  lineTotal: string;
}

export interface Invoice {
  id: string;
  number: string;
  customerId: string;
  quoteId: string | null;
  status: InvoiceStatus;
  dueDate: string;
  vatApplied: boolean;
  subtotal: string;
  vatAmount: string;
  total: string;
  amountPaid: string;
  balanceDue: string;
  notes: string | null;
  createdAt: string;
  lineItems?: InvoiceLineItem[];
}

export const VALID_INVOICE_STATUS_TRANSITIONS: Record<string, InvoiceStatus[]> = {
  unpaid: ['partially_paid', 'paid', 'overdue'],
  partially_paid: ['partially_paid', 'paid', 'overdue'],
  overdue: ['overdue', 'partially_paid', 'paid'],
  paid: [],
};

// Single source of truth for human-readable status text — shared by InvoiceDetailPage
// and InvoicesListPage so the list no longer shows raw enum text (backlog #52).
export const INVOICE_STATUS_LABELS: Record<InvoiceStatus, string> = {
  unpaid: 'Unpaid',
  partially_paid: 'Partially Paid',
  paid: 'Paid',
  overdue: 'Overdue',
};

const INVOICES_QUERY_KEY = ['invoices'] as const;

export function useInvoices() {
  return useQuery({
    queryKey: INVOICES_QUERY_KEY,
    queryFn: () => apiGet<{ invoices: Invoice[] }>('/api/invoices').then((r) => r.invoices),
  });
}

export function useInvoice(id: string | undefined) {
  return useQuery({
    queryKey: [...INVOICES_QUERY_KEY, id],
    queryFn: () => apiGet<{ invoice: Invoice }>(`/api/invoices/${id}`).then((r) => r.invoice),
    enabled: id !== undefined,
  });
}

export function useUpdateInvoiceStatus(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ status, amountPaid }: { status: InvoiceStatus; amountPaid?: number }) =>
      apiPatch<{ invoice: Invoice }>(`/api/invoices/${id}/status`, { status, amountPaid }).then((r) => r.invoice),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: INVOICES_QUERY_KEY });
    },
  });
}

export function useSendInvoice(id: string) {
  return useMutation({
    mutationFn: () => apiPost<SendDocumentResponse>(`/api/invoices/${id}/send`),
  });
}
