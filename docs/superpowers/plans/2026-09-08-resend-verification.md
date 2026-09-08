# Resend-Verification Endpoint Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a tenant who lost, never received, or let their
verification email expire get a fresh one without manual DB
intervention, closing backlog item #001.

**Architecture:** One new rate-limited route,
`POST /api/auth/resend-verification`, reusing the existing
`sendVerificationEmail()` function and `authLimiter` instance unchanged.
Frontend surfaces it as a button on `LoginPage` that appears only when
login fails with the existing "not verified" 403, using the email
already typed into the login form.

**Tech Stack:** No new dependencies. Same Express/zod/Prisma backend
conventions already in `src/routes/auth.ts`; same React/`apiPost`/
`ApiError` conventions already in the two frontend pages this touches.

## Global Constraints

- Always mints a **fresh** token + fresh 24-hour expiry on every resend
  call, overwriting the old one (so an old, possibly-leaked link stops
  working the moment a new one is requested).
- Three distinct outcomes, no anti-enumeration hiding (register's
  existing 409 already reveals whether an email is registered, so
  hiding it here adds no protection, only worse UX): unknown email →
  `404`; already-verified → `400`; otherwise → `200` and a real send.
- The verification-email send is wrapped in try/catch exactly like
  `POST /api/auth/register` already does — the token is persisted before
  the send attempt, so a transient SMTP failure must not 500 the request
  or discard the freshly-minted token; log and still return `200`.
- Rate limiting: reuse the existing `authLimiter` (10/hour/IP) already
  declared once per router in `src/routes/auth.ts` — do not create a
  second limiter instance.
- No new dependencies, no schema/migration changes (`verificationToken`/
  `verificationTokenExpires` are already nullable columns written by
  registration).

---

### Task 1: Backend — `POST /api/auth/resend-verification`

**Files:**
- Modify: `platform/api/src/routes/auth.ts`
- Test: `platform/api/tests/auth.test.ts`

**Interfaces:**
- Produces: `POST /api/auth/resend-verification` — body `{ email: string
  }`, responses `200 { ok: true }` / `404 { ok: false, error: string }` /
  `400 { ok: false, error: string }`.
- Consumes: `sendVerificationEmail(to, token): Promise<void>` (already
  exists, unchanged, in `src/auth/email.ts`), the existing `authLimiter`
  instance already declared in `createAuthRouter()`, `prisma.tenant`
  (already imported in this file), `crypto.randomBytes` (already
  imported in this file).

- [ ] **Step 1: Write the failing tests**

Add these tests to `platform/api/tests/auth.test.ts`, placed after the
existing `POST /api/auth/verify-email rejects an unknown token` test and
before the `registerAndVerify` helper function (so the new tests can use
that helper, which is defined right after):

```typescript
test('POST /api/auth/resend-verification returns 404 for an unknown email', async () => {
  const app = buildApp();
  const res = await request(app)
    .post('/api/auth/resend-verification')
    .send({ email: 'nobody@example.com' });

  assert.equal(res.status, 404);
  assert.equal(res.body.ok, false);
  assert.match(res.body.error, /No account found/);
});

test('POST /api/auth/resend-verification returns 400 for an invalid email format', async () => {
  const app = buildApp();
  const res = await request(app)
    .post('/api/auth/resend-verification')
    .send({ email: 'not-an-email' });

  assert.equal(res.status, 400);
  assert.equal(res.body.ok, false);
});
```

Then add these two tests immediately after the existing
`registerAndVerify` helper function definition (they depend on it):

```typescript
test('POST /api/auth/resend-verification returns 400 for an already-verified account', async () => {
  const app = buildApp();
  await registerAndVerify(app, 'jane@acmeprints.co.za');

  const res = await request(app)
    .post('/api/auth/resend-verification')
    .send({ email: 'jane@acmeprints.co.za' });

  assert.equal(res.status, 400);
  assert.equal(res.body.ok, false);
  assert.match(res.body.error, /already verified/);
});

test('POST /api/auth/resend-verification mints a fresh token that invalidates the old one', async () => {
  const app = buildApp();
  await request(app).post('/api/auth/register').send({
    businessName: 'Acme Prints',
    contactName: 'Jane Doe',
    email: 'jane@acmeprints.co.za',
    password: 'correct horse battery staple',
  });
  const original = await prisma.tenant.findUnique({ where: { email: 'jane@acmeprints.co.za' } });
  const originalToken = original?.verificationToken;

  const res = await request(app)
    .post('/api/auth/resend-verification')
    .send({ email: 'jane@acmeprints.co.za' });

  assert.equal(res.status, 200);
  assert.equal(res.body.ok, true);

  const updated = await prisma.tenant.findUnique({ where: { email: 'jane@acmeprints.co.za' } });
  assert.ok(updated?.verificationToken, 'a new token should be set');
  assert.notEqual(updated?.verificationToken, originalToken, 'the token should have changed');

  // The old token must no longer verify the account.
  const oldTokenAttempt = await request(app)
    .post('/api/auth/verify-email')
    .send({ token: originalToken });
  assert.equal(oldTokenAttempt.status, 400);

  // The new token must work.
  const newTokenAttempt = await request(app)
    .post('/api/auth/verify-email')
    .send({ token: updated?.verificationToken });
  assert.equal(newTokenAttempt.status, 200);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd platform/api && npm test -- --test-name-pattern resend-verification`
