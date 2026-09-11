import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { ReportsPage } from '../src/pages/reports/ReportsPage.js';
import * as client from '../src/api/client.js';
import { createTestQueryClient } from './helpers/queryClient.js';

beforeEach(() => {
  vi.restoreAllMocks();
});

const summary = {
  ok: true,
  totalRevenue: '1250.00',
  openQuotesCount: 3,
  overdueInvoices: [
    { id: 'inv-1', number: 'INV-0001', customerId: 'c1', total: '75.00', balanceDue: '75.00', dueDate: '2026-01-01T00:00:00.000Z' },
  ],
  lowStockItems: [
    { kind: 'filament', id: 'f1', name: 'eSun PLA', remaining: 30, threshold: 100 },
  ],
  jobsInProgress: 2,
};

function renderPage() {
  const queryClient = createTestQueryClient();
  return render(
    <MemoryRouter>
      <QueryClientProvider client={queryClient}>
        <ReportsPage />
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

describe('ReportsPage', () => {
  it('renders summary data from a mocked apiGet', async () => {
    vi.spyOn(client, 'apiGet').mockImplementation((path: string) => {
      if (path === '/api/reports/summary') {
        return Promise.resolve(summary);
      }
      return Promise.reject(new client.ApiError('not found', 404));
    });

    renderPage();

    await waitFor(() => expect(screen.getByText('R 1250.00')).toBeInTheDocument());
    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.getByText('INV-0001')).toBeInTheDocument();
    expect(screen.getByText('eSun PLA')).toBeInTheDocument();
    expect(screen.getByText('30 / 100')).toBeInTheDocument();
  });

  it('shows empty-state copy when there are no overdue invoices or low-stock items', async () => {
    vi.spyOn(client, 'apiGet').mockImplementation((path: string) => {
      if (path === '/api/reports/summary') {
        return Promise.resolve({ ...summary, overdueInvoices: [], lowStockItems: [] });
      }
      return Promise.reject(new client.ApiError('not found', 404));
    });

    renderPage();

    await waitFor(() => expect(screen.getByText('No overdue invoices.')).toBeInTheDocument());
    expect(screen.getByText('Nothing running low.')).toBeInTheDocument();
  });

  it('shows an error message when the summary fails to load', async () => {
    vi.spyOn(client, 'apiGet').mockRejectedValue(new client.ApiError('Something went wrong.', 500));
    renderPage();
    await waitFor(() => expect(screen.getByText("Couldn't load reports. Try refreshing the page.")).toBeInTheDocument());
  });
});
