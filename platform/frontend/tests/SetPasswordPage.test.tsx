import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { SetPasswordPage } from '../src/pages/team/SetPasswordPage.js';
import * as client from '../src/api/client.js';

beforeEach(() => {
  vi.restoreAllMocks();
});

function renderWithToken(token: string | null) {
  const path = token ? `/set-password?token=${token}` : '/set-password';
  return render(
    <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }} initialEntries={[path]}>
      <Routes>
        <Route path="/set-password" element={<SetPasswordPage />} />
        <Route path="/login" element={<div>login page</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('SetPasswordPage', () => {
  it('shows an error and no form when there is no token in the URL', () => {
    renderWithToken(null);
    expect(screen.getByText(/no set-password token/i)).toBeInTheDocument();
    expect(screen.queryByLabelText('Password')).not.toBeInTheDocument();
  });

  it('submits the token and password to POST /api/team/set-password and redirects to login', async () => {
    const postSpy = vi.spyOn(client, 'apiPost').mockResolvedValue({ ok: true });
    renderWithToken('abc123');

    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'brand new password' } });
    fireEvent.change(screen.getByLabelText('Confirm password'), { target: { value: 'brand new password' } });
    fireEvent.click(screen.getByRole('button', { name: 'Set password' }));

    await waitFor(() =>
      expect(postSpy).toHaveBeenCalledWith('/api/team/set-password', {
        token: 'abc123',
        password: 'brand new password',
      }),
    );
    await waitFor(() => expect(screen.getByText('login page')).toBeInTheDocument());
  });

  it('shows an error when password and confirm password do not match', async () => {
    const postSpy = vi.spyOn(client, 'apiPost').mockResolvedValue({ ok: true });
    renderWithToken('abc123');

    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'brand new password' } });
    fireEvent.change(screen.getByLabelText('Confirm password'), { target: { value: 'different password' } });
    fireEvent.click(screen.getByRole('button', { name: 'Set password' }));

    await waitFor(() => expect(screen.getByText('Passwords do not match.')).toBeInTheDocument());
    expect(postSpy).not.toHaveBeenCalled();
  });

  it('shows the server error message when the token is invalid or expired', async () => {
    vi.spyOn(client, 'apiPost').mockRejectedValue(new client.ApiError('This link is invalid or has expired.', 400));
    renderWithToken('bad-token');

    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'brand new password' } });
    fireEvent.change(screen.getByLabelText('Confirm password'), { target: { value: 'brand new password' } });
    fireEvent.click(screen.getByRole('button', { name: 'Set password' }));

    await waitFor(() => expect(screen.getByText('This link is invalid or has expired.')).toBeInTheDocument());
  });
});
