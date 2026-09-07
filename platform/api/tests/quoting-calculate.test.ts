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
