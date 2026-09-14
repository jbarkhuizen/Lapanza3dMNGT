import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { LaserMaterialsListPage } from '../src/pages/laserMaterials/LaserMaterialsListPage.js';
import * as client from '../src/api/client.js';
import { createTestQueryClient } from './helpers/queryClient.js';

beforeEach(() => {
  vi.restoreAllMocks();
});

function renderPage(queryClient: QueryClient = createTestQueryClient()) {
  return render(
    <MemoryRouter>
      <QueryClientProvider client={queryClient}>
        <LaserMaterialsListPage />
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

function renderAt(path: string, queryClient: QueryClient = createTestQueryClient()) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <QueryClientProvider client={queryClient}>
        <Routes>
          <Route path="/laser-materials" element={<LaserMaterialsListPage />} />
          <Route path="/laser-materials/:id" element={<LaserMaterialsListPage />} />
        </Routes>
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

const baseLaserMaterial = {
  id: '1',
  name: 'Acrylic 3mm',
  sheetPrice: 500,
  sheetAreaM2: 2.88,
  usableSheetAreaM2: 2,
  costMultiplier: 1,
  createdAt: '2026-01-01T00:00:00.000Z',
};

describe('LaserMaterialsListPage — list rendering', () => {
  it('lists laser materials returned by the API', async () => {
    vi.spyOn(client, 'apiGet').mockResolvedValue({ ok: true, laserMaterials: [baseLaserMaterial] });
    renderPage();
    await waitFor(() => expect(screen.getByText('Acrylic 3mm')).toBeInTheDocument());
  });

  it('shows an empty state when there are no laser materials', async () => {
    vi.spyOn(client, 'apiGet').mockResolvedValue({ ok: true, laserMaterials: [] });
    renderPage();
    await waitFor(() => expect(screen.getByText(/no laser materials yet/i)).toBeInTheDocument());
  });

  it('shows an error message when the list fails to load', async () => {
    vi.spyOn(client, 'apiGet').mockRejectedValue(new client.ApiError('Something went wrong.', 500));
    renderPage();
    await waitFor(() => expect(screen.getByText(/couldn't load laser materials/i)).toBeInTheDocument());
  });

  it('deletes a laser material when confirmed', async () => {
    vi.spyOn(client, 'apiGet').mockResolvedValue({ ok: true, laserMaterials: [baseLaserMaterial] });
    const deleteSpy = vi.spyOn(client, 'apiDelete').mockResolvedValue({ ok: true });
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    renderPage();
    await waitFor(() => expect(screen.getByText('Acrylic 3mm')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(deleteSpy).toHaveBeenCalledWith('/api/laser-materials/1'));
  });
});

describe('LaserMaterialsListPage — inline add form', () => {
  it('shows an always-visible essentials-only add form with "More details" collapsed', async () => {
    vi.spyOn(client, 'apiGet').mockResolvedValue({ ok: true, laserMaterials: [] });
    renderPage();
    await waitFor(() => expect(screen.getByLabelText('Name', { selector: '#add-name' })).toBeInTheDocument());
    expect(screen.getByLabelText('Sheet price', { selector: '#add-sheetPrice' })).toBeInTheDocument();
    expect(screen.getByLabelText('Sheet area (m²)', { selector: '#add-sheetAreaM2' })).toBeInTheDocument();
    expect(screen.getByLabelText('Usable sheet area (m²)', { selector: '#add-usableSheetAreaM2' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '+ More details' })).toBeInTheDocument();
    expect(screen.queryByLabelText('Cost multiplier', { selector: '#add-costMultiplier' })).not.toBeInTheDocument();
  });

  it('creates a laser material via the essentials-only form and shows the new row without a manual refetch', async () => {
    const getSpy = vi.spyOn(client, 'apiGet').mockResolvedValue({ ok: true, laserMaterials: [] });
    const postSpy = vi.spyOn(client, 'apiPost').mockResolvedValue({ ok: true, laserMaterial: { id: '1' } });
    renderPage();

    await waitFor(() => expect(screen.getByText(/no laser materials yet/i)).toBeInTheDocument());

    fireEvent.change(screen.getByLabelText('Name', { selector: '#add-name' }), { target: { value: 'Acrylic 3mm' } });
    fireEvent.change(screen.getByLabelText('Sheet price', { selector: '#add-sheetPrice' }), { target: { value: '500' } });
    fireEvent.change(screen.getByLabelText('Sheet area (m²)', { selector: '#add-sheetAreaM2' }), { target: { value: '2.88' } });
    fireEvent.change(screen.getByLabelText('Usable sheet area (m²)', { selector: '#add-usableSheetAreaM2' }), {
      target: { value: '2' },
    });

    getSpy.mockResolvedValue({ ok: true, laserMaterials: [baseLaserMaterial] });
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));

    await waitFor(() => expect(postSpy).toHaveBeenCalled());
    const [, body] = postSpy.mock.calls[0];
    expect(body).toMatchObject({ name: 'Acrylic 3mm', sheetPrice: 500, sheetAreaM2: 2.88, usableSheetAreaM2: 2 });
    expect((body as Record<string, unknown>).costMultiplier).toBeUndefined();

    await waitFor(() => expect(screen.getByText('Acrylic 3mm')).toBeInTheDocument());
  });

  it('includes an optional field from the expanded "More details" section in the create payload', async () => {
    vi.spyOn(client, 'apiGet').mockResolvedValue({ ok: true, laserMaterials: [] });
    const postSpy = vi.spyOn(client, 'apiPost').mockResolvedValue({ ok: true, laserMaterial: { id: '1' } });
    renderPage();

    await waitFor(() => expect(screen.getByLabelText('Name', { selector: '#add-name' })).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText('Name', { selector: '#add-name' }), { target: { value: 'Acrylic 3mm' } });
    fireEvent.change(screen.getByLabelText('Sheet price', { selector: '#add-sheetPrice' }), { target: { value: '500' } });
    fireEvent.change(screen.getByLabelText('Sheet area (m²)', { selector: '#add-sheetAreaM2' }), { target: { value: '2.88' } });
    fireEvent.change(screen.getByLabelText('Usable sheet area (m²)', { selector: '#add-usableSheetAreaM2' }), {
      target: { value: '2' },
    });
    fireEvent.click(screen.getByRole('button', { name: '+ More details' }));
    fireEvent.change(screen.getByLabelText('Cost multiplier', { selector: '#add-costMultiplier' }), { target: { value: '1.2' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));

    await waitFor(() => expect(postSpy).toHaveBeenCalled());
    const [, body] = postSpy.mock.calls[0];
    expect((body as Record<string, unknown>).costMultiplier).toBe(1.2);
  });

  it('blocks submitting the add form when usableSheetAreaM2 is left blank', async () => {
    vi.spyOn(client, 'apiGet').mockResolvedValue({ ok: true, laserMaterials: [] });
    const postSpy = vi.spyOn(client, 'apiPost').mockResolvedValue({ ok: true, laserMaterial: { id: '1' } });
    renderPage();

    await waitFor(() => expect(screen.getByLabelText('Name', { selector: '#add-name' })).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText('Name', { selector: '#add-name' }), { target: { value: 'Acrylic 3mm' } });
    fireEvent.change(screen.getByLabelText('Sheet price', { selector: '#add-sheetPrice' }), { target: { value: '500' } });
    fireEvent.change(screen.getByLabelText('Sheet area (m²)', { selector: '#add-sheetAreaM2' }), { target: { value: '2.88' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));

    expect(postSpy).not.toHaveBeenCalled();
  });
});

describe('LaserMaterialsListPage — edit in place', () => {
  it('clicking Edit shows that row pre-filled with its current values', async () => {
    vi.spyOn(client, 'apiGet').mockResolvedValue({ ok: true, laserMaterials: [baseLaserMaterial] });
    renderPage();

    await waitFor(() => expect(screen.getByText('Acrylic 3mm')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));

    expect(screen.getByLabelText('Name', { selector: '#edit-name' })).toHaveValue('Acrylic 3mm');
    expect(screen.getByLabelText('Sheet price', { selector: '#edit-sheetPrice' })).toHaveValue(500);
  });

  it('Cancel reverts to read-only without calling update', async () => {
    vi.spyOn(client, 'apiGet').mockResolvedValue({ ok: true, laserMaterials: [baseLaserMaterial] });
    const patchSpy = vi.spyOn(client, 'apiPatch').mockResolvedValue({ ok: true });
    renderPage();

    await waitFor(() => expect(screen.getByText('Acrylic 3mm')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));

    fireEvent.change(screen.getByLabelText('Name', { selector: '#edit-name' }), { target: { value: 'Changed Name' } });
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(screen.getByText('Acrylic 3mm')).toBeInTheDocument();
    expect(screen.queryByText('Changed Name')).not.toBeInTheDocument();
    expect(patchSpy).not.toHaveBeenCalled();
  });

  it('Save calls update and returns to read-only reflecting new values', async () => {
    vi.spyOn(client, 'apiGet').mockResolvedValue({ ok: true, laserMaterials: [baseLaserMaterial] });
    const patchSpy = vi.spyOn(client, 'apiPatch').mockResolvedValue({ ok: true });
    renderPage();

    await waitFor(() => expect(screen.getByText('Acrylic 3mm')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));

    fireEvent.change(screen.getByLabelText('Sheet price', { selector: '#edit-sheetPrice' }), { target: { value: '550' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() =>
      expect(patchSpy).toHaveBeenCalledWith('/api/laser-materials/1', expect.objectContaining({ sheetPrice: 550 })),
    );
    await waitFor(() => expect(screen.queryByLabelText('Name', { selector: '#edit-name' })).not.toBeInTheDocument());
  });
});

describe('LaserMaterialsListPage — deep link', () => {
  it('navigating to /laser-materials/:id auto-expands the matching row', async () => {
    vi.spyOn(client, 'apiGet').mockImplementation((path) => {
      if (path === '/api/laser-materials') {
        return Promise.resolve({ ok: true, laserMaterials: [baseLaserMaterial] });
      }
      if (path === '/api/laser-materials/1') {
        return Promise.resolve({ ok: true, laserMaterial: baseLaserMaterial });
      }
      return Promise.reject(new Error(`Unexpected path: ${path}`));
    });
    renderAt('/laser-materials/1');

    await waitFor(() => expect(screen.getByLabelText('Name', { selector: '#edit-name' })).toHaveValue('Acrylic 3mm'));
  });
});
