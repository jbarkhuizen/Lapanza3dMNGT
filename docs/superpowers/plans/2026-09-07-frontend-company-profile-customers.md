# Frontend: Company Profile + Customers Pages Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Phase 3 of the frontend build-out (per `docs/superpowers/specs/2026-09-07-frontend-deploy-design.md`'s execution order): the Company Profile settings page and the Customers list/create/edit pages — the first two real data-driven pages built on the Frontend Foundation (auth, shell, routing, API client) merged earlier tonight.

**Architecture:** Each page uses `@tanstack/react-query`'s `useQuery`/`useMutation` against the existing typed `apiGet`/`apiPost`/`apiPatch` client — no new fetch logic, no new global state. Two new small form field components (`Checkbox`, `TextareaField`) extend the existing `FormField` pattern for the field types Company Profile needs that plain text inputs don't cover.

**Tech Stack:** Same as Frontend Foundation — React 18, TypeScript, Vite, Tailwind, React Router v6, `@tanstack/react-query`, Vitest + React Testing Library.

## Global Constraints

- Every API call goes through `apiGet`/`apiPost`/`apiPatch` (`src/api/client.ts`) — never raw `fetch`.
- Every internal navigation uses React Router's `<Link>`/`useNavigate` — never a hardcoded `<a href="/app/...">` (this exact bug was found and fixed in Frontend Foundation; don't reintroduce it).
- Every new authenticated page is wrapped in the existing `<RequireAuth><AppShell>...</AppShell></RequireAuth>` pattern in `src/App.tsx`, and gets exactly one entry added to `AppShell.tsx`'s `NAV_ITEMS`.
- Every page that fetches data uses `useQuery`; every page that writes data uses `useMutation` with `queryClient.invalidateQueries` on success so the UI reflects the write without a manual refetch.
- Test files that render a component using `useQuery`/`useMutation` MUST wrap it in a `<QueryClientProvider client={...}>` with a fresh `QueryClient` per test (`retry: false` in `defaultOptions.queries` so a mocked-rejection test doesn't retry and slow down / time out) — mirroring how `tests/App.test.tsx` already wraps with `<AppProviders>` for the real provider, but tests for individual pages (not going through `<App />`) need their own lightweight wrapper instead of importing the app-wide singleton `AppProviders` (which would leak cache state between unrelated tests).
- Money/Decimal fields: neither Company Profile nor Customer has any Decimal-backed field (verified against `platform/api/prisma/schema.prisma` — `Tenant`'s company-profile fields and `Customer` are all `String`/`Boolean`/`Int`), so no currency-formatting helper is needed in this phase.

---

### Task 1: Company Profile page

**Files:**
- Create: `platform/frontend/src/components/Checkbox.tsx`
- Create: `platform/frontend/tests/Checkbox.test.tsx`
- Create: `platform/frontend/src/components/TextareaField.tsx`
- Create: `platform/frontend/tests/TextareaField.test.tsx`
- Create: `platform/frontend/src/api/companyProfile.ts`
- Create: `platform/frontend/src/pages/CompanyProfilePage.tsx`
- Create: `platform/frontend/tests/CompanyProfilePage.test.tsx`
- Create: `platform/frontend/tests/helpers/queryClient.ts`
- Modify: `platform/frontend/src/components/AppShell.tsx` (add nav entry)
- Modify: `platform/frontend/src/App.tsx` (add route)
- Modify: `platform/frontend/tests/App.test.tsx` (routing test for the new route)

**Interfaces:**
- Consumes: `apiGet`/`apiPatch` (Frontend Foundation), `AppShell`'s `NAV_ITEMS` array, `App.tsx`'s route tree, `RequireAuth`.
- Produces: `tests/helpers/queryClient.ts`'s `createTestQueryClient()` — a fresh, no-retry `QueryClient` factory every later phase's page tests reuse (Customers in Task 2, and every future module page).
- Produces: `Checkbox` and `TextareaField` components, reused by Task 2 (`TextareaField` for the Customer `notes` field) and every later phase.

- [ ] **Step 1: Create the shared test QueryClient helper**

Create `platform/frontend/tests/helpers/queryClient.ts`:

```typescript
import { QueryClient } from '@tanstack/react-query';

export function createTestQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
}
```

- [ ] **Step 2: Write the failing `Checkbox` test**

Create `platform/frontend/tests/Checkbox.test.tsx`:

```typescript
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Checkbox } from '../src/components/Checkbox.js';

describe('Checkbox', () => {
  it('renders a labeled checkbox reflecting the checked prop', () => {
    render(<Checkbox id="vat" label="VAT registered" checked={true} onChange={() => {}} />);
    const input = screen.getByLabelText('VAT registered') as HTMLInputElement;
    expect(input.type).toBe('checkbox');
    expect(input.checked).toBe(true);
  });

  it('calls onChange with the new checked value when toggled', () => {
    const onChange = vi.fn();
    render(<Checkbox id="vat" label="VAT registered" checked={false} onChange={onChange} />);
    fireEvent.click(screen.getByLabelText('VAT registered'));
    expect(onChange).toHaveBeenCalledWith(true);
  });
});
```

- [ ] **Step 3: Run the test, verify it fails**

```bash
npx vitest run tests/Checkbox.test.tsx
```
Expected: FAIL — `src/components/Checkbox.tsx` does not exist yet.

- [ ] **Step 4: Implement `Checkbox`**

Create `platform/frontend/src/components/Checkbox.tsx`:

```typescript
interface CheckboxProps {
  id: string;
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}

export function Checkbox({ id, label, checked, onChange }: CheckboxProps) {
  return (
    <div className="flex items-center gap-2">
      <input
        id={id}
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-4 w-4 rounded border-slate-300"
      />
      <label htmlFor={id} className="text-sm font-medium text-slate-700">
        {label}
      </label>
    </div>
  );
}
```

- [ ] **Step 5: Run the test, verify it passes**

```bash
npx vitest run tests/Checkbox.test.tsx
```
Expected: PASS, both tests.

- [ ] **Step 6: Write the failing `TextareaField` test**

Create `platform/frontend/tests/TextareaField.test.tsx`:

```typescript
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { TextareaField } from '../src/components/TextareaField.js';

describe('TextareaField', () => {
  it('renders a labeled textarea with the given value', () => {
    render(<TextareaField id="notes" label="Notes" value="Some notes" onChange={() => {}} />);
    expect(screen.getByLabelText('Notes')).toHaveValue('Some notes');
  });

  it('calls onChange with the new text when edited', () => {
    const onChange = vi.fn();
    render(<TextareaField id="notes" label="Notes" value="" onChange={onChange} />);
    fireEvent.change(screen.getByLabelText('Notes'), { target: { value: 'New text' } });
    expect(onChange).toHaveBeenCalledWith('New text');
  });
});
```

- [ ] **Step 7: Run the test, verify it fails**

```bash
npx vitest run tests/TextareaField.test.tsx
```
Expected: FAIL — `src/components/TextareaField.tsx` does not exist yet.

- [ ] **Step 8: Implement `TextareaField`**

Create `platform/frontend/src/components/TextareaField.tsx`:

```typescript
interface TextareaFieldProps {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  rows?: number;
}

export function TextareaField({ id, label, value, onChange, rows = 4 }: TextareaFieldProps) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-sm font-medium text-slate-700">
        {label}
      </label>
      <textarea
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={rows}
        className="rounded border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
      />
    </div>
  );
}
```

- [ ] **Step 9: Run the test, verify it passes**

```bash
npx vitest run tests/TextareaField.test.tsx
```
Expected: PASS, both tests.

- [ ] **Step 10: Create the Company Profile API hook module**

Create `platform/frontend/src/api/companyProfile.ts`:

```typescript
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiGet, apiPatch } from './client.js';

export interface CompanyProfile {
  businessName: string;
  contactName: string;
  email: string;
  registrationNumber: string | null;
  vatRegistered: boolean;
  vatNumber: string | null;
  logoUrl: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  postalCode: string | null;
  phone: string | null;
  website: string | null;
  bankName: string | null;
  bankAccountHolder: string | null;
  bankAccountNumber: string | null;
  bankBranchCode: string | null;
  termsAndConditionsText: string | null;
  defaultCurrency: string;
  defaultQuoteValidityDays: number | null;
  quoteNumberPrefix: string;
  invoiceNumberPrefix: string;
}

export type UpdateCompanyProfileInput = Partial<Omit<CompanyProfile, 'email'>>;

const COMPANY_PROFILE_QUERY_KEY = ['companyProfile'] as const;

export function useCompanyProfile() {
  return useQuery({
    queryKey: COMPANY_PROFILE_QUERY_KEY,
    queryFn: () => apiGet<{ companyProfile: CompanyProfile }>('/api/company-profile').then((r) => r.companyProfile),
  });
}

export function useUpdateCompanyProfile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: UpdateCompanyProfileInput) =>
      apiPatch<{ companyProfile: CompanyProfile }>('/api/company-profile', data).then((r) => r.companyProfile),
    onSuccess: (companyProfile) => {
      queryClient.setQueryData(COMPANY_PROFILE_QUERY_KEY, companyProfile);
    },
  });
}
```

- [ ] **Step 11: Write the failing CompanyProfilePage test**

Create `platform/frontend/tests/CompanyProfilePage.test.tsx`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { CompanyProfilePage } from '../src/pages/CompanyProfilePage.js';
import * as client from '../src/api/client.js';
import { createTestQueryClient } from './helpers/queryClient.js';

const baseProfile = {
  businessName: 'Acme Prints',
  contactName: 'Jane Doe',
  email: 'jane@acme.co.za',
  registrationNumber: null,
  vatRegistered: false,
  vatNumber: null,
  logoUrl: null,
  addressLine1: null,
  addressLine2: null,
  city: null,
  postalCode: null,
  phone: null,
  website: null,
  bankName: null,
  bankAccountHolder: null,
  bankAccountNumber: null,
  bankBranchCode: null,
  termsAndConditionsText: null,
  defaultCurrency: 'ZAR',
  defaultQuoteValidityDays: null,
  quoteNumberPrefix: 'QT',
  invoiceNumberPrefix: 'INV',
};

beforeEach(() => {
  vi.restoreAllMocks();
});

function renderPage() {
  const queryClient = createTestQueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <CompanyProfilePage />
    </QueryClientProvider>,
  );
}

describe('CompanyProfilePage', () => {
  it('loads and displays the current company profile', async () => {
    vi.spyOn(client, 'apiGet').mockResolvedValue({ ok: true, companyProfile: baseProfile });
    renderPage();
    await waitFor(() => expect(screen.getByDisplayValue('Acme Prints')).toBeInTheDocument());
    expect(screen.getByDisplayValue('QT')).toBeInTheDocument();
    expect(screen.getByDisplayValue('INV')).toBeInTheDocument();
  });

  it('saves changes via PATCH and reflects the updated value', async () => {
    vi.spyOn(client, 'apiGet').mockResolvedValue({ ok: true, companyProfile: baseProfile });
    const patchSpy = vi.spyOn(client, 'apiPatch').mockResolvedValue({
      ok: true,
      companyProfile: { ...baseProfile, city: 'Cape Town' },
    });
    renderPage();
    await waitFor(() => expect(screen.getByDisplayValue('Acme Prints')).toBeInTheDocument());

    fireEvent.change(screen.getByLabelText('City'), { target: { value: 'Cape Town' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() =>
      expect(patchSpy).toHaveBeenCalledWith('/api/company-profile', expect.objectContaining({ city: 'Cape Town' })),
    );
    await waitFor(() => expect(screen.getByText('Saved.')).toBeInTheDocument());
  });

  it('checking "VAT registered" reveals the VAT number field as required', async () => {
    vi.spyOn(client, 'apiGet').mockResolvedValue({ ok: true, companyProfile: baseProfile });
    renderPage();
    await waitFor(() => expect(screen.getByDisplayValue('Acme Prints')).toBeInTheDocument());

    const vatCheckbox = screen.getByLabelText('VAT registered') as HTMLInputElement;
    expect(vatCheckbox.checked).toBe(false);
    fireEvent.click(vatCheckbox);
    expect(vatCheckbox.checked).toBe(true);
  });

  it('shows the server error message when saving fails', async () => {
    vi.spyOn(client, 'apiGet').mockResolvedValue({ ok: true, companyProfile: baseProfile });
    vi.spyOn(client, 'apiPatch').mockRejectedValue(
      new client.ApiError('VAT number is required when VAT-registered.', 400),
    );
    renderPage();
    await waitFor(() => expect(screen.getByDisplayValue('Acme Prints')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(screen.getByText('VAT number is required when VAT-registered.')).toBeInTheDocument(),
    );
  });
});
```

- [ ] **Step 12: Run the test, verify it fails**

```bash
npx vitest run tests/CompanyProfilePage.test.tsx
```
Expected: FAIL — `src/pages/CompanyProfilePage.tsx` does not exist yet.

- [ ] **Step 13: Implement `CompanyProfilePage`**

Create `platform/frontend/src/pages/CompanyProfilePage.tsx`:

```typescript
import { useEffect, useState, type FormEvent } from 'react';
import { FormField } from '../components/FormField.js';
import { Checkbox } from '../components/Checkbox.js';
import { TextareaField } from '../components/TextareaField.js';
import { ApiError } from '../api/client.js';
import { useCompanyProfile, useUpdateCompanyProfile, type UpdateCompanyProfileInput } from '../api/companyProfile.js';

type FormState = UpdateCompanyProfileInput;

export function CompanyProfilePage() {
  const { data: profile, isLoading } = useCompanyProfile();
  const updateMutation = useUpdateCompanyProfile();
  const [form, setForm] = useState<FormState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (profile && !form) {
      setForm(profile);
    }
  }, [profile, form]);

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => (prev ? { ...prev, [key]: value } : prev));
    setSaved(false);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!form) return;
    setError(null);
    setSaved(false);
    try {
      await updateMutation.mutateAsync(form);
      setSaved(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong. Try again shortly.');
    }
  }

  if (isLoading || !form) {
    return <p className="text-slate-500">Loading…</p>;
  }

  return (
    <form onSubmit={handleSubmit} className="flex max-w-2xl flex-col gap-8">
      <h1 className="text-2xl font-semibold text-slate-900">Company Profile</h1>

      <section className="flex flex-col gap-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Business</h2>
        <FormField
          id="businessName"
          label="Business name"
          value={form.businessName ?? ''}
          onChange={(e) => set('businessName', e.target.value)}
        />
        <FormField
          id="contactName"
          label="Contact name"
          value={form.contactName ?? ''}
          onChange={(e) => set('contactName', e.target.value)}
        />
        <FormField id="registrationNumber" label="Registration number" value={form.registrationNumber ?? ''} onChange={(e) => set('registrationNumber', e.target.value)} />
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">VAT / Legal</h2>
        <Checkbox
          id="vatRegistered"
          label="VAT registered"
          checked={form.vatRegistered ?? false}
          onChange={(checked) => set('vatRegistered', checked)}
        />
        <FormField id="vatNumber" label="VAT number" value={form.vatNumber ?? ''} onChange={(e) => set('vatNumber', e.target.value)} />
        <TextareaField
          id="termsAndConditionsText"
          label="Terms & conditions"
          value={form.termsAndConditionsText ?? ''}
          onChange={(value) => set('termsAndConditionsText', value)}
        />
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Address</h2>
        <FormField id="addressLine1" label="Address line 1" value={form.addressLine1 ?? ''} onChange={(e) => set('addressLine1', e.target.value)} />
        <FormField id="addressLine2" label="Address line 2" value={form.addressLine2 ?? ''} onChange={(e) => set('addressLine2', e.target.value)} />
        <FormField id="city" label="City" value={form.city ?? ''} onChange={(e) => set('city', e.target.value)} />
        <FormField id="postalCode" label="Postal code" value={form.postalCode ?? ''} onChange={(e) => set('postalCode', e.target.value)} />
        <FormField id="phone" label="Phone" value={form.phone ?? ''} onChange={(e) => set('phone', e.target.value)} />
        <FormField id="website" label="Website" value={form.website ?? ''} onChange={(e) => set('website', e.target.value)} />
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Banking</h2>
        <FormField id="bankName" label="Bank name" value={form.bankName ?? ''} onChange={(e) => set('bankName', e.target.value)} />
        <FormField id="bankAccountHolder" label="Account holder" value={form.bankAccountHolder ?? ''} onChange={(e) => set('bankAccountHolder', e.target.value)} />
        <FormField id="bankAccountNumber" label="Account number" value={form.bankAccountNumber ?? ''} onChange={(e) => set('bankAccountNumber', e.target.value)} />
        <FormField id="bankBranchCode" label="Branch code" value={form.bankBranchCode ?? ''} onChange={(e) => set('bankBranchCode', e.target.value)} />
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Numbering</h2>
        <FormField id="quoteNumberPrefix" label="Quote number prefix" value={form.quoteNumberPrefix ?? ''} onChange={(e) => set('quoteNumberPrefix', e.target.value)} />
        <FormField id="invoiceNumberPrefix" label="Invoice number prefix" value={form.invoiceNumberPrefix ?? ''} onChange={(e) => set('invoiceNumberPrefix', e.target.value)} />
        <FormField
          id="defaultQuoteValidityDays"
          label="Default quote validity (days)"
          type="number"
          value={form.defaultQuoteValidityDays ?? ''}
          onChange={(e) => set('defaultQuoteValidityDays', e.target.value ? Number(e.target.value) : null)}
        />
      </section>

      {error && <p className="text-sm text-red-600">{error}</p>}
      {saved && !error && <p className="text-sm text-green-600">Saved.</p>}
      <button
        type="submit"
        disabled={updateMutation.isPending}
        className="w-fit rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
      >
        Save
      </button>
    </form>
  );
}
```

- [ ] **Step 14: Run the test, verify it passes**

```bash
npx vitest run tests/CompanyProfilePage.test.tsx
```
Expected: PASS, all 4 tests.

- [ ] **Step 15: Add the nav entry and route**

In `src/components/AppShell.tsx`, update `NAV_ITEMS`:

```typescript
const NAV_ITEMS = [
  { to: '/', label: 'Dashboard' },
  { to: '/company-profile', label: 'Company Profile' },
];
```

In `src/App.tsx`, add the import:

```typescript
import { CompanyProfilePage } from './pages/CompanyProfilePage.js';
```

And add a new `<Route>` inside the existing authenticated `<Route path="/" ...>`'s sibling position (as its own top-level route, matching the existing `/` route's structure):

```typescript
        <Route
          path="/company-profile"
          element={
            <RequireAuth>
              <AppShell>
                <CompanyProfilePage />
              </AppShell>
            </RequireAuth>
          }
        />
