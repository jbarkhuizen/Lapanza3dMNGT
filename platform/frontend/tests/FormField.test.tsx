import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { FormField } from '../src/components/FormField.js';

describe('FormField', () => {
  it('renders a labeled input with the given value', () => {
    render(<FormField id="name" label="Name" value="Some value" onChange={() => {}} />);
    expect(screen.getByLabelText('Name')).toHaveValue('Some value');
  });

  it('defaults number inputs to step="any" so fractional values are accepted', () => {
    render(<FormField id="layerHeightMm" label="Layer height (mm)" type="number" value="" onChange={() => {}} />);
    expect(screen.getByLabelText('Layer height (mm)')).toHaveAttribute('step', 'any');
  });

  it('preserves an explicit step prop instead of overriding it', () => {
    render(<FormField id="quantity" label="Quantity" type="number" step="5" value="" onChange={() => {}} />);
    expect(screen.getByLabelText('Quantity')).toHaveAttribute('step', '5');
  });
});
