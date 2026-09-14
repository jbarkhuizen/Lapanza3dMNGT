import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { PremadeItemsListPage } from '../src/pages/premadeItems/PremadeItemsListPage.js';
import * as client from '../src/api/client.js';
import { createTestQueryClient } from './helpers/queryClient.js';

beforeEach(() => {
  vi.restoreAllMocks();
});

function renderPage(queryClient: QueryClient = createTestQueryClient()) {
  return render(
    <MemoryRouter>
      <QueryClientProvider client={queryClient}>
        <PremadeItemsListPage />
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

function renderAt(path: string, queryClient: QueryClient = createTestQueryClient()) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <QueryClientProvider client={queryClient}>
        <Routes>
          <Route path="/premade-items" element={<PremadeItemsListPage />} />
          <Route path="/premade-items/:id" element={<PremadeItemsListPage />} />
        </Routes>
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

const basePremadeItem = { id: '1', name: 'Keychain blank', unitCost: 25, costMultiplier: 1, createdAt: '2026-01-01T00:00:00.000Z' };

describe('PremadeItemsListPage — list rendering', () => {
  it('lists premade items returned by the API', async () => {
    vi.spyOn(client, 'apiGet').mockResolvedValue({ ok: true, premadeItems: [basePremadeItem] });
    renderPage();
    await waitFor(() => expect(screen.getByText('Keychain blank')).toBeInTheDocument());
  });

  it('shows an empty state when there are no premade items', async () => {
    vi.spyOn(client, 'apiGet').mockResolvedValue({ ok: true, premadeItems: [] });
    renderPage();
    await waitFor(() => expect(screen.getByText(/no premade items yet/i)).toBeInTheDocument());
  });

  it('shows an error message when the list fails to load', async () => {
    vi.spyOn(client, 'apiGet').mockRejectedValue(new client.ApiError('Something went wrong.', 500));
    renderPage();
    await waitFor(() => expect(screen.getByText(/couldn't load premade items/i)).toBeInTheDocument());
  });

  it('deletes a premade item when confirmed', async () => {
    vi.spyOn(client, 'apiGet').mockResolvedValue({ ok: true, premadeItems: [basePremadeItem] });
    const deleteSpy = vi.spyOn(client, 'apiDelete').mockResolvedValue({ ok: true });
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    renderPage();
    await waitFor(() => expect(screen.getByText('Keychain blank')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(deleteSpy).toHaveBeenCalledWith('/api/premade-items/1'));
  });
});

describe('PremadeItemsListPage — inline add form', () => {
  it('shows an always-visible essentials-only add form with "More details" collapsed', async () => {
    vi.spyOn(client, 'apiGet').mockResolvedValue({ ok: true, premadeItems: [] });
    renderPage();
    await waitFor(() => expect(screen.getByLabelText('Name', { selector: '#add-name' })).toBeInTheDocument());
    expect(screen.getByLabelText('Unit cost', { selector: '#add-unitCost' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '+ More details' })).toBeInTheDocument();
    expect(screen.queryByLabelText('Cost multiplier', { selector: '#add-costMultiplier' })).not.toBeInTheDocument();
  });

  it('creates a premade item via the essentials-only form and shows the new row without a manual refetch', async () => {
    const getSpy = vi.spyOn(client, 'apiGet').mockResolvedValue({ ok: true, premadeItems: [] });
    const postSpy = vi.spyOn(client, 'apiPost').mockResolvedValue({ ok: true, premadeItem: { id: '1' } });
    renderPage();

    await waitFor(() => expect(screen.getByText(/no premade items yet/i)).toBeInTheDocument());

    fireEvent.change(screen.getByLabelText('Name', { selector: '#add-name' }), { target: { value: 'Keychain blank' } });
    fireEvent.change(screen.getByLabelText('Unit cost', { selector: '#add-unitCost' }), { target: { value: '25' } });

    getSpy.mockResolvedValue({ ok: true, premadeItems: [basePremadeItem] });
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));

    await waitFor(() => expect(postSpy).toHaveBeenCalled());
    const [, body] = postSpy.mock.calls[0];
    expect(body).toMatchObject({ name: 'Keychain blank', unitCost: 25 });
    expect((body as Record<string, unknown>).costMultiplier).toBeUndefined();

    await waitFor(() => expect(screen.getByText('Keychain blank')).toBeInTheDocument());
  });

  it('includes an optional field from the expanded "More details" section in the create payload', async () => {
    vi.spyOn(client, 'apiGet').mockResolvedValue({ ok: true, premadeItems: [] });
    const postSpy = vi.spyOn(client, 'apiPost').mockResolvedValue({ ok: true, premadeItem: { id: '1' } });
    renderPage();

    await waitFor(() => expect(screen.getByLabelText('Name', { selector: '#add-name' })).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText('Name', { selector: '#add-name' }), { target: { value: 'Keychain blank' } });
    fireEvent.change(screen.getByLabelText('Unit cost', { selector: '#add-unitCost' }), { target: { value: '25' } });
    fireEvent.click(screen.getByRole('button', { name: '+ More details' }));
    fireEvent.change(screen.getByLabelText('Cost multiplier', { selector: '#add-costMultiplier' }), { target: { value: '1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));

    await waitFor(() => expect(postSpy).toHaveBeenCalled());
    const [, body] = postSpy.mock.calls[0];
    expect((body as Record<string, unknown>).costMultiplier).toBe(1);
  });

  it('blocks submitting the add form when unitCost is left blank', async () => {
    vi.spyOn(client, 'apiGet').mockResolvedValue({ ok: true, premadeItems: [] });
    const postSpy = vi.spyOn(client, 'apiPost').mockResolvedValue({ ok: true, premadeItem: { id: '1' } });
    renderPage();

    await waitFor(() => expect(screen.getByLabelText('Name', { selector: '#add-name' })).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText('Name', { selector: '#add-name' }), { target: { value: 'Keychain blank' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));

    expect(postSpy).not.toHaveBeenCalled();
  });
});

describe('PremadeItemsListPage — edit in place', () => {
  it('clicking Edit shows that row pre-filled with its current values', async () => {
    vi.spyOn(client, 'apiGet').mockResolvedValue({ ok: true, premadeItems: [basePremadeItem] });
    renderPage();

    await waitFor(() => expect(screen.getByText('Keychain blank')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));

    expect(screen.getByLabelText('Name', { selector: '#edit-name' })).toHaveValue('Keychain blank');
    expect(screen.getByLabelText('Unit cost', { selector: '#edit-unitCost' })).toHaveValue(25);
  });

  it('Cancel reverts to read-only without calling update', async () => {
    vi.spyOn(client, 'apiGet').mockResolvedValue({ ok: true, premadeItems: [basePremadeItem] });
    const patchSpy = vi.spyOn(client, 'apiPatch').mockResolvedValue({ ok: true });
    renderPage();

    await waitFor(() => expect(screen.getByText('Keychain blank')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));

    fireEvent.change(screen.getByLabelText('Name', { selector: '#edit-name' }), { target: { value: 'Changed Name' } });
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(screen.getByText('Keychain blank')).toBeInTheDocument();
    expect(screen.queryByText('Changed Name')).not.toBeInTheDocument();
    expect(patchSpy).not.toHaveBeenCalled();
  });

  it('Save calls update and returns to read-only reflecting new values', async () => {
    vi.spyOn(client, 'apiGet').mockResolvedValue({ ok: true, premadeItems: [basePremadeItem] });
    const patchSpy = vi.spyOn(client, 'apiPatch').mockResolvedValue({ ok: true });
    renderPage();

    await waitFor(() => expect(screen.getByText('Keychain blank')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));

    fireEvent.change(screen.getByLabelText('Unit cost', { selector: '#edit-unitCost' }), { target: { value: '30' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() =>
      expect(patchSpy).toHaveBeenCalledWith('/api/premade-items/1', expect.objectContaining({ unitCost: 30 })),
    );
    await waitFor(() => expect(screen.queryByLabelText('Name', { selector: '#edit-name' })).not.toBeInTheDocument());
  });
});

describe('PremadeItemsListPage — deep link', () => {
  it('navigating to /premade-items/:id auto-expands the matching row', async () => {
    vi.spyOn(client, 'apiGet').mockImplementation((path) => {
      if (path === '/api/premade-items') {
        return Promise.resolve({ ok: true, premadeItems: [basePremadeItem] });
      }
      if (path === '/api/premade-items/1') {
        return Promise.resolve({ ok: true, premadeItem: basePremadeItem });
      }
      return Promise.reject(new Error(`Unexpected path: ${path}`));
    });
    renderAt('/premade-items/1');

    await waitFor(() => expect(screen.getByLabelText('Name', { selector: '#edit-name' })).toHaveValue('Keychain blank'));
  });
});
