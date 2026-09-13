import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { PremadeItemsListPage } from '../src/pages/premadeItems/PremadeItemsListPage.js';
import { PremadeItemFormPage } from '../src/pages/premadeItems/PremadeItemFormPage.js';
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
        <PremadeItemsListPage />
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
          <Route path="/premade-items/new" element={<PremadeItemFormPage />} />
          <Route path="/premade-items/:id" element={<PremadeItemFormPage />} />
          <Route path="/premade-items" element={<div>premade items list</div>} />
        </Routes>
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

describe('PremadeItemsListPage', () => {
  it('lists premade items returned by the API', async () => {
    vi.spyOn(client, 'apiGet').mockResolvedValue({
      ok: true,
      premadeItems: [{ id: '1', name: 'Keychain blank', unitCost: 25, costMultiplier: 1, createdAt: '2026-01-01T00:00:00.000Z' }],
    });
    renderList();
    await waitFor(() => expect(screen.getByText('Keychain blank')).toBeInTheDocument());
  });

  it('shows an empty state when there are no premade items', async () => {
    vi.spyOn(client, 'apiGet').mockResolvedValue({ ok: true, premadeItems: [] });
    renderList();
    await waitFor(() => expect(screen.getByText(/no premade items yet/i)).toBeInTheDocument());
  });

  it('shows an error message when the list fails to load', async () => {
    vi.spyOn(client, 'apiGet').mockRejectedValue(new client.ApiError('Something went wrong.', 500));
    renderList();
    await waitFor(() => expect(screen.getByText(/couldn't load premade items/i)).toBeInTheDocument());
  });
});

describe('PremadeItemFormPage', () => {
  it('creates a premade item with the expected payload', async () => {
    const postSpy = vi.spyOn(client, 'apiPost').mockResolvedValue({ ok: true, premadeItem: { id: '1' } });
    renderFormAt('/premade-items/new');

    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Keychain blank' } });
    fireEvent.change(screen.getByLabelText('Unit cost'), { target: { value: '25' } });
    fireEvent.change(screen.getByLabelText('Cost multiplier'), { target: { value: '1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() =>
      expect(postSpy).toHaveBeenCalledWith('/api/premade-items', {
        name: 'Keychain blank',
        unitCost: 25,
        costMultiplier: 1,
      }),
    );
  });

  it('blocks submitting when unitCost is left blank', async () => {
    const postSpy = vi.spyOn(client, 'apiPost').mockResolvedValue({ ok: true, premadeItem: { id: '1' } });
    renderFormAt('/premade-items/new');

    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Keychain blank' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(postSpy).not.toHaveBeenCalled();
  });

  it('loads an existing premade item and saves changes', async () => {
    vi.spyOn(client, 'apiGet').mockResolvedValue({
      ok: true,
      premadeItem: { id: '1', name: 'Keychain blank', unitCost: 25, costMultiplier: 1, createdAt: '2026-01-01T00:00:00.000Z' },
    });
    const patchSpy = vi.spyOn(client, 'apiPatch').mockResolvedValue({ ok: true });
    renderFormAt('/premade-items/1');

    await waitFor(() => expect(screen.getByDisplayValue('Keychain blank')).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText('Unit cost'), { target: { value: '30' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() =>
      expect(patchSpy).toHaveBeenCalledWith('/api/premade-items/1', expect.objectContaining({ unitCost: 30 })),
    );
  });
});
