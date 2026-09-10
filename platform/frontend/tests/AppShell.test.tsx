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

  function renderWithSubscription(subscription: Record<string, unknown> | null) {
    vi.spyOn(client, 'apiGet').mockImplementation((path: string) => {
      if (path === '/api/auth/me') {
        return Promise.resolve({
          ok: true,
          tenant: { id: '1', businessName: 'Acme Prints', email: 'a@b.com', emailVerified: true, hasSubscription: true },
        });
      }
      if (path === '/api/billing/subscription') {
        return Promise.resolve({ ok: true, subscription });
      }
      return Promise.reject(new client.ApiError('not found', 404));
    });
    const queryClient = createTestQueryClient();
    return render(
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
  }

  it('shows a trial-days-remaining banner for a trialing subscription', async () => {
    const trialEndsAt = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString();
    renderWithSubscription({ status: 'trialing', trialEndsAt, currentPeriodEnd: null });
    await waitFor(() => expect(screen.getByText(/days left in your free trial/i)).toBeInTheDocument());
    expect(screen.getByText(/^5 days left in your free trial$/i)).toBeInTheDocument();
  });

  it('shows a past-due payment banner with a link to manage billing', async () => {
    renderWithSubscription({ status: 'past_due', trialEndsAt: new Date().toISOString(), currentPeriodEnd: null });
    await waitFor(() => expect(screen.getByText(/last payment failed/i)).toBeInTheDocument());
    expect(screen.getByRole('link', { name: /manage billing/i })).toHaveAttribute('href', '/billing');
  });

  it('shows a lapsed-subscription banner distinct from the past-due one', async () => {
    renderWithSubscription({ status: 'lapsed', trialEndsAt: new Date().toISOString(), currentPeriodEnd: null });
    await waitFor(() => expect(screen.getByText(/subscription has lapsed/i)).toBeInTheDocument());
    expect(screen.queryByText(/last payment failed/i)).not.toBeInTheDocument();
  });

  it('shows no status banner for an active subscription with plenty of time left', async () => {
    renderWithSubscription({
      status: 'active',
      trialEndsAt: new Date().toISOString(),
      currentPeriodEnd: new Date(Date.now() + 20 * 24 * 60 * 60 * 1000).toISOString(),
    });
    await waitFor(() => expect(screen.getByText('Acme Prints')).toBeInTheDocument());
    expect(screen.queryByText(/days left in your free trial/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/last payment failed/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/subscription has lapsed/i)).not.toBeInTheDocument();
  });

  it('shows no status banner when there is no subscription at all', async () => {
    renderWithSubscription(null);
    await waitFor(() => expect(screen.getByText('Acme Prints')).toBeInTheDocument());
    expect(screen.queryByText(/days left in your free trial/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/last payment failed/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/subscription has lapsed/i)).not.toBeInTheDocument();
  });
});
