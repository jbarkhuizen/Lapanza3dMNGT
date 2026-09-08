import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { App } from '../src/App.js';
import { AppProviders } from '../src/AppProviders.js';
import * as client from '../src/api/client.js';

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('App routing', () => {
  it('redirects an unauthenticated visitor at "/" to "/login"', async () => {
    vi.spyOn(client, 'apiGet').mockRejectedValue(new client.ApiError('Log in to continue.', 401));
    render(
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }} initialEntries={['/']}>
        <AppProviders>
          <App />
        </AppProviders>
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
        <AppProviders>
          <App />
        </AppProviders>
      </MemoryRouter>,
    );
    await waitFor(() => expect(screen.getByText(/Welcome, Acme Prints/)).toBeInTheDocument());
  });

  it('renders the register page at "/register" without requiring auth', async () => {
    vi.spyOn(client, 'apiGet').mockRejectedValue(new client.ApiError('Log in to continue.', 401));
    render(
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }} initialEntries={['/register']}>
        <AppProviders>
          <App />
        </AppProviders>
      </MemoryRouter>,
    );
    await waitFor(() => expect(screen.getByText('Create your account')).toBeInTheDocument());
  });

  it('renders a not-found page for an unknown path', async () => {
    vi.spyOn(client, 'apiGet').mockRejectedValue(new client.ApiError('Log in to continue.', 401));
    render(
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }} initialEntries={['/no-such-page']}>
        <AppProviders>
          <App />
        </AppProviders>
      </MemoryRouter>,
    );
    await waitFor(() => expect(screen.getByText('Page not found')).toBeInTheDocument());
    expect(screen.getByRole('link', { name: /back to dashboard/i })).toBeInTheDocument();
  });

  it('renders the Company Profile page at "/company-profile" for an authenticated tenant', async () => {
    vi.spyOn(client, 'apiGet').mockImplementation((path: string) => {
      if (path === '/api/auth/me') {
        return Promise.resolve({
          ok: true,
          tenant: { id: '1', businessName: 'Acme Prints', email: 'a@b.com', emailVerified: true },
        });
      }
      if (path === '/api/company-profile') {
        return Promise.resolve({
          ok: true,
          companyProfile: {
            businessName: 'Acme Prints', contactName: 'Jane', email: 'a@b.com', registrationNumber: null,
            vatRegistered: false, vatNumber: null, logoUrl: null, addressLine1: null, addressLine2: null,
            city: null, postalCode: null, phone: null, website: null, bankName: null, bankAccountHolder: null,
            bankAccountNumber: null, bankBranchCode: null, termsAndConditionsText: null, defaultCurrency: 'ZAR',
            defaultQuoteValidityDays: null, quoteNumberPrefix: 'QT', invoiceNumberPrefix: 'INV',
          },
        });
      }
      return Promise.reject(new client.ApiError('not found', 404));
    });
    render(
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }} initialEntries={['/company-profile']}>
        <AppProviders>
          <App />
        </AppProviders>
      </MemoryRouter>,
    );
    await waitFor(() => expect(screen.getByText('Company Profile')).toBeInTheDocument());
  });

  it('redirects an unauthenticated visitor at "/customers" to "/login"', async () => {
    vi.spyOn(client, 'apiGet').mockRejectedValue(new client.ApiError('Log in to continue.', 401));
    render(
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }} initialEntries={['/customers']}>
        <AppProviders>
          <App />
        </AppProviders>
      </MemoryRouter>,
    );
    await waitFor(() => expect(screen.getByText('Log in to Barkie')).toBeInTheDocument());
  });

  it('renders the Customers list page at "/customers" for an authenticated tenant', async () => {
    vi.spyOn(client, 'apiGet').mockImplementation((path: string) => {
      if (path === '/api/auth/me') {
        return Promise.resolve({
          ok: true,
          tenant: { id: '1', businessName: 'Acme Prints', email: 'a@b.com', emailVerified: true },
        });
      }
      if (path === '/api/customers') {
        return Promise.resolve({ ok: true, customers: [] });
      }
      return Promise.reject(new client.ApiError('not found', 404));
    });
    render(
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }} initialEntries={['/customers']}>
        <AppProviders>
          <App />
        </AppProviders>
      </MemoryRouter>,
    );
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Customers' })).toBeInTheDocument());
  });

  it('renders the Filaments list page at "/filaments" for an authenticated tenant', async () => {
    vi.spyOn(client, 'apiGet').mockImplementation((path: string) => {
      if (path === '/api/auth/me') {
        return Promise.resolve({
          ok: true,
          tenant: { id: '1', businessName: 'Acme Prints', email: 'a@b.com', emailVerified: true },
        });
      }
      if (path === '/api/filaments') {
        return Promise.resolve({ ok: true, filaments: [] });
      }
      return Promise.reject(new client.ApiError('not found', 404));
    });
    render(
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }} initialEntries={['/filaments']}>
        <AppProviders>
          <App />
        </AppProviders>
      </MemoryRouter>,
    );
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Filaments' })).toBeInTheDocument());
  });

  it('renders the Labour Steps list page at "/labour-steps" for an authenticated tenant', async () => {
    vi.spyOn(client, 'apiGet').mockImplementation((path: string) => {
      if (path === '/api/auth/me') {
        return Promise.resolve({
          ok: true,
          tenant: { id: '1', businessName: 'Acme Prints', email: 'a@b.com', emailVerified: true },
        });
      }
      if (path === '/api/labour-steps') {
        return Promise.resolve({ ok: true, labourSteps: [] });
      }
      return Promise.reject(new client.ApiError('not found', 404));
    });
    render(
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }} initialEntries={['/labour-steps']}>
        <AppProviders>
          <App />
        </AppProviders>
      </MemoryRouter>,
    );
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Labour Steps' })).toBeInTheDocument());
  });

  it('renders the Consumables list page at "/consumables" for an authenticated tenant', async () => {
    vi.spyOn(client, 'apiGet').mockImplementation((path: string) => {
      if (path === '/api/auth/me') {
        return Promise.resolve({
          ok: true,
          tenant: { id: '1', businessName: 'Acme Prints', email: 'a@b.com', emailVerified: true },
        });
      }
      if (path === '/api/consumables') {
        return Promise.resolve({ ok: true, consumables: [] });
      }
      return Promise.reject(new client.ApiError('not found', 404));
    });
    render(
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }} initialEntries={['/consumables']}>
        <AppProviders>
          <App />
        </AppProviders>
      </MemoryRouter>,
    );
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Consumables' })).toBeInTheDocument());
  });

  it('renders the Printers list page at "/printers" for an authenticated tenant', async () => {
    vi.spyOn(client, 'apiGet').mockImplementation((path: string) => {
      if (path === '/api/auth/me') {
        return Promise.resolve({
          ok: true,
          tenant: { id: '1', businessName: 'Acme Prints', email: 'a@b.com', emailVerified: true },
        });
      }
      if (path === '/api/printers') {
        return Promise.resolve({ ok: true, printers: [] });
      }
      return Promise.reject(new client.ApiError('not found', 404));
    });
    render(
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }} initialEntries={['/printers']}>
        <AppProviders>
          <App />
        </AppProviders>
      </MemoryRouter>,
    );
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Printers' })).toBeInTheDocument());
  });

  it('renders the Costing Templates list page at "/costing-templates" for an authenticated tenant', async () => {
    vi.spyOn(client, 'apiGet').mockImplementation((path: string) => {
      if (path === '/api/auth/me') {
        return Promise.resolve({
          ok: true,
          tenant: { id: '1', businessName: 'Acme Prints', email: 'a@b.com', emailVerified: true },
        });
      }
      if (path === '/api/costing-templates') {
        return Promise.resolve({ ok: true, costingTemplates: [] });
      }
      return Promise.reject(new client.ApiError('not found', 404));
    });
    render(
      <MemoryRouter
        future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
        initialEntries={['/costing-templates']}
      >
        <AppProviders>
          <App />
        </AppProviders>
      </MemoryRouter>,
    );
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Costing Templates' })).toBeInTheDocument());
  });

  it('renders the Costing Template create form at "/costing-templates/new" for an authenticated tenant', async () => {
    vi.spyOn(client, 'apiGet').mockImplementation((path: string) => {
      if (path === '/api/auth/me') {
        return Promise.resolve({
          ok: true,
          tenant: { id: '1', businessName: 'Acme Prints', email: 'a@b.com', emailVerified: true },
        });
      }
      if (path === '/api/filaments') {
        return Promise.resolve({ ok: true, filaments: [] });
      }
      if (path === '/api/printers') {
        return Promise.resolve({ ok: true, printers: [] });
      }
      if (path === '/api/labour-steps') {
        return Promise.resolve({ ok: true, labourSteps: [] });
      }
      if (path === '/api/consumables') {
        return Promise.resolve({ ok: true, consumables: [] });
      }
      return Promise.reject(new client.ApiError('not found', 404));
    });
    render(
      <MemoryRouter
        future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
        initialEntries={['/costing-templates/new']}
      >
        <AppProviders>
          <App />
        </AppProviders>
      </MemoryRouter>,
    );
    await waitFor(() => expect(screen.getByRole('heading', { name: 'New Costing Template' })).toBeInTheDocument());
  });

  it('renders the Quotes list page at "/quotes" for an authenticated tenant', async () => {
    vi.spyOn(client, 'apiGet').mockImplementation((path: string) => {
      if (path === '/api/auth/me') {
        return Promise.resolve({
          ok: true,
          tenant: { id: '1', businessName: 'Acme Prints', email: 'a@b.com', emailVerified: true },
        });
      }
      if (path === '/api/quotes') {
        return Promise.resolve({ ok: true, quotes: [] });
      }
      if (path === '/api/customers') {
        return Promise.resolve({ ok: true, customers: [] });
      }
      return Promise.reject(new client.ApiError('not found', 404));
    });
    render(
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }} initialEntries={['/quotes']}>
        <AppProviders>
          <App />
        </AppProviders>
      </MemoryRouter>,
    );
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Quotes' })).toBeInTheDocument());
  });

  it('renders the Quote create form at "/quotes/new" for an authenticated tenant', async () => {
    vi.spyOn(client, 'apiGet').mockImplementation((path: string) => {
      if (path === '/api/auth/me') {
        return Promise.resolve({
          ok: true,
          tenant: { id: '1', businessName: 'Acme Prints', email: 'a@b.com', emailVerified: true },
        });
      }
      if (path === '/api/customers') {
        return Promise.resolve({ ok: true, customers: [] });
      }
      if (path === '/api/costing-templates') {
        return Promise.resolve({ ok: true, costingTemplates: [] });
      }
      return Promise.reject(new client.ApiError('not found', 404));
    });
    render(
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }} initialEntries={['/quotes/new']}>
        <AppProviders>
          <App />
        </AppProviders>
      </MemoryRouter>,
    );
    await waitFor(() => expect(screen.getByRole('heading', { name: 'New Quote' })).toBeInTheDocument());
  });
});
