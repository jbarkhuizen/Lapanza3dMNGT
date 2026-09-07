# Frontend Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Scaffold the subscriber dashboard SPA (`platform/frontend/`) and build everything every later module page will depend on: an API client, auth state, the authenticated app shell, and the auth pages themselves (login/register/verify-email). This is the smallest slice that proves the whole pipeline (build → deploy → real login) works end to end.

**Architecture:** React 18 + TypeScript + Vite, Tailwind CSS, React Router v6, `@tanstack/react-query` for server state. A thin typed fetch wrapper (`src/api/client.ts`) is the only thing that talks to the API; every page/hook goes through it, never raw `fetch`.

**Tech Stack:** Vite 5, React 18, TypeScript 5, Tailwind CSS 3, React Router 6, `@tanstack/react-query` 5, Vitest + React Testing Library for tests.

## Global Constraints

- Base URL for all API calls comes from `import.meta.env.VITE_API_BASE_URL`: `http://localhost:4200` in dev, empty/unset in the production build (`.env.production` sets it to `""` — since every API call already includes the `/api/...` prefix in its path, a non-empty base URL here would double it).
- Every fetch call sets `credentials: 'include'` — the API's session cookie is httpOnly and must ride along on every request, including cross-port dev requests (same-site, different port — allowed under `SameSite=Lax`).
- Every API error response (`{ ok: false, error: string }`) surfaces as a thrown `ApiError` with a `.message` equal to the server's `error` string — never a generic "request failed."
- No global client-state library. Auth state lives in one `AuthContext`. Everything else is React Query server state.
- Dev server runs on port 5174 (matches `platform/api/env.sample`'s `FRONTEND_ORIGIN=http://localhost:5174`).
- Router uses `basename="/app"` only in the production build; in dev it stays unprefixed (`/`) so `npm run dev` continues to serve from the site root — this is a build-time conditional, not a runtime one (see Task 1).

---

### Task 1: Project scaffold

**Files:**
- Create: `platform/frontend/package.json`
- Create: `platform/frontend/vite.config.ts`
- Create: `platform/frontend/tsconfig.json`
- Create: `platform/frontend/tsconfig.node.json`
- Create: `platform/frontend/tailwind.config.js`
- Create: `platform/frontend/postcss.config.js`
- Create: `platform/frontend/index.html`
- Create: `platform/frontend/src/main.tsx`
- Create: `platform/frontend/src/App.tsx`
- Create: `platform/frontend/src/index.css`
- Create: `platform/frontend/.gitignore`
- Create: `platform/frontend/env.sample`
- Create: `platform/frontend/README.md`

**Interfaces:**
- Produces: a working `npm run dev` (Vite dev server on 5174) and `npm run build` (outputs `dist/`, asset paths prefixed `/app/` via `base: '/app/'`). Later tasks add real routes/pages inside `src/App.tsx`.

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "barkie-frontend",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "preview": "vite preview",
    "test": "vitest run",
    "typecheck": "tsc -b --noEmit"
  },
  "dependencies": {
    "@tanstack/react-query": "^5.59.0",
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "react-router-dom": "^6.26.2"
  },
  "devDependencies": {
    "@testing-library/jest-dom": "^6.5.0",
    "@testing-library/react": "^16.0.1",
    "@types/react": "^18.3.11",
    "@types/react-dom": "^18.3.0",
    "@vitejs/plugin-react": "^4.3.2",
    "autoprefixer": "^10.4.20",
    "jsdom": "^25.0.1",
    "postcss": "^8.4.47",
    "tailwindcss": "^3.4.13",
    "typescript": "^5.6.2",
    "vite": "^5.4.8",
    "vitest": "^2.1.2"
  }
}
```

- [ ] **Step 2: Create `vite.config.ts`**

```typescript
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => ({
  plugins: [react()],
  base: mode === 'production' ? '/app/' : '/',
  server: { port: 5174 },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test-setup.ts'],
    globals: true,
  },
}));
```

`base` only changes for a production build (`vite build` runs with `mode: 'production'` by default) — the dev server keeps serving from `/`, matching the Global Constraint.

- [ ] **Step 3: Create `tsconfig.json` and `tsconfig.node.json`**

`tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "useDefineForClassFields": true,
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "types": ["vitest/globals", "@testing-library/jest-dom"]
  },
  "include": ["src"],
  "references": [{ "path": "./tsconfig.node.json" }]
}
```

`tsconfig.node.json`:
```json
{
  "compilerOptions": {
    "composite": true,
    "skipLibCheck": true,
    "module": "ESNext",
    "moduleResolution": "bundler",
    "allowSyntheticDefaultImports": true
  },
  "include": ["vite.config.ts"]
}
```

- [ ] **Step 4: Create Tailwind config**

`tailwind.config.js`:
```javascript
/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: { extend: {} },
  plugins: [],
};
```

`postcss.config.js`:
```javascript
export default {
  plugins: { tailwindcss: {}, autoprefixer: {} },
};
```

- [ ] **Step 5: Create `index.html`**

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Barkie</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 6: Create `src/index.css`**

```css
@tailwind base;
@tailwind components;
@tailwind utilities;
```

- [ ] **Step 7: Create `src/App.tsx` (placeholder, later tasks replace its contents)**

```typescript
export function App() {
  return (
    <div className="flex min-h-screen items-center justify-center text-slate-600">
      Barkie dashboard — scaffold OK.
    </div>
  );
}
```

- [ ] **Step 8: Create `src/main.tsx`**

```typescript
import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App.js';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
```

- [ ] **Step 9: Create `.gitignore`, `env.sample`, `README.md`**

`.gitignore`:
```
node_modules/
dist/
.env
```

`env.sample`:
```
VITE_API_BASE_URL=http://localhost:4200
```

`README.md`:
```markdown
# Barkie Frontend

