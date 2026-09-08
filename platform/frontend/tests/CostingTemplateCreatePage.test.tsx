import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { CostingTemplateCreatePage } from '../src/pages/costingTemplates/CostingTemplateCreatePage.js';
import * as client from '../src/api/client.js';
import { createTestQueryClient } from './helpers/queryClient.js';

beforeEach(() => {
  vi.restoreAllMocks();
});

function mockReferenceData(options?: { emptyLabourSteps?: boolean; emptyConsumables?: boolean }) {
  vi.spyOn(client, 'apiGet').mockImplementation((path: string) => {
    if (path === '/api/filaments') {
      return Promise.resolve({ ok: true, filaments: [{ id: 'f1', brand: 'eSun', materialType: 'PLA', diameterMm: 1.75, colour: null, costPerSpool: null, costPerKg: 300, spoolWeightGrams: null, remainingWeightGrams: null, supplier: null, purchaseDate: null, notes: null, lowStockThresholdGrams: null, createdAt: '2026-01-01T00:00:00.000Z' }] });
    }
    if (path === '/api/printers') {
      return Promise.resolve({ ok: true, printers: [{ id: 'p1', name: 'Prusa MK4', make: null, model: null, buildVolumeXMm: null, buildVolumeYMm: null, buildVolumeZMm: null, purchaseDate: null, purchaseCost: 4000, powerDrawWatts: 200, electricityRatePerKwh: '2.5000', expectedLifetimeHours: 2000, status: 'active', createdAt: '2026-01-01T00:00:00.000Z' }] });
    }
    if (path === '/api/labour-steps') {
      return Promise.resolve({ ok: true, labourSteps: options?.emptyLabourSteps ? [] : [{ id: 'ls1', name: 'Slicing', hourlyRate: 150, active: true, createdAt: '2026-01-01T00:00:00.000Z' }] });
    }
    if (path === '/api/consumables') {
      return Promise.resolve({ ok: true, consumables: options?.emptyConsumables ? [] : [{ id: 'cs1', name: 'Build plate adhesive', category: 'other', unitOfMeasure: 'each', costPerUnit: 10, currentStock: 5, reorderThreshold: null, supplier: null, createdAt: '2026-01-01T00:00:00.000Z' }] });
    }
    return Promise.reject(new client.ApiError('not found', 404));
  });
}

