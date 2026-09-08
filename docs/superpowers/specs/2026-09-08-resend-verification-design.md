# Resend-Verification Endpoint — Design Spec

**Status:** Approved 2026-09-08. Implements backlog item #001: "No way to
recover if a subscriber loses their verification email — token expires
after 24h, re-registering hits the 409 duplicate-email check, no admin or
self-delete path. A tenant who loses the mail is stuck permanently."

## Goal

Let a tenant who never received, lost, or let their verification email
expire get a fresh one, without needing manual DB intervention. This gap
became a real, live failure mode (not just theoretical) once the real
SMTP phase shipped — an actual tenant registered before SMTP existed and
had to be manually verified via a DB-fetched token during that phase's
smoke test, which is exactly the scenario this endpoint should handle
self-service.

## Backend

**New endpoint:** `POST /api/auth/resend-verification`, body `{ email:
string }`, validated via `z.object({ email: z.string().email() })`.

**Rate limited** via the existing `authLimiter` (10 requests/hour per IP,
already shared by `register` and `login` in `src/routes/auth.ts`) — no
new limiter needed.

**Behavior, in order:**
1. Look up the tenant by email. Not found → `404 { ok: false, error: 'No
   account found with this email.' }`.
2. Already verified (`emailVerifiedAt` is set) → `400 { ok: false, error:
   'This account is already verified. Log in instead.' }`.
3. Otherwise: mint a **fresh** `verificationToken` (`crypto.randomBytes(32)
   .toString('hex')`, same as registration) and a fresh 24-hour
   `verificationTokenExpires`, overwriting whatever was there before (so
   an old, possibly-leaked link stops working the moment a new one is
   requested — no need to reason about whether the old token is "still
   valid enough to keep"). Call `sendVerificationEmail()` (unchanged,
   already real-SMTP-aware from the prior phase) with the new token.
   Respond `200 { ok: true }`.

**No anti-enumeration hiding.** `POST /api/auth/register`'s existing `409
{ error: 'An account with this email already exists.' }` already reveals
whether an email is registered — a distinct `404` here adds no new
information-leak surface, and a real, distinguishable error message is
far more useful to a legitimate user than a fake "if this email exists,
check your inbox" non-answer would be. Consistency with the existing
register endpoint's behavior matters more than a protection that's
already bypassed elsewhere in this same flow.

**Reuses, unchanged:** `sendVerificationEmail()`, `hashPassword`-adjacent
`crypto.randomBytes` token generation pattern, the `authLimiter` instance,
the existing `Tenant` schema (`verificationToken`/
`verificationTokenExpires` are already nullable columns, already written
by registration — no migration needed).

## Frontend

**`LoginPage.tsx`:** when a login attempt fails specifically because the
account isn't verified (the existing `403 'Verify your email address
before logging in.'` response), show a "Resend verification email" button
below the error message, using the email already typed into the login
form (no second input needed). Clicking it calls the new endpoint and
shows a brief success/error message inline — no navigation, no new page.

**`VerifyEmailPage.tsx`:** its `error` state (invalid/expired token) is
currently a dead end — no link, no next step, exactly the "stuck
permanently" behavior this whole endpoint exists to fix. Add a "Go to
login" link there, pointing to `/login`, where the resend button above
lives. Deliberately not adding a second email-input form directly on this
page — the token in the URL is already invalid/consumed by the time this
state is reached, so there's no email address to prefill here anyway, and
routing back to the one place that already has this capability keeps the
UI from duplicating the same flow in two places.

**New hook:** `useResendVerification()` in `src/api/auth.ts` (or wherever
existing auth hooks live — check the file before assuming) — a
`useMutation` wrapping `apiPost('/api/auth/resend-verification', {
email })`, following the exact same pattern as every other mutation hook
in this codebase.

## What's explicitly out of scope

- Rate-limiting resend attempts differently from register/login — the
  shared `authLimiter` is sufficient at this scale.
- An admin-facing "resend for this tenant" action — self-service only,
  per the backlog item's framing.
- Any change to the verification link itself, `VerifyEmailPage`'s happy
  path, or the token TTL (still 24 hours).

## Testing

- Backend: route tests for all three outcomes (unknown email → 404,
  already-verified → 400, unverified tenant → 200 + a real new token
  minted, differing from the original one, with a fresh expiry). A test
  confirming the OLD token no longer verifies after a resend (proves
  invalidation, not just that a new one exists).
- Frontend: `LoginPage` test — the resend button appears only after the
  specific "not verified" 403, not after other login failures (wrong
  password, etc.); clicking it calls the right endpoint with the typed
  email. `VerifyEmailPage` test — the error state renders a link to
  `/login`.
