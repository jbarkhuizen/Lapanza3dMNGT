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
});
