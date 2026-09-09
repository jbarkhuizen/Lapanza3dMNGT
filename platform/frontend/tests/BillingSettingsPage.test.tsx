import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { BillingSettingsPage } from '../src/pages/billing/BillingSettingsPage.js';
import * as client from '../src/api/client.js';
import { createTestQueryClient } from './helpers/queryClient.js';

beforeEach(() => {
  vi.restoreAllMocks();
});

const activeSubscription = {
  id: 's1', status: 'active', paymentProvider: 'payfast',
  trialEndsAt: '2026-09-22T00:00:00.000Z', currentPeriodEnd: '2026-10-22T00:00:00.000Z',
  plan: { id: 'p1', name: 'Tier 1', monthlyPrice: '25.00', sortOrder: 1 },
};

const canceledSubscription = {
  ...activeSubscription,
  id: 's2',
  status: 'canceled',
};

const lapsedSubscription = {
  ...activeSubscription,
  id: 's3',
  status: 'lapsed',
};

function renderPage() {
  const queryClient = createTestQueryClient();
  return render(
    <MemoryRouter>
      <QueryClientProvider client={queryClient}>
        <BillingSettingsPage />
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

describe('BillingSettingsPage', () => {
  it('shows the current plan and status', async () => {
    vi.spyOn(client, 'apiGet').mockResolvedValue({ ok: true, subscription: activeSubscription });
    renderPage();
    await waitFor(() => expect(screen.getByText('Tier 1')).toBeInTheDocument());
    expect(screen.getByText(/active/i)).toBeInTheDocument();
  });

  it('cancels the subscription when the cancel button is clicked', async () => {
    vi.spyOn(client, 'apiGet').mockResolvedValue({ ok: true, subscription: activeSubscription });
    const postSpy = vi.spyOn(client, 'apiPost').mockResolvedValue({ ok: true });
    renderPage();
    await waitFor(() => expect(screen.getByRole('button', { name: /cancel subscription/i })).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /cancel subscription/i }));
    await waitFor(() => expect(postSpy).toHaveBeenCalledWith('/api/billing/cancel'));
  });

  it('renders a link to /plans instead of the cancel button when the subscription is canceled', async () => {
    vi.spyOn(client, 'apiGet').mockResolvedValue({ ok: true, subscription: canceledSubscription });
    renderPage();
    await waitFor(() => expect(screen.getByText(/canceled/i)).toBeInTheDocument());
    const link = screen.getByRole('link', { name: /choose a plan/i });
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute('href', '/plans');
    expect(screen.queryByRole('button', { name: /cancel subscription/i })).not.toBeInTheDocument();
  });

  it('renders a link to /plans when the subscription is lapsed', async () => {
    vi.spyOn(client, 'apiGet').mockResolvedValue({ ok: true, subscription: lapsedSubscription });
    renderPage();
    await waitFor(() => expect(screen.getByText(/lapsed/i)).toBeInTheDocument());
    const link = screen.getByRole('link', { name: /choose a plan/i });
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute('href', '/plans');
  });
});
