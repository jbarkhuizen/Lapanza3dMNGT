import '@testing-library/jest-dom/vitest';

// Newer Node versions (v20.11+) ship their own experimental global `localStorage`,
// which is disabled unless run with `--localstorage-file`. Because it already exists
// as a key on the Node global object, vitest's jsdom environment setup skips copying
// jsdom's real, working `window.localStorage` over it — leaving `localStorage` (and
// `window.localStorage`, since `window` is aliased to the test global) undefined.
// Backfill it here from the underlying jsdom instance so tests can use localStorage
// as they would in a real browser.
declare global {
  // eslint-disable-next-line no-var
  var jsdom: { window: Window } | undefined;
}

if (typeof globalThis.localStorage === 'undefined' && globalThis.jsdom) {
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    get: () => globalThis.jsdom!.window.localStorage,
  });
}

// jsdom does not implement `window.matchMedia` at all. `ThemeProvider` (mounted by
// `AppProviders`, and therefore present in every test that renders `<App>` or
// `<AppShell>`) calls it unconditionally, so every such test would otherwise throw
// "window.matchMedia is not a function". Provide a default fallback (reporting "no
// dark preference") so those tests don't need to know about theming at all; tests
// that care about the resolved theme (ThemeContext/ThemeToggle/AppShell tests) set
// their own `window.matchMedia` mock in a `beforeEach`, which simply overrides this.
if (typeof window.matchMedia !== 'function') {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}