```

Place it right after the existing `/` route, before `<Route path="*" ...>` (the catch-all must stay last).

- [ ] **Step 16: Add a routing test**

In `tests/App.test.tsx`, add:

```typescript
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
```

Add this as a new `it(...)` inside the existing `describe('App routing', ...)` block (not a top-level `test(...)`), and give the `<MemoryRouter>` the same `future={{ v7_startTransition: true, v7_relativeSplatPath: true }}` prop every other test in this file already uses (check the existing tests in this file for the exact prop — copy it verbatim). All of `expect`/`screen`/`waitFor`/`MemoryRouter`/`AppProviders`/`App`/`client` are already imported at the top of `tests/App.test.tsx` from Frontend Foundation — add nothing new.

- [ ] **Step 17: Run the full test suite, typecheck, and build**

```bash
npm test
npm run typecheck
npm run build
```
Expected: all tests pass (32 existing + this task's 9 new = 41), zero type errors, build succeeds.

- [ ] **Step 18: Commit**

```bash
git add platform/frontend/src/components/Checkbox.tsx platform/frontend/tests/Checkbox.test.tsx platform/frontend/src/components/TextareaField.tsx platform/frontend/tests/TextareaField.test.tsx platform/frontend/src/api/companyProfile.ts platform/frontend/src/pages/CompanyProfilePage.tsx platform/frontend/tests/CompanyProfilePage.test.tsx platform/frontend/tests/helpers/queryClient.ts platform/frontend/src/components/AppShell.tsx platform/frontend/src/App.tsx platform/frontend/tests/App.test.tsx
git commit -m "Add Company Profile page"
```

---

### Task 2: Customers pages (list, create, edit)

**Files:**
- Create: `platform/frontend/src/api/customers.ts`
- Create: `platform/frontend/src/pages/customers/CustomersListPage.tsx`
- Create: `platform/frontend/tests/CustomersListPage.test.tsx`
- Create: `platform/frontend/src/pages/customers/CustomerFormPage.tsx`
- Create: `platform/frontend/tests/CustomerFormPage.test.tsx`
- Modify: `platform/frontend/src/components/AppShell.tsx` (add nav entry)
- Modify: `platform/frontend/src/App.tsx` (add routes)
- Modify: `platform/frontend/tests/App.test.tsx` (routing test)

**Interfaces:**
- Consumes: `apiGet`/`apiPost`/`apiPatch`, `FormField`, `TextareaField` (Task 1), `createTestQueryClient` (Task 1).
- Produces: nothing new consumed by later phases (Customers has no dependents within this plan), but establishes the "list page + shared create/edit form page" pattern later phases (Printers, Filaments, Labour Steps, Consumables — all similarly-shaped single-table CRUD) should follow.

- [ ] **Step 1: Create the Customers API hook module**

Create `platform/frontend/src/api/customers.ts`:

```typescript
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiGet, apiPatch, apiPost } from './client.js';

