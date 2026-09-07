import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { LabourStepsListPage } from '../src/pages/labourSteps/LabourStepsListPage.js';
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
        <LabourStepsListPage />
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

describe('LabourStepsListPage', () => {
  it('lists labour steps returned by the API', async () => {
    vi.spyOn(client, 'apiGet').mockResolvedValue({
      ok: true,
      labourSteps: [{ id: '1', name: 'Slicing', hourlyRate: 150, active: true, createdAt: '2026-01-01T00:00:00.000Z' }],
    });
    renderPage();
    await waitFor(() => expect(screen.getByText('Slicing')).toBeInTheDocument());
  });

  it('shows an empty state when there are no labour steps', async () => {
    vi.spyOn(client, 'apiGet').mockResolvedValue({ ok: true, labourSteps: [] });
    renderPage();
    await waitFor(() => expect(screen.getByText(/no labour steps yet/i)).toBeInTheDocument());
  });

  it('shows an error message when the list fails to load', async () => {
    vi.spyOn(client, 'apiGet').mockRejectedValue(new client.ApiError('Something went wrong.', 500));
    renderPage();
    await waitFor(() => expect(screen.getByText(/couldn't load labour steps/i)).toBeInTheDocument());
  });

  it('has a link to create a new labour step', async () => {
    vi.spyOn(client, 'apiGet').mockResolvedValue({ ok: true, labourSteps: [] });
    renderPage();
    await waitFor(() =>
      expect(screen.getByRole('link', { name: 'New Labour Step' })).toHaveAttribute('href', '/labour-steps/new'),
    );
  });
});