Expected: FAIL — the route doesn't exist yet (404 on the route itself,
distinct from the intentional 404-for-unknown-email test case, since the
whole path is unregistered).

- [ ] **Step 3: Add the route**

In `platform/api/src/routes/auth.ts`, add this route immediately after
the existing `authRouter.post('/api/auth/verify-email', ...)` route
block (i.e. after its closing `});`, before the `loginSchema` /
`authRouter.post('/api/auth/login', ...)` block):

```typescript
  const resendVerificationSchema = z.object({ email: z.string().email() });

  authRouter.post('/api/auth/resend-verification', authLimiter, async (req, res) => {
    const parsed = resendVerificationSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ ok: false, error: 'Enter a valid email address.' });
    }

    const tenant = await prisma.tenant.findUnique({ where: { email: parsed.data.email } });
    if (!tenant) {
      return res.status(404).json({ ok: false, error: 'No account found with this email.' });
    }
    if (tenant.emailVerifiedAt) {
      return res.status(400).json({ ok: false, error: 'This account is already verified. Log in instead.' });
    }

    const verificationToken = crypto.randomBytes(32).toString('hex');
    const verificationTokenExpires = new Date(Date.now() + 24 * 60 * 60 * 1000);

    await prisma.tenant.update({
      where: { id: tenant.id },
      data: { verificationToken, verificationTokenExpires },
    });

    try {
      await sendVerificationEmail(tenant.email, verificationToken);
    } catch (error) {
      // The fresh token is already persisted above — don't 500 and
      // discard it over a transient SMTP failure. Same pattern as
      // POST /api/auth/register's own hardening.
      console.error(`Failed to resend verification email to ${tenant.email}:`, error);
    }

    res.json({ ok: true });
  });
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd platform/api && npm test -- --test-name-pattern resend-verification`
Expected: PASS (4/4)

- [ ] **Step 5: Run the full suite and typecheck**

Run: `cd platform/api && npm test && npm run typecheck`
Expected: PASS, no regressions

- [ ] **Step 6: Commit**

```bash
cd platform/api
git add src/routes/auth.ts tests/auth.test.ts
git commit -m "Add POST /api/auth/resend-verification endpoint (closes backlog #001)"
```

---

### Task 2: Frontend — resend button on login + a way out of the dead-end verify-error page

**Files:**
- Modify: `platform/frontend/src/pages/auth/LoginPage.tsx`
- Modify: `platform/frontend/src/pages/auth/VerifyEmailPage.tsx`
- Test: `platform/frontend/tests/LoginPage.test.tsx`
- Test: `platform/frontend/tests/VerifyEmailPage.test.tsx`

**Interfaces:**
- Consumes: `apiPost`/`ApiError` from `../../api/client.js` (already
  imported in both files) — `ApiError.status` (already exists on the
  class) is used to detect the specific 403 "not verified" case, rather
  than matching on the error message text.
- No new hooks/modules — both pages already call `apiPost` directly, no
  dedicated auth API module exists in this codebase to add to.

- [ ] **Step 1: Write the failing tests for `LoginPage`**

Add these two `it` blocks inside the existing `describe('LoginPage'`
block in `platform/frontend/tests/LoginPage.test.tsx` (after the last
existing test, before the closing `});`):

```typescript
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
```

- [ ] **Step 2: Write the failing test for `VerifyEmailPage`**

Add this `it` block inside the existing `describe('VerifyEmailPage'`
block in `platform/frontend/tests/VerifyEmailPage.test.tsx` (after the
last existing test, before the closing `});`):

