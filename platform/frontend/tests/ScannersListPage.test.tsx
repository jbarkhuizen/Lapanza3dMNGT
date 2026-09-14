import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ScannersListPage } from '../src/pages/scanners/ScannersListPage.js';
import * as client from '../src/api/client.js';
import { createTestQueryClient } from './helpers/queryClient.js';

beforeEach(() => {
  vi.restoreAllMocks();
});

function renderPage(queryClient: QueryClient = createTestQueryClient()) {
  return render(
    <MemoryRouter>
      <QueryClientProvider client={queryClient}>
        <ScannersListPage />
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

function renderAt(path: string, queryClient: QueryClient = createTestQueryClient()) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <QueryClientProvider client={queryClient}>
        <Routes>
          <Route path="/scanners" element={<ScannersListPage />} />
          <Route path="/scanners/:id" element={<ScannersListPage />} />
        </Routes>
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

const baseScanner = {
  id: '1',
  name: 'Handheld scanner',
  scannerCost: 6000,
  expectedScanHours: 1000,
  powerCostPerHour: 0.5,
  createdAt: '2026-01-01T00:00:00.000Z',
};

describe('ScannersListPage — list rendering', () => {
  it('lists scanners returned by the API', async () => {
    vi.spyOn(client, 'apiGet').mockResolvedValue({ ok: true, scanners: [baseScanner] });
    renderPage();
    await waitFor(() => expect(screen.getByText('Handheld scanner')).toBeInTheDocument());
  });

  it('shows an empty state when there are no scanners', async () => {
    vi.spyOn(client, 'apiGet').mockResolvedValue({ ok: true, scanners: [] });
    renderPage();
    await waitFor(() => expect(screen.getByText(/no scanners yet/i)).toBeInTheDocument());
  });

  it('shows an error message when the list fails to load', async () => {
    vi.spyOn(client, 'apiGet').mockRejectedValue(new client.ApiError('Something went wrong.', 500));
    renderPage();
    await waitFor(() => expect(screen.getByText(/couldn't load scanners/i)).toBeInTheDocument());
  });

  it('deletes a scanner when confirmed', async () => {
    vi.spyOn(client, 'apiGet').mockResolvedValue({ ok: true, scanners: [baseScanner] });
    const deleteSpy = vi.spyOn(client, 'apiDelete').mockResolvedValue({ ok: true });
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    renderPage();
    await waitFor(() => expect(screen.getByText('Handheld scanner')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(deleteSpy).toHaveBeenCalledWith('/api/scanners/1'));
  });
});

describe('ScannersListPage — inline add form', () => {
  it('shows an always-visible essentials-only add form with "More details" collapsed', async () => {
    vi.spyOn(client, 'apiGet').mockResolvedValue({ ok: true, scanners: [] });
    renderPage();
    await waitFor(() => expect(screen.getByLabelText('Name', { selector: '#add-name' })).toBeInTheDocument());
    expect(screen.getByLabelText('Scanner cost', { selector: '#add-scannerCost' })).toBeInTheDocument();
    expect(screen.getByLabelText('Expected scan hours', { selector: '#add-expectedScanHours' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '+ More details' })).toBeInTheDocument();
    expect(screen.queryByLabelText('Power cost per hour', { selector: '#add-powerCostPerHour' })).not.toBeInTheDocument();
  });

  it('creates a scanner via the essentials-only form and shows the new row without a manual refetch', async () => {
    const getSpy = vi.spyOn(client, 'apiGet').mockResolvedValue({ ok: true, scanners: [] });
    const postSpy = vi.spyOn(client, 'apiPost').mockResolvedValue({ ok: true, scanner: { id: '1' } });
    renderPage();

    await waitFor(() => expect(screen.getByText(/no scanners yet/i)).toBeInTheDocument());

    fireEvent.change(screen.getByLabelText('Name', { selector: '#add-name' }), { target: { value: 'Handheld scanner' } });
    fireEvent.change(screen.getByLabelText('Scanner cost', { selector: '#add-scannerCost' }), { target: { value: '6000' } });
    fireEvent.change(screen.getByLabelText('Expected scan hours', { selector: '#add-expectedScanHours' }), {
      target: { value: '1000' },
    });

    getSpy.mockResolvedValue({ ok: true, scanners: [baseScanner] });
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));

    await waitFor(() => expect(postSpy).toHaveBeenCalled());
    const [, body] = postSpy.mock.calls[0];
    expect(body).toMatchObject({ name: 'Handheld scanner', scannerCost: 6000, expectedScanHours: 1000 });
    expect((body as Record<string, unknown>).powerCostPerHour).toBeUndefined();

    await waitFor(() => expect(screen.getByText('Handheld scanner')).toBeInTheDocument());
  });

  it('includes an optional field from the expanded "More details" section in the create payload', async () => {
    vi.spyOn(client, 'apiGet').mockResolvedValue({ ok: true, scanners: [] });
    const postSpy = vi.spyOn(client, 'apiPost').mockResolvedValue({ ok: true, scanner: { id: '1' } });
    renderPage();

    await waitFor(() => expect(screen.getByLabelText('Name', { selector: '#add-name' })).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText('Name', { selector: '#add-name' }), { target: { value: 'Handheld scanner' } });
    fireEvent.change(screen.getByLabelText('Scanner cost', { selector: '#add-scannerCost' }), { target: { value: '6000' } });
    fireEvent.change(screen.getByLabelText('Expected scan hours', { selector: '#add-expectedScanHours' }), {
      target: { value: '1000' },
    });
    fireEvent.click(screen.getByRole('button', { name: '+ More details' }));
    fireEvent.change(screen.getByLabelText('Power cost per hour', { selector: '#add-powerCostPerHour' }), {
      target: { value: '0.5' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));

    await waitFor(() => expect(postSpy).toHaveBeenCalled());
    const [, body] = postSpy.mock.calls[0];
    expect((body as Record<string, unknown>).powerCostPerHour).toBe(0.5);
  });

  it('blocks submitting the add form when expectedScanHours is left blank', async () => {
    vi.spyOn(client, 'apiGet').mockResolvedValue({ ok: true, scanners: [] });
    const postSpy = vi.spyOn(client, 'apiPost').mockResolvedValue({ ok: true, scanner: { id: '1' } });
    renderPage();

    await waitFor(() => expect(screen.getByLabelText('Name', { selector: '#add-name' })).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText('Name', { selector: '#add-name' }), { target: { value: 'Handheld scanner' } });
    fireEvent.change(screen.getByLabelText('Scanner cost', { selector: '#add-scannerCost' }), { target: { value: '6000' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));

    expect(postSpy).not.toHaveBeenCalled();
  });
});

describe('ScannersListPage — edit in place', () => {
  it('clicking Edit shows that row pre-filled with its current values', async () => {
    vi.spyOn(client, 'apiGet').mockResolvedValue({ ok: true, scanners: [baseScanner] });
    renderPage();

    await waitFor(() => expect(screen.getByText('Handheld scanner')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));

    expect(screen.getByLabelText('Name', { selector: '#edit-name' })).toHaveValue('Handheld scanner');
    expect(screen.getByLabelText('Scanner cost', { selector: '#edit-scannerCost' })).toHaveValue(6000);
  });

  it('Cancel reverts to read-only without calling update', async () => {
    vi.spyOn(client, 'apiGet').mockResolvedValue({ ok: true, scanners: [baseScanner] });
    const patchSpy = vi.spyOn(client, 'apiPatch').mockResolvedValue({ ok: true });
    renderPage();

    await waitFor(() => expect(screen.getByText('Handheld scanner')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));

    fireEvent.change(screen.getByLabelText('Name', { selector: '#edit-name' }), { target: { value: 'Changed Name' } });
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(screen.getByText('Handheld scanner')).toBeInTheDocument();
    expect(screen.queryByText('Changed Name')).not.toBeInTheDocument();
    expect(patchSpy).not.toHaveBeenCalled();
  });

  it('Save calls update and returns to read-only reflecting new values', async () => {
    vi.spyOn(client, 'apiGet').mockResolvedValue({ ok: true, scanners: [baseScanner] });
    const patchSpy = vi.spyOn(client, 'apiPatch').mockResolvedValue({ ok: true });
    renderPage();

    await waitFor(() => expect(screen.getByText('Handheld scanner')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));

    fireEvent.change(screen.getByLabelText('Scanner cost', { selector: '#edit-scannerCost' }), { target: { value: '6500' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() =>
      expect(patchSpy).toHaveBeenCalledWith('/api/scanners/1', expect.objectContaining({ scannerCost: 6500 })),
    );
    await waitFor(() => expect(screen.queryByLabelText('Name', { selector: '#edit-name' })).not.toBeInTheDocument());
  });
});

describe('ScannersListPage — deep link', () => {
  it('navigating to /scanners/:id auto-expands the matching row', async () => {
    vi.spyOn(client, 'apiGet').mockImplementation((path) => {
      if (path === '/api/scanners') {
        return Promise.resolve({ ok: true, scanners: [baseScanner] });
      }
      if (path === '/api/scanners/1') {
        return Promise.resolve({ ok: true, scanner: baseScanner });
      }
      return Promise.reject(new Error(`Unexpected path: ${path}`));
    });
    renderAt('/scanners/1');

    await waitFor(() => expect(screen.getByLabelText('Name', { selector: '#edit-name' })).toHaveValue('Handheld scanner'));
  });
});
