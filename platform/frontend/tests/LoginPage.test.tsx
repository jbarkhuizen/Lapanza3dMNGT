import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { LoginPage } from '../src/pages/auth/LoginPage.js';
import * as client from '../src/api/client.js';
import { AuthProvider } from '../src/context/AuthContext.js';

beforeEach(() => {
  vi.restoreAllMocks();
  vi.spyOn(client, 'apiGet').mockRejectedValue(new client.ApiError('Log in to continue.', 401));
});

function renderLogin() {
  return render(
    <MemoryRouter>
      <AuthProvider>
        <LoginPage />
      </AuthProvider>
    </MemoryRouter>,
  );
}

describe('LoginPage', () => {
  it('submits email and password to /api/auth/login', async () => {
    const postSpy = vi.spyOn(client, 'apiPost').mockResolvedValue({ ok: true });
    renderLogin();

    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'a@b.com' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'correct horse' } });
    fireEvent.click(screen.getByRole('button', { name: 'Log in' }));

    await waitFor(() =>
      expect(postSpy).toHaveBeenCalledWith('/api/auth/login', { email: 'a@b.com', password: 'correct horse' }),
    );
  });

  it('shows the server error message on failed login', async () => {
    vi.spyOn(client, 'apiPost').mockRejectedValue(new client.ApiError('Incorrect email or password.', 401));
    renderLogin();

    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'a@b.com' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'wrong' } });
    fireEvent.click(screen.getByRole('button', { name: 'Log in' }));

    await waitFor(() => expect(screen.getByText('Incorrect email or password.')).toBeInTheDocument());
  });
});
