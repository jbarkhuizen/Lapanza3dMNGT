import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { LaserMaterialsListPage } from '../src/pages/laserMaterials/LaserMaterialsListPage.js';
import { LaserMaterialFormPage } from '../src/pages/laserMaterials/LaserMaterialFormPage.js';
import * as client from '../src/api/client.js';
import { createTestQueryClient } from './helpers/queryClient.js';

beforeEach(() => {
  vi.restoreAllMocks();
});

function renderList() {
  const queryClient = createTestQueryClient();
  return render(
    <MemoryRouter>
      <QueryClientProvider client={queryClient}>
        <LaserMaterialsListPage />
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

function renderFormAt(path: string) {
  const queryClient = createTestQueryClient();
  return render(
    <MemoryRouter initialEntries={[path]}>
      <QueryClientProvider client={queryClient}>
        <Routes>
          <Route path="/laser-materials/new" element={<LaserMaterialFormPage />} />
          <Route path="/laser-materials/:id" element={<LaserMaterialFormPage />} />
          <Route path="/laser-materials" element={<div>laser materials list</div>} />
        </Routes>
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

describe('LaserMaterialsListPage', () => {
  it('lists laser materials returned by the API', async () => {
    vi.spyOn(client, 'apiGet').mockResolvedValue({
      ok: true,
      laserMaterials: [{ id: '1', name: 'Acrylic 3mm', sheetPrice: 500, sheetAreaM2: 2.88, usableSheetAreaM2: 2, costMultiplier: 1, createdAt: '2026-01-01T00:00:00.000Z' }],
    });
    renderList();
    await waitFor(() => expect(screen.getByText('Acrylic 3mm')).toBeInTheDocument());
  });

  it('shows an empty state when there are no laser materials', async () => {
    vi.spyOn(client, 'apiGet').mockResolvedValue({ ok: true, laserMaterials: [] });
    renderList();
    await waitFor(() => expect(screen.getByText(/no laser materials yet/i)).toBeInTheDocument());
  });

  it('shows an error message when the list fails to load', async () => {
    vi.spyOn(client, 'apiGet').mockRejectedValue(new client.ApiError('Something went wrong.', 500));
    renderList();
    await waitFor(() => expect(screen.getByText(/couldn't load laser materials/i)).toBeInTheDocument());
  });
});

describe('LaserMaterialFormPage', () => {
  it('creates a laser material with the expected payload', async () => {
    const postSpy = vi.spyOn(client, 'apiPost').mockResolvedValue({ ok: true, laserMaterial: { id: '1' } });
    renderFormAt('/laser-materials/new');

    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Acrylic 3mm' } });
    fireEvent.change(screen.getByLabelText('Sheet price'), { target: { value: '500' } });
    fireEvent.change(screen.getByLabelText('Sheet area (m²)'), { target: { value: '2.88' } });
    fireEvent.change(screen.getByLabelText('Usable sheet area (m²)'), { target: { value: '2' } });
    fireEvent.change(screen.getByLabelText('Cost multiplier'), { target: { value: '1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() =>
      expect(postSpy).toHaveBeenCalledWith('/api/laser-materials', {
        name: 'Acrylic 3mm',
        sheetPrice: 500,
        sheetAreaM2: 2.88,
        usableSheetAreaM2: 2,
        costMultiplier: 1,
      }),
    );
  });

  it('blocks submitting when usableSheetAreaM2 is left blank', async () => {
    const postSpy = vi.spyOn(client, 'apiPost').mockResolvedValue({ ok: true, laserMaterial: { id: '1' } });
    renderFormAt('/laser-materials/new');

    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Acrylic 3mm' } });
    fireEvent.change(screen.getByLabelText('Sheet price'), { target: { value: '500' } });
    fireEvent.change(screen.getByLabelText('Sheet area (m²)'), { target: { value: '2.88' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(postSpy).not.toHaveBeenCalled();
  });

  it('loads an existing laser material and saves changes', async () => {
    vi.spyOn(client, 'apiGet').mockResolvedValue({
      ok: true,
      laserMaterial: { id: '1', name: 'Acrylic 3mm', sheetPrice: 500, sheetAreaM2: 2.88, usableSheetAreaM2: 2, costMultiplier: 1, createdAt: '2026-01-01T00:00:00.000Z' },
    });
    const patchSpy = vi.spyOn(client, 'apiPatch').mockResolvedValue({ ok: true });
    renderFormAt('/laser-materials/1');

    await waitFor(() => expect(screen.getByDisplayValue('Acrylic 3mm')).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText('Sheet price'), { target: { value: '550' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() =>
      expect(patchSpy).toHaveBeenCalledWith('/api/laser-materials/1', expect.objectContaining({ sheetPrice: 550 })),
    );
  });
});
