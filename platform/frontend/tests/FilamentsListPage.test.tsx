import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { FilamentsListPage } from '../src/pages/filaments/FilamentsListPage.js';
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
        <FilamentsListPage />
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

const baseFilament = {
  id: '1', brand: 'eSun', materialType: 'PLA', diameterMm: 1.75, colour: 'Black',
  costPerSpool: null, costPerKg: 300, spoolWeightGrams: null, remainingWeightGrams: null,
  supplier: null, purchaseDate: null, notes: null, lowStockThresholdGrams: null,
  createdAt: '2026-01-01T00:00:00.000Z',
};

describe('FilamentsListPage', () => {
  it('lists filaments returned by the API', async () => {
    vi.spyOn(client, 'apiGet').mockResolvedValue({ ok: true, filaments: [baseFilament] });
    renderPage();
    await waitFor(() => expect(screen.getByText('eSun')).toBeInTheDocument());
  });

  it('shows an empty state when there are no filaments', async () => {
    vi.spyOn(client, 'apiGet').mockResolvedValue({ ok: true, filaments: [] });
    renderPage();
    await waitFor(() => expect(screen.getByText(/no filaments yet/i)).toBeInTheDocument());
  });

  it('shows an error message when the list fails to load', async () => {
    vi.spyOn(client, 'apiGet').mockRejectedValue(new client.ApiError('Something went wrong.', 500));
    renderPage();
    await waitFor(() => expect(screen.getByText(/couldn't load filaments/i)).toBeInTheDocument());
  });

  it('has a link to create a new filament', async () => {
    vi.spyOn(client, 'apiGet').mockResolvedValue({ ok: true, filaments: [] });
    renderPage();
    await waitFor(() =>
      expect(screen.getByRole('link', { name: 'New Filament' })).toHaveAttribute('href', '/filaments/new'),
    );
  });

  it('shows an em-dash placeholder for a colour cleared to an empty string', async () => {
    vi.spyOn(client, 'apiGet').mockResolvedValue({
      ok: true,
      filaments: [{ ...baseFilament, id: '2', brand: 'Cleared Colour', colour: '' }],
    });
    renderPage();
    await waitFor(() => expect(screen.getByText('Cleared Colour')).toBeInTheDocument());
    const row = screen.getByText('Cleared Colour').closest('tr');
    expect(row).not.toBeNull();
    expect(row!.textContent).toContain('—');
  });

  it('shows an em-dash placeholder for a null colour', async () => {
    vi.spyOn(client, 'apiGet').mockResolvedValue({
      ok: true,
      filaments: [{ ...baseFilament, id: '3', brand: 'Null Colour', colour: null }],
    });
    renderPage();
    await waitFor(() => expect(screen.getByText('Null Colour')).toBeInTheDocument());
    const row = screen.getByText('Null Colour').closest('tr');
    expect(row).not.toBeNull();
    expect(row!.textContent).toContain('—');
  });
});