export interface Customer {
  id: string;
  name: string;
  company: string | null;
  email: string | null;
  phone: string | null;
  billingAddress: string;
  deliveryAddress: string | null;
  vatNumber: string | null;
  notes: string | null;
  createdAt: string;
}

export interface CustomerFormInput {
  name: string;
  billingAddress: string;
  company?: string;
  email?: string;
  phone?: string;
  deliveryAddress?: string;
  vatNumber?: string;
  notes?: string;
}

const CUSTOMERS_QUERY_KEY = ['customers'] as const;

export function useCustomers() {
  return useQuery({
    queryKey: CUSTOMERS_QUERY_KEY,
    queryFn: () => apiGet<{ customers: Customer[] }>('/api/customers').then((r) => r.customers),
  });
}

export function useCustomer(id: string | undefined) {
  return useQuery({
    queryKey: [...CUSTOMERS_QUERY_KEY, id],
    queryFn: () => apiGet<{ customer: Customer }>(`/api/customers/${id}`).then((r) => r.customer),
    enabled: id !== undefined,
  });
}

export function useCreateCustomer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: CustomerFormInput) =>
      apiPost<{ customer: Customer }>('/api/customers', data).then((r) => r.customer),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: CUSTOMERS_QUERY_KEY });
    },
  });
}

