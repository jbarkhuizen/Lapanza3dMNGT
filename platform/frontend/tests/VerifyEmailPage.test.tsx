import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { VerifyEmailPage } from '../src/pages/auth/VerifyEmailPage.js';
import * as client from '../src/api/client.js';

beforeEach(() => {
  vi.restoreAllMocks();
});

function renderWithToken(token: string | null, options?: { strictMode?: boolean }) {
  const path = token ? `/verify-email?token=${token}` : '/verify-email';
  const tree = (
    <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }} initialEntries={[path]}>
      <Routes>
        <Route path="/verify-email" element={<VerifyEmailPage />} />
      </Routes>
    </MemoryRouter>
  );
  return render(options?.strictMode ? <React.StrictMode>{tree}</React.StrictMode> : tree);
}

describe('VerifyEmailPage', () => {
  it('reads the token from the query string and posts it to /api/auth/verify-email', async () => {
    const postSpy = vi.spyOn(client, 'apiPost').mockResolvedValue({ ok: true });
    renderWithToken('abc123');
    await waitFor(() => expect(postSpy).toHaveBeenCalledWith('/api/auth/verify-email', { token: 'abc123' }));
    await waitFor(() => expect(screen.getByText(/verified/i)).toBeInTheDocument());
  });

  it('posts the verification request exactly once under React.StrictMode double-invoked effects', async () => {
    const postSpy = vi.spyOn(client, 'apiPost').mockResolvedValue({ ok: true });
    renderWithToken('abc123', { strictMode: true });
    await waitFor(() => expect(screen.getByText(/verified/i)).toBeInTheDocument());
    expect(postSpy).toHaveBeenCalledTimes(1);
  });

  it('renders a "Log in to continue" link that does not point at the /app/ prefix', async () => {
    vi.spyOn(client, 'apiPost').mockResolvedValue({ ok: true });
    renderWithToken('abc123');
    await waitFor(() => expect(screen.getByText(/verified/i)).toBeInTheDocument());
    expect(screen.getByRole('link', { name: /log in to continue/i }).getAttribute('href')).not.toMatch(/^\/app\//);
  });

  it('shows an error message when verification fails', async () => {
    vi.spyOn(client, 'apiPost').mockRejectedValue(
      new client.ApiError('This verification link is invalid or has expired.', 400),
    );
    renderWithToken('bad-token');
    await waitFor(() =>
      expect(screen.getByText('This verification link is invalid or has expired.')).toBeInTheDocument(),
    );
  });

  it('shows an error message when there is no token in the URL', async () => {
    renderWithToken(null);
    await waitFor(() => expect(screen.getByText(/no verification token/i)).toBeInTheDocument());
  });
});
