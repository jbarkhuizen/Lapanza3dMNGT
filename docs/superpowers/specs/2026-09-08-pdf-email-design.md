# PDF Generation + Email Sending — Design Spec

**Status:** Approved 2026-09-08. Final phase of the frontend-deploy design
(`2026-09-07-frontend-deploy-design.md`'s "PDF + Email capability" section).

## Goal

Let a tenant generate a PDF of a Quote or Invoice and "send" it to the
customer — dev-mode email only (console log), matching the "no new secrets
tonight" constraint carried through this whole build. Frontend gets a
"Send to Customer" button that downloads the PDF and shows dev-mode-aware
confirmation.

## Backend

**New dependency:** `pdfkit` (+ `@types/pdfkit`). No external PDF service.

**Endpoints:** `POST /api/quotes/:id/send`, `POST /api/invoices/:id/send`
(tenant-scoped, same auth middleware as existing quote/invoice routes).

**Flow per request:**
1. Load the quote/invoice via `tenantScope`, 404 if not found.
2. Load its Customer relation (Quote/Invoice don't embed Customer — join
   explicitly, same pattern as `useCustomerLookup` on the frontend).
3. If `customer.email` is null/empty → 400
   `{ ok: false, error: 'Customer has no email on file.' }`. "Send" implies
   a recipient; a customer with no email should use "Download PDF" instead
   (out of scope for this phase — see Deferred below).
4. Load the tenant's CompanyProfile.
5. Generate the PDF in-memory with `pdfkit`, collect into a Buffer, base64
   it.
6. Call `sendDocumentEmail(customer.email, documentType, documentNumber,
   pdfBuffer)` — dev-mode: `console.log` only, mirrors
   `sendVerificationEmail()` in `src/auth/email.ts`. No real SMTP.
7. Respond `{ ok: true, pdfBase64: string, sentTo: string, devMode: true }`.

No state changes to the quote/invoice itself (status, etc.) — sending is
side-effect-free on the document; it doesn't imply a status transition
(e.g. `sendQuote` on a `draft` quote does NOT auto-transition to `sent` —
status changes remain a separate explicit action via the existing status
endpoints).

**Regeneration, not caching:** every call regenerates the PDF fresh from
current DB state. Quotes/invoices are effectively immutable once created
(line items don't change after creation), so this is cheap and always
correct — no cache invalidation to think about, and it naturally supports
re-sending.

### PDF layout

- Header: business name (large), then address lines, phone, email,
  website, registration number, VAT number (only if `vatRegistered`).
- Document title + number + date (e.g. "QUOTE Q-2026-00042", issue date,
  and for quotes, validity/expiry date if set).
- Customer block: name, billing address, VAT number if set.
- Line items table: Description | Qty | Unit Price | Line Total. Same
  data `serializeQuote()`/`serializeInvoice()` already expose.
- Totals block: Subtotal, VAT (labelled "VAT (15%)" — hardcoded label,
  matching the SRS's fixed South African rate; only shown if
  `companyProfile.vatRegistered`), Total. For invoices: also Amount Paid
  and Balance Due (using the existing `balanceDue` field).
- Footer: banking details (bank name, account holder, account number,
  branch code) if set, then `termsAndConditionsText` if set.
- **No logo embedding.** `logoUrl` is an external URL with no upload
  pipeline behind it (logo upload is explicitly deferred elsewhere in this
  project). Fetching a tenant-supplied URL server-side to embed in a PDF
  is an SSRF surface for no real benefit at this stage — skip it. Business
  name text serves as the header identity for now.

### `sendDocumentEmail()`

New file `src/documents/sendDocumentEmail.ts` (not `src/auth/` — this is a
document concern, not an auth concern):

```typescript
export async function sendDocumentEmail(
  to: string,
  documentType: 'quote' | 'invoice',
  documentNumber: string,
): Promise<void> {
  console.log(`[dev-email] ${documentType} ${documentNumber} sent to ${to} (PDF attached, dev mode — no real email sent)`);
}
```

Deliberately doesn't take the PDF buffer — dev mode never attaches
anything, and a real-SMTP implementation is out of scope for tonight
(matches how `sendVerificationEmail` never touched real SMTP either).

## Frontend

**One button per detail page:** `QuoteDetailPage`, `InvoiceDetailPage` —
"Send to Customer" (disabled/hidden if `customer.email` is falsy, with a
tooltip/hint "Add a customer email to enable sending").

**On click:**
1. Call `useSendQuote()` / `useSendInvoice()` mutation → `POST
   /api/quotes/:id/send` (or invoices).
2. On success: decode `pdfBase64` → `Blob` → trigger browser download via
   a temporary `<a>` + `URL.createObjectURL` (filename:
   `{documentNumber}.pdf`).
3. Show a toast: `Emailed to {sentTo} (dev mode — check server console for
   the email log)`.
4. On 400 (no customer email): show the error message from the response.

No new page, no new route — an addition to the two existing detail pages.

## Deferred (explicitly out of scope)

- Real SMTP / transactional email service.
- "Download PDF" as a separate action when the customer has no email —
  today, no email on file means no PDF at all via this endpoint. A future
  item could split "generate PDF" from "email it", but that's not needed
  for tonight's scope.
- Logo embedding in the PDF.
- Any change to quote/invoice status as a side effect of sending.

## Testing

- Backend: unit tests for `sendDocumentEmail` (console output), route
  tests for both endpoints — happy path (200, contains `pdfBase64`
  starting with a valid PDF structure), 404 (wrong tenant / missing doc),
  400 (customer with no email).
- Frontend: `useSendQuote`/`useSendInvoice` hook tests (mocked API), detail
  page tests — button renders and disabled state when no customer email,
  click triggers mutation and shows toast (download itself is a browser
  API side effect, not asserted in jsdom).
