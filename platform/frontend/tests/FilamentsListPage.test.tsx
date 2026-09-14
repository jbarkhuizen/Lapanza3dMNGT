import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { FilamentsListPage } from '../src/pages/filaments/FilamentsListPage.js';
import * as client from '../src/api/client.js';
import { createTestQueryClient } from './helpers/queryClient.js';

beforeEach(() => {
  vi.restoreAllMocks();
});

function renderPage(queryClient: QueryClient = createTestQueryClient()) {
  return render(
    <MemoryRouter>
      <QueryClientProvider client={queryClient}>
        <FilamentsListPage />
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

function renderAt(path: string, queryClient: QueryClient = createTestQueryClient()) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <QueryClientProvider client={queryClient}>
        <Routes>
          <Route path="/filaments" element={<FilamentsListPage />} />
          <Route path="/filaments/:id" element={<FilamentsListPage />} />
        </Routes>
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

const baseFilament = {
  id: '1', brand: 'eSun', materialType: 'PLA', diameterMm: 1.75, colour: 'Black',
  costPerSpool: null, costPerKg: 300, spoolWeightGrams: null, remainingWeightGrams: null,
  supplier: null, purchaseDate: null, notes: null, lowStockThresholdGrams: null,
  createdAt: '2026-01-01T00:00:00.000Z',
};

describe('FilamentsListPage — list rendering', () => {
  it('lists filaments returned by the API', async () => {
    vi.spyOn(client, 'apiGet').mockResolvedValue({ ok: true, filaments: [baseFilament] });
    renderPage();
    await waitFor(() => expect(screen.getByText('eSun')).toBeInTheDocument());
  });

  it('shows an empty state when there are no filaments', async () => {
    vi.spyOn(client, 'apiGet').mockResolvedValue({ ok: true, filaments: [] });
    renderPage();
    await waitFor(() => expect(screen.getByText(/no filaments yet/i)).toBeInTheDocument());
  });

  it('shows an error message when the list fails to load', async () => {
    vi.spyOn(client, 'apiGet').mockRejectedValue(new client.ApiError('Something went wrong.', 500));
    renderPage();
    await waitFor(() => expect(screen.getByText(/couldn't load filaments/i)).toBeInTheDocument());
  });

  it('shows an em-dash placeholder for a colour cleared to an empty string', async () => {
    vi.spyOn(client, 'apiGet').mockResolvedValue({
      ok: true,
      filaments: [{ ...baseFilament, id: '2', brand: 'Cleared Colour', colour: '' }],
    });
    renderPage();
    await waitFor(() => expect(screen.getByText('Cleared Colour')).toBeInTheDocument());
    const row = screen.getByText('Cleared Colour').closest('tr');
    expect(row).not.toBeNull();
    expect(row!.textContent).toContain('—');
  });

  it('shows an em-dash placeholder for a null colour', async () => {
    vi.spyOn(client, 'apiGet').mockResolvedValue({
      ok: true,
      filaments: [{ ...baseFilament, id: '3', brand: 'Null Colour', colour: null }],
    });
    renderPage();
    await waitFor(() => expect(screen.getByText('Null Colour')).toBeInTheDocument());
    const row = screen.getByText('Null Colour').closest('tr');
    expect(row).not.toBeNull();
    expect(row!.textContent).toContain('—');
  });
});

describe('FilamentsListPage — inline add form', () => {
  it('shows an always-visible essentials-only add form with "More details" collapsed', async () => {
    vi.spyOn(client, 'apiGet').mockResolvedValue({ ok: true, filaments: [] });
    renderPage();
    await waitFor(() => expect(screen.getByLabelText('Brand')).toBeInTheDocument());
    expect(screen.getByLabelText('Material type')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '+ More details' })).toBeInTheDocument();
    expect(screen.queryByLabelText('Colour')).not.toBeInTheDocument();
  });

  it('creates a filament via the essentials-only form and shows the new row without a manual refetch', async () => {
    const getSpy = vi.spyOn(client, 'apiGet').mockResolvedValue({ ok: true, filaments: [] });
    const postSpy = vi.spyOn(client, 'apiPost').mockResolvedValue({ ok: true, filament: { id: '1' } });
    renderPage();

    await waitFor(() => expect(screen.getByText(/no filaments yet/i)).toBeInTheDocument());

    fireEvent.change(screen.getByLabelText('Brand'), { target: { value: 'eSun' } });
    fireEvent.change(screen.getByLabelText('Material type'), { target: { value: 'PLA' } });

    getSpy.mockResolvedValue({ ok: true, filaments: [baseFilament] });
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));

    await waitFor(() => expect(postSpy).toHaveBeenCalled());
    const [, body] = postSpy.mock.calls[0];
    expect(body).toMatchObject({ brand: 'eSun', materialType: 'PLA', diameterMm: 1.75 });
    expect((body as Record<string, unknown>).costPerKg).toBeUndefined();

    await waitFor(() => expect(screen.getByText('eSun')).toBeInTheDocument());
  });

  it('includes an optional field from the expanded "More details" section in the create payload', async () => {
    vi.spyOn(client, 'apiGet').mockResolvedValue({ ok: true, filaments: [] });
    const postSpy = vi.spyOn(client, 'apiPost').mockResolvedValue({ ok: true, filament: { id: '1' } });
    renderPage();

    await waitFor(() => expect(screen.getByLabelText('Brand')).toBeInTheDocument());

    fireEvent.change(screen.getByLabelText('Brand'), { target: { value: 'eSun' } });
    fireEvent.change(screen.getByLabelText('Material type'), { target: { value: 'PLA' } });
    fireEvent.click(screen.getByRole('button', { name: '+ More details' }));
    fireEvent.change(screen.getByLabelText('Cost per kg'), { target: { value: '300' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));

    await waitFor(() => expect(postSpy).toHaveBeenCalled());
    const [, body] = postSpy.mock.calls[0];
    expect((body as Record<string, unknown>).costPerKg).toBe(300);
  });

  it('omits a blank purchase date instead of sending an empty string that fails server validation', async () => {
    vi.spyOn(client, 'apiGet').mockResolvedValue({ ok: true, filaments: [] });
    const postSpy = vi.spyOn(client, 'apiPost').mockResolvedValue({ ok: true, filament: { id: '1' } });
    renderPage();

    await waitFor(() => expect(screen.getByLabelText('Brand')).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText('Brand'), { target: { value: 'eSun' } });
    fireEvent.change(screen.getByLabelText('Material type'), { target: { value: 'PLA' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));

    await waitFor(() => expect(postSpy).toHaveBeenCalled());
    const [, body] = postSpy.mock.calls[0];
    expect((body as Record<string, unknown>).purchaseDate).toBeUndefined();
  });

  it('pre-fills materialType and costPerKg from query params (Materials Library "Use this material" link)', async () => {
    vi.spyOn(client, 'apiGet').mockResolvedValue({ ok: true, filaments: [] });
    render(
      <MemoryRouter initialEntries={['/filaments?materialType=PETG&costPerKg=360']}>
        <QueryClientProvider client={createTestQueryClient()}>
          <Routes>
            <Route path="/filaments" element={<FilamentsListPage />} />
          </Routes>
        </QueryClientProvider>
      </MemoryRouter>,
    );

    await waitFor(() => expect(screen.getByLabelText('Material type')).toHaveValue('PETG'));
    fireEvent.click(screen.getByRole('button', { name: '+ More details' }));
    expect(screen.getByLabelText('Cost per kg')).toHaveValue(360);
    expect(screen.getByLabelText('Brand')).toHaveValue('');
  });
});

describe('FilamentsListPage — edit in place', () => {
  it('clicking Edit shows that row pre-filled with its current values', async () => {
    vi.spyOn(client, 'apiGet').mockResolvedValue({ ok: true, filaments: [baseFilament] });
    renderPage();

    await waitFor(() => expect(screen.getByText('eSun')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));

    expect(screen.getByLabelText('Brand', { selector: '#edit-brand' })).toHaveValue('eSun');
    expect(screen.getByLabelText('Material type', { selector: '#edit-materialType' })).toHaveValue('PLA');
  });

  it('Cancel reverts to read-only without calling update', async () => {
    vi.spyOn(client, 'apiGet').mockResolvedValue({ ok: true, filaments: [baseFilament] });
    const patchSpy = vi.spyOn(client, 'apiPatch').mockResolvedValue({ ok: true });
    renderPage();

    await waitFor(() => expect(screen.getByText('eSun')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));

    const brandInput = screen.getByLabelText('Brand', { selector: '#edit-brand' });
    fireEvent.change(brandInput, { target: { value: 'Changed Brand' } });
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(screen.getByText('eSun')).toBeInTheDocument();
    expect(screen.queryByText('Changed Brand')).not.toBeInTheDocument();
    expect(patchSpy).not.toHaveBeenCalled();
  });

  it('Save calls update and returns to read-only reflecting new values', async () => {
    vi.spyOn(client, 'apiGet').mockResolvedValue({ ok: true, filaments: [baseFilament] });
    const patchSpy = vi.spyOn(client, 'apiPatch').mockResolvedValue({ ok: true });
    renderPage();

    await waitFor(() => expect(screen.getByText('eSun')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));

    const brandInput = screen.getByLabelText('Brand', { selector: '#edit-brand' });
    fireEvent.change(brandInput, { target: { value: 'eSun Pro' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() =>
      expect(patchSpy).toHaveBeenCalledWith('/api/filaments/1', expect.objectContaining({ brand: 'eSun Pro' })),
    );
    await waitFor(() => expect(screen.queryByLabelText('Brand', { selector: '#edit-brand' })).not.toBeInTheDocument());
  });
});

describe('FilamentsListPage — deep link', () => {
  it('navigating to /filaments/:id auto-expands the matching row', async () => {
    vi.spyOn(client, 'apiGet').mockImplementation((path) => {
      if (path === '/api/filaments') {
        return Promise.resolve({ ok: true, filaments: [baseFilament] });
      }
      if (path === '/api/filaments/1') {
        return Promise.resolve({ ok: true, filament: baseFilament });
      }
      return Promise.reject(new Error(`Unexpected path: ${path}`));
    });
    renderAt('/filaments/1');

    await waitFor(() => expect(screen.getByLabelText('Brand', { selector: '#edit-brand' })).toHaveValue('eSun'));
  });
});
