import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { TeamPage } from '../src/pages/team/TeamPage.js';
import * as client from '../src/api/client.js';
import { createTestQueryClient } from './helpers/queryClient.js';

beforeEach(() => {
  vi.restoreAllMocks();
});

function renderPage() {
  const queryClient = createTestQueryClient();
  return render(
    <MemoryRouter>
      <QueryClientProvider client={queryClient}>
        <TeamPage />
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

const baseMember = {
  id: 'm1',
  name: 'Sam Sales',
  email: 'sam@acmeprints.co.za',
  role: 'sales' as const,
  active: true,
  hasSetPassword: true,
  createdAt: '2026-01-01T00:00:00.000Z',
};

describe('TeamPage', () => {
  it('lists team members returned by the API', async () => {
    vi.spyOn(client, 'apiGet').mockResolvedValue({ ok: true, teamMembers: [baseMember] });
    renderPage();
    await waitFor(() => expect(screen.getByText('Sam Sales')).toBeInTheDocument());
    expect(screen.getByText('sam@acmeprints.co.za')).toBeInTheDocument();
  });

  it('shows an empty state when there are no team members', async () => {
    vi.spyOn(client, 'apiGet').mockResolvedValue({ ok: true, teamMembers: [] });
    renderPage();
    await waitFor(() => expect(screen.getByText(/no team members yet/i)).toBeInTheDocument());
  });

  it('shows the active-member count against the 3-member cap', async () => {
    vi.spyOn(client, 'apiGet').mockResolvedValue({ ok: true, teamMembers: [baseMember] });
    renderPage();
    await waitFor(() => expect(screen.getByText('1 of 3 active members')).toBeInTheDocument());
  });

  it('submits a new invite via the Add member form', async () => {
    vi.spyOn(client, 'apiGet').mockResolvedValue({ ok: true, teamMembers: [] });
    const postSpy = vi.spyOn(client, 'apiPost').mockResolvedValue({
      ok: true,
      teamMember: { ...baseMember, id: 'm2', hasSetPassword: false },
    });
    renderPage();
    await waitFor(() => expect(screen.getByText(/no team members yet/i)).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'Add member' }));
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Sam Sales' } });
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'sam@acmeprints.co.za' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send invite' }));

    await waitFor(() =>
      expect(postSpy).toHaveBeenCalledWith('/api/team/invite', {
        name: 'Sam Sales',
        email: 'sam@acmeprints.co.za',
        role: 'sales',
      }),
    );
  });

  it('shows the invite error message when the cap is exceeded', async () => {
    vi.spyOn(client, 'apiGet').mockResolvedValue({ ok: true, teamMembers: [] });
    vi.spyOn(client, 'apiPost').mockRejectedValue(
      new client.ApiError('You can have at most 3 active team members.', 400),
    );
    renderPage();
    await waitFor(() => expect(screen.getByText(/no team members yet/i)).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'Add member' }));
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Sam Sales' } });
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'sam@acmeprints.co.za' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send invite' }));

    await waitFor(() =>
      expect(screen.getByText('You can have at most 3 active team members.')).toBeInTheDocument(),
    );
  });

  it('deactivates a member when the Deactivate button is clicked', async () => {
    vi.spyOn(client, 'apiGet').mockResolvedValue({ ok: true, teamMembers: [baseMember] });
    const patchSpy = vi.spyOn(client, 'apiPatch').mockResolvedValue({ ok: true });
    renderPage();
    await waitFor(() => expect(screen.getByText('Sam Sales')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'Deactivate' }));

    await waitFor(() => expect(patchSpy).toHaveBeenCalledWith('/api/team/m1', { active: false }));
  });

  it('deletes a member when the Delete button is clicked', async () => {
    vi.spyOn(client, 'apiGet').mockResolvedValue({ ok: true, teamMembers: [baseMember] });
    const deleteSpy = vi.spyOn(client, 'apiDelete').mockResolvedValue({ ok: true });
    renderPage();
    await waitFor(() => expect(screen.getByText('Sam Sales')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));

    await waitFor(() => expect(deleteSpy).toHaveBeenCalledWith('/api/team/m1'));
  });
});
