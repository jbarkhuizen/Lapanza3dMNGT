import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AppShell } from '../src/components/AppShell.js';
import { AuthProvider } from '../src/context/AuthContext.js';
import * as client from '../src/api/client.js';

beforeEach(() => {
  vi.restoreAllMocks();
  vi.spyOn(client, 'apiGet').mockResolvedValue({
    ok: true,
    tenant: { id: '1', businessName: 'Acme Prints', email: 'a@b.com', emailVerified: true },
  });
});

describe('AppShell', () => {
  it('shows the tenant business name once loaded', async () => {
    render(
      <MemoryRouter>
        <AuthProvider>
          <AppShell>
            <div>page content</div>
          </AppShell>
        </AuthProvider>
      </MemoryRouter>,
    );
    await waitFor(() => expect(screen.getByText('Acme Prints')).toBeInTheDocument());
    expect(screen.getByText('page content')).toBeInTheDocument();
  });

  it('logs out and calls /api/auth/logout when the logout button is clicked', async () => {
    const postSpy = vi.spyOn(client, 'apiPost').mockResolvedValue({ ok: true });
    render(
      <MemoryRouter>
        <AuthProvider>
          <AppShell>
            <div>page content</div>
          </AppShell>
        </AuthProvider>
      </MemoryRouter>,
    );
    await waitFor(() => expect(screen.getByText('Acme Prints')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'Log out' }));
    await waitFor(() => expect(postSpy).toHaveBeenCalledWith('/api/auth/logout'));
  });
});
