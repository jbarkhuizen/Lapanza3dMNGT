import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { TextareaField } from '../src/components/TextareaField.js';

describe('TextareaField', () => {
  it('renders a labeled textarea with the given value', () => {
    render(<TextareaField id="notes" label="Notes" value="Some notes" onChange={() => {}} />);
    expect(screen.getByLabelText('Notes')).toHaveValue('Some notes');
  });

  it('calls onChange with the new text when edited', () => {
    const onChange = vi.fn();
    render(<TextareaField id="notes" label="Notes" value="" onChange={onChange} />);
    fireEvent.change(screen.getByLabelText('Notes'), { target: { value: 'New text' } });
    expect(onChange).toHaveBeenCalledWith('New text');
  });
});
