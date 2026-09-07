import { describe, it, expect } from 'vitest';
import { omitBlankStrings } from '../src/lib/omitBlankStrings.js';

describe('omitBlankStrings', () => {
  it('converts empty string values to undefined', () => {
    expect(omitBlankStrings({ a: '', b: 'kept' })).toEqual({ a: undefined, b: 'kept' });
  });

  it('does not touch false, 0, or null', () => {
    expect(omitBlankStrings({ flag: false, count: 0, missing: null })).toEqual({ flag: false, count: 0, missing: null });
  });
});
