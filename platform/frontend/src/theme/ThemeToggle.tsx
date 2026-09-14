import { useTheme, type Theme } from './ThemeContext.js';

const CYCLE: Theme[] = ['system', 'light', 'dark'];
const LABELS: Record<Theme, string> = { system: 'System', light: 'Light', dark: 'Dark' };

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();

  function cycle() {
    const next = CYCLE[(CYCLE.indexOf(theme) + 1) % CYCLE.length];
    setTheme(next);
  }

  return (
    <button
      type="button"
      onClick={cycle}
      aria-label={`Theme: ${LABELS[theme]}. Click to change.`}
      className="rounded px-2 py-1 text-sm text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-700"
    >
      {LABELS[theme]}
    </button>
  );
}
