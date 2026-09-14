import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { LabourStepsListPage } from '../src/pages/labourSteps/LabourStepsListPage.js';
import * as client from '../src/api/client.js';
import { createTestQueryClient } from './helpers/queryClient.js';

beforeEach(() => {
  vi.restoreAllMocks();
});

function renderPage(queryClient: QueryClient = createTestQueryClient()) {
  return render(
    <MemoryRouter>
      <QueryClientProvider client={queryClient}>
        <LabourStepsListPage />
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

function renderAt(path: string, queryClient: QueryClient = createTestQueryClient()) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <QueryClientProvider client={queryClient}>
        <Routes>
          <Route path="/labour-steps" element={<LabourStepsListPage />} />
          <Route path="/labour-steps/:id" element={<LabourStepsListPage />} />
        </Routes>
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

const baseLabourStep = { id: '1', name: 'Slicing', hourlyRate: 150, active: true, createdAt: '2026-01-01T00:00:00.000Z' };

describe('LabourStepsListPage — list rendering', () => {
  it('lists labour steps returned by the API', async () => {
    vi.spyOn(client, 'apiGet').mockResolvedValue({ ok: true, labourSteps: [baseLabourStep] });
    renderPage();
    await waitFor(() => expect(screen.getByText('Slicing')).toBeInTheDocument());
  });

  it('shows an empty state when there are no labour steps', async () => {
    vi.spyOn(client, 'apiGet').mockResolvedValue({ ok: true, labourSteps: [] });
    renderPage();
    await waitFor(() => expect(screen.getByText(/no labour steps yet/i)).toBeInTheDocument());
  });

  it('shows an error message when the list fails to load', async () => {
    vi.spyOn(client, 'apiGet').mockRejectedValue(new client.ApiError('Something went wrong.', 500));
    renderPage();
    await waitFor(() => expect(screen.getByText(/couldn't load labour steps/i)).toBeInTheDocument());
  });
});

describe('LabourStepsListPage — inline add form', () => {
  it('shows an always-visible essentials-only add form with "More details" collapsed', async () => {
    vi.spyOn(client, 'apiGet').mockResolvedValue({ ok: true, labourSteps: [] });
    renderPage();
    await waitFor(() => expect(screen.getByLabelText('Name', { selector: '#add-name' })).toBeInTheDocument());
    expect(screen.getByLabelText('Hourly rate', { selector: '#add-hourlyRate' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '+ More details' })).toBeInTheDocument();
    expect(screen.queryByLabelText('Active', { selector: '#add-active' })).not.toBeInTheDocument();
  });

  it('creates a labour step via the essentials-only form with the active checkbox defaulting to true', async () => {
    const getSpy = vi.spyOn(client, 'apiGet').mockResolvedValue({ ok: true, labourSteps: [] });
    const postSpy = vi.spyOn(client, 'apiPost').mockResolvedValue({ ok: true, labourStep: { id: '1' } });
    renderPage();

    await waitFor(() => expect(screen.getByText(/no labour steps yet/i)).toBeInTheDocument());

    fireEvent.change(screen.getByLabelText('Name', { selector: '#add-name' }), { target: { value: 'Slicing' } });
    fireEvent.change(screen.getByLabelText('Hourly rate', { selector: '#add-hourlyRate' }), { target: { value: '150' } });

    getSpy.mockResolvedValue({ ok: true, labourSteps: [baseLabourStep] });
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));

    await waitFor(() => expect(postSpy).toHaveBeenCalled());
    const [, body] = postSpy.mock.calls[0];
    expect(body).toMatchObject({ name: 'Slicing', hourlyRate: 150, active: true });

    await waitFor(() => expect(screen.getByText('Slicing')).toBeInTheDocument());
  });

  it('can uncheck the active checkbox in "More details" before creating', async () => {
    vi.spyOn(client, 'apiGet').mockResolvedValue({ ok: true, labourSteps: [] });
    const postSpy = vi.spyOn(client, 'apiPost').mockResolvedValue({ ok: true, labourStep: { id: '1' } });
    renderPage();

    await waitFor(() => expect(screen.getByLabelText('Name', { selector: '#add-name' })).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText('Name', { selector: '#add-name' }), { target: { value: 'Slicing' } });
    fireEvent.change(screen.getByLabelText('Hourly rate', { selector: '#add-hourlyRate' }), { target: { value: '150' } });
    fireEvent.click(screen.getByRole('button', { name: '+ More details' }));
    fireEvent.click(screen.getByLabelText('Active', { selector: '#add-active' }));
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));

    await waitFor(() => expect(postSpy).toHaveBeenCalled());
    const [, body] = postSpy.mock.calls[0];
    expect((body as Record<string, unknown>).active).toBe(false);
  });

  it('blocks submitting the add form when hourlyRate is left blank', async () => {
    vi.spyOn(client, 'apiGet').mockResolvedValue({ ok: true, labourSteps: [] });
    const postSpy = vi.spyOn(client, 'apiPost').mockResolvedValue({ ok: true, labourStep: { id: '1' } });
    renderPage();

    await waitFor(() => expect(screen.getByLabelText('Name', { selector: '#add-name' })).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText('Name', { selector: '#add-name' }), { target: { value: 'Slicing' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));

    expect(postSpy).not.toHaveBeenCalled();
  });
});

describe('LabourStepsListPage — edit in place', () => {
  it('clicking Edit shows that row pre-filled with its current values', async () => {
    vi.spyOn(client, 'apiGet').mockResolvedValue({ ok: true, labourSteps: [baseLabourStep] });
    renderPage();

    await waitFor(() => expect(screen.getByText('Slicing')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));

    expect(screen.getByLabelText('Name', { selector: '#edit-name' })).toHaveValue('Slicing');
    expect(screen.getByLabelText('Hourly rate', { selector: '#edit-hourlyRate' })).toHaveValue(150);
  });

  it('Cancel reverts to read-only without calling update', async () => {
    vi.spyOn(client, 'apiGet').mockResolvedValue({ ok: true, labourSteps: [baseLabourStep] });
    const patchSpy = vi.spyOn(client, 'apiPatch').mockResolvedValue({ ok: true });
    renderPage();

    await waitFor(() => expect(screen.getByText('Slicing')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));

    fireEvent.change(screen.getByLabelText('Name', { selector: '#edit-name' }), { target: { value: 'Changed Name' } });
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(screen.getByText('Slicing')).toBeInTheDocument();
    expect(screen.queryByText('Changed Name')).not.toBeInTheDocument();
    expect(patchSpy).not.toHaveBeenCalled();
  });

  it('Save calls update and returns to read-only reflecting new values', async () => {
    vi.spyOn(client, 'apiGet').mockResolvedValue({ ok: true, labourSteps: [baseLabourStep] });
    const patchSpy = vi.spyOn(client, 'apiPatch').mockResolvedValue({ ok: true });
    renderPage();

    await waitFor(() => expect(screen.getByText('Slicing')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));

    fireEvent.change(screen.getByLabelText('Hourly rate', { selector: '#edit-hourlyRate' }), { target: { value: '175' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() =>
      expect(patchSpy).toHaveBeenCalledWith('/api/labour-steps/1', expect.objectContaining({ hourlyRate: 175 })),
    );
    await waitFor(() => expect(screen.queryByLabelText('Name', { selector: '#edit-name' })).not.toBeInTheDocument());
  });
});

describe('LabourStepsListPage — deep link', () => {
  it('navigating to /labour-steps/:id auto-expands the matching row', async () => {
    vi.spyOn(client, 'apiGet').mockImplementation((path) => {
      if (path === '/api/labour-steps') {
        return Promise.resolve({ ok: true, labourSteps: [baseLabourStep] });
      }
      if (path === '/api/labour-steps/1') {
        return Promise.resolve({ ok: true, labourStep: baseLabourStep });
      }
      return Promise.reject(new Error(`Unexpected path: ${path}`));
    });
    renderAt('/labour-steps/1');

    await waitFor(() => expect(screen.getByLabelText('Name', { selector: '#edit-name' })).toHaveValue('Slicing'));
  });
});
