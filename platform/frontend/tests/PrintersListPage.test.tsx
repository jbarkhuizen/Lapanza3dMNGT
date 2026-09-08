import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { PrintersListPage } from '../src/pages/printers/PrintersListPage.js';
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
        <PrintersListPage />
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

const basePrinter = {
  id: '1', name: 'Prusa MK4', make: 'Prusa', model: 'MK4', buildVolumeXMm: null,
  buildVolumeYMm: null, buildVolumeZMm: null, purchaseDate: null, purchaseCost: null,
  powerDrawWatts: null, electricityRatePerKwh: null, expectedLifetimeHours: null,
  status: 'active', createdAt: '2026-01-01T00:00:00.000Z',
};

describe('PrintersListPage', () => {
  it('lists printers returned by the API', async () => {
    vi.spyOn(client, 'apiGet').mockResolvedValue({ ok: true, printers: [basePrinter] });
    renderPage();
    await waitFor(() => expect(screen.getByText('Prusa MK4')).toBeInTheDocument());
  });

  it('shows an empty state when there are no printers', async () => {
    vi.spyOn(client, 'apiGet').mockResolvedValue({ ok: true, printers: [] });
    renderPage();
    await waitFor(() => expect(screen.getByText(/no printers yet/i)).toBeInTheDocument());
  });

  it('shows an error message when the list fails to load', async () => {
    vi.spyOn(client, 'apiGet').mockRejectedValue(new client.ApiError('Something went wrong.', 500));
    renderPage();
    await waitFor(() => expect(screen.getByText(/couldn't load printers/i)).toBeInTheDocument());
  });

  it('has a link to create a new printer', async () => {
    vi.spyOn(client, 'apiGet').mockResolvedValue({ ok: true, printers: [] });
    renderPage();
    await waitFor(() =>
      expect(screen.getByRole('link', { name: 'New Printer' })).toHaveAttribute('href', '/printers/new'),
    );
  });
});
