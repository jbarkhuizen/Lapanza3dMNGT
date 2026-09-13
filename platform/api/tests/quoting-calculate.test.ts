import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calculateQuoteTotals } from '../src/quoting/calculate.js';

test('single line, no VAT', () => {
  const result = calculateQuoteTotals({
    lines: [{ unitPrice: 150, quantity: 2 }],
    vatApplied: false,
  });
  assert.equal(result.lineTotals[0].toFixed(2), '300.00');
  assert.equal(result.subtotal.toFixed(2), '300.00');
  assert.equal(result.vatAmount.toFixed(2), '0.00');
  assert.equal(result.total.toFixed(2), '300.00');
});

test('single line, VAT applied at 15%', () => {
  const result = calculateQuoteTotals({
    lines: [{ unitPrice: 100, quantity: 1 }],
    vatApplied: true,
  });
  assert.equal(result.subtotal.toFixed(2), '100.00');
  assert.equal(result.vatAmount.toFixed(2), '15.00');
  assert.equal(result.total.toFixed(2), '115.00');
});

test('multiple lines sum into subtotal before VAT', () => {
  const result = calculateQuoteTotals({
    lines: [
      { unitPrice: 50, quantity: 3 }, // 150.00
      { unitPrice: 20, quantity: 2 }, // 40.00
    ],
    vatApplied: true,
  });
  assert.equal(result.lineTotals[0].toFixed(2), '150.00');
  assert.equal(result.lineTotals[1].toFixed(2), '40.00');
  assert.equal(result.subtotal.toFixed(2), '190.00');
  assert.equal(result.vatAmount.toFixed(2), '28.50');
  assert.equal(result.total.toFixed(2), '218.50');
});

test('rounds the unit price to 2dp before deriving the line total, so the persisted rate and total reconcile', () => {
  // 2.335 rounds to 2.34 under HALF_UP; 2.34 * 3 = 7.02 exactly.
  // Multiplying the raw 2.335 * 3 = 7.005 directly (without rounding the rate
  // first) would give 7.01 -- the same defect class the costing engine's
  // calculateCosting() was fixed for.
  const result = calculateQuoteTotals({
    lines: [{ unitPrice: 2.335, quantity: 3 }],
    vatApplied: false,
  });
  assert.equal(result.lineUnitPrices[0].toFixed(2), '2.34');
  assert.equal(result.lineTotals[0].toFixed(2), '7.02');
  assert.equal(result.lineUnitPrices[0].times(3).toFixed(2), result.lineTotals[0].toFixed(2));
});

test('empty line list produces zero totals', () => {
  const result = calculateQuoteTotals({ lines: [], vatApplied: true });
  assert.equal(result.subtotal.toFixed(2), '0.00');
  assert.equal(result.vatAmount.toFixed(2), '0.00');
  assert.equal(result.total.toFixed(2), '0.00');
});

// --- Discount modes (docs/superpowers/specs/2026-09-13-invoice-quote-enhancements-design.md) ---

const DISCOUNT_LINES = [
  { unitPrice: 50, quantity: 3 }, // 150.00
  { unitPrice: 33, quantity: 1 }, // 33.00
]; // subtotal 183.00

test('no discount arguments reproduces exactly today\'s output (byte-identical, additive-only change)', () => {
  const withoutDiscountFields = calculateQuoteTotals({ lines: DISCOUNT_LINES, vatApplied: true });
  const withExplicitNulls = calculateQuoteTotals({
    lines: DISCOUNT_LINES,
    vatApplied: true,
    discountPercent: null,
    discountAppliesTo: null,
  });
  for (const result of [withoutDiscountFields, withExplicitNulls]) {
    assert.equal(result.subtotal.toFixed(2), '183.00');
    assert.equal(result.discountAmount.toFixed(2), '0.00');
    assert.equal(result.vatAmount.toFixed(2), '27.45');
    assert.equal(result.total.toFixed(2), '210.45');
    assert.equal(result.lineTotals[0].toFixed(2), '150.00');
    assert.equal(result.lineTotals[1].toFixed(2), '33.00');
  }
});

test('discountPercent of 0 behaves identically to no discount', () => {
  const zeroDiscount = calculateQuoteTotals({
    lines: DISCOUNT_LINES,
    vatApplied: true,
    discountPercent: 0,
    discountAppliesTo: 'total',
  });
  const noDiscount = calculateQuoteTotals({ lines: DISCOUNT_LINES, vatApplied: true });
  assert.equal(zeroDiscount.subtotal.toFixed(2), noDiscount.subtotal.toFixed(2));
  assert.equal(zeroDiscount.discountAmount.toFixed(2), '0.00');
  assert.equal(zeroDiscount.vatAmount.toFixed(2), noDiscount.vatAmount.toFixed(2));
  assert.equal(zeroDiscount.total.toFixed(2), noDiscount.total.toFixed(2));
  assert.equal(zeroDiscount.lineTotals[0].toFixed(2), noDiscount.lineTotals[0].toFixed(2));
});

