import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiGet, apiPatch, apiPost } from './client.js';
import type { SendDocumentResponse } from './sendDocument.js';

export type { SendDocumentResponse } from './sendDocument.js';

export type QuoteStatus = 'draft' | 'sent' | 'accepted' | 'expired';

export interface QuoteLineItem {
  id: string;
  costingTemplateId: string | null;
  description: string;
  quantity: number;
  unitPrice: string;
  lineTotal: string;
}

export interface Quote {
  id: string;
  number: string;
  customerId: string;
  status: QuoteStatus;
  validUntil: string | null;
  vatApplied: boolean;
  subtotal: string;
  vatAmount: string;
  total: string;
  notes: string | null;
  createdAt: string;
  lineItems?: QuoteLineItem[];
}

export interface QuoteLineItemInput {
  costingTemplateId?: string;
  description?: string;
  unitPrice?: number;
  quantity: number;
}

export interface QuoteFormInput {
  customerId: string;
  validUntil?: string;
  notes?: string;
  lineItems: QuoteLineItemInput[];
}

// Verbatim copy of VALID_STATUS_TRANSITIONS from platform/api/src/routes/quotes.ts.
export const VALID_QUOTE_STATUS_TRANSITIONS: Record<string, QuoteStatus[]> = {
  draft: ['sent', 'expired'],
  sent: ['accepted', 'expired'],
};

// Single source of truth for human-readable status text — shared by QuoteDetailPage
// and QuotesListPage so the list no longer shows raw enum text (backlog #52).
export const QUOTE_STATUS_LABELS: Record<QuoteStatus, string> = {
  draft: 'Draft',
  sent: 'Sent',
  accepted: 'Accepted',
  expired: 'Expired',
};

export const QUOTES_QUERY_KEY = ['quotes'] as const;

export function useQuotes() {
  return useQuery({
    queryKey: QUOTES_QUERY_KEY,
    queryFn: () => apiGet<{ quotes: Quote[] }>('/api/quotes').then((r) => r.quotes),
  });
}

export function useQuote(id: string | undefined) {
  return useQuery({
    queryKey: [...QUOTES_QUERY_KEY, id],
    queryFn: () => apiGet<{ quote: Quote }>(`/api/quotes/${id}`).then((r) => r.quote),
    enabled: id !== undefined,
  });
}

export function useCreateQuote() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: QuoteFormInput) => apiPost<{ quote: Quote }>('/api/quotes', data).then((r) => r.quote),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUOTES_QUERY_KEY });
    },
  });
}

export function useUpdateQuoteStatus(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (status: QuoteStatus) =>
      apiPatch<{ quote: Quote }>(`/api/quotes/${id}/status`, { status }).then((r) => r.quote),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUOTES_QUERY_KEY });
    },
  });
}

export function useConvertQuoteToInvoice(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => apiPost<{ invoice: { id: string } }>(`/api/quotes/${id}/convert-to-invoice`).then((r) => r.invoice),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUOTES_QUERY_KEY });
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
    },
  });
}

export function useSendQuote(id: string) {
  return useMutation({
    mutationFn: () => apiPost<SendDocumentResponse>(`/api/quotes/${id}/send`),
  });
}
