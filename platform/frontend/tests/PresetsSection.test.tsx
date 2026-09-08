import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { PresetsSection } from '../src/components/printers/PresetsSection.js';
import * as client from '../src/api/client.js';
import { createTestQueryClient } from './helpers/queryClient.js';

beforeEach(() => {
  vi.restoreAllMocks();
});

function renderSection() {
  const queryClient = createTestQueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <PresetsSection printerId="printer-1" />
    </QueryClientProvider>,
  );
}

describe('PresetsSection', () => {
  it('lists presets for the printer', async () => {
    vi.spyOn(client, 'apiGet').mockResolvedValue({
      ok: true,
      presets: [{ id: '1', name: 'PLA — Standard', materialType: 'PLA', nozzleTempC: 210, bedTempC: 60, printSpeedMmS: null, layerHeightMm: null, infillPercent: null, notes: null, createdAt: '2026-01-01T00:00:00.000Z' }],
    });
    renderSection();
    await waitFor(() => expect(screen.getByText('PLA — Standard')).toBeInTheDocument());
  });

  it('creates a new preset and clears the add form', async () => {
    vi.spyOn(client, 'apiGet').mockResolvedValue({ ok: true, presets: [] });
    const postSpy = vi.spyOn(client, 'apiPost').mockResolvedValue({
      ok: true,
      preset: { id: '2', name: 'PETG', materialType: 'PETG', nozzleTempC: null, bedTempC: null, printSpeedMmS: null, layerHeightMm: null, infillPercent: null, notes: null, createdAt: '2026-01-01T00:00:00.000Z' },
    });
    renderSection();
    await waitFor(() => expect(screen.getByText(/no presets yet/i)).toBeInTheDocument());

    fireEvent.change(screen.getByLabelText('Preset name'), { target: { value: 'PETG' } });
    fireEvent.change(screen.getByLabelText('Material type'), { target: { value: 'PETG' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add Preset' }));

    await waitFor(() =>
      expect(postSpy).toHaveBeenCalledWith(
        '/api/printers/printer-1/presets',
        expect.objectContaining({ name: 'PETG', materialType: 'PETG' }),
      ),
    );

    expect(screen.getByLabelText('Preset name')).toHaveValue('');
    expect(screen.getByLabelText('Material type')).toHaveValue('');
  });

  it('sends numeric preset fields as numbers, not strings', async () => {
    vi.spyOn(client, 'apiGet').mockResolvedValue({ ok: true, presets: [] });
    const postSpy = vi.spyOn(client, 'apiPost').mockResolvedValue({
      ok: true,
      preset: { id: '3', name: 'PLA — Fast', materialType: 'PLA', nozzleTempC: 210, bedTempC: null, printSpeedMmS: null, layerHeightMm: null, infillPercent: null, notes: null, createdAt: '2026-01-01T00:00:00.000Z' },
    });
    renderSection();
    await waitFor(() => expect(screen.getByText(/no presets yet/i)).toBeInTheDocument());

    fireEvent.change(screen.getByLabelText('Preset name'), { target: { value: 'PLA — Fast' } });
    fireEvent.change(screen.getByLabelText('Material type'), { target: { value: 'PLA' } });
    fireEvent.change(screen.getByLabelText('Nozzle temp (°C)'), { target: { value: '210' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add Preset' }));

    await waitFor(() =>
      expect(postSpy).toHaveBeenCalledWith(
        '/api/printers/printer-1/presets',
        expect.objectContaining({ nozzleTempC: 210 }),
      ),
    );
  });
});
