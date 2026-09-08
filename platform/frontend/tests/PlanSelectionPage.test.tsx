import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { PlanSelectionPage } from '../src/pages/billing/PlanSelectionPage.js';
import * as client from '../src/api/client.js';
import { createTestQueryClient } from './helpers/queryClient.js';

beforeEach(() => {
  vi.restoreAllMocks();
});

const plans = [
  { id: 'p1', name: 'Tier 1', monthlyPrice: '25.00', sortOrder: 1 },
  { id: 'p2', name: 'Tier 2', monthlyPrice: '45.00', sortOrder: 2 },
  { id: 'p3', name: 'Tier 3', monthlyPrice: '70.00', sortOrder: 3 },
];

function renderPage() {
  const queryClient = createTestQueryClient();
  return render(
    <MemoryRouter>
      <QueryClientProvider client={queryClient}>
        <PlanSelectionPage />
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

describe('PlanSelectionPage', () => {
  it('renders all 3 plans with their prices', async () => {
    vi.spyOn(client, 'apiGet').mockResolvedValue({ ok: true, plans });
    renderPage();
    await waitFor(() => expect(screen.getByText('Tier 1')).toBeInTheDocument());
    expect(screen.getByText('Tier 2')).toBeInTheDocument();
    expect(screen.getByText('Tier 3')).toBeInTheDocument();
    expect(screen.getByText(/25\.00/)).toBeInTheDocument();
  });

  it('lets the tenant pick a plan and a provider, and redirects the browser on checkout', async () => {
    vi.spyOn(client, 'apiGet').mockResolvedValue({ ok: true, plans });
    const postSpy = vi.spyOn(client, 'apiPost').mockResolvedValue({ redirectUrl: 'https://sandbox.payfast.co.za/eng/process?x=1' });

    const originalLocation = window.location;
    // @ts-expect-error -- test-only override to observe the redirect
    delete window.location;
    // @ts-expect-error -- test-only override
    window.location = { ...originalLocation, href: '' };

    try {
      renderPage();
      await waitFor(() => expect(screen.getByText('Tier 1')).toBeInTheDocument());

      fireEvent.click(screen.getAllByRole('button', { name: /start free trial/i })[0]);

      await waitFor(() => expect(postSpy).toHaveBeenCalledWith('/api/billing/checkout', { planId: 'p1', provider: 'payfast' }));
      await waitFor(() => expect(window.location.href).toBe('https://sandbox.payfast.co.za/eng/process?x=1'));
    } finally {
      // @ts-expect-error -- restore
      window.location = originalLocation;
    }
  });
});
