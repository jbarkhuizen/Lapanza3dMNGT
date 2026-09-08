import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { BillingCompletePage } from '../src/pages/billing/BillingCompletePage.js';
import * as client from '../src/api/client.js';
import { createTestQueryClient } from './helpers/queryClient.js';

beforeEach(() => {
  vi.restoreAllMocks();
});

function renderPage() {
  const queryClient = createTestQueryClient();
  return render(
    <MemoryRouter initialEntries={['/billing/complete']}>
      <QueryClientProvider client={queryClient}>
        <Routes>
          <Route path="/billing/complete" element={<BillingCompletePage />} />
          <Route path="/" element={<div>dashboard</div>} />
        </Routes>
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

describe('BillingCompletePage', () => {
  it('shows a confirmation once the subscription is active', async () => {
    vi.spyOn(client, 'apiGet').mockResolvedValue({
      ok: true,
      subscription: { id: 's1', status: 'trialing', paymentProvider: 'payfast', trialEndsAt: '2026-09-22T00:00:00.000Z', currentPeriodEnd: null, plan: { id: 'p1', name: 'Tier 1', monthlyPrice: '25.00', sortOrder: 1 } },
    });
    renderPage();
    await waitFor(() => expect(screen.getByText(/trial/i)).toBeInTheDocument());
  });
});
