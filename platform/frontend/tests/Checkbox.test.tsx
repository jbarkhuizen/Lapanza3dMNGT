import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Checkbox } from '../src/components/Checkbox.js';

describe('Checkbox', () => {
  it('renders a labeled checkbox reflecting the checked prop', () => {
    render(<Checkbox id="vat" label="VAT registered" checked={true} onChange={() => {}} />);
    const input = screen.getByLabelText('VAT registered') as HTMLInputElement;
    expect(input.type).toBe('checkbox');
    expect(input.checked).toBe(true);
  });

  it('calls onChange with the new checked value when toggled', () => {
    const onChange = vi.fn();
    render(<Checkbox id="vat" label="VAT registered" checked={false} onChange={onChange} />);
    fireEvent.click(screen.getByLabelText('VAT registered'));
    expect(onChange).toHaveBeenCalledWith(true);
  });
});
