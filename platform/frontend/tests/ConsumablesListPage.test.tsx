import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { ConsumablesListPage } from '../src/pages/consumables/ConsumablesListPage.js';
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
        <ConsumablesListPage />
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

const baseConsumable = {
  id: '1', name: 'Standard Resin', category: 'resin', unitOfMeasure: 'ml', costPerUnit: 0.5,
  currentStock: 1000, reorderThreshold: null, supplier: null,
  createdAt: '2026-01-01T00:00:00.000Z',
};

describe('ConsumablesListPage', () => {
  it('lists consumables returned by the API', async () => {
    vi.spyOn(client, 'apiGet').mockResolvedValue({ ok: true, consumables: [baseConsumable] });
    renderPage();
    await waitFor(() => expect(screen.getByText('Standard Resin')).toBeInTheDocument());
  });

  it('shows an empty state when there are no consumables', async () => {
    vi.spyOn(client, 'apiGet').mockResolvedValue({ ok: true, consumables: [] });
    renderPage();
    await waitFor(() => expect(screen.getByText(/no consumables yet/i)).toBeInTheDocument());
  });

  it('shows an error message when the list fails to load', async () => {
    vi.spyOn(client, 'apiGet').mockRejectedValue(new client.ApiError('Something went wrong.', 500));
    renderPage();
    await waitFor(() => expect(screen.getByText(/couldn't load consumables/i)).toBeInTheDocument());
  });

  it('has a link to create a new consumable', async () => {
    vi.spyOn(client, 'apiGet').mockResolvedValue({ ok: true, consumables: [] });
    renderPage();
    await waitFor(() =>
      expect(screen.getByRole('link', { name: 'New Consumable' })).toHaveAttribute('href', '/consumables/new'),
    );
  });
});
