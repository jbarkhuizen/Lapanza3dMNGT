# Backlog Medium-Priority Batch — Design Spec

**Status:** Approved 2026-09-08. Closes backlog items #7, #8, #12, #45,
#56 — five independent, small, Medium-priority fixes bundled into one
phase since each is too small to warrant its own spec/plan cycle.

## #7 — `TRUST_PROXY` only recognizes the exact string `'true'`

`src/env.ts` currently does `process.env.TRUST_PROXY === 'true'` with no
signal if a deploy config uses a different truthy spelling (`'1'`,
`'yes'`, `'True'`) — such a typo would silently leave `trustProxy` false,
reinstating the shared-rate-limit-bucket bug behind a reverse proxy with
no visible error.

**Fix:** Keep the exact-match behavior (don't loosen what counts as
"true" — that's its own footgun). Add a startup warning: if
`TRUST_PROXY` is set to a non-empty value that isn't exactly `'true'` or
`'false'`, log a clear warning naming the value and stating it's being
treated as `false`. Emitted once, at process start.

## #8 — `authLimiter` shares one bucket across register + login (+ resend-verification)

One `rateLimit()` instance, keyed by IP, now covers three different
account-lifecycle actions with different real-world frequency and abuse
profiles.

**Fix:** Split into two instances: `loginLimiter` (login only — the
highest-frequency, most brute-forceable action) and `accountLimiter`
(register + resend-verification — both low-frequency, "something's wrong
with my account" actions that legitimately cluster together). Same
window/limit values as today (10/hour) for both — this fix is about
isolating the buckets, not re-tuning the numbers, which the original item
explicitly deferred to "once real usage patterns are known."

## #12 — Expired sessions are never pruned

`getSession()` correctly rejects an expired session at the app layer but
never deletes the row — the `sessions` table grows unboundedly.

**Fix:** Delete-on-detection: when `getSession()` finds a session whose
`expiresAt` has passed, delete that row before returning `null`. No
scheduled job, no new infrastructure — the table self-prunes as expired
sessions are naturally encountered by real traffic. (A session nobody
ever presents again stays orphaned forever either way — a real cleanup
job is only worth it if idle-session accumulation becomes an actual
problem at scale, which isn't the case yet.)

## #45 — No client-side signal that a Printer needs 4 fields for costing

`POST /api/costing-templates` 400s if the chosen printer is missing
`electricityRatePerKwh`, `expectedLifetimeHours`, `purchaseCost`, or
`powerDrawWatts` — but `PrinterFormPage` renders those as four ordinary
optional fields with no indication they matter for costing until a user
hits an opaque error much later.

**Fix:** Add a small heading/label above those four fields (which
already sit adjacently in the form) reading "Required for job costing" —
just enough to set expectation at data-entry time. Not blocking the form,
not making the fields required at the schema level (a printer can still
exist without being costable yet) — purely a UI hint.

## #56 — UI and PDF disagree on currency and VAT label

Every `formatCurrency()` call site on `QuoteDetailPage`/
`InvoiceDetailPage` omits the currency argument (defaults to `'ZAR'`),
while the generated PDF uses the tenant's actual
`companyProfile.defaultCurrency` — a tenant on a non-ZAR default sees
one currency on screen and another in the PDF for the same document.
Separately, the on-screen VAT row says just `"VAT"` while the PDF says
`"VAT (15%)"`.

**Fix:** Both detail pages already have `useCustomerLookup()` in scope;
add `useCompanyProfile()` (already exists, already used by
`CompanyProfilePage`) and thread `companyProfile?.defaultCurrency` into
every `formatCurrency(value, currency)` call on both pages. Change the
VAT row label text from `"VAT"` to `"VAT (15%)"` on both pages to match
the PDF.

## What's explicitly out of scope

- Re-tuning rate-limit numbers (window/limit values) — item #8 was about
  bucket isolation, not new thresholds.
- A scheduled/cron session-cleanup job — delete-on-detection is
  sufficient at this scale.
- Making the 4 costing-related Printer fields required at the schema or
  form-validation level — still optional, just better signposted.
- Any change to `formatCurrency()`'s own implementation (its known edge
  cases are backlog item #49, separate).

## Testing

- Backend: a test asserting the startup warning fires for a bad
  `TRUST_PROXY` value and doesn't fire for `'true'`/`'false'`/unset; tests
  confirming `login`/`register`/`resend-verification` are rate-limited by
  independent buckets (hitting one's limit doesn't block the other);
  a test confirming an expired session row is actually deleted from the
  DB after `getSession()` is called on it (not just rejected).
- Frontend: a test confirming the "Required for job costing" label
  renders on `PrinterFormPage`; tests confirming `formatCurrency` is
  called with the tenant's actual currency (not the default) on both
  detail pages when `companyProfile.defaultCurrency` is non-ZAR, and that
  the VAT label reads "VAT (15%)".
