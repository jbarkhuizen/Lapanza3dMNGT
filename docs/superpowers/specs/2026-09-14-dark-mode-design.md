# Dark Mode

## Summary

Add a System/Light/Dark theme control across the whole product: the tenant dashboard (`platform/frontend`) and the public landing/shop site (`landing/`), sharing one `localStorage` key so a user's choice carries over between them (same-origin in production, both served under `barkie.co.za`).

## Background / motivation

The dashboard has no dark mode at all — every color is a hardcoded Tailwind utility class (`text-slate-900`, `bg-white`, etc.), no tokens, no toggle. Investigating the landing site during this brainstorm turned up that it already HAS a working light/dark toggle (`landing/public/js/shared.js`, `landing/public/styles.css`'s `:root[data-theme="dark"]` block), live on all 5 of its pages — it just doesn't offer an explicit "follow my system" option once a user has touched the toggle, and it was built independently of anything in the dashboard. This spec corrects the scope accordingly: **extend** landing's existing implementation to 3-state, and **build** the dashboard's from scratch, sharing the same persistence key and the same underlying palette.

## Scope decision

Both areas, in one round, since the user wants the whole product themed consistently and the landing-site half turned out to be a small extension rather than new work.

## Palette

Approved token values (design walkthrough used the dashboard's just-shipped Filaments page and a landing snippet as worked examples):

| Token | Light | Dark |
|---|---|---|
| `bg` (page) | `#f8fafc` (slate-50) | `#0f172a` (slate-900) |
| `surface` (cards/nav/table) | `#ffffff` | `#1e293b` (slate-800) |
| `border` | `#e2e8f0` (slate-200) | `#334155` (slate-700) |
| `text` primary | `#0f172a` (slate-900) | `#f1f5f9` (slate-100) |
| `text` secondary | `#64748b` (slate-500) | `#94a3b8` (slate-400) |
| primary button (dashboard) | `#0f172a` bg / white text | `#f1f5f9` bg / `#0f172a` text (inverted) |
| danger surface / text | `#fef2f2` / `#dc2626` | `#450a0a` / `#f87171` |

Landing keeps its own already-established token names and terracotta accent (`--color-terracotta` etc. in `styles.css`) — these dashboard tokens are a separate, parallel system expressed as Tailwind `dark:` variants, not shared CSS variables. "One shared palette" means the neutrals read as the same visual language across both areas, not that the two codebases share a literal token file — they're different stacks (Tailwind utility classes vs. hand-written CSS custom properties) and stay that way.

## Landing site changes (extend, not rebuild)

- `shared.js`'s theme logic currently: read `localStorage['barkie-theme']`, fall back to `prefers-color-scheme`, set `data-theme` once, and the toggle button flips between only `'light'`/`'dark'` from then on (writing a concrete value every time, so a user can never get back to "follow my OS" without clearing storage manually).
- Change: the toggle becomes a 3-way cycle, **System → Light → Dark → System**. `'system'` is a real value that can be written back to `localStorage['barkie-theme']` (not just "nothing stored yet"). When the resolved value is `'system'`, derive the applied `data-theme` from `matchMedia('(prefers-color-scheme: dark)')` **and** subscribe to that query's `change` event so the page updates live if the OS theme changes while the tab is open, without a reload.
- Audit `styles.css` for any color declaration that isn't routed through `--surface`/`--surface-soft`/`--ink`/`--ink-muted`/`--color-*` — a value that bypasses the token system would look wrong (or invisible) once dark mode is actually used more widely than it apparently has been.
- The toggle control's visible state (icon/label) needs a third visual state for "System," not just two.

## Dashboard changes (new)

- `platform/frontend/tailwind.config.js`: add `darkMode: 'class'`.
- New `platform/frontend/src/theme/ThemeContext.tsx` (or similar): a `ThemeProvider` + `useTheme()` hook exposing `{ theme: 'system' | 'light' | 'dark', setTheme, resolvedTheme: 'light' | 'dark' }`. Reads/writes the **same** `localStorage['barkie-theme']` key landing already uses — same values (`'system' | 'light' | 'dark'`), so a preference set on the public site is honored on first dashboard visit and vice versa (both served from `barkie.co.za` in production, the dashboard under `/app`). Applies `resolvedTheme === 'dark'` as a `dark` class on `document.documentElement`, and subscribes to `matchMedia('(prefers-color-scheme: dark)')`'s `change` event while `theme === 'system'`.
- Mount `ThemeProvider` in `AppProviders.tsx`, alongside the existing `QueryClientProvider`.
- **Flash-of-wrong-theme prevention**: a small inline `<script>` added directly to `platform/frontend/index.html`'s `<head>`, running synchronously before React mounts, that reads `localStorage['barkie-theme']` (falling back to `matchMedia`) and sets the `dark` class on `<html>` immediately — the same technique every dashboard with a persisted theme uses, since `ThemeProvider`'s own effect would otherwise run after first paint and cause a visible flash on every load.
- New toggle control in `AppShell.tsx`'s header, next to the existing notification bell — a 3-way control (System/Light/Dark), not a plain on/off switch.
- The mechanical sweep: every hardcoded Tailwind color utility across `platform/frontend/src/**` (pages, components, `AppShell.tsx` itself) gets a matching `dark:` variant per the palette table above. No new abstraction — plain Tailwind classes, exactly how this codebase already writes them everywhere (e.g. `className="bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"`).

## Testing

- `ThemeContext`/`useTheme()`: unit tests covering — defaults to `'system'` with no stored value; resolves to the OS preference via a mocked `matchMedia`; explicit `setTheme('dark')` persists to `localStorage` and overrides the OS mock; a live `matchMedia` `change` event updates `resolvedTheme` only while `theme === 'system'` (not while pinned to light/dark).
- The toggle component: renders three selectable states, clicking each calls `setTheme` with the right value.
- No changes to the ~60 existing page/component tests beyond this — adding a `dark:` variant to a className string doesn't change what those tests assert (text content, interaction behavior), so they're expected to pass unmodified. A handful of spot-check tests (e.g. on `AppShell` or one representative list page) assert the `dark` class toggles the right elements, rather than re-testing every page's markup.
- Landing site: extend `landing/tests/` (if a JS test suite exists there — confirm before assuming) with the 3-way cycle logic; otherwise this is manually verified in a browser, matching how the rest of `landing/`'s JS is tested today (check `landing/tests/` first).

## Out of scope

- A rebrand or new accent color for the dashboard — it stays monochrome slate, just themed for both light and dark.
- Any change to landing's actual color values or brand tokens (terracotta etc.) — only the toggle's state machine changes.
- Per-tenant custom shop-page theming (a tenant's public shop page inherits the same site-wide toggle, not its own separate light/dark setting).
