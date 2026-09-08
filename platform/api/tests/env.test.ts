import { test } from 'node:test';
import assert from 'node:assert/strict';
import { trustProxyWarning } from '../src/env.js';

test('trustProxyWarning returns null for unset, empty, "true", or "false"', () => {
  assert.equal(trustProxyWarning(undefined), null);
  assert.equal(trustProxyWarning(''), null);
  assert.equal(trustProxyWarning('true'), null);
  assert.equal(trustProxyWarning('false'), null);
});

test('trustProxyWarning returns a message naming the bad value for anything else', () => {
  const warning = trustProxyWarning('1');
  assert.ok(warning);
  assert.match(warning!, /TRUST_PROXY/);
  assert.match(warning!, /"1"/);
});
