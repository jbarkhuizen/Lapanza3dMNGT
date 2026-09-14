import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { PrintersListPage } from '../src/pages/printers/PrintersListPage.js';
import * as client from '../src/api/client.js';
import { createTestQueryClient } from './helpers/queryClient.js';

beforeEach(() => {
  vi.restoreAllMocks();
});

function renderPage(queryClient: QueryClient = createTestQueryClient()) {
  return render(
    <MemoryRouter>
      <QueryClientProvider client={queryClient}>
        <PrintersListPage />
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

function renderAt(path: string, queryClient: QueryClient = createTestQueryClient()) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <QueryClientProvider client={queryClient}>
        <Routes>
          <Route path="/printers" element={<PrintersListPage />} />
          <Route path="/printers/:id" element={<PrintersListPage />} />
        </Routes>
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

const basePrinter = {
  id: '1',
  name: 'Prusa MK4',
  make: 'Prusa',
  model: 'MK4',
  buildVolumeXMm: null,
  buildVolumeYMm: null,
  buildVolumeZMm: null,
  purchaseDate: null,
  purchaseCost: null,
  powerDrawWatts: null,
  electricityRatePerKwh: null,
  expectedLifetimeHours: null,
  status: 'active',
  process: 'fdm',
  createdAt: '2026-01-01T00:00:00.000Z',
};

function mockGet(printers: unknown[]) {
  vi.spyOn(client, 'apiGet').mockImplementation((path: string) => {
    if (path === '/api/printers') {
      return Promise.resolve({ ok: true, printers });
    }
    if (path === '/api/printers/1') {
      return Promise.resolve({ ok: true, printer: printers.find((p) => (p as { id: string }).id === '1') });
    }
    if (path === '/api/printers/1/presets') {
      return Promise.resolve({ ok: true, presets: [] });
    }
    if (path === '/api/printers/1/maintenance-log') {
      return Promise.resolve({ ok: true, entries: [] });
    }
    return Promise.reject(new Error(`Unexpected path: ${path}`));
  });
}

describe('PrintersListPage — list rendering', () => {
  it('lists printers returned by the API', async () => {
    mockGet([basePrinter]);
    renderPage();
    await waitFor(() => expect(screen.getByText('Prusa MK4')).toBeInTheDocument());
  });

  it('shows an empty state when there are no printers', async () => {
    mockGet([]);
    renderPage();
    await waitFor(() => expect(screen.getByText(/no printers yet/i)).toBeInTheDocument());
  });

  it('shows an error message when the list fails to load', async () => {
    vi.spyOn(client, 'apiGet').mockRejectedValue(new client.ApiError('Something went wrong.', 500));
    renderPage();
    await waitFor(() => expect(screen.getByText(/couldn't load printers/i)).toBeInTheDocument());
  });
});

describe('PrintersListPage — inline add form', () => {
  it('shows an always-visible essentials-only add form with "More details" collapsed', async () => {
    mockGet([]);
    renderPage();
    await waitFor(() => expect(screen.getByLabelText('Name', { selector: '#add-name' })).toBeInTheDocument());
    expect(screen.getByLabelText('Status', { selector: '#add-status' })).toBeInTheDocument();
    expect(screen.getByLabelText('Process', { selector: '#add-process' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '+ More details' })).toBeInTheDocument();
    expect(screen.queryByLabelText('Make')).not.toBeInTheDocument();
  });

  it('creates a printer with essentials only, defaulting status to active and process to fdm', async () => {
    mockGet([]);
    const postSpy = vi.spyOn(client, 'apiPost').mockResolvedValue({ ok: true, printer: { id: '1' } });
    renderPage();

    await waitFor(() => expect(screen.getByText(/no printers yet/i)).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText('Name', { selector: '#add-name' }), { target: { value: 'Prusa MK4' } });

    mockGet([basePrinter]);
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));

    await waitFor(() => expect(postSpy).toHaveBeenCalled());
    const [, body] = postSpy.mock.calls[0];
    expect(body).toMatchObject({ name: 'Prusa MK4', status: 'active', process: 'fdm' });
    expect((body as Record<string, unknown>).powerDrawWatts).toBeUndefined();

    await waitFor(() => expect(screen.getByText('Prusa MK4')).toBeInTheDocument());
  });

  it('includes an optional field from the expanded "More details" section in the create payload', async () => {
    mockGet([]);
    const postSpy = vi.spyOn(client, 'apiPost').mockResolvedValue({ ok: true, printer: { id: '1' } });
    renderPage();

    await waitFor(() => expect(screen.getByLabelText('Name', { selector: '#add-name' })).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText('Name', { selector: '#add-name' }), { target: { value: 'Prusa MK4' } });
    fireEvent.click(screen.getByRole('button', { name: '+ More details' }));
    fireEvent.change(screen.getByLabelText('Power draw (W)', { selector: '#add-powerDrawWatts' }), { target: { value: '250' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));

    await waitFor(() => expect(postSpy).toHaveBeenCalled());
    const [, body] = postSpy.mock.calls[0];
    expect((body as Record<string, unknown>).powerDrawWatts).toBe(250);
  });

  it('omits a blank purchase date instead of sending an empty string that fails server validation', async () => {
    mockGet([]);
    const postSpy = vi.spyOn(client, 'apiPost').mockResolvedValue({ ok: true, printer: { id: '1' } });
    renderPage();

    await waitFor(() => expect(screen.getByLabelText('Name', { selector: '#add-name' })).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText('Name', { selector: '#add-name' }), { target: { value: 'Prusa MK4' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));

    await waitFor(() => expect(postSpy).toHaveBeenCalled());
    const [, body] = postSpy.mock.calls[0];
    expect((body as Record<string, unknown>).purchaseDate).toBeUndefined();
  });

  it('does not render Presets/Maintenance Log sections in the add form', async () => {
    mockGet([]);
    renderPage();
    await waitFor(() => expect(screen.getByLabelText('Name', { selector: '#add-name' })).toBeInTheDocument());
    expect(screen.queryByText('Printer Presets')).not.toBeInTheDocument();
    expect(screen.queryByText('Maintenance Log')).not.toBeInTheDocument();
  });
});

describe('PrintersListPage — edit in place', () => {
  it('clicking Edit shows that row pre-filled with its current values (null optional fields become blank inputs)', async () => {
    mockGet([basePrinter]);
    renderPage();

    await waitFor(() => expect(screen.getByText('Prusa MK4')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));

    expect(screen.getByLabelText('Name', { selector: '#edit-name' })).toHaveValue('Prusa MK4');

    const editForm = screen.getByLabelText('Name', { selector: '#edit-name' }).closest('form')!;
    fireEvent.click(within(editForm).getByRole('button', { name: '+ More details' }));
    expect(within(editForm).getByLabelText('Make', { selector: '#edit-make' })).toHaveValue('Prusa');
    expect(within(editForm).getByLabelText('Power draw (W)', { selector: '#edit-powerDrawWatts' })).toHaveValue(null);
  });

  it('displays purchaseDate in YYYY-MM-DD format when editing a printer with an ISO datetime from backend', async () => {
    mockGet([{ ...basePrinter, purchaseDate: '2026-03-15T00:00:00.000Z' }]);
    renderPage();

    await waitFor(() => expect(screen.getByText('Prusa MK4')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    const editForm = screen.getByLabelText('Name', { selector: '#edit-name' }).closest('form')!;
    fireEvent.click(within(editForm).getByRole('button', { name: '+ More details' }));

    expect((within(editForm).getByLabelText('Purchase date') as HTMLInputElement).value).toBe('2026-03-15');
  });

  it('converts electricityRatePerKwh from a formatted API string to a number on load, and back to a number on save', async () => {
    mockGet([{ ...basePrinter, electricityRatePerKwh: '2.5000' }]);
    const patchSpy = vi.spyOn(client, 'apiPatch').mockResolvedValue({ ok: true });
    renderPage();

    await waitFor(() => expect(screen.getByText('Prusa MK4')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    const editForm = screen.getByLabelText('Name', { selector: '#edit-name' }).closest('form')!;
    fireEvent.click(within(editForm).getByRole('button', { name: '+ More details' }));

    expect(within(editForm).getByLabelText('Electricity rate per kWh')).toHaveValue(2.5);
    fireEvent.click(within(editForm).getByRole('button', { name: 'Save' }));

    await waitFor(() =>
      expect(patchSpy).toHaveBeenCalledWith('/api/printers/1', expect.objectContaining({ electricityRatePerKwh: 2.5 })),
    );
  });

  it('Cancel reverts to read-only without calling update', async () => {
    mockGet([basePrinter]);
    const patchSpy = vi.spyOn(client, 'apiPatch').mockResolvedValue({ ok: true });
    renderPage();

    await waitFor(() => expect(screen.getByText('Prusa MK4')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));

    const nameInput = screen.getByLabelText('Name', { selector: '#edit-name' });
    fireEvent.change(nameInput, { target: { value: 'Changed Name' } });
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(screen.getByText('Prusa MK4')).toBeInTheDocument();
    expect(screen.queryByText('Changed Name')).not.toBeInTheDocument();
    expect(patchSpy).not.toHaveBeenCalled();
  });

  it('Save calls update and returns to read-only reflecting new values', async () => {
    mockGet([basePrinter]);
    const patchSpy = vi.spyOn(client, 'apiPatch').mockResolvedValue({ ok: true });
    renderPage();

    await waitFor(() => expect(screen.getByText('Prusa MK4')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));

    const editForm = screen.getByLabelText('Name', { selector: '#edit-name' }).closest('form')!;
    fireEvent.click(within(editForm).getByRole('button', { name: '+ More details' }));
    const makeInput = within(editForm).getByLabelText('Make', { selector: '#edit-make' });
    fireEvent.change(makeInput, { target: { value: 'Bambu Lab' } });
    fireEvent.click(within(editForm).getByRole('button', { name: 'Save' }));

    await waitFor(() =>
      expect(patchSpy).toHaveBeenCalledWith('/api/printers/1', expect.objectContaining({ make: 'Bambu Lab' })),
    );
    await waitFor(() => expect(screen.queryByLabelText('Name', { selector: '#edit-name' })).not.toBeInTheDocument());
  });

  it('clearing powerDrawWatts via the × button sends an explicit null', async () => {
    mockGet([{ ...basePrinter, powerDrawWatts: 250 }]);
    const patchSpy = vi.spyOn(client, 'apiPatch').mockResolvedValue({ ok: true });
    renderPage();

    await waitFor(() => expect(screen.getByText('Prusa MK4')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    const editForm = screen.getByLabelText('Name', { selector: '#edit-name' }).closest('form')!;
    fireEvent.click(within(editForm).getByRole('button', { name: '+ More details' }));

    fireEvent.click(within(editForm).getByRole('button', { name: 'Clear Power draw (W)' }));
    fireEvent.click(within(editForm).getByRole('button', { name: 'Save' }));

    await waitFor(() =>
      expect(patchSpy).toHaveBeenCalledWith('/api/printers/1', expect.objectContaining({ powerDrawWatts: null })),
    );
  });

  it('renders Presets/Maintenance Log sections in the expanded edit row, always expanded (not behind More details)', async () => {
    mockGet([basePrinter]);
    renderPage();

    await waitFor(() => expect(screen.getByText('Prusa MK4')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));

    await waitFor(() => expect(screen.getByText('Printer Presets')).toBeInTheDocument());
    expect(screen.getByText('Maintenance Log')).toBeInTheDocument();
  });
});

describe('PrintersListPage — deep link', () => {
  it('navigating to /printers/:id auto-expands the matching row', async () => {
    mockGet([basePrinter]);
    renderAt('/printers/1');

    await waitFor(() => expect(screen.getByLabelText('Name', { selector: '#edit-name' })).toHaveValue('Prusa MK4'));
  });
});
