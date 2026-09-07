import { Prisma } from '@prisma/client';

export interface QuoteLineInput {
  unitPrice: number | Prisma.Decimal;
  quantity: number;
}

export interface QuoteTotalsInput {
  lines: QuoteLineInput[];
  vatApplied: boolean;
}

export interface QuoteTotalsResult {
  lineUnitPrices: Prisma.Decimal[];
  lineTotals: Prisma.Decimal[];
  subtotal: Prisma.Decimal;
  vatAmount: Prisma.Decimal;
  total: Prisma.Decimal;
}

const VAT_RATE = new Prisma.Decimal('0.15');

function toDecimal(value: number | Prisma.Decimal): Prisma.Decimal {
  return value instanceof Prisma.Decimal ? value : new Prisma.Decimal(value);
}

function round(value: Prisma.Decimal, decimalPlaces: number): Prisma.Decimal {
  return value.toDecimalPlaces(decimalPlaces, Prisma.Decimal.ROUND_HALF_UP);
}

export function calculateQuoteTotals(input: QuoteTotalsInput): QuoteTotalsResult {
  const { lines, vatApplied } = input;

  // Round each rate to its column scale BEFORE deriving a line total from it,
  // so the persisted unitPrice and the persisted lineTotal always reconcile
  // (unitPrice * quantity === lineTotal), the same discipline the costing
  // engine's calculateCosting() applies to labour/consumable rates.
  const lineUnitPrices = lines.map((line) => round(toDecimal(line.unitPrice), 2));
  const lineTotals = lines.map((line, i) => round(lineUnitPrices[i].times(line.quantity), 2));

  const subtotal = round(
    lineTotals.reduce((sum, cost) => sum.plus(cost), new Prisma.Decimal(0)),
    2,
  );
  const vatAmount = vatApplied ? round(subtotal.times(VAT_RATE), 2) : new Prisma.Decimal(0);
  const total = round(subtotal.plus(vatAmount), 2);

  return { lineUnitPrices, lineTotals, subtotal, vatAmount, total };
}
