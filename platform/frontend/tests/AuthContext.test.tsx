import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { AuthProvider, useAuth } from '../src/context/AuthContext.js';
import * as client from '../src/api/client.js';

function Probe() {
  const { tenant, loading } = useAuth();
  if (loading) return <div>loading</div>;
  return <div>{tenant ? `logged in as ${tenant.businessName}` : 'logged out'}</div>;
}

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('AuthProvider', () => {
  it('shows loading, then the tenant, when /api/auth/me succeeds', async () => {
    vi.spyOn(client, 'apiGet').mockResolvedValue({
      ok: true,
      tenant: { id: '1', businessName: 'Acme Prints', email: 'a@b.com', emailVerified: true },
    });
    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );
    expect(screen.getByText('loading')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText('logged in as Acme Prints')).toBeInTheDocument());
  });

  it('shows logged out when /api/auth/me rejects (401)', async () => {
    vi.spyOn(client, 'apiGet').mockRejectedValue(new client.ApiError('Log in to continue.', 401));
    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );
    await waitFor(() => expect(screen.getByText('logged out')).toBeInTheDocument());
  });
});
