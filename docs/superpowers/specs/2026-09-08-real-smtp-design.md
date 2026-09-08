# Real SMTP Email Sending — Design Spec

**Status:** Approved 2026-09-08.

## Goal

Replace the two dev-mode, console-log-only email functions
(`sendVerificationEmail()` in `src/auth/email.ts`, `sendDocumentEmail()` in
`src/documents/sendDocumentEmail.ts`) with real delivery via Gmail SMTP,
without touching any call site — both functions' signatures stay
identical, per the comment already left in `email.ts` anticipating exactly
this change ("A later plan replaces the body of this function with
nodemailer + cPanel SMTP — callers never need to change").

## Provider

Gmail/Google Workspace SMTP via an App Password. Sender address:
`lapanzaonline@gmail.com` (same account used elsewhere for this owner's
businesses). Library: `nodemailer` (new dependency), using its
`service: 'gmail'` transport shorthand — the standard, well-documented
path for Gmail SMTP with an App Password, no manual host/port/TLS
configuration needed.

## Configuration

Three new env vars, added to `src/env.ts` as **optional** (not
`required()`):

- `SMTP_USER` — the sending Gmail address.
- `SMTP_APP_PASSWORD` — the 16-character Google App Password.
- `SMTP_FROM_NAME` — display name for the From header, defaults to
  `"Barkie"` if unset.

Set only in the VPS's `/opt/barkie/api/.env` (never committed, never in
local `.env`/`.env.test`). The app password is collected directly from the
user immediately before writing it to the VPS — not stored in this repo,
not pasted earlier than needed.

## Dev/test vs. production — no environment-name branching

Both `sendVerificationEmail()` and `sendDocumentEmail()` check whether
`env.smtpUser` and `env.smtpAppPassword` are both set:

- **Unset** (local dev, `.env.test`, CI — none of these will ever have
  these vars) → today's console-log stub, byte-for-byte unchanged. The 147
  backend tests keep passing with no mocking needed, and local dev can
  never accidentally email a real address.
- **Set** (production only) → build a `nodemailer` transport once (module
  singleton, not per-call — Gmail SMTP connection setup has real latency)
  and send for real.

This means the two functions gain an internal branch but keep their exact
existing signature and return type (`Promise<void>`), so `auth.ts`,
`quotes.ts`, and `invoices.ts` need zero changes at their call sites.

## Registration email-failure hardening

`POST /api/auth/register` in `auth.ts` currently `await`s
`sendVerificationEmail()` **unguarded**, after the tenant row is already
committed. A real SMTP call introduces real failure modes (auth rejected,
transient network error, Gmail rate limiting) that the console-log stub
never had. Today, an unguarded throw there would 500 the request while
leaving a stuck, unverifiable tenant behind — the exact scenario backlog
item #001 (missing resend-verification endpoint) describes, now reachable
by more than just "the user lost the email."

Fix: wrap that one call in try/catch. On failure, log the error
server-side (`console.error`) and still return `201 { ok: true }` — the
account exists and can still be manually reset by an operator if needed;
silently swallowing the failure from the client's perspective matches how
a real signup flow shouldn't leak SMTP implementation details, and this
does not make anything worse than the current unguarded-throw behavior
(it only removes a NEW way to fail that real SMTP introduces). This does
**not** replace item #001 — a resend endpoint is still separately useful
and stays on the backlog.

## Email content

Both functions keep generating the exact same content they log today —
`sendVerificationEmail()` sends the verification link as the email body;
`sendDocumentEmail()` sends a short message naming the document
type/number, ideally with the PDF as an attachment (nodemailer supports
attachments directly via a `Buffer`). Since `sendDocumentEmail()`'s
current signature is `(to, documentType, documentNumber): Promise<void>`
— it does **not** receive the PDF buffer today (dev-mode never attached
anything, per the PDF+email phase's own design note) — extending it to
receive and attach the PDF buffer is the one signature change in this
plan, made at both of its two call sites (`quotes.ts`, `invoices.ts`,
which already have the buffer in scope right before calling it).

Plain-text email bodies for both — no HTML templates, no branding assets.
That's a reasonable enhancement for later, not required to make sending
real.

## What's explicitly out of scope

- Retry/backoff queue, bounce handling, delivery-status tracking, open
  tracking — not needed at this volume on Gmail SMTP.
- HTML email templates / branded design — plain text is fine for now.
- The resend-verification endpoint (backlog item #001) — related but
  separate.
- Any other SMTP provider (SendGrid, Mailgun, cPanel mail) — Gmail only,
  per this decision; switching later stays possible since both functions'
  external signatures don't change.

## Testing

- Unit tests for both functions: with `SMTP_USER`/`SMTP_APP_PASSWORD`
  unset, assert the existing console-log behavior is unchanged (reuse the
  existing test pattern already in `tests/documents.test.ts` and
  `tests/auth.test.ts` for these).
- A test for the nodemailer branch that mocks nodemailer's
  `createTransport`/`sendMail` (never a real network call in tests) and
  asserts: the transport is configured with `service: 'gmail'` and the
  right credentials, `sendMail` is called with the right `to`/`from`/
  `subject`/body, and (for `sendDocumentEmail`) the PDF buffer is attached
  correctly.
- A test for the register-route try/catch: mock `sendVerificationEmail`
  to reject, assert the route still returns `201 { ok: true }` and the
  tenant row exists.
