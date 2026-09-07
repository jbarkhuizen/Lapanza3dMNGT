export function omitBlankStrings<T extends object>(input: T): T {
  const result = { ...input };
  for (const key of Object.keys(result) as (keyof T)[]) {
    if (result[key] === '') {
      result[key] = undefined as T[keyof T];
    }
  }
  return result;
}
