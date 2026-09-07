import { describe, it, expect } from 'vitest';
import { omitBlankFields } from '../src/lib/omitBlankFields.js';

describe('omitBlankFields', () => {
  it('omits listed fields when they are blank, leaving unlisted blank fields untouched', () => {
    const result = omitBlankFields({ a: '', b: '', c: 'kept' }, ['a']);
    expect(result).not.toHaveProperty('a');
    expect(result.b).toBe('');
    expect(result.c).toBe('kept');
  });

  it('does not touch false, 0, or null, and leaves non-blank listed fields as-is', () => {
    expect(omitBlankFields({ flag: false, count: 0, missing: null, name: 'set' }, ['name'])).toEqual({
      flag: false,
      count: 0,
      missing: null,
      name: 'set',
    });
  });
});