test('\'total\' discount mode: 10% off the subtotal, applied once before VAT', () => {
  // subtotal 183.00 -> discountAmount = round(183.00 * 10 / 100, 2) = 18.30
  // discountedSubtotal = 164.70 -> vatAmount = round(164.70 * 0.15, 2) = 24.705 -> 24.71 (HALF_UP)
  // total = 164.70 + 24.71 = 189.41
  const result = calculateQuoteTotals({
    lines: DISCOUNT_LINES,
    vatApplied: true,
    discountPercent: 10,
    discountAppliesTo: 'total',
  });
  assert.equal(result.subtotal.toFixed(2), '183.00');
  assert.equal(result.discountAmount.toFixed(2), '18.30');
  assert.equal(result.vatAmount.toFixed(2), '24.71');
  assert.equal(result.total.toFixed(2), '189.41');
  // 'total' mode does not touch the per-line totals -- they stay the plain,
  // undiscounted line totals.
  assert.equal(result.lineTotals[0].toFixed(2), '150.00');
  assert.equal(result.lineTotals[1].toFixed(2), '33.00');
});

test('\'per_line\' discount mode: 10% off each line before summing, producing a different (documented) result from \'total\' mode', () => {
  // line 0: round(150.00 * 0.90, 2) = 135.00
  // line 1: round(33.00 * 0.90, 2) = 29.70
  // discountedSubtotal = round(135.00 + 29.70, 2) = 164.70 (same as 'total' mode here,
  // since these particular lines don't hit a rounding boundary either way)
  // subtotal (pre-discount) still 183.00; discountAmount = 183.00 - 164.70 = 18.30
  // vatAmount = round(164.70 * 0.15, 2) = 24.71; total = 164.70 + 24.71 = 189.41
  const result = calculateQuoteTotals({
    lines: DISCOUNT_LINES,
    vatApplied: true,
    discountPercent: 10,
    discountAppliesTo: 'per_line',
  });
  assert.equal(result.subtotal.toFixed(2), '183.00');
  assert.equal(result.lineTotals[0].toFixed(2), '135.00');
  assert.equal(result.lineTotals[1].toFixed(2), '29.70');
  assert.equal(result.discountAmount.toFixed(2), '18.30');
  assert.equal(result.vatAmount.toFixed(2), '24.71');
  assert.equal(result.total.toFixed(2), '189.41');
});

test('\'per_line\' and \'total\' modes can diverge by a cent because per-line rounds first', () => {
  // Three identical odd-cent lines make the two modes disagree by exactly one cent, per
  // the spec's note that this is expected/correct, not a bug to reconcile away.
  const lines = [
    { unitPrice: 3.33, quantity: 1 },
    { unitPrice: 3.33, quantity: 1 },
    { unitPrice: 3.33, quantity: 1 },
  ]; // subtotal 9.99
  const totalMode = calculateQuoteTotals({ lines, vatApplied: false, discountPercent: 10, discountAppliesTo: 'total' });
  const perLineMode = calculateQuoteTotals({ lines, vatApplied: false, discountPercent: 10, discountAppliesTo: 'per_line' });

  // 'total': discountAmount = round(9.99 * 10 / 100, 2) = round(0.999, 2) = 1.00
  // discountedSubtotal = 9.99 - 1.00 = 8.99
  assert.equal(totalMode.discountAmount.toFixed(2), '1.00');
  assert.equal(totalMode.total.toFixed(2), '8.99');

  // 'per_line': each line's discountedLineTotal = round(3.33 * 0.90, 2) = round(2.997, 2) = 3.00
  // discountedSubtotal = round(3.00 * 3, 2) = 9.00 -> discountAmount = 9.99 - 9.00 = 0.99
  assert.equal(perLineMode.lineTotals[0].toFixed(2), '3.00');
  assert.equal(perLineMode.discountAmount.toFixed(2), '0.99');
  assert.equal(perLineMode.total.toFixed(2), '9.00');

  // The two modes land on genuinely different totals for the same inputs.
  assert.notEqual(totalMode.total.toFixed(2), perLineMode.total.toFixed(2));
});

test('discountAppliesTo without a discountPercent is treated as no discount', () => {
  const result = calculateQuoteTotals({ lines: DISCOUNT_LINES, vatApplied: false, discountAppliesTo: 'total' });
  assert.equal(result.discountAmount.toFixed(2), '0.00');
  assert.equal(result.total.toFixed(2), '183.00');
});
