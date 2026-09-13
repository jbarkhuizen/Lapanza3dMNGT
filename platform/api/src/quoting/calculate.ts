import { Prisma } from '@prisma/client';

export interface QuoteLineInput {
  unitPrice: number | Prisma.Decimal;
  quantity: number;
}

export type DiscountAppliesTo = 'total' | 'per_line';

export interface QuoteTotalsInput {
  lines: QuoteLineInput[];
  vatApplied: boolean;
  // Both must be present (and discountPercent > 0) for a discount to apply --
  // see calculateQuoteTotals's doc comment for the exact rounding-order
  // formulas per mode. Absent/null discountPercent, or a discountPercent of
  // 0, behaves identically to omitting discount fields entirely.
  discountPercent?: number | Prisma.Decimal | null;
  discountAppliesTo?: DiscountAppliesTo | null;
}

export interface QuoteTotalsResult {
  lineUnitPrices: Prisma.Decimal[];
  // In 'per_line' discount mode, these are the per-line DISCOUNTED totals
  // (what gets persisted as each line item's lineTotal) -- NOT
  // lineUnitPrices[i] * quantity. In 'total' mode, or with no discount,
  // these are the plain (undiscounted) line totals, same as always.
  lineTotals: Prisma.Decimal[];
  subtotal: Prisma.Decimal;
  // Always present (0 when no discount applies) -- the actual Rand amount
  // removed from subtotal before VAT, so subtotal/discountAmount/vatAmount/
  // total reconcile as four distinct lines.
  discountAmount: Prisma.Decimal;
  vatAmount: Prisma.Decimal;
  total: Prisma.Decimal;
}

const VAT_RATE = new Prisma.Decimal('0.15');

// Quote/Invoice subtotal, vatAmount and total columns are all
// @db.Decimal(12, 2) in prisma/schema.prisma — 12 significant digits, 2
// after the decimal point, so this is the largest value that column can
// physically hold. Per-line-item unitPrice is already capped well under
// this at the zod-schema layer (routes/quotes.ts, routes/invoices.ts), but
// that only bounds a single line — summing many valid lines (or a large
// quantity) can still push subtotal/vatAmount/total past this ceiling, so
// callers must check the *computed* totals against it before persisting.
export const MAX_MONEY_VALUE = new Prisma.Decimal('9999999999.99');

function toDecimal(value: number | Prisma.Decimal): Prisma.Decimal {
  return value instanceof Prisma.Decimal ? value : new Prisma.Decimal(value);
}

function round(value: Prisma.Decimal, decimalPlaces: number): Prisma.Decimal {
  return value.toDecimalPlaces(decimalPlaces, Prisma.Decimal.ROUND_HALF_UP);
}

// Money-math discipline (see docs/superpowers/specs/2026-09-13-invoice-quote-enhancements-design.md's
// "Money-math discipline" section) -- follow these formulas exactly, do not
// "simplify" or reorder the rounding:
//
// No discount (discountPercent null/0, or discountAppliesTo null): identical
// to this function's pre-discount behaviour. discountAmount is 0.
//
// 'total' mode:
//   subtotal = round(Σ lineTotals, 2)                          (unchanged)
//   discountAmount = round(subtotal × discountPercent / 100, 2)
//   discountedSubtotal = subtotal − discountAmount
//   vatAmount = vatApplied ? round(discountedSubtotal × 0.15, 2) : 0
//   total = discountedSubtotal + vatAmount
//
// 'per_line' mode:
//   discountedLineTotal[i] = round(lineTotals[i] × (1 − discountPercent/100), 2)
//   subtotal = round(Σ lineTotals, 2)                    (still the PRE-discount sum)
//   discountedSubtotal = round(Σ discountedLineTotal, 2)
//   discountAmount = subtotal − discountedSubtotal
//   vatAmount = vatApplied ? round(discountedSubtotal × 0.15, 2) : 0
//   total = discountedSubtotal + vatAmount
//
// The two modes deliberately land on different totals (by a cent or two) for
// the same inputs, because 'per_line' rounds each line before summing --
// that's expected, not a bug to reconcile away.
export function calculateQuoteTotals(input: QuoteTotalsInput): QuoteTotalsResult {
  const { lines, vatApplied, discountPercent, discountAppliesTo } = input;

  // Round each rate to its column scale BEFORE deriving a line total from it,
  // so the persisted unitPrice and the persisted lineTotal always reconcile
  // (unitPrice * quantity === lineTotal) in the no-discount / 'total' cases,
  // the same discipline the costing engine's calculateCosting() applies to
  // labour/consumable rates.
  const lineUnitPrices = lines.map((line) => round(toDecimal(line.unitPrice), 2));
  const rawLineTotals = lines.map((line, i) => round(lineUnitPrices[i].times(line.quantity), 2));

  const subtotal = round(
    rawLineTotals.reduce((sum, cost) => sum.plus(cost), new Prisma.Decimal(0)),
    2,
  );

  const hasDiscount =
    discountAppliesTo != null && discountPercent != null && toDecimal(discountPercent).greaterThan(0);

  let lineTotals = rawLineTotals;
  let discountedSubtotal = subtotal;
  let discountAmount = new Prisma.Decimal(0);

  if (hasDiscount) {
    const percent = toDecimal(discountPercent!);
    if (discountAppliesTo === 'total') {
      discountAmount = round(subtotal.times(percent).dividedBy(100), 2);
      discountedSubtotal = subtotal.minus(discountAmount);
    } else {
      // 'per_line': discount each line's (already-rounded, pre-discount)
      // total before summing, so per-line rounding happens first.
      const discountedLineTotals = rawLineTotals.map((lineTotal) =>
        round(lineTotal.times(new Prisma.Decimal(1).minus(percent.dividedBy(100))), 2),
      );
      discountedSubtotal = round(
        discountedLineTotals.reduce((sum, cost) => sum.plus(cost), new Prisma.Decimal(0)),
        2,
      );
      discountAmount = subtotal.minus(discountedSubtotal);
      lineTotals = discountedLineTotals;
    }
  }

  const vatAmount = vatApplied ? round(discountedSubtotal.times(VAT_RATE), 2) : new Prisma.Decimal(0);
  const total = round(discountedSubtotal.plus(vatAmount), 2);

  return { lineUnitPrices, lineTotals, subtotal, discountAmount, vatAmount, total };
}
