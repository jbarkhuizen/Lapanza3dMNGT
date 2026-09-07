/**
 * Removes the given fields from `input` when their value is a blank string (''),
 * leaving every other field — including blank strings not named in `fields` — untouched.
 *
 * Only some optional fields have stricter-than-plain-optional server validation (e.g.
 * `.email()`, `.min(1)`) that rejects ''. Those are the ones that belong in `fields`, so an
 * intentionally-blank value is omitted from the request instead of failing validation.
 * Every other optional field accepts '' fine and should be sent as-is, so a user can
 * actually clear it.
 */
export function omitBlankFields<T extends object>(input: T, fields: (keyof T)[]): Partial<T> {
  const result: Partial<T> = { ...input };
  for (const field of fields) {
    if (result[field] === '') {
      delete result[field];
    }
  }
  return result;
}
