import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { AppShell } from '../src/components/AppShell.js';
import { AuthProvider, useAuth } from '../src/context/AuthContext.js';
import * as client from '../src/api/client.js';
import { createTestQueryClient } from './helpers/queryClient.js';

function AuthProbe() {
  const { tenant } = useAuth();
  return <div>auth-probe: {tenant ? `logged in as ${tenant.businessName}` : 'logged out'}</div>;
}

beforeEach(() => {
  vi.restoreAllMocks();
  vi.spyOn(client, 'apiGet').mockImplementation((path: string) => {
    if (path === '/api/auth/me') {
      return Promise.resolve({
        ok: true,
        tenant: { id: '1', businessName: 'Acme Prints', email: 'a@b.com', emailVerified: true, hasSubscription: true },
      });
    }
    if (path === '/api/billing/subscription') {
      return Promise.resolve({ ok: true, subscription: null });
    }
    return Promise.reject(new client.ApiError('not found', 404));
  });
});

describe('AppShell', () => {
  it('shows the tenant business name once loaded', async () => {
    const queryClient = createTestQueryClient();
    render(
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <QueryClientProvider client={queryClient}>
          <AuthProvider>
            <AppShell>
              <div>page content</div>
            </AppShell>
          </AuthProvider>
        </QueryClientProvider>
      </MemoryRouter>,
    );
    await waitFor(() => expect(screen.getByText('Acme Prints')).toBeInTheDocument());
    expect(screen.getByText('page content')).toBeInTheDocument();
  });

  it('logs out and calls /api/auth/logout when the logout button is clicked', async () => {
    const postSpy = vi.spyOn(client, 'apiPost').mockResolvedValue({ ok: true });
    const queryClient = createTestQueryClient();
    render(
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <QueryClientProvider client={queryClient}>
          <AuthProvider>
            <AppShell>
              <div>page content</div>
            </AppShell>
          </AuthProvider>
        </QueryClientProvider>
      </MemoryRouter>,
    );
    await waitFor(() => expect(screen.getByText('Acme Prints')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'Log out' }));
    await waitFor(() => expect(postSpy).toHaveBeenCalledWith('/api/auth/logout'));
  });

  it('clears the tenant (logged-out, RequireAuth-redirect-eligible) once logout refetch gets a 401', async () => {
    const getSpy = vi.spyOn(client, 'apiGet');
    vi.spyOn(client, 'apiPost').mockResolvedValue({ ok: true });
    const queryClient = createTestQueryClient();
    render(
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <QueryClientProvider client={queryClient}>
          <AuthProvider>
            <AuthProbe />
            <AppShell>
              <div>page content</div>
            </AppShell>
          </AuthProvider>
        </QueryClientProvider>
      </MemoryRouter>,
    );
    await waitFor(() => expect(screen.getByText('auth-probe: logged in as Acme Prints')).toBeInTheDocument());

    getSpy.mockRejectedValueOnce(new client.ApiError('Log in to continue.', 401));
    fireEvent.click(screen.getByRole('button', { name: 'Log out' }));

    await waitFor(() => expect(screen.getByText('auth-probe: logged out')).toBeInTheDocument());
  });
});
