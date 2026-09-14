import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MoreDetailsToggle } from '../src/components/MoreDetailsToggle.js';

describe('MoreDetailsToggle', () => {
  it('renders nothing when given no children (null)', () => {
    const { container } = render(<MoreDetailsToggle>{null}</MoreDetailsToggle>);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing when given no children (empty array)', () => {
    const { container } = render(<MoreDetailsToggle>{[]}</MoreDetailsToggle>);
    expect(container).toBeEmptyDOMElement();
  });

  it('starts collapsed with children not in the document', () => {
    render(
      <MoreDetailsToggle>
        <p>Secret detail</p>
      </MoreDetailsToggle>,
    );
    expect(screen.getByRole('button', { name: '+ More details' })).toBeInTheDocument();
    expect(screen.queryByText('Secret detail')).not.toBeInTheDocument();
  });

  it('reveals children and flips the label when clicked', () => {
    render(
      <MoreDetailsToggle>
        <p>Secret detail</p>
      </MoreDetailsToggle>,
    );
    fireEvent.click(screen.getByRole('button', { name: '+ More details' }));
    expect(screen.getByText('Secret detail')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '− Hide details' })).toBeInTheDocument();
  });

  it('re-collapses when clicked again', () => {
    render(
      <MoreDetailsToggle>
        <p>Secret detail</p>
      </MoreDetailsToggle>,
    );
    const toggle = () => screen.getByRole('button', { name: /details/i });
    fireEvent.click(toggle());
    expect(screen.getByText('Secret detail')).toBeInTheDocument();
    fireEvent.click(toggle());
    expect(screen.queryByText('Secret detail')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '+ More details' })).toBeInTheDocument();
  });
});
