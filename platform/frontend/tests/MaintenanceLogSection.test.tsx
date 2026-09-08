import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { MaintenanceLogSection } from '../src/components/printers/MaintenanceLogSection.js';
import * as client from '../src/api/client.js';
import { createTestQueryClient } from './helpers/queryClient.js';

beforeEach(() => {
  vi.restoreAllMocks();
});

function renderSection() {
  const queryClient = createTestQueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <MaintenanceLogSection printerId="printer-1" />
    </QueryClientProvider>,
  );
}

describe('MaintenanceLogSection', () => {
  it('lists maintenance log entries for the printer', async () => {
    vi.spyOn(client, 'apiGet').mockResolvedValue({
      ok: true,
      entries: [{ id: '1', date: '2026-02-01T00:00:00.000Z', description: 'Replaced nozzle', cost: 15, performedBy: 'Jane', createdAt: '2026-01-01T00:00:00.000Z' }],
    });
    renderSection();
    await waitFor(() => expect(screen.getByText(/Replaced nozzle/)).toBeInTheDocument());
    expect(screen.getByText('2026-02-01 — Replaced nozzle')).toBeInTheDocument();
  });

  it('creates a new maintenance log entry and clears the add form', async () => {
    vi.spyOn(client, 'apiGet').mockResolvedValue({ ok: true, entries: [] });
    const postSpy = vi.spyOn(client, 'apiPost').mockResolvedValue({
      ok: true,
      entry: { id: '2', date: '2026-03-01', description: 'Belt tension check', cost: null, performedBy: null, createdAt: '2026-01-01T00:00:00.000Z' },
    });
    renderSection();
    await waitFor(() => expect(screen.getByText(/no maintenance entries yet/i)).toBeInTheDocument());

    fireEvent.change(screen.getByLabelText('Date'), { target: { value: '2026-03-01' } });
    fireEvent.change(screen.getByLabelText('Description'), { target: { value: 'Belt tension check' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add Entry' }));

    await waitFor(() =>
      expect(postSpy).toHaveBeenCalledWith(
        '/api/printers/printer-1/maintenance-log',
        expect.objectContaining({ date: '2026-03-01', description: 'Belt tension check' }),
      ),
    );

    expect(screen.getByLabelText('Date')).toHaveValue('');
    expect(screen.getByLabelText('Description')).toHaveValue('');
  });

  it('sends a filled-in optional cost as a real number, not a string', async () => {
    vi.spyOn(client, 'apiGet').mockResolvedValue({ ok: true, entries: [] });
    const postSpy = vi.spyOn(client, 'apiPost').mockResolvedValue({
      ok: true,
      entry: { id: '3', date: '2026-04-01', description: 'Bed leveling', cost: 25, performedBy: null, createdAt: '2026-01-01T00:00:00.000Z' },
    });
    renderSection();
    await waitFor(() => expect(screen.getByText(/no maintenance entries yet/i)).toBeInTheDocument());

    fireEvent.change(screen.getByLabelText('Date'), { target: { value: '2026-04-01' } });
    fireEvent.change(screen.getByLabelText('Description'), { target: { value: 'Bed leveling' } });
    fireEvent.change(screen.getByLabelText('Cost'), { target: { value: '25' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add Entry' }));

    await waitFor(() => expect(postSpy).toHaveBeenCalled());
    const [, body] = postSpy.mock.calls[0];
    expect((body as Record<string, unknown>).cost).toBe(25);
  });
});