function renderPage() {
  const queryClient = createTestQueryClient();
  return render(
    <MemoryRouter initialEntries={['/costing-templates/new']}>
      <QueryClientProvider client={queryClient}>
        <Routes>
          <Route path="/costing-templates/new" element={<CostingTemplateCreatePage />} />
          <Route path="/costing-templates/:id" element={<div>detail page</div>} />
        </Routes>
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

describe('CostingTemplateCreatePage', () => {
  it('populates filament/printer/labour-step/consumable pickers from their respective APIs', async () => {
    mockReferenceData();
    renderPage();
    await waitFor(() => expect(screen.getByRole('option', { name: 'eSun — PLA' })).toBeInTheDocument());
    expect(screen.getByRole('option', { name: 'Prusa MK4' })).toBeInTheDocument();
  });

  it('creates a costing template with no line items and navigates to its detail page', async () => {
    mockReferenceData();
    const postSpy = vi.spyOn(client, 'apiPost').mockResolvedValue({ ok: true, costingTemplate: { id: 'new-template-1' } });
    renderPage();
    await waitFor(() => expect(screen.getByRole('option', { name: 'eSun — PLA' })).toBeInTheDocument());

    fireEvent.change(screen.getByLabelText('Template name'), { target: { value: 'Standard bracket' } });
    fireEvent.change(screen.getByLabelText('Filament'), { target: { value: 'f1' } });
    fireEvent.change(screen.getByLabelText('Weight (g)'), { target: { value: '50' } });
    fireEvent.change(screen.getByLabelText('Printer'), { target: { value: 'p1' } });
    fireEvent.change(screen.getByLabelText('Print time (hours)'), { target: { value: '2' } });
    fireEvent.change(screen.getByLabelText('Markup (%)'), { target: { value: '50' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create Costing Template' }));

    await waitFor(() =>
      expect(postSpy).toHaveBeenCalledWith('/api/costing-templates', {
        name: 'Standard bracket',
        filamentId: 'f1',
        weightGrams: 50,
        printerId: 'p1',
        printTimeHours: 2,
        markupPercent: 50,
        labourLines: [],
        consumableLines: [],
      }),
    );
    await waitFor(() => expect(screen.getByText('detail page')).toBeInTheDocument());
  });

  it('adds a labour line and a consumable line, and submits both correctly', async () => {
    mockReferenceData();
    const postSpy = vi.spyOn(client, 'apiPost').mockResolvedValue({ ok: true, costingTemplate: { id: 'new-template-1' } });
    renderPage();
    await waitFor(() => expect(screen.getByRole('option', { name: 'eSun — PLA' })).toBeInTheDocument());

    fireEvent.change(screen.getByLabelText('Template name'), { target: { value: 'Standard bracket' } });
    fireEvent.change(screen.getByLabelText('Filament'), { target: { value: 'f1' } });
    fireEvent.change(screen.getByLabelText('Weight (g)'), { target: { value: '50' } });
    fireEvent.change(screen.getByLabelText('Printer'), { target: { value: 'p1' } });
    fireEvent.change(screen.getByLabelText('Print time (hours)'), { target: { value: '2' } });
    fireEvent.change(screen.getByLabelText('Markup (%)'), { target: { value: '50' } });

    fireEvent.click(screen.getByRole('button', { name: 'Add Labour Line' }));
    fireEvent.change(screen.getByLabelText('Labour step'), { target: { value: 'ls1' } });
    fireEvent.change(screen.getByLabelText('Hours'), { target: { value: '1' } });

    fireEvent.click(screen.getByRole('button', { name: 'Add Consumable Line' }));
    fireEvent.change(screen.getByLabelText('Consumable'), { target: { value: 'cs1' } });
    fireEvent.change(screen.getByLabelText('Quantity'), { target: { value: '2' } });

    fireEvent.click(screen.getByRole('button', { name: 'Create Costing Template' }));

    await waitFor(() =>
      expect(postSpy).toHaveBeenCalledWith('/api/costing-templates', {
        name: 'Standard bracket',
        filamentId: 'f1',
        weightGrams: 50,
        printerId: 'p1',
        printTimeHours: 2,
        markupPercent: 50,
        labourLines: [{ labourStepId: 'ls1', hours: 1 }],
        consumableLines: [{ consumableId: 'cs1', quantity: 2 }],
      }),
    );
  });

  it('shows the server error message when creation fails', async () => {
    mockReferenceData();
    vi.spyOn(client, 'apiPost').mockRejectedValue(
      new client.ApiError('This printer is missing an electricity rate, power draw, expected lifetime, or purchase cost — set these before costing a job on it.', 400),
    );
    renderPage();
    await waitFor(() => expect(screen.getByRole('option', { name: 'eSun — PLA' })).toBeInTheDocument());

    fireEvent.change(screen.getByLabelText('Template name'), { target: { value: 'Standard bracket' } });
    fireEvent.change(screen.getByLabelText('Filament'), { target: { value: 'f1' } });
    fireEvent.change(screen.getByLabelText('Weight (g)'), { target: { value: '50' } });
    fireEvent.change(screen.getByLabelText('Printer'), { target: { value: 'p1' } });
    fireEvent.change(screen.getByLabelText('Print time (hours)'), { target: { value: '2' } });
    fireEvent.change(screen.getByLabelText('Markup (%)'), { target: { value: '50' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create Costing Template' }));

    await waitFor(() =>
      expect(
        screen.getByText('This printer is missing an electricity rate, power draw, expected lifetime, or purchase cost — set these before costing a job on it.'),
      ).toBeInTheDocument(),
    );
  });

  it('disables the "Add Labour Line" button when labour steps list is empty and shows a hint', async () => {
    mockReferenceData({ emptyLabourSteps: true });
    renderPage();
    await waitFor(() => expect(screen.getByRole('option', { name: 'eSun — PLA' })).toBeInTheDocument());

    const addLabourButton = screen.getByRole('button', { name: 'Add Labour Line' });
    expect(addLabourButton).toBeDisabled();
    expect(screen.getByText('Add a labour step first (Labour Steps page) before adding one here.')).toBeInTheDocument();
  });

  it('disables the "Add Consumable Line" button when consumables list is empty and shows a hint', async () => {
    mockReferenceData({ emptyConsumables: true });
    renderPage();
    await waitFor(() => expect(screen.getByRole('option', { name: 'eSun — PLA' })).toBeInTheDocument());

    const addConsumableButton = screen.getByRole('button', { name: 'Add Consumable Line' });
    expect(addConsumableButton).toBeDisabled();
    expect(screen.getByText('Add a consumable first (Consumables page) before adding one here.')).toBeInTheDocument();
  });
});
