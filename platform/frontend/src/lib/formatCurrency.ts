const CURRENCY_SYMBOLS: Record<string, string> = {
  ZAR: 'R',
};

export function formatCurrency(value: string, currency: string = 'ZAR'): string {
  const symbol = CURRENCY_SYMBOLS[currency] ?? currency;
  return `${symbol} ${value}`;
}
