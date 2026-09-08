import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiGet, apiPatch } from './client.js';

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
