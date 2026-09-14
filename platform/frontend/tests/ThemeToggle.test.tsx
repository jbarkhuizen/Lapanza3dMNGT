import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ThemeProvider } from '../src/theme/ThemeContext.js';
import { ThemeToggle } from '../src/theme/ThemeToggle.js';

beforeEach(() => {
  localStorage.clear();
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  })) as unknown as typeof window.matchMedia;
});

describe('ThemeToggle', () => {
  it('initially renders "System"', () => {
    render(
      <ThemeProvider>
        <ThemeToggle />
      </ThemeProvider>,
    );
    expect(screen.getByRole('button', { name: /Theme: System/ })).toHaveTextContent('System');
  });

  it('cycles System -> Light -> Dark -> System on repeated clicks', () => {
    render(
      <ThemeProvider>
        <ThemeToggle />
      </ThemeProvider>,
    );
    const button = screen.getByRole('button');
    expect(button).toHaveTextContent('System');

    fireEvent.click(button);
    expect(button).toHaveTextContent('Light');

    fireEvent.click(button);
    expect(button).toHaveTextContent('Dark');

    fireEvent.click(button);
    expect(button).toHaveTextContent('System');
  });
});
