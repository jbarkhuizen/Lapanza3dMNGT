import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { JobCardsListPage } from '../src/pages/jobCards/JobCardsListPage.js';
import * as client from '../src/api/client.js';
import { createTestQueryClient } from './helpers/queryClient.js';

beforeEach(() => {
  vi.restoreAllMocks();
});

function renderPage() {
  const queryClient = createTestQueryClient();
  return render(
    <MemoryRouter>
      <QueryClientProvider client={queryClient}>
        <JobCardsListPage />
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

function baseJobCard(overrides: Record<string, unknown> = {}) {
  return {
    id: '1',
    number: 'JC-0001',
    cardType: 'repair',
    customerId: 'cust-1',
    jobTitle: 'Fix extruder',
    status: 'new',
    priority: 'normal',
    assignedTo: null,
    receivedDate: '2026-09-13T00:00:00.000Z',
    requiredBy: '2026-09-20T00:00:00.000Z',
    notes: null,
    terms: null,
    receivedBy: null,
    quoteId: null,
    createdAt: '2026-09-13T00:00:00.000Z',
    ...overrides,
  };
}

function mockApiGet(overrides: {
  jobCards?: unknown[];
  stats?: Record<string, number>;
  customers?: unknown[];
}) {
  vi.spyOn(client, 'apiGet').mockImplementation((path: string) => {
    if (path === '/api/job-cards') {
      return Promise.resolve({ ok: true, jobCards: overrides.jobCards ?? [] });
    }
    if (path === '/api/job-cards/stats') {
      return Promise.resolve({ ok: true, dueSoon: 0, awaitingQuote: 0, quoted: 0, invoiced: 0, ...overrides.stats });
    }
    if (path === '/api/customers') {
      return Promise.resolve({ ok: true, customers: overrides.customers ?? [] });
    }
    return Promise.reject(new client.ApiError('not found', 404));
  });
}

describe('JobCardsListPage', () => {
  it('lists job cards returned by the API, with the resolved customer name', async () => {
    mockApiGet({
      jobCards: [baseJobCard()],
      customers: [{ id: 'cust-1', name: 'Bob Client', company: null, email: null, phone: null, billingAddress: '1 Oak St', deliveryAddress: null, vatNumber: null, notes: null, createdAt: '2026-01-01T00:00:00.000Z' }],
    });
    renderPage();
    await waitFor(() => expect(screen.getByText('JC-0001')).toBeInTheDocument());
    expect(screen.getByText('Fix extruder')).toBeInTheDocument();
    expect(screen.getByText('Bob Client')).toBeInTheDocument();
  });

  it('renders the 4-stat row from mocked GET /api/job-cards/stats', async () => {
    mockApiGet({ stats: { dueSoon: 2, awaitingQuote: 3, quoted: 4, invoiced: 1 } });
    renderPage();
    await waitFor(() => expect(screen.getByText('Due Soon')).toBeInTheDocument());
    expect(screen.getByText('Awaiting Quote')).toBeInTheDocument();
    expect(screen.getByText('Quoted')).toBeInTheDocument();
    expect(screen.getByText('Invoiced')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.getByText('4')).toBeInTheDocument();
    expect(screen.getByText('1')).toBeInTheDocument();
  });

  it('shows an empty state when there are no job cards', async () => {
    mockApiGet({});
    renderPage();
    await waitFor(() => expect(screen.getByText(/no job cards yet/i)).toBeInTheDocument());
  });

  it('has a New job card button that opens a type picker with three links', async () => {
    mockApiGet({});
    renderPage();
    await waitFor(() => expect(screen.getByRole('button', { name: 'New job card' })).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'New job card' }));
    expect(screen.getByRole('link', { name: 'Repair' })).toHaveAttribute('href', '/job-cards/new?type=repair');
    expect(screen.getByRole('link', { name: 'Print job' })).toHaveAttribute('href', '/job-cards/new?type=print');
    expect(screen.getByRole('link', { name: 'CAD job' })).toHaveAttribute('href', '/job-cards/new?type=cad');
  });

  it('shows an error message when the job cards query fails', async () => {
    vi.spyOn(client, 'apiGet').mockRejectedValue(new client.ApiError('Something went wrong.', 500));
    renderPage();
    await waitFor(() => expect(screen.getByText(/couldn't load job cards/i)).toBeInTheDocument());
  });
});
