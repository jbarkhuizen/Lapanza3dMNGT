import {
  STORAGE_KEY,
  THEME_ICONS,
  THEME_LABELS,
  parseStoredTheme,
  nextTheme,
  resolveTheme,
} from './theme-core.js';

(function () {
  const root = document.documentElement;
  const media = window.matchMedia('(prefers-color-scheme: dark)');

  function readStoredTheme() {
    try {
      return parseStoredTheme(localStorage.getItem(STORAGE_KEY));
    } catch (err) {
      // localStorage unavailable (private browsing, etc.) — follow the OS.
      return 'system';
    }
  }

  function writeStoredTheme(theme) {
    try {
      localStorage.setItem(STORAGE_KEY, theme);
    } catch (err) {
      // storage unavailable — theme just won't persist
    }
  }

  let theme = readStoredTheme();

  const toggle = document.getElementById('theme-toggle');
  const icon = toggle ? toggle.querySelector('[aria-hidden="true"]') : null;

  function applyTheme() {
    root.setAttribute('data-theme', resolveTheme(theme, media.matches));
    if (toggle) {
      if (icon) {
        icon.textContent = THEME_ICONS[theme];
      }
      toggle.setAttribute('aria-label', `Theme: ${THEME_LABELS[theme]}. Click to change.`);
    }
  }

  applyTheme();

  // While the user hasn't pinned a theme (or has explicitly chosen
  // 'system'), keep the applied theme live-synced with the OS preference
  // without a reload.
  media.addEventListener('change', () => {
    if (theme === 'system') {
      applyTheme();
    }
  });

  if (toggle) {
    toggle.addEventListener('click', () => {
      theme = nextTheme(theme);
      writeStoredTheme(theme);
      applyTheme();
    });
  }

  const yearEl = document.getElementById('year');
  if (yearEl) {
    yearEl.textContent = String(new Date().getFullYear());
  }
})();
