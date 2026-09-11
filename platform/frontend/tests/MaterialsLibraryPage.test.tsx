import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { MaterialsLibraryPage } from '../src/pages/materials/MaterialsLibraryPage.js';
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
        <MaterialsLibraryPage />
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

const pla = {
  id: 'pla', name: 'PLA', chemistry: 'Polylactic acid', bestFor: 'Display models',
  nozzleTempC: 200, bedTempC: 60, requiresEnclosure: false, requiresHardenedNozzle: false,
  requiresDirectDrive: false, recommendsDryFilament: false, recommendsVentilation: false,
  difficulty: 'Beginner', moisture: 'Low', abrasive: false,
  priceZarPerKgLow: 295, priceZarPerKgHigh: 425, priceEstimated: false,
  whyChooseIt: 'Prints cleanly.', avoidWhenText: 'Hot car.', tags: ['beginner-friendly'],
  createdAt: '2026-01-01T00:00:00.000Z',
};

const tpu = {
  id: 'tpu-95a', name: 'TPU (95A)', chemistry: 'Thermoplastic polyurethane', bestFor: 'Phone cases',
  nozzleTempC: 225, bedTempC: 50, requiresEnclosure: false, requiresHardenedNozzle: false,
  requiresDirectDrive: true, recommendsDryFilament: true, recommendsVentilation: false,
  difficulty: 'Intermediate', moisture: 'Medium', abrasive: false,
  priceZarPerKgLow: 350, priceZarPerKgHigh: 550, priceEstimated: false,
  whyChooseIt: 'Flexible.', avoidWhenText: 'Bowden setup.', tags: ['flexible'],
  createdAt: '2026-01-01T00:00:00.000Z',
};

describe('MaterialsLibraryPage', () => {
  it('renders materials from a mocked apiGet', async () => {
    vi.spyOn(client, 'apiGet').mockResolvedValue({ ok: true, materials: [pla, tpu] });
    renderPage();
    await waitFor(() => expect(screen.getByText('PLA')).toBeInTheDocument());
    expect(screen.getByText('TPU (95A)')).toBeInTheDocument();
  });

  it('narrows the list when a tag filter is clicked', async () => {
    const getSpy = vi.spyOn(client, 'apiGet').mockImplementation((path) => {
      if (path === '/api/materials') {
        return Promise.resolve({ ok: true, materials: [pla, tpu] });
      }
      if (path === '/api/materials?tag=flexible') {
        return Promise.resolve({ ok: true, materials: [tpu] });
      }
      return Promise.reject(new Error(`Unexpected path: ${path}`));
    });
    renderPage();
    await waitFor(() => expect(screen.getByText('PLA')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'Flexible' }));

    await waitFor(() => expect(getSpy).toHaveBeenCalledWith('/api/materials?tag=flexible'));
    await waitFor(() => expect(screen.queryByText('PLA')).not.toBeInTheDocument());
    expect(screen.getByText('TPU (95A)')).toBeInTheDocument();
  });

  it('has a "Use this material" link with the correct href and query params', async () => {
    vi.spyOn(client, 'apiGet').mockResolvedValue({ ok: true, materials: [pla] });
    renderPage();
    await waitFor(() =>
      expect(screen.getByRole('link', { name: 'Use this material' })).toHaveAttribute(
        'href',
        '/filaments/new?materialType=PLA&costPerKg=360',
      ),
    );
  });
});
