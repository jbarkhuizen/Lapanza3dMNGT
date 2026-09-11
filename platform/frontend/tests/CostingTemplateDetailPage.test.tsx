import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { CostingTemplateDetailPage } from '../src/pages/costingTemplates/CostingTemplateDetailPage.js';
import * as client from '../src/api/client.js';
import { createTestQueryClient } from './helpers/queryClient.js';
import { formatCurrency } from '../src/lib/formatCurrency.js';

beforeEach(() => {
  vi.restoreAllMocks();
});

const fullTemplate = {
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
  labourLines: [
    { id: 'l1', labourStepId: 'ls1', labourStepSnapshotName: 'Slicing', hourlyRateSnapshot: '150.00', hours: 1, lineCost: '150.00' },
  ],
  consumableLines: [
    { id: 'c1', consumableId: 'cs1', consumableSnapshotName: 'Build plate adhesive', costPerUnitSnapshot: '10.00', quantity: 2, lineCost: '20.00' },
  ],
};

function renderAt(path: string) {
  const queryClient = createTestQueryClient();
  return render(
    <MemoryRouter initialEntries={[path]}>
      <QueryClientProvider client={queryClient}>
        <Routes>
          <Route path="/costing-templates/:id" element={<CostingTemplateDetailPage />} />
          <Route path="/jobs" element={<div>jobs board page</div>} />
        </Routes>
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

describe('CostingTemplateDetailPage', () => {
  it('renders the full cost breakdown including line items', async () => {
    vi.spyOn(client, 'apiGet').mockImplementation((path: string) => {
      if (path === '/api/costing-templates/1') return Promise.resolve({ ok: true, costingTemplate: fullTemplate });
      if (path === '/api/jobs') return Promise.resolve({ ok: true, jobs: [] });
      return Promise.reject(new client.ApiError('not found', 404));
    });
    renderAt('/costing-templates/1');

    await waitFor(() => expect(screen.getByRole('heading', { name: 'Standard PLA bracket' })).toBeInTheDocument());
    expect(screen.getByText('eSun')).toBeInTheDocument();
    expect(screen.getByText('Prusa MK4')).toBeInTheDocument();
    expect(screen.getByText(formatCurrency('190.00'))).toBeInTheDocument();
    expect(screen.getByText(formatCurrency('285.00'))).toBeInTheDocument();
    expect(screen.getByText('Slicing')).toBeInTheDocument();
    expect(screen.getByText('Build plate adhesive')).toBeInTheDocument();
  });

  it('shows an error message when the template fails to load', async () => {
    vi.spyOn(client, 'apiGet').mockRejectedValue(new client.ApiError('Costing template not found.', 404));
    renderAt('/costing-templates/999');
    await waitFor(() => expect(screen.getByText('Costing template not found.')).toBeInTheDocument());
  });

  it('clicking "Start Job" calls the create endpoint and navigates to /jobs', async () => {
    vi.spyOn(client, 'apiGet').mockImplementation((path: string) => {
      if (path === '/api/costing-templates/1') return Promise.resolve({ ok: true, costingTemplate: fullTemplate });
      if (path === '/api/jobs') return Promise.resolve({ ok: true, jobs: [] });
      return Promise.reject(new client.ApiError('not found', 404));
    });
    const postSpy = vi
      .spyOn(client, 'apiPost')
      .mockResolvedValue({ ok: true, job: { id: 'j1', costingTemplateId: '1', name: 'Standard PLA bracket', status: 'backlog', notes: null, createdAt: '2026-01-01T00:00:00.000Z', startedAt: null, completedAt: null } });

    renderAt('/costing-templates/1');
    await waitFor(() => expect(screen.getByRole('button', { name: 'Start Job' })).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'Start Job' }));

    await waitFor(() => expect(postSpy).toHaveBeenCalledWith('/api/jobs', { costingTemplateId: '1' }));
    await waitFor(() => expect(screen.getByText('jobs board page')).toBeInTheDocument());
  });

  it('shows existing jobs for this template as links', async () => {
    vi.spyOn(client, 'apiGet').mockImplementation((path: string) => {
      if (path === '/api/costing-templates/1') return Promise.resolve({ ok: true, costingTemplate: fullTemplate });
      if (path === '/api/jobs') {
        return Promise.resolve({
          ok: true,
          jobs: [
            { id: 'j1', costingTemplateId: '1', name: 'Standard PLA bracket', status: 'printing', notes: null, createdAt: '2026-01-01T00:00:00.000Z', startedAt: '2026-01-02T00:00:00.000Z', completedAt: null },
            { id: 'j2', costingTemplateId: 'other-template', name: 'Unrelated job', status: 'backlog', notes: null, createdAt: '2026-01-01T00:00:00.000Z', startedAt: null, completedAt: null },
          ],
        });
      }
      return Promise.reject(new client.ApiError('not found', 404));
    });

    renderAt('/costing-templates/1');
    await waitFor(() => expect(screen.getByRole('link', { name: /Standard PLA bracket — Printing/ })).toBeInTheDocument());
    expect(screen.queryByText('Unrelated job')).not.toBeInTheDocument();
  });
});
