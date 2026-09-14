// Pure, DOM-free theme state logic for the System/Light/Dark toggle — no
// localStorage/window/document access here, so it can be unit-tested
// directly. Mirrors the split used by materials-selector.js and
// stl-scaler-core.js: the wiring (reading localStorage, matchMedia,
// updating the DOM) lives in shared.js, the state machine lives here.

export const STORAGE_KEY = 'barkie-theme';

export const THEME_CYCLE = ['system', 'light', 'dark'];

export const THEME_ICONS = { system: '◐', light: '☀', dark: '☾' };

export const THEME_LABELS = { system: 'System', light: 'Light', dark: 'Dark' };

/**
 * Validates a raw value read from storage, defaulting to 'system' for
 * anything unset or unrecognized — including an existing user's untouched
 * preference from before this 3-state toggle existed, when the old 2-state
 * toggle never wrote anything until the first click (so "nothing stored"
 * and "explicitly system" are treated identically: follow the OS).
 */
export function parseStoredTheme(rawValue) {
  return THEME_CYCLE.includes(rawValue) ? rawValue : 'system';
}

/** Advances the toggle: System -> Light -> Dark -> System. */
export function nextTheme(theme) {
  const index = THEME_CYCLE.indexOf(theme);
  return THEME_CYCLE[(index + 1) % THEME_CYCLE.length];
}

/**
 * Resolves the theme actually applied to the page (`data-theme`).
 * `prefersDark` is the caller-supplied result of
 * `matchMedia('(prefers-color-scheme: dark)').matches`, kept as a plain
 * argument (rather than read internally) so this function stays
 * window-free and doesn't require mocking matchMedia to test.
 */
export function resolveTheme(theme, prefersDark) {
  if (theme === 'system') {
    return prefersDark ? 'dark' : 'light';
  }
  return theme;
}
