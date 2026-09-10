import { describe, it, expect } from 'vitest';
import { formatCurrency } from '../src/lib/formatCurrency.js';

describe('formatCurrency', () => {
  it('prefixes a ZAR value with "R " by default', () => {
    expect(formatCurrency('190.00')).toBe('R 190.00');
  });

  it('preserves the exact string scale, never reformats the number', () => {
    expect(formatCurrency('0.300000')).toBe('R 0.300000');
  });

  it('falls back to the currency code itself for an unrecognized currency', () => {
    expect(formatCurrency('10.00', 'USD')).toBe('USD 10.00');
  });

  it('does not resolve prototype-chain properties as currency symbols', () => {
    // 'constructor' (and other Object.prototype keys) are not own properties of
    // CURRENCY_SYMBOLS, so this must fall back like any other unrecognized code
    // instead of resolving to Object's constructor function via the prototype chain.
    expect(formatCurrency('1.00', 'constructor')).toBe('constructor 1.00');
  });
});