```typescript
  it('renders a link back to login when verification fails', async () => {
    vi.spyOn(client, 'apiPost').mockRejectedValue(
      new client.ApiError('This verification link is invalid or has expired.', 400),
    );
    renderWithToken('bad-token');
    await waitFor(() =>
      expect(screen.getByText('This verification link is invalid or has expired.')).toBeInTheDocument(),
    );
    expect(screen.getByRole('link', { name: /go to login/i }).getAttribute('href')).toMatch(/^\/login/);
  });
```

- [ ] **Step 3: Run both test files to verify the new tests fail**

Run: `cd platform/frontend && npm test -- LoginPage VerifyEmailPage`
Expected: FAIL — no resend button exists on `LoginPage`, no "Go to
login" link exists on `VerifyEmailPage`'s error state.

- [ ] **Step 4: Update `LoginPage.tsx`**

Replace the full contents of
`platform/frontend/src/pages/auth/LoginPage.tsx` with:

```typescript
import { useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { apiPost, ApiError } from '../../api/client.js';
import { useAuth } from '../../context/AuthContext.js';
import { FormField } from '../../components/FormField.js';

interface LocationState {
  from?: { pathname: string };
}

export function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [needsVerification, setNeedsVerification] = useState(false);
  const [resendStatus, setResendStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [submitting, setSubmitting] = useState(false);
  const { refetch } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setNeedsVerification(false);
    setResendStatus('idle');
    setSubmitting(true);
    try {
      await apiPost('/api/auth/login', { email, password });
      await refetch();
      const state = location.state as LocationState | null;
      navigate(state?.from?.pathname ?? '/');
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
        setNeedsVerification(err.status === 403);
      } else {
        setError('Something went wrong. Try again shortly.');
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function handleResend() {
    setResendStatus('sending');
    try {
      await apiPost('/api/auth/resend-verification', { email });
      setResendStatus('sent');
    } catch {
      setResendStatus('error');
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
        {needsVerification && (
          <div className="flex flex-col gap-1">
            <button
              type="button"
              onClick={handleResend}
              disabled={resendStatus === 'sending'}
              className="text-left text-sm text-slate-600 underline disabled:opacity-50"
            >
              Resend verification email
            </button>
            {resendStatus === 'sent' && (
              <p className="text-sm text-green-700">Verification email sent — check your inbox.</p>
            )}
            {resendStatus === 'error' && (
              <p className="text-sm text-red-600">Couldn't resend. Try again shortly.</p>
            )}
          </div>
        )}
        <button
          type="submit"
          disabled={submitting}
          className="rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          Log in
        </button>
        <Link to="/register" className="text-center text-sm text-slate-500 underline">
          Need an account? Register
        </Link>
      </form>
    </div>
  );
}
```

- [ ] **Step 5: Update `VerifyEmailPage.tsx`'s error state**

In `platform/frontend/src/pages/auth/VerifyEmailPage.tsx`, change:

```typescript
        {status === 'error' && <p className="text-red-600">{error}</p>}
```

to:

```typescript
        {status === 'error' && (
          <>
            <p className="text-red-600">{error}</p>
            <Link to="/login" className="mt-2 inline-block text-sm text-slate-500 underline">
              Go to login
            </Link>
          </>
        )}
```

(`Link` is already imported at the top of this file alongside
`useSearchParams` — no new import needed.)

- [ ] **Step 6: Run both test files to verify all tests pass**

Run: `cd platform/frontend && npm test -- LoginPage VerifyEmailPage`
Expected: PASS, all tests including the 4 new ones.

- [ ] **Step 7: Run the full frontend test suite**

Run: `cd platform/frontend && npm test`
Expected: PASS, no regressions.

- [ ] **Step 8: Typecheck / build**

Run: `cd platform/frontend && npm run build`
Expected: no type errors, build succeeds.

- [ ] **Step 9: Commit**

```bash
cd platform/frontend
git add src/pages/auth/LoginPage.tsx src/pages/auth/VerifyEmailPage.tsx tests/LoginPage.test.tsx tests/VerifyEmailPage.test.tsx
git commit -m "Add resend-verification UI to LoginPage; give VerifyEmailPage's error state a way out"
```

---

## After all tasks

Deploy both `platform/api` and `platform/frontend` per `docs/AI_HANDOFF.md`'s
"Deploying" section, then smoke-test against production: register a
throwaway tenant, resend its verification (confirm a real email arrives,
not just a `journalctl` line, and confirm the OLD registration email's
link no longer works), attempt resend again after verifying (confirm the
400 "already verified" response), attempt resend for a nonexistent email
(confirm the 404), then clean up the throwaway tenant. Update the backlog
board to mark item #001 Done. Update `docs/AI_HANDOFF.md` and local
memory.
