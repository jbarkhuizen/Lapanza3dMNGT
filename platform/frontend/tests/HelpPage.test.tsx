import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { HelpPage } from '../src/pages/help/HelpPage.js';

function renderPage() {
  return render(
    <MemoryRouter>
      <HelpPage />
    </MemoryRouter>,
  );
}

describe('HelpPage', () => {
  it('renders the User Guide, How-To, and FAQ sections', () => {
    renderPage();
    expect(screen.getByRole('heading', { name: 'Help Center' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'User Guide' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'How-To Articles' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'FAQ' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Getting started' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'How to price your first print accurately' })).toBeInTheDocument();
  });

  it('expands a FAQ item when clicked and collapses when clicked again', () => {
    renderPage();
    const question = screen.getByRole('button', { name: /How much does Barkie cost/ });
    expect(screen.queryByText(/Three tiers, all with a 14-day free trial/)).not.toBeInTheDocument();

    fireEvent.click(question);
    expect(screen.getByText(/Three tiers, all with a 14-day free trial/)).toBeInTheDocument();

    fireEvent.click(question);
    expect(screen.queryByText(/Three tiers, all with a 14-day free trial/)).not.toBeInTheDocument();
  });

  it('only one FAQ item is open at a time', () => {
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: /How much does Barkie cost/ }));
    expect(screen.getByText(/Three tiers, all with a 14-day free trial/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Can I cancel anytime/ }));
    expect(screen.queryByText(/Three tiers, all with a 14-day free trial/)).not.toBeInTheDocument();
    expect(screen.getByText(/No lock-in contract/)).toBeInTheDocument();
  });
});
