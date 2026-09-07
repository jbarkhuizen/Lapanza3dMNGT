import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { RegisterPage } from '../src/pages/auth/RegisterPage.js';
import * as client from '../src/api/client.js';

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('RegisterPage', () => {
  it('submits businessName, contactName, email, and password to /api/auth/register', async () => {
    const postSpy = vi.spyOn(client, 'apiPost').mockResolvedValue({ ok: true });
    render(
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <RegisterPage />
      </MemoryRouter>,
    );

    fireEvent.change(screen.getByLabelText('Business name'), { target: { value: 'Acme Prints' } });
    fireEvent.change(screen.getByLabelText('Your name'), { target: { value: 'Jane Doe' } });
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'jane@acme.co.za' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'correct horse battery staple' } });
    fireEvent.click(screen.getByRole('button', { name: 'Register' }));

    await waitFor(() =>
      expect(postSpy).toHaveBeenCalledWith('/api/auth/register', {
        businessName: 'Acme Prints',
        contactName: 'Jane Doe',
        email: 'jane@acme.co.za',
        password: 'correct horse battery staple',
      }),
    );
  });

  it('shows a success message after registering, instead of navigating away', async () => {
    vi.spyOn(client, 'apiPost').mockResolvedValue({ ok: true });
    render(
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <RegisterPage />
      </MemoryRouter>,
    );

    fireEvent.change(screen.getByLabelText('Business name'), { target: { value: 'Acme Prints' } });
    fireEvent.change(screen.getByLabelText('Your name'), { target: { value: 'Jane Doe' } });
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'jane@acme.co.za' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'correct horse battery staple' } });
    fireEvent.click(screen.getByRole('button', { name: 'Register' }));

    await waitFor(() => expect(screen.getByText(/check your email/i)).toBeInTheDocument());
  });

  it('renders an "Already have an account? Log in" link that does not point at the /app/ prefix', () => {
    render(
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <RegisterPage />
      </MemoryRouter>,
    );
    expect(screen.getByRole('link', { name: /log in/i }).getAttribute('href')).not.toMatch(/^\/app\//);
  });
});