export function useUpdateCustomer(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<CustomerFormInput>) => apiPatch(`/api/customers/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: CUSTOMERS_QUERY_KEY });
    },
  });
}
```

- [ ] **Step 2: Write the failing CustomersListPage test**

Create `platform/frontend/tests/CustomersListPage.test.tsx`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { CustomersListPage } from '../src/pages/customers/CustomersListPage.js';
import * as client from '../src/api/client.js';
import { createTestQueryClient } from './helpers/queryClient.js';

beforeEach(() => {
  vi.restoreAllMocks();
});

function renderPage() {
  const queryClient = createTestQueryClient();
  return render(
    <MemoryRouter>
      <QueryClientProvider client={queryClient}>
        <CustomersListPage />
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

describe('CustomersListPage', () => {
  it('lists customers returned by the API', async () => {
    vi.spyOn(client, 'apiGet').mockResolvedValue({
      ok: true,
      customers: [
        { id: '1', name: 'Bob Client', company: null, email: null, phone: null, billingAddress: '1 Oak St', deliveryAddress: null, vatNumber: null, notes: null, createdAt: '2026-01-01T00:00:00.000Z' },
      ],
    });
    renderPage();
    await waitFor(() => expect(screen.getByText('Bob Client')).toBeInTheDocument());
  });

  it('shows an empty state when there are no customers', async () => {
    vi.spyOn(client, 'apiGet').mockResolvedValue({ ok: true, customers: [] });
    renderPage();
    await waitFor(() => expect(screen.getByText(/no customers yet/i)).toBeInTheDocument());
  });

  it('has a link to create a new customer', async () => {
    vi.spyOn(client, 'apiGet').mockResolvedValue({ ok: true, customers: [] });
    renderPage();
    await waitFor(() => expect(screen.getByRole('link', { name: 'New Customer' })).toHaveAttribute('href', '/customers/new'));
  });
});
```

- [ ] **Step 3: Run the test, verify it fails**

```bash
npx vitest run tests/CustomersListPage.test.tsx
```
Expected: FAIL — `src/pages/customers/CustomersListPage.tsx` does not exist yet.

- [ ] **Step 4: Implement `CustomersListPage`**

Create `platform/frontend/src/pages/customers/CustomersListPage.tsx`:

```typescript
import { Link } from 'react-router-dom';
import { useCustomers } from '../../api/customers.js';

export function CustomersListPage() {
  const { data: customers, isLoading } = useCustomers();

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-slate-900">Customers</h1>
        <Link to="/customers/new" className="rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white">
          New Customer
        </Link>
      </div>
      {isLoading && <p className="text-slate-500">Loading…</p>}
      {!isLoading && customers?.length === 0 && <p className="text-slate-500">No customers yet.</p>}
      {!isLoading && customers && customers.length > 0 && (
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-slate-500">
              <th className="py-2">Name</th>
              <th className="py-2">Company</th>
              <th className="py-2">Email</th>
              <th className="py-2"></th>
            </tr>
          </thead>
          <tbody>
            {customers.map((customer) => (
              <tr key={customer.id} className="border-b border-slate-100">
                <td className="py-2">{customer.name}</td>
                <td className="py-2">{customer.company ?? '—'}</td>
                <td className="py-2">{customer.email ?? '—'}</td>
                <td className="py-2 text-right">
                  <Link to={`/customers/${customer.id}`} className="text-slate-600 underline">
                    Edit
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
```

- [ ] **Step 5: Run the test, verify it passes**

```bash
npx vitest run tests/CustomersListPage.test.tsx
```
Expected: PASS, all 3 tests.

- [ ] **Step 6: Write the failing CustomerFormPage test**

Create `platform/frontend/tests/CustomerFormPage.test.tsx`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { CustomerFormPage } from '../src/pages/customers/CustomerFormPage.js';
import * as client from '../src/api/client.js';
import { createTestQueryClient } from './helpers/queryClient.js';

beforeEach(() => {
  vi.restoreAllMocks();
});

function renderAt(path: string) {
  const queryClient = createTestQueryClient();
  return render(
    <MemoryRouter initialEntries={[path]}>
      <QueryClientProvider client={queryClient}>
        <Routes>
          <Route path="/customers/new" element={<CustomerFormPage />} />
          <Route path="/customers/:id" element={<CustomerFormPage />} />
          <Route path="/customers" element={<div>customers list</div>} />
        </Routes>
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

describe('CustomerFormPage — create mode', () => {
  it('creates a customer and navigates back to the list', async () => {
    const postSpy = vi.spyOn(client, 'apiPost').mockResolvedValue({ ok: true, customer: { id: '1' } });
    renderAt('/customers/new');

    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Bob Client' } });
    fireEvent.change(screen.getByLabelText('Billing address'), { target: { value: '1 Oak St' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() =>
      expect(postSpy).toHaveBeenCalledWith('/api/customers', expect.objectContaining({ name: 'Bob Client', billingAddress: '1 Oak St' })),
    );
    await waitFor(() => expect(screen.getByText('customers list')).toBeInTheDocument());
  });
});

describe('CustomerFormPage — edit mode', () => {
  it('loads the existing customer and saves changes via PATCH', async () => {
    vi.spyOn(client, 'apiGet').mockResolvedValue({
      ok: true,
      customer: { id: '1', name: 'Bob Client', company: null, email: null, phone: null, billingAddress: '1 Oak St', deliveryAddress: null, vatNumber: null, notes: null, createdAt: '2026-01-01T00:00:00.000Z' },
    });
    const patchSpy = vi.spyOn(client, 'apiPatch').mockResolvedValue({ ok: true });
    renderAt('/customers/1');

    await waitFor(() => expect(screen.getByDisplayValue('Bob Client')).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText('Company'), { target: { value: 'Acme Co' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() =>
      expect(patchSpy).toHaveBeenCalledWith('/api/customers/1', expect.objectContaining({ company: 'Acme Co' })),
    );
  });
});
```

- [ ] **Step 7: Run the test, verify it fails**

```bash
npx vitest run tests/CustomerFormPage.test.tsx
```
Expected: FAIL — `src/pages/customers/CustomerFormPage.tsx` does not exist yet.

- [ ] **Step 8: Implement `CustomerFormPage`**

Create `platform/frontend/src/pages/customers/CustomerFormPage.tsx`:

```typescript
import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { FormField } from '../../components/FormField.js';
import { TextareaField } from '../../components/TextareaField.js';
import { ApiError } from '../../api/client.js';
import {
  useCustomer,
  useCreateCustomer,
  useUpdateCustomer,
  type CustomerFormInput,
} from '../../api/customers.js';

const emptyForm: CustomerFormInput = {
  name: '',
  billingAddress: '',
  company: '',
  email: '',
  phone: '',
  deliveryAddress: '',
  vatNumber: '',
  notes: '',
};

export function CustomerFormPage() {
  const { id } = useParams();
  const isEditMode = id !== undefined;
  const navigate = useNavigate();
  const { data: existingCustomer } = useCustomer(id);
  const createMutation = useCreateCustomer();
  const updateMutation = useUpdateCustomer(id ?? '');
  const [form, setForm] = useState<CustomerFormInput>(emptyForm);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (existingCustomer) {
      setForm({
        name: existingCustomer.name,
        billingAddress: existingCustomer.billingAddress,
        company: existingCustomer.company ?? '',
        email: existingCustomer.email ?? '',
        phone: existingCustomer.phone ?? '',
        deliveryAddress: existingCustomer.deliveryAddress ?? '',
        vatNumber: existingCustomer.vatNumber ?? '',
        notes: existingCustomer.notes ?? '',
      });
    }
  }, [existingCustomer]);

  function set<K extends keyof CustomerFormInput>(key: K, value: CustomerFormInput[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      if (isEditMode) {
        await updateMutation.mutateAsync(form);
      } else {
        await createMutation.mutateAsync(form);
      }
      navigate('/customers');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong. Try again shortly.');
    }
  }

  const isPending = createMutation.isPending || updateMutation.isPending;

  return (
    <form onSubmit={handleSubmit} className="flex max-w-xl flex-col gap-4">
      <h1 className="text-2xl font-semibold text-slate-900">{isEditMode ? 'Edit Customer' : 'New Customer'}</h1>
      <FormField id="name" label="Name" value={form.name} onChange={(e) => set('name', e.target.value)} required />
      <FormField id="company" label="Company" value={form.company ?? ''} onChange={(e) => set('company', e.target.value)} />
      <FormField id="email" label="Email" type="email" value={form.email ?? ''} onChange={(e) => set('email', e.target.value)} />
      <FormField id="phone" label="Phone" value={form.phone ?? ''} onChange={(e) => set('phone', e.target.value)} />
      <FormField id="billingAddress" label="Billing address" value={form.billingAddress} onChange={(e) => set('billingAddress', e.target.value)} required />
      <FormField id="deliveryAddress" label="Delivery address" value={form.deliveryAddress ?? ''} onChange={(e) => set('deliveryAddress', e.target.value)} />
      <FormField id="vatNumber" label="VAT number" value={form.vatNumber ?? ''} onChange={(e) => set('vatNumber', e.target.value)} />
      <TextareaField id="notes" label="Notes" value={form.notes ?? ''} onChange={(value) => set('notes', value)} />
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button
        type="submit"
        disabled={isPending}
        className="w-fit rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
      >
        Save
      </button>
    </form>
  );
}
```

- [ ] **Step 9: Run the test, verify it passes**

```bash
npx vitest run tests/CustomerFormPage.test.tsx
```
Expected: PASS, both tests.

- [ ] **Step 10: Add the nav entry and routes**

In `src/components/AppShell.tsx`, update `NAV_ITEMS` (append after the Company Profile entry added in Task 1):

```typescript
const NAV_ITEMS = [
  { to: '/', label: 'Dashboard' },
  { to: '/company-profile', label: 'Company Profile' },
  { to: '/customers', label: 'Customers' },
];
```

In `src/App.tsx`, add imports:

```typescript
import { CustomersListPage } from './pages/customers/CustomersListPage.js';
import { CustomerFormPage } from './pages/customers/CustomerFormPage.js';
```

Add three new routes (after the `/company-profile` route added in Task 1, before the catch-all):

```typescript
        <Route
          path="/customers"
          element={
            <RequireAuth>
              <AppShell>
                <CustomersListPage />
              </AppShell>
            </RequireAuth>
          }
        />
        <Route
          path="/customers/new"
          element={
            <RequireAuth>
              <AppShell>
                <CustomerFormPage />
              </AppShell>
            </RequireAuth>
          }
        />
        <Route
          path="/customers/:id"
          element={
            <RequireAuth>
              <AppShell>
                <CustomerFormPage />
              </AppShell>
            </RequireAuth>
          }
        />
```

- [ ] **Step 11: Add a routing test**

In `tests/App.test.tsx`, add:

```typescript
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
  await waitFor(() => expect(screen.getByText('Customers')).toBeInTheDocument());
});
```

- [ ] **Step 12: Run the full test suite, typecheck, and build**

```bash
npm test
npm run typecheck
npm run build
```
Expected: all tests pass (41 from Task 1 + this task's 6 new = 47), zero type errors, build succeeds.

- [ ] **Step 13: Commit**

```bash
git add platform/frontend/src/api/customers.ts platform/frontend/src/pages/customers platform/frontend/tests/CustomersListPage.test.tsx platform/frontend/tests/CustomerFormPage.test.tsx platform/frontend/src/components/AppShell.tsx platform/frontend/src/App.tsx platform/frontend/tests/App.test.tsx
git commit -m "Add Customers pages: list, create, edit"
```
