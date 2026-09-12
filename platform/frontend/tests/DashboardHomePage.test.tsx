import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { DashboardHomePage } from '../src/pages/DashboardHomePage.js';
import { AuthProvider } from '../src/context/AuthContext.js';
import * as client from '../src/api/client.js';
import { createTestQueryClient } from './helpers/queryClient.js';

beforeEach(() => {
  vi.restoreAllMocks();
});

// Every number here is intentionally distinct from every other -- the whole
// page renders at once, so a repeated value (e.g. openInvoicesCount equal to
// invoiceStatusCounts.unpaid) would make screen.getByText(...) match more
// than one element.
const dashboardSummary = {
  ok: true,
  revenueThisMonth: '1250.00',
  openInvoicesCount: 9,
  openQuotesCount: 3,
  paidInvoicesCount: 15,
  invoiceStatusCounts: { paid: 6, unpaid: 4, overdue: 2 },
  convertedQuotesCount: 5,
};

function mockReferenceData(overrides: Partial<typeof dashboardSummary> = {}) {
  vi.spyOn(client, 'apiGet').mockImplementation((path: string) => {
    if (path === '/api/auth/me') {
      return Promise.resolve({
        ok: true,
        tenant: { id: '1', businessName: 'Acme Prints', email: 'a@b.com', emailVerified: true, hasSubscription: true },
      });
    }
    if (path === '/api/reports/dashboard') {
      return Promise.resolve({ ...dashboardSummary, ...overrides });
    }
    return Promise.reject(new client.ApiError('not found', 404));
  });
}

// Each invoice-status row renders as <div class="flex flex-col gap-1"> containing
// [a label/count row, a track div wrapping a single filled bar div] -- walk down
// to that filled bar to assert its inline width style.
function getBarWidth(label: string): string {
  const rowWrapper = screen.getByText(label).closest('div')!.parentElement!;
  const barTrack = rowWrapper.children[1] as HTMLElement;
  const barFill = barTrack.firstElementChild as HTMLElement;
  return barFill.style.width;
}

function renderPage() {
  const queryClient = createTestQueryClient();
  return render(
    <MemoryRouter>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <DashboardHomePage />
        </AuthProvider>
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

describe('DashboardHomePage', () => {
  it('renders the welcome heading with the tenant business name', async () => {
    mockReferenceData();
    renderPage();
    await waitFor(() => expect(screen.getByText(/Welcome back, Acme Prints/)).toBeInTheDocument());
  });

  it('renders the stat cards from mocked GET /api/reports/dashboard', async () => {
    mockReferenceData();
    renderPage();
    await waitFor(() => expect(screen.getByText('Open Invoices')).toBeInTheDocument());
    expect(screen.getByText('9')).toBeInTheDocument();
    expect(screen.getByText('Open Quotes')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.getByText('Paid Invoices')).toBeInTheDocument();
    expect(screen.getByText('15')).toBeInTheDocument();
    expect(screen.getByText('R 1250.00')).toBeInTheDocument();
  });

  it('renders the invoice-status bars with counts and percentage widths', async () => {
    mockReferenceData();
    renderPage();
    await waitFor(() => expect(screen.getByText('Invoice status')).toBeInTheDocument());

    // 6 paid + 4 unpaid + 2 overdue = 12 total; paid = 50%, unpaid = 33%, overdue = 17% (rounded).
    expect(getBarWidth('Paid')).toBe('50%');
    expect(getBarWidth('Unpaid')).toBe('33%');
    expect(getBarWidth('Overdue')).toBe('17%');

    expect(screen.getByText('Converted Quotes')).toBeInTheDocument();
    expect(screen.getByText('5')).toBeInTheDocument();
  });

  it('shows a 0% bar with no invoices at all, without dividing by zero', async () => {
    mockReferenceData({ invoiceStatusCounts: { paid: 0, unpaid: 0, overdue: 0 } });
    renderPage();
    await waitFor(() => expect(screen.getByText('Invoice status')).toBeInTheDocument());
    expect(getBarWidth('Paid')).toBe('0%');
    expect(getBarWidth('Unpaid')).toBe('0%');
    expect(getBarWidth('Overdue')).toBe('0%');
  });

  it('shows an error message when the dashboard summary fails to load', async () => {
    vi.spyOn(client, 'apiGet').mockImplementation((path: string) => {
      if (path === '/api/auth/me') {
        return Promise.resolve({
          ok: true,
          tenant: { id: '1', businessName: 'Acme Prints', email: 'a@b.com', emailVerified: true, hasSubscription: true },
        });
      }
      return Promise.reject(new client.ApiError('Something went wrong.', 500));
    });
    renderPage();
    await waitFor(() => expect(screen.getByText("Couldn't load the dashboard. Try refreshing the page.")).toBeInTheDocument());
  });
});
