import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { LoginPage } from '../src/pages/auth/LoginPage.js';
import * as client from '../src/api/client.js';
import { AuthProvider } from '../src/context/AuthContext.js';

beforeEach(() => {
  vi.restoreAllMocks();
  vi.spyOn(client, 'apiGet').mockRejectedValue(new client.ApiError('Log in to continue.', 401));
});

function renderLogin() {
  return render(
    <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
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

  it('renders a "Need an account? Register" link that does not point at the /app/ prefix', async () => {
    renderLogin();
    const link = await screen.findByRole('link', { name: /register/i });
    expect(link.getAttribute('href')).not.toMatch(/^\/app\//);
  });

  it('navigates back to the page the user was trying to reach before being redirected to log in', async () => {
    vi.spyOn(client, 'apiPost').mockResolvedValue({ ok: true });
    render(
      <MemoryRouter
        future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
        initialEntries={[{ pathname: '/login', state: { from: { pathname: '/some-protected-page' } } }]}
      >
        <AuthProvider>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/some-protected-page" element={<div>protected page content</div>} />
          </Routes>
        </AuthProvider>
      </MemoryRouter>,
    );

    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'a@b.com' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'correct horse' } });
    fireEvent.click(screen.getByRole('button', { name: 'Log in' }));

    await waitFor(() => expect(screen.getByText('protected page content')).toBeInTheDocument());
  });

  it('shows a "Resend verification email" button only when login fails because the account is unverified', async () => {
    vi.spyOn(client, 'apiPost').mockRejectedValue(
      new client.ApiError('Verify your email address before logging in.', 403),
    );
    renderLogin();

    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'a@b.com' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'correct horse' } });
    fireEvent.click(screen.getByRole('button', { name: 'Log in' }));

    await waitFor(() => expect(screen.getByRole('button', { name: 'Resend verification email' })).toBeInTheDocument());
  });

  it('does not show the resend button for a wrong-password failure', async () => {
    vi.spyOn(client, 'apiPost').mockRejectedValue(new client.ApiError('Incorrect email or password.', 401));
    renderLogin();

    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'a@b.com' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'wrong' } });
    fireEvent.click(screen.getByRole('button', { name: 'Log in' }));

    await waitFor(() => expect(screen.getByText('Incorrect email or password.')).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: 'Resend verification email' })).not.toBeInTheDocument();
  });

  it('resends the verification email using the email already typed into the form', async () => {
    const postSpy = vi.spyOn(client, 'apiPost').mockImplementation((path: string) => {
      if (path === '/api/auth/login') {
        return Promise.reject(new client.ApiError('Verify your email address before logging in.', 403));
      }
      if (path === '/api/auth/resend-verification') {
        return Promise.resolve({ ok: true });
      }
      return Promise.reject(new client.ApiError('unexpected path', 500));
    });
    renderLogin();

    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'a@b.com' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'correct horse' } });
    fireEvent.click(screen.getByRole('button', { name: 'Log in' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Resend verification email' })).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'Resend verification email' }));

    await waitFor(() =>
      expect(postSpy).toHaveBeenCalledWith('/api/auth/resend-verification', { email: 'a@b.com' }),
    );
    await waitFor(() => expect(screen.getByText(/verification email sent/i)).toBeInTheDocument());
  });
});
