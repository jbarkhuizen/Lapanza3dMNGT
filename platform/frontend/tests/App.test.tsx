import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { App } from '../src/App.js';
import * as client from '../src/api/client.js';

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('App routing', () => {
  it('redirects an unauthenticated visitor at "/" to "/login"', async () => {
    vi.spyOn(client, 'apiGet').mockRejectedValue(new client.ApiError('Log in to continue.', 401));
    render(
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }} initialEntries={['/']}>
        <App />
      </MemoryRouter>,
    );
    await waitFor(() => expect(screen.getByText('Log in to Barkie')).toBeInTheDocument());
  });

  it('shows the dashboard at "/" for an authenticated tenant', async () => {
    vi.spyOn(client, 'apiGet').mockResolvedValue({
      ok: true,
      tenant: { id: '1', businessName: 'Acme Prints', email: 'a@b.com', emailVerified: true },
    });
    render(
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }} initialEntries={['/']}>
        <App />
      </MemoryRouter>,
    );
    await waitFor(() => expect(screen.getByText(/Welcome, Acme Prints/)).toBeInTheDocument());
  });

  it('renders the register page at "/register" without requiring auth', async () => {
    vi.spyOn(client, 'apiGet').mockRejectedValue(new client.ApiError('Log in to continue.', 401));
    render(
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }} initialEntries={['/register']}>
        <App />
      </MemoryRouter>,
    );
    await waitFor(() => expect(screen.getByText('Create your account')).toBeInTheDocument());
  });

  it('renders a not-found page for an unknown path', async () => {
    vi.spyOn(client, 'apiGet').mockRejectedValue(new client.ApiError('Log in to continue.', 401));
    render(
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }} initialEntries={['/company-profile']}>
        <App />
      </MemoryRouter>,
    );
    await waitFor(() => expect(screen.getByText('Page not found')).toBeInTheDocument());
    expect(screen.getByRole('link', { name: /back to dashboard/i })).toBeInTheDocument();
  });
});
