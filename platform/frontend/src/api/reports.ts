import { useQuery } from '@tanstack/react-query';
import { apiGet } from './client.js';

export interface OverdueInvoiceSummary {
  id: string;
  number: string;
  customerId: string;
  total: string;
  balanceDue: string;
  dueDate: string;
  [key: string]: unknown;
}

export interface LowStockItem {
  kind: 'filament' | 'consumable';
  id: string;
  name: string;
  remaining: number;
  threshold: number;
}

export interface ReportsSummary {
  totalRevenue: string;
  openQuotesCount: number;
  overdueInvoices: OverdueInvoiceSummary[];
  lowStockItems: LowStockItem[];
  jobsInProgress: number;
}

export function useReportsSummary() {
  return useQuery({
    queryKey: ['reports', 'summary'],
    queryFn: () => apiGet<{ ok: true } & ReportsSummary>('/api/reports/summary'),
  });
}

export interface InvoiceStatusCounts {
  paid: number;
  unpaid: number;
  overdue: number;
}

export interface DashboardSummary {
  revenueThisMonth: string;
  openInvoicesCount: number;
  openQuotesCount: number;
  paidInvoicesCount: number;
  invoiceStatusCounts: InvoiceStatusCounts;
  convertedQuotesCount: number;
}

export function useDashboardSummary() {
  return useQuery({
    queryKey: ['reports', 'dashboard'],
    queryFn: () => apiGet<{ ok: true } & DashboardSummary>('/api/reports/dashboard'),
  });
}
