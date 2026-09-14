import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { ThemeProvider, useTheme } from '../src/theme/ThemeContext.js';

type MatchMediaMock = {
  matches: boolean;
  media: string;
  addEventListener: ReturnType<typeof vi.fn>;
  removeEventListener: ReturnType<typeof vi.fn>;
};

function mockMatchMedia(matches: boolean): MatchMediaMock {
  const mock: MatchMediaMock = {
    matches,
    media: '(prefers-color-scheme: dark)',
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  };
  window.matchMedia = vi.fn().mockImplementation(() => mock) as unknown as typeof window.matchMedia;
  return mock;
}

function ThemeProbe() {
  const { theme, setTheme, resolvedTheme } = useTheme();
  return (
    <div>
      <span>theme: {theme}</span>
      <span>resolved: {resolvedTheme}</span>
      <button onClick={() => setTheme('dark')}>set dark</button>
      <button onClick={() => setTheme('light')}>set light</button>
      <button onClick={() => setTheme('system')}>set system</button>
    </div>
  );
}

beforeEach(() => {
  localStorage.clear();
});

describe('ThemeContext', () => {
  it('defaults to system with no stored value, resolving from matchMedia', () => {
    mockMatchMedia(true);
    render(
      <ThemeProvider>
        <ThemeProbe />
      </ThemeProvider>,
    );
    expect(screen.getByText('theme: system')).toBeInTheDocument();
    expect(screen.getByText('resolved: dark')).toBeInTheDocument();
  });

  it('resolves to light when matchMedia does not match dark preference', () => {
    mockMatchMedia(false);
    render(
      <ThemeProvider>
        <ThemeProbe />
      </ThemeProvider>,
    );
    expect(screen.getByText('theme: system')).toBeInTheDocument();
    expect(screen.getByText('resolved: light')).toBeInTheDocument();
  });

  it('setTheme("dark") updates resolvedTheme immediately and persists to localStorage', () => {
    mockMatchMedia(false);
    render(
      <ThemeProvider>
        <ThemeProbe />
      </ThemeProvider>,
    );
    fireEvent.click(screen.getByText('set dark'));
    expect(screen.getByText('theme: dark')).toBeInTheDocument();
    expect(screen.getByText('resolved: dark')).toBeInTheDocument();
    expect(localStorage.getItem('barkie-theme')).toBe('dark');
  });

  it('does not subscribe to matchMedia changes (and ignores the OS preference) while pinned to light', () => {
    localStorage.setItem('barkie-theme', 'light');
    // OS reports "dark", but since theme is pinned to 'light' this must be ignored entirely.
    const media = mockMatchMedia(true);
    render(
      <ThemeProvider>
        <ThemeProbe />
      </ThemeProvider>,
    );
    expect(screen.getByText('theme: light')).toBeInTheDocument();
    expect(screen.getByText('resolved: light')).toBeInTheDocument();
    expect(media.addEventListener).not.toHaveBeenCalled();
  });

  it('updates resolvedTheme on a matchMedia change event while theme is system', () => {
    const media = mockMatchMedia(false);
    render(
      <ThemeProvider>
        <ThemeProbe />
      </ThemeProvider>,
    );
    expect(screen.getByText('resolved: light')).toBeInTheDocument();

    const handleChange = media.addEventListener.mock.calls.find((call) => call[0] === 'change')?.[1];
    expect(handleChange).toBeDefined();

    media.matches = true;
    act(() => {
      handleChange();
    });
    expect(screen.getByText('resolved: dark')).toBeInTheDocument();
  });

  it('useTheme throws when used outside a ThemeProvider', () => {
    const ThrowingProbe = () => {
      useTheme();
      return null;
    };
    // Suppress React's expected console.error for the thrown-during-render case.
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => render(<ThrowingProbe />)).toThrow('useTheme must be used within a ThemeProvider');
    consoleSpy.mockRestore();
  });
});
