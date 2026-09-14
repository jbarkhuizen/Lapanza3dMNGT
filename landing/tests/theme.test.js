import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  STORAGE_KEY,
  THEME_CYCLE,
  parseStoredTheme,
  nextTheme,
  resolveTheme,
} from '../public/js/theme-core.js';

test('the storage key matches the cross-stack contract shared with platform/frontend', () => {
  assert.equal(STORAGE_KEY, 'barkie-theme');
});

test('parseStoredTheme defaults to system when nothing is stored', () => {
  assert.equal(parseStoredTheme(null), 'system');
  assert.equal(parseStoredTheme(undefined), 'system');
});

test('parseStoredTheme defaults to system for an unrecognized value', () => {
  assert.equal(parseStoredTheme('sepia'), 'system');
  assert.equal(parseStoredTheme(''), 'system');
});

test('parseStoredTheme passes through each valid explicit value, including system', () => {
  assert.equal(parseStoredTheme('system'), 'system');
  assert.equal(parseStoredTheme('light'), 'light');
  assert.equal(parseStoredTheme('dark'), 'dark');
});

test('nextTheme cycles System -> Light -> Dark -> System', () => {
  assert.equal(nextTheme('system'), 'light');
  assert.equal(nextTheme('light'), 'dark');
  assert.equal(nextTheme('dark'), 'system');
});

test('nextTheme cycling three times from any starting point returns to that point', () => {
  for (const start of THEME_CYCLE) {
    const afterThreeClicks = nextTheme(nextTheme(nextTheme(start)));
    assert.equal(afterThreeClicks, start);
  }
});

test('resolveTheme follows the OS preference only when theme is system', () => {
  assert.equal(resolveTheme('system', true), 'dark');
  assert.equal(resolveTheme('system', false), 'light');
});

test('resolveTheme ignores the OS preference once pinned to light or dark', () => {
  assert.equal(resolveTheme('light', true), 'light');
  assert.equal(resolveTheme('dark', false), 'dark');
});
