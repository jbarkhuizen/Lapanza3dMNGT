const CURRENCY_SYMBOLS: Record<string, string> = {
  ZAR: 'R',
};

export function formatCurrency(value: string, currency: string = 'ZAR'): string {
  const symbol = Object.hasOwn(CURRENCY_SYMBOLS, currency) ? CURRENCY_SYMBOLS[currency] : currency;
  return `${symbol} ${value}`;
}
