# Invoice/Quote Enhancements: Discounts, Payment Link, Document Footer Defaults — Design Spec

**Source:** competitor reference screenshots (Invoice/Quote creation forms — Discounts control, Payment link field, Banking details/Pricing notes footer, Payment terms/Notes/Terms & conditions).

## Money-math discipline — read this before touching `calculate.ts`

This codebase already went through a multi-round rounding-order bug-fix cycle on the costing engine (see `platform/api/src/quoting/calculate.ts`'s existing `round()`-after-every-step discipline). Discounts are new arithmetic on the same money path — follow the exact formulas below, do not improvise rounding order.

**`subtotal` keeps its current meaning: the pre-discount sum of line totals.** Do not repurpose it. Add a new persisted `discountAmount` column (always the actual Rand amount removed, `0` when no discount) so the UI/PDF can show `Subtotal → Discount → VAT → Total` as four distinct lines that reconcile.

Two discount modes, selected by `discountAppliesTo`:

- **`'total'`**: `lineTotals` computed exactly as `calculateQuoteTotals` already does today → `subtotal = round(Σ lineTotals, 2)` (unchanged) → `discountAmount = round(subtotal × discountPercent / 100, 2)` → `discountedSubtotal = subtotal − discountAmount` → `vatAmount = vatApplied ? round(discountedSubtotal × 0.15, 2) : 0` → `total = discountedSubtotal + vatAmount`.
- **`'per_line'`**: each line's total is discounted **before** summing: `discountedLineTotal[i] = round(lineTotals[i] × (1 − discountPercent/100), 2)` → `subtotal = round(Σ lineTotals, 2)` (still the **pre**-discount sum, per the rule above) → `discountedSubtotal = round(Σ discountedLineTotal, 2)` → `discountAmount = subtotal − discountedSubtotal` → `vatAmount = vatApplied ? round(discountedSubtotal × 0.15, 2) : 0` → `total = discountedSubtotal + vatAmount`. Note this can differ by a cent or two from the `'total'` mode's result on the same inputs, because rounding happens per-line first — that's expected and correct, not a bug to reconcile away.
- **No discount** (`discountPercent` null/0 or `discountAppliesTo` null): `discountAmount = 0`, everything else exactly as `calculateQuoteTotals` computes today. **This must produce byte-identical output to the current function for every existing test** — the whole point is additive, not a rewrite.

`discountPercent` is `0`–`100` inclusive (a zod `.min(0).max(100)`), stored as `Decimal @db.Decimal(5, 2)`.

## Data model

Add to both `Quote` and `Invoice` in `platform/api/prisma/schema.prisma`:
```prisma
discountPercent    Decimal? @db.Decimal(5, 2)
discountAppliesTo  String?
discountAmount     Decimal  @default(0) @db.Decimal(12, 2)
paymentTerms       String?
termsAndConditionsText String?
```
`Invoice` additionally gets:
```prisma
paymentLinkUrl String?
```

Add to `Tenant`:
```prisma
pricingNotesText     String?
defaultPaymentTerms  String?
defaultNotes         String?
```
(`Tenant.termsAndConditionsText` already exists — reuse it as the T&C default source, do not duplicate it under a new name.)

## Backend

**`platform/api/src/quoting/calculate.ts`** — extend `QuoteTotalsInput` with optional `discountPercent?: number | Prisma.Decimal` and `discountAppliesTo?: 'total' | 'per_line'`, extend `QuoteTotalsResult` with `discountAmount: Prisma.Decimal` and (for `'per_line'` mode) the per-line discounted totals replacing the plain `lineTotals` output — implement exactly the two formulas above. Add unit tests in `platform/api/tests/costing-calculate.test.ts` or wherever `calculateQuoteTotals` is currently tested (check first) covering: no discount reproduces today's exact output; `'total'` mode on a known input; `'per_line'` mode on the same input produces a different (documented) result; `discountPercent` of `0` behaves identically to no discount.

**`platform/api/src/routes/quotes.ts`** and **`platform/api/src/routes/invoices.ts`** — extend the create schema with `discountPercent`/`discountAppliesTo` (Invoice also `paymentLinkUrl`, validated as `z.string().trim().url().optional().or(z.literal(''))`), pass them into `calculateQuoteTotals`, persist the new columns. On creation, default `paymentTerms`/`termsAndConditionsText`/`notes` from the tenant's `defaultPaymentTerms`/`termsAndConditionsText`/`defaultNotes` **only when the request didn't supply its own value** (`body.paymentTerms ?? profile.defaultPaymentTerms ?? null`, same for the other two) — this is a one-time snapshot at creation, not a live link; editing the tenant defaults afterward must not retroactively change already-created documents. Add a `PATCH` capability for `paymentTerms`/`termsAndConditionsText`/`notes`/`paymentLinkUrl` (Invoice only for the link) on already-created documents if no such general-purpose PATCH exists yet for these fields — check the current routes first; if editing `notes` post-creation is already possible via some existing PATCH, extend that one rather than adding a new endpoint.

**`platform/api/src/routes/company-profile.ts`** — extend `updateCompanyProfileSchema` with `pricingNotesText`, `defaultPaymentTerms`, `defaultNotes` (plain `.trim().optional()`, matching the existing fields' validation style in this same schema).

**`platform/api/src/db/scoped.ts`** — extend `CreateQuoteInput`/`CreateInvoiceInput` and the `companyProfileSelect`/`UpdateCompanyProfileInput` with the new fields.

**PDF generation** (`platform/api/src/documents/generateDocumentPdf.ts`) — read this file first. Add: a Discount line between Subtotal and VAT (only rendered when `discountAmount > 0`), the Payment terms / Notes / Terms & conditions text blocks (if not already rendered — check current state), a Payment link (Invoice only, rendered as a clickable link if pdfkit supports link annotations, otherwise as plain text of the URL) when set, and the tenant's `pricingNotesText` as a small footer caption alongside the existing banking-details block.

## Frontend (`platform/frontend`)

**`platform/frontend/src/pages/CompanyProfilePage.tsx`** — add a "Document footer" section: Pricing notes (textarea), and a "Default notes & terms" section: Payment terms / Notes / Terms & conditions (the last one likely already has a field here under a different section — check first, don't duplicate `termsAndConditionsText`'s existing input).

**`platform/frontend/src/pages/quotes/QuoteFormPage.tsx`** / **`platform/frontend/src/pages/invoices/InvoiceFormPage.tsx`** (check exact filenames first) — add: a "Discounts" control (radio/select: None / Invoice total / Per line item, revealing a percentage input when not "None"), Payment terms / Terms & conditions text inputs (pre-filled from the loaded defaults on the create form, editable), Invoice-only Payment link URL field. Show the discount line in the on-page totals summary (Subtotal / Discount / VAT / Total) matching the PDF.

## Tests

- Backend: extend `tests/quotes.test.ts` / `tests/invoices.test.ts` with create-with-discount (both modes) round-trip tests, and a company-profile test for the three new tenant default fields feeding into a newly-created document.
- Frontend: extend the corresponding form-page test files for the new discount control and payment-link field.

## Global constraints

- `calculateQuoteTotals` with no discount arguments must remain byte-identical to its current behavior — every existing caller and test that doesn't pass discount fields must keep passing unmodified.
- Every route stays tenant-scoped, `requireTenantAuth`/`requireActiveSubscription`.
- Follow the exact rounding-order formulas above — do not "simplify" them, the two modes are deliberately different.
