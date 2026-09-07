export function formatDocumentNumber(prefix: string, value: number): string {
  return `${prefix}-${value.toString().padStart(4, '0')}`;
}