React + Vite subscriber dashboard. Talks to `platform/api/`'s existing REST API.

## Local dev

    cp env.sample .env
    npm install
    npm run dev

Runs on http://localhost:5174 (matches `platform/api/env.sample`'s `FRONTEND_ORIGIN`). Requires `platform/api/` running on port 4200 (its default).

## Build

    npm run build

Outputs `dist/`, with all asset paths prefixed `/app/` for production path-based hosting on `barkie.co.za/app/`.
```

- [ ] **Step 10: Install and verify**

```bash
npm install
npm run build
```
Expected: `npm install` succeeds, `npm run build` produces `dist/index.html` and `dist/assets/*` with `/app/`-prefixed paths (grep `dist/index.html` for `src="/app/assets/`).

```bash
npm run dev
```
Expected: dev server starts on port 5174 (Ctrl+C after confirming — no test needed yet, there's nothing to test until Task 2).

- [ ] **Step 11: Commit**

```bash
git add platform/frontend
git commit -m "Scaffold frontend: Vite + React + TypeScript + Tailwind"
```

---

### Task 2: API client and auth context

**Files:**
- Create: `platform/frontend/src/test-setup.ts`
- Create: `platform/frontend/src/api/client.ts`
- Create: `platform/frontend/tests/api-client.test.ts`
- Create: `platform/frontend/src/context/AuthContext.tsx`
- Create: `platform/frontend/tests/AuthContext.test.tsx`

**Interfaces:**
- Consumes: `platform/api/src/routes/auth.ts`'s `GET /api/auth/me` (returns `{ ok: true, tenant: { id, businessName, email, emailVerified } }` or 401), `POST /api/auth/login`, `POST /api/auth/logout`.
- Produces: `apiGet<T>(path)`, `apiPost<T>(path, body?)`, `apiPatch<T>(path, body?)` — all return `Promise<T>` (the `data` field of a successful response, NOT the raw `{ ok, ...}` envelope) and throw `ApiError` on any non-2xx or `{ ok: false }` response. Produces: `AuthProvider`, `useAuth()` returning `{ tenant: Tenant | null, loading: boolean, refetch: () => Promise<void> }`, `RequireAuth` (a component wrapping protected routes). Every later module's API hooks (Task 3 onward, and every subsequent phase's pages) call `apiGet`/`apiPost`/`apiPatch` directly — these three functions are the ONLY place `fetch` appears in the whole frontend.

- [ ] **Step 1: Create the test setup file**

`platform/frontend/src/test-setup.ts`:
```typescript
import '@testing-library/jest-dom/vitest';
```

- [ ] **Step 2: Write the failing API client tests**

Create `platform/frontend/tests/api-client.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { apiGet, apiPost, apiPatch, ApiError } from '../src/api/client.js';

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn());
});

describe('apiGet', () => {
  it('returns the response body on success', async () => {
    (fetch as any).mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, tenant: { id: '1' } }),
    });
    const result = await apiGet<{ tenant: { id: string } }>('/api/auth/me');
    expect(result.tenant.id).toBe('1');
  });

  it('sends credentials: include', async () => {
    (fetch as any).mockResolvedValue({ ok: true, json: async () => ({ ok: true }) });
    await apiGet('/api/auth/me');
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/auth/me'),
      expect.objectContaining({ credentials: 'include' }),
    );
  });

  it('throws ApiError with the server error message on { ok: false }', async () => {
    (fetch as any).mockResolvedValue({
      ok: true,
      json: async () => ({ ok: false, error: 'Log in to continue.' }),
    });
    await expect(apiGet('/api/auth/me')).rejects.toThrow('Log in to continue.');
    await expect(apiGet('/api/auth/me')).rejects.toBeInstanceOf(ApiError);
  });

  it('throws ApiError with the http status when json body has no error field', async () => {
    (fetch as any).mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => { throw new Error('not json'); },
    });
    await expect(apiGet('/api/health')).rejects.toMatchObject({ status: 500 });
  });
});

describe('apiPost', () => {
  it('sends a JSON body with POST method', async () => {
    (fetch as any).mockResolvedValue({ ok: true, json: async () => ({ ok: true }) });
    await apiPost('/api/auth/login', { email: 'a@b.com', password: 'x' });
    const [, options] = (fetch as any).mock.calls[0];
    expect(options.method).toBe('POST');
    expect(options.headers['Content-Type']).toBe('application/json');
    expect(JSON.parse(options.body)).toEqual({ email: 'a@b.com', password: 'x' });
  });
});

describe('apiPatch', () => {
  it('sends a JSON body with PATCH method', async () => {
    (fetch as any).mockResolvedValue({ ok: true, json: async () => ({ ok: true }) });
    await apiPatch('/api/company-profile', { city: 'Cape Town' });
    const [, options] = (fetch as any).mock.calls[0];
    expect(options.method).toBe('PATCH');
    expect(JSON.parse(options.body)).toEqual({ city: 'Cape Town' });
  });
});
```

- [ ] **Step 3: Run the tests, verify they fail**

```bash
npx vitest run tests/api-client.test.ts
```
Expected: FAIL — `src/api/client.ts` does not exist yet.

- [ ] **Step 4: Implement the API client**

Create `platform/frontend/src/api/client.ts`:

```typescript
const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '';

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

type ApiEnvelope = { ok: boolean; error?: string; [key: string]: unknown };

async function request<T>(path: string, options: RequestInit): Promise<T> {
  const response = await fetch(`${BASE_URL}${path}`, {
    ...options,
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...options.headers },
  });

  let body: ApiEnvelope;
  try {
    body = await response.json();
  } catch {
    throw new ApiError('Something went wrong. Try again shortly.', response.status);
  }

  if (!body.ok) {
    throw new ApiError(body.error ?? 'Something went wrong. Try again shortly.', response.status);
  }

  return body as T;
}

export function apiGet<T>(path: string): Promise<T> {
  return request<T>(path, { method: 'GET' });
}

export function apiPost<T>(path: string, data?: unknown): Promise<T> {
  return request<T>(path, { method: 'POST', body: data !== undefined ? JSON.stringify(data) : undefined });
}

export function apiPatch<T>(path: string, data?: unknown): Promise<T> {
  return request<T>(path, { method: 'PATCH', body: data !== undefined ? JSON.stringify(data) : undefined });
}
```

Note: `request<T>` returns the FULL envelope (`{ ok: true, tenant: {...} }`), typed as `T` by the caller (e.g. `apiGet<{ tenant: Tenant }>('/api/auth/me')` then destructure `.tenant`) — matching every API response shape already established in `platform/api/src/routes/*.ts` (`{ ok: true, <resourceName>: ... }` or `{ ok: true, <resourceName>s: [...] }`). Do not try to unwrap a "data" field that doesn't exist in this API's actual response shape.

- [ ] **Step 5: Run the tests, verify they pass**

```bash
npx vitest run tests/api-client.test.ts
```
Expected: PASS, all 6 tests.

- [ ] **Step 6: Write the failing AuthContext tests**

Create `platform/frontend/tests/AuthContext.test.tsx`:

```typescript
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
```

- [ ] **Step 7: Run the tests, verify they fail**

```bash
npx vitest run tests/AuthContext.test.tsx
```
Expected: FAIL — `src/context/AuthContext.tsx` does not exist yet.

- [ ] **Step 8: Implement AuthContext**

Create `platform/frontend/src/context/AuthContext.tsx`:

```typescript
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { apiGet } from '../api/client.js';

export interface Tenant {
  id: string;
  businessName: string;
  email: string;
  emailVerified: boolean;
}

interface AuthContextValue {
  tenant: Tenant | null;
  loading: boolean;
  refetch: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [loading, setLoading] = useState(true);

  const refetch = useCallback(async () => {
    try {
      const result = await apiGet<{ tenant: Tenant }>('/api/auth/me');
      setTenant(result.tenant);
    } catch {
      setTenant(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refetch();
  }, [refetch]);

  return <AuthContext.Provider value={{ tenant, loading, refetch }}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return ctx;
}

export function RequireAuth({ children }: { children: ReactNode }) {
  const { tenant, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return <div className="flex min-h-screen items-center justify-center text-slate-500">Loading…</div>;
  }
  if (!tenant) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }
  return <>{children}</>;
}
```

- [ ] **Step 9: Run the tests, verify they pass**

```bash
npx vitest run tests/AuthContext.test.tsx
```
Expected: PASS, both tests.

`RequireAuth` needs `react-router-dom`'s `<Navigate>`/`useLocation`, which needs a `<MemoryRouter>` (or real router) ancestor to render without throwing — it isn't exercised directly by this task's tests (only `AuthProvider`/`useAuth` are), so no router wrapper is needed here. Task 4 tests `RequireAuth` itself, wrapped in a router.

- [ ] **Step 10: Run the full test suite and typecheck**

```bash
npm test
npm run typecheck
```
Expected: all pass (Task 1 has no tests yet, so this task's 10 tests are the only ones), zero type errors.

- [ ] **Step 11: Commit**

```bash
git add platform/frontend/src/test-setup.ts platform/frontend/src/api platform/frontend/tests/api-client.test.ts platform/frontend/src/context platform/frontend/tests/AuthContext.test.tsx
git commit -m "Add typed API client and AuthContext"
```

---

### Task 3: Auth pages (Login, Register, Verify Email)

**Files:**
- Create: `platform/frontend/src/pages/auth/LoginPage.tsx`
- Create: `platform/frontend/tests/LoginPage.test.tsx`
- Create: `platform/frontend/src/pages/auth/RegisterPage.tsx`
- Create: `platform/frontend/tests/RegisterPage.test.tsx`
- Create: `platform/frontend/src/pages/auth/VerifyEmailPage.tsx`
- Create: `platform/frontend/tests/VerifyEmailPage.test.tsx`
- Create: `platform/frontend/src/components/FormField.tsx`

**Interfaces:**
- Consumes: `apiPost` (Task 2) against `/api/auth/login`, `/api/auth/register`, `/api/auth/verify-email`. Consumes: `useAuth().refetch` (Task 2) to refresh auth state after a successful login.
- Produces: three route-level page components, wired into the router in Task 4. Produces: `<FormField label quotesInputProps />`, a small shared label+input+error wrapper every later module's create/edit forms (phases 3-7) reuse instead of hand-rolling label/error markup per field.

- [ ] **Step 1: Create the shared `FormField` component**

Create `platform/frontend/src/components/FormField.tsx`:

```typescript
import type { InputHTMLAttributes } from 'react';

interface FormFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string;
}

export function FormField({ label, error, id, ...inputProps }: FormFieldProps) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-sm font-medium text-slate-700">
        {label}
      </label>
      <input
        id={id}
        {...inputProps}
        className="rounded border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
      />
      {error && <span className="text-sm text-red-600">{error}</span>}
    </div>
  );
}
```

- [ ] **Step 2: Write the failing LoginPage test**

Create `platform/frontend/tests/LoginPage.test.tsx`:

```typescript
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
```

- [ ] **Step 3: Run the test, verify it fails**

```bash
npx vitest run tests/LoginPage.test.tsx
```
Expected: FAIL — `src/pages/auth/LoginPage.tsx` does not exist yet.

- [ ] **Step 4: Implement LoginPage**

Create `platform/frontend/src/pages/auth/LoginPage.tsx`:

```typescript
import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiPost, ApiError } from '../../api/client.js';
import { useAuth } from '../../context/AuthContext.js';
import { FormField } from '../../components/FormField.js';

export function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const { refetch } = useAuth();
  const navigate = useNavigate();

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await apiPost('/api/auth/login', { email, password });
      await refetch();
      navigate('/');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong. Try again shortly.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50">
      <form onSubmit={handleSubmit} className="flex w-80 flex-col gap-4 rounded-lg bg-white p-8 shadow">
        <h1 className="text-xl font-semibold text-slate-900">Log in to Barkie</h1>
        <FormField
          id="email"
          label="Email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <FormField
          id="password"
          label="Password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button
          type="submit"
          disabled={submitting}
          className="rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          Log in
        </button>
        <a href="/app/register" className="text-center text-sm text-slate-500 underline">
          Need an account? Register
        </a>
      </form>
    </div>
  );
}
```

- [ ] **Step 5: Run the test, verify it passes**

```bash
npx vitest run tests/LoginPage.test.tsx
```
Expected: PASS, both tests.

- [ ] **Step 6: Write the failing RegisterPage test**

Create `platform/frontend/tests/RegisterPage.test.tsx`:

```typescript
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
      <MemoryRouter>
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
      <MemoryRouter>
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
});
```

- [ ] **Step 7: Run the test, verify it fails**

```bash
npx vitest run tests/RegisterPage.test.tsx
```
Expected: FAIL — `src/pages/auth/RegisterPage.tsx` does not exist yet.

- [ ] **Step 8: Implement RegisterPage**

Create `platform/frontend/src/pages/auth/RegisterPage.tsx`:

```typescript
import { useState, type FormEvent } from 'react';
import { apiPost, ApiError } from '../../api/client.js';
import { FormField } from '../../components/FormField.js';

export function RegisterPage() {
  const [businessName, setBusinessName] = useState('');
  const [contactName, setContactName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [registered, setRegistered] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await apiPost('/api/auth/register', { businessName, contactName, email, password });
      setRegistered(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong. Try again shortly.');
    } finally {
      setSubmitting(false);
    }
  }

  if (registered) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <div className="w-96 rounded-lg bg-white p-8 text-center shadow">
          <h1 className="text-xl font-semibold text-slate-900">Almost there</h1>
          <p className="mt-2 text-sm text-slate-600">
            Check your email for a verification link to activate your account.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50">
      <form onSubmit={handleSubmit} className="flex w-80 flex-col gap-4 rounded-lg bg-white p-8 shadow">
        <h1 className="text-xl font-semibold text-slate-900">Create your account</h1>
        <FormField
          id="businessName"
          label="Business name"
          value={businessName}
          onChange={(e) => setBusinessName(e.target.value)}
          required
        />
        <FormField
          id="contactName"
          label="Your name"
          value={contactName}
          onChange={(e) => setContactName(e.target.value)}
          required
        />
        <FormField
          id="email"
          label="Email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <FormField
          id="password"
          label="Password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          minLength={10}
          required
        />
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button
          type="submit"
          disabled={submitting}
          className="rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          Register
        </button>
        <a href="/app/login" className="text-center text-sm text-slate-500 underline">
          Already have an account? Log in
        </a>
      </form>
    </div>
  );
}
```

- [ ] **Step 9: Run the test, verify it passes**

```bash
npx vitest run tests/RegisterPage.test.tsx
```
Expected: PASS, both tests.

- [ ] **Step 10: Write the failing VerifyEmailPage test**

Create `platform/frontend/tests/VerifyEmailPage.test.tsx`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { VerifyEmailPage } from '../src/pages/auth/VerifyEmailPage.js';
import * as client from '../src/api/client.js';

beforeEach(() => {
  vi.restoreAllMocks();
});

function renderWithToken(token: string | null) {
  const path = token ? `/verify-email?token=${token}` : '/verify-email';
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/verify-email" element={<VerifyEmailPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('VerifyEmailPage', () => {
  it('reads the token from the query string and posts it to /api/auth/verify-email', async () => {
    const postSpy = vi.spyOn(client, 'apiPost').mockResolvedValue({ ok: true });
    renderWithToken('abc123');
    await waitFor(() => expect(postSpy).toHaveBeenCalledWith('/api/auth/verify-email', { token: 'abc123' }));
    await waitFor(() => expect(screen.getByText(/verified/i)).toBeInTheDocument());
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
```

- [ ] **Step 11: Run the test, verify it fails**

```bash
npx vitest run tests/VerifyEmailPage.test.tsx
```
Expected: FAIL — `src/pages/auth/VerifyEmailPage.tsx` does not exist yet.

- [ ] **Step 12: Implement VerifyEmailPage**

Create `platform/frontend/src/pages/auth/VerifyEmailPage.tsx`:

```typescript
import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { apiPost, ApiError } from '../../api/client.js';

export function VerifyEmailPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');
  const [status, setStatus] = useState<'verifying' | 'verified' | 'error'>('verifying');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) {
      setStatus('error');
      setError('No verification token was found in this link.');
      return;
    }
    apiPost('/api/auth/verify-email', { token })
      .then(() => setStatus('verified'))
      .catch((err) => {
        setStatus('error');
        setError(err instanceof ApiError ? err.message : 'Something went wrong. Try again shortly.');
      });
  }, [token]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50">
      <div className="w-96 rounded-lg bg-white p-8 text-center shadow">
        {status === 'verifying' && <p className="text-slate-600">Verifying your email…</p>}
        {status === 'verified' && (
          <>
            <h1 className="text-xl font-semibold text-slate-900">Email verified</h1>
            <a href="/app/login" className="mt-2 inline-block text-sm text-slate-500 underline">
              Log in to continue
            </a>
          </>
        )}
        {status === 'error' && <p className="text-red-600">{error}</p>}
      </div>
    </div>
  );
}
```

- [ ] **Step 13: Run the test, verify it passes**

```bash
npx vitest run tests/VerifyEmailPage.test.tsx
```
Expected: PASS, all 3 tests.

- [ ] **Step 14: Run the full test suite and typecheck**

```bash
npm test
npm run typecheck
```
Expected: all tests pass (Task 2's 10 + this task's 7 = 17), zero type errors.

- [ ] **Step 15: Commit**

```bash
git add platform/frontend/src/pages platform/frontend/tests/LoginPage.test.tsx platform/frontend/tests/RegisterPage.test.tsx platform/frontend/tests/VerifyEmailPage.test.tsx platform/frontend/src/components
git commit -m "Add Login, Register, and Verify Email pages"
```

---

### Task 4: App shell and routing wire-up

**Files:**
- Create: `platform/frontend/src/components/AppShell.tsx`
- Create: `platform/frontend/tests/AppShell.test.tsx`
- Create: `platform/frontend/src/pages/DashboardHomePage.tsx`
- Modify: `platform/frontend/src/App.tsx`
- Create: `platform/frontend/tests/App.test.tsx`

**Interfaces:**
- Consumes: `AuthProvider`/`useAuth`/`RequireAuth` (Task 2), `LoginPage`/`RegisterPage`/`VerifyEmailPage` (Task 3).
- Produces: the router structure every later phase's pages plug into — a `<nav>` list in `AppShell.tsx` that each phase (3 onward from the design spec) appends one `<li>` to, and a matching `<Route>` added to `App.tsx`'s authenticated route group. This task's `AppShell` nav starts with just "Dashboard" and "Company Profile" as placeholders (later phases fill in the rest); the Company Profile *page* itself is NOT built in this task — only a stub link target proving the routing pattern, replaced by the real page in the next phase's plan.

- [ ] **Step 1: Write the failing AppShell test**

Create `platform/frontend/tests/AppShell.test.tsx`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AppShell } from '../src/components/AppShell.js';
import { AuthProvider } from '../src/context/AuthContext.js';
import * as client from '../src/api/client.js';

beforeEach(() => {
  vi.restoreAllMocks();
  vi.spyOn(client, 'apiGet').mockResolvedValue({
    ok: true,
    tenant: { id: '1', businessName: 'Acme Prints', email: 'a@b.com', emailVerified: true },
  });
});

describe('AppShell', () => {
  it('shows the tenant business name once loaded', async () => {
    render(
      <MemoryRouter>
        <AuthProvider>
          <AppShell>
            <div>page content</div>
          </AppShell>
        </AuthProvider>
      </MemoryRouter>,
    );
    await waitFor(() => expect(screen.getByText('Acme Prints')).toBeInTheDocument());
    expect(screen.getByText('page content')).toBeInTheDocument();
  });

  it('logs out and calls /api/auth/logout when the logout button is clicked', async () => {
    const postSpy = vi.spyOn(client, 'apiPost').mockResolvedValue({ ok: true });
    render(
      <MemoryRouter>
        <AuthProvider>
          <AppShell>
            <div>page content</div>
          </AppShell>
        </AuthProvider>
      </MemoryRouter>,
    );
    await waitFor(() => expect(screen.getByText('Acme Prints')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'Log out' }));
    await waitFor(() => expect(postSpy).toHaveBeenCalledWith('/api/auth/logout'));
  });
});
```

- [ ] **Step 2: Run the test, verify it fails**

```bash
npx vitest run tests/AppShell.test.tsx
```
Expected: FAIL — `src/components/AppShell.tsx` does not exist yet.

- [ ] **Step 3: Implement AppShell**

Create `platform/frontend/src/components/AppShell.tsx`:

```typescript
import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.js';
import { apiPost } from '../api/client.js';

const NAV_ITEMS = [
  { to: '/', label: 'Dashboard' },
  { to: '/company-profile', label: 'Company Profile' },
];

export function AppShell({ children }: { children: ReactNode }) {
  const { tenant, refetch } = useAuth();
  const [loggingOut, setLoggingOut] = useState(false);

  async function handleLogout() {
    setLoggingOut(true);
    try {
      await apiPost('/api/auth/logout');
    } finally {
      await refetch();
      setLoggingOut(false);
    }
  }

  return (
    <div className="flex min-h-screen">
      <nav className="flex w-56 flex-col gap-1 border-r border-slate-200 bg-slate-50 p-4">
        <span className="mb-4 text-lg font-semibold text-slate-900">Barkie</span>
        {NAV_ITEMS.map((item) => (
          <Link
            key={item.to}
            to={item.to}
            className="rounded px-3 py-2 text-sm text-slate-700 hover:bg-slate-200"
          >
            {item.label}
          </Link>
        ))}
      </nav>
      <div className="flex flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-slate-200 px-6 py-3">
          <span className="text-sm text-slate-600">{tenant?.businessName}</span>
          <button
            onClick={handleLogout}
            disabled={loggingOut}
            className="rounded px-3 py-1 text-sm text-slate-600 hover:bg-slate-100 disabled:opacity-50"
          >
            Log out
          </button>
        </header>
        <main className="flex-1 p-6">{children}</main>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run the test, verify it passes**

```bash
npx vitest run tests/AppShell.test.tsx
```
Expected: PASS, both tests.

- [ ] **Step 5: Create the dashboard home placeholder page**

Create `platform/frontend/src/pages/DashboardHomePage.tsx`:

```typescript
import { useAuth } from '../context/AuthContext.js';

export function DashboardHomePage() {
  const { tenant } = useAuth();
  return (
    <div>
      <h1 className="text-2xl font-semibold text-slate-900">Welcome, {tenant?.businessName}</h1>
      <p className="mt-2 text-slate-600">Pick a module from the left to get started.</p>
    </div>
  );
}
```

- [ ] **Step 6: Write the failing App routing test**

Create `platform/frontend/tests/App.test.tsx`:

```typescript
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
      <MemoryRouter initialEntries={['/']}>
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
      <MemoryRouter initialEntries={['/']}>
        <App />
      </MemoryRouter>,
    );
    await waitFor(() => expect(screen.getByText(/Welcome, Acme Prints/)).toBeInTheDocument());
  });

  it('renders the register page at "/register" without requiring auth', async () => {
    vi.spyOn(client, 'apiGet').mockRejectedValue(new client.ApiError('Log in to continue.', 401));
    render(
      <MemoryRouter initialEntries={['/register']}>
        <App />
      </MemoryRouter>,
    );
    await waitFor(() => expect(screen.getByText('Create your account')).toBeInTheDocument());
  });
});
```

Note: `App.tsx` must NOT itself render a `<BrowserRouter>`/`basename` wrapper for this test to work with `<MemoryRouter>` — the router (with its production-only `basename="/app"`) is provided by `main.tsx`, not `App.tsx`. `App.tsx` only defines `<Routes>`/`<Route>`, so tests can wrap it in whatever router they need.

- [ ] **Step 7: Run the test, verify it fails**

```bash
npx vitest run tests/App.test.tsx
```
Expected: FAIL — `App.tsx` is still the Task 1 placeholder with no routes.

- [ ] **Step 8: Implement the real `App.tsx`**

Replace the contents of `platform/frontend/src/App.tsx`:

```typescript
import { Routes, Route } from 'react-router-dom';
import { AuthProvider, RequireAuth } from './context/AuthContext.js';
import { AppShell } from './components/AppShell.js';
import { LoginPage } from './pages/auth/LoginPage.js';
import { RegisterPage } from './pages/auth/RegisterPage.js';
import { VerifyEmailPage } from './pages/auth/VerifyEmailPage.js';
import { DashboardHomePage } from './pages/DashboardHomePage.js';

export function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/verify-email" element={<VerifyEmailPage />} />
        <Route
          path="/"
          element={
            <RequireAuth>
              <AppShell>
                <DashboardHomePage />
              </AppShell>
            </RequireAuth>
          }
        />
      </Routes>
    </AuthProvider>
  );
}
```

- [ ] **Step 9: Run the test, verify it passes**

```bash
npx vitest run tests/App.test.tsx
```
Expected: PASS, all 3 tests.

- [ ] **Step 10: Update `main.tsx` for the production `basename`**

Modify `platform/frontend/src/main.tsx` to add the router with a conditional `basename`:

```typescript
import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { App } from './App.js';
import './index.css';

const basename = import.meta.env.PROD ? '/app' : '/';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter basename={basename}>
      <App />
    </BrowserRouter>
  </React.StrictMode>,
);
```

- [ ] **Step 11: Run the full test suite, typecheck, and build**

```bash
npm test
npm run typecheck
npm run build
```
Expected: all tests pass (17 from Tasks 2-3 + this task's 5 = 22), zero type errors, `npm run build` succeeds.

- [ ] **Step 12: Manual smoke test against the real API**

With `platform/api/` running locally (`npm run dev` there, on port 4200) and this frontend's dev server running (`npm run dev`, port 5174): open `http://localhost:5174/register`, register a test account, check the API's dev-mode console log for the verification link, visit it, then log in at `http://localhost:5174/login` and confirm the dashboard loads with the business name in the header and a working "Log out" button. This is a manual step — no automated test needed beyond what Steps 1-9 already cover, since it's exercising the real API, not a mock.

- [ ] **Step 13: Commit**

```bash
git add platform/frontend/src/components/AppShell.tsx platform/frontend/tests/AppShell.test.tsx platform/frontend/src/pages/DashboardHomePage.tsx platform/frontend/src/App.tsx platform/frontend/tests/App.test.tsx platform/frontend/src/main.tsx
git commit -m "Wire up app shell, routing, and production basename"
```
