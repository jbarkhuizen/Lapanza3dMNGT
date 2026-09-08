import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { CostingTemplatesListPage } from '../src/pages/costingTemplates/CostingTemplatesListPage.js';
import * as client from '../src/api/client.js';
import { createTestQueryClient } from './helpers/queryClient.js';
import { formatCurrency } from '../src/lib/formatCurrency.js';

beforeEach(() => {
  vi.restoreAllMocks();
});

function renderPage() {
  const queryClient = createTestQueryClient();
  return render(
    <MemoryRouter>
      <QueryClientProvider client={queryClient}>
        <CostingTemplatesListPage />
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

const baseTemplate = {
  id: '1',
  name: 'Standard PLA bracket',
  filamentId: 'f1',
  filamentSnapshotBrand: 'eSun',
  filamentSnapshotMaterialType: 'PLA',
  filamentSnapshotCostPerGram: '0.300000',
  weightGrams: 50,
  printerId: 'p1',
  printerSnapshotName: 'Prusa MK4',
  printerSnapshotElectricityRatePerKwh: '2.5000',
  printerSnapshotDepreciationPerHour: '2.0000',
  printTimeHours: 2,
  markupPercent: '50.00',
  filamentCost: '15.00',
  electricityCost: '1.00',
  depreciationCost: '4.00',
  labourCost: '150.00',
  consumablesCost: '20.00',
  totalCost: '190.00',
  suggestedPrice: '285.00',
  createdAt: '2026-01-01T00:00:00.000Z',
};

describe('CostingTemplatesListPage', () => {
  it('lists costing templates returned by the API', async () => {
    vi.spyOn(client, 'apiGet').mockResolvedValue({ ok: true, costingTemplates: [baseTemplate] });
    renderPage();
    await waitFor(() => expect(screen.getByText('Standard PLA bracket')).toBeInTheDocument());
    expect(screen.getByText('eSun')).toBeInTheDocument();
    expect(screen.getByText('Prusa MK4')).toBeInTheDocument();
    expect(screen.getByText(formatCurrency('190.00'))).toBeInTheDocument();
    expect(screen.getByText(formatCurrency('285.00'))).toBeInTheDocument();
  });

  it('shows an empty state when there are no costing templates', async () => {
    vi.spyOn(client, 'apiGet').mockResolvedValue({ ok: true, costingTemplates: [] });
    renderPage();
    await waitFor(() => expect(screen.getByText(/no costing templates yet/i)).toBeInTheDocument());
  });

  it('shows an error message when the list fails to load', async () => {
    vi.spyOn(client, 'apiGet').mockRejectedValue(new client.ApiError('Something went wrong.', 500));
    renderPage();
    await waitFor(() => expect(screen.getByText(/couldn't load costing templates/i)).toBeInTheDocument());
  });

  it('has a link to create a new costing template', async () => {
    vi.spyOn(client, 'apiGet').mockResolvedValue({ ok: true, costingTemplates: [] });
    renderPage();
    await waitFor(() =>
      expect(screen.getByRole('link', { name: 'New Costing Template' })).toHaveAttribute(
        'href',
        '/costing-templates/new',
      ),
    );
  });
});
