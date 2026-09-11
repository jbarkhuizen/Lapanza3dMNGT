import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { MaterialComparePage } from '../src/pages/materials/MaterialComparePage.js';
import * as client from '../src/api/client.js';
import { createTestQueryClient } from './helpers/queryClient.js';

beforeEach(() => {
  vi.restoreAllMocks();
});

function renderAt(path: string) {
  const queryClient = createTestQueryClient();
  return render(
    <MemoryRouter initialEntries={[path]}>
      <QueryClientProvider client={queryClient}>
        <MaterialComparePage />
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

const petg = {
  id: 'petg', name: 'PETG', chemistry: 'Glycol-modified PET', bestFor: 'Everyday functional parts',
  nozzleTempC: 230, bedTempC: 70, requiresEnclosure: false, requiresHardenedNozzle: false,
  requiresDirectDrive: false, recommendsDryFilament: true, recommendsVentilation: false,
  difficulty: 'Beginner', moisture: 'Medium', abrasive: false,
  priceZarPerKgLow: 290, priceZarPerKgHigh: 450, priceEstimated: false,
  whyChooseIt: 'Strong.', avoidWhenText: 'Fine detail.', tags: ['beginner-friendly'],
  createdAt: '2026-01-01T00:00:00.000Z',
};

describe('MaterialComparePage', () => {
  it("renders both materials' data side by side given ?a=pla&b=petg", async () => {
    vi.spyOn(client, 'apiGet').mockImplementation((path) => {
      if (path === '/api/materials/pla') return Promise.resolve({ ok: true, material: pla });
      if (path === '/api/materials/petg') return Promise.resolve({ ok: true, material: petg });
      return Promise.reject(new Error(`Unexpected path: ${path}`));
    });
    renderAt('/materials/compare?a=pla&b=petg');

    await waitFor(() => expect(screen.getByText('PLA')).toBeInTheDocument());
    expect(screen.getByText('PETG')).toBeInTheDocument();
    expect(screen.getByText('200 °C')).toBeInTheDocument();
    expect(screen.getByText('230 °C')).toBeInTheDocument();
  });

  it('shows the empty-state copy when a param is missing', async () => {
    renderAt('/materials/compare?a=pla');
    await waitFor(() => expect(screen.getByText(/Pick two materials to compare them/)).toBeInTheDocument());
    expect(screen.getByRole('link', { name: 'Back to materials' })).toHaveAttribute('href', '/materials');
  });

  it('shows the empty-state copy when both params are missing', async () => {
    renderAt('/materials/compare');
    await waitFor(() => expect(screen.getByText(/Pick two materials to compare them/)).toBeInTheDocument());
  });
});
