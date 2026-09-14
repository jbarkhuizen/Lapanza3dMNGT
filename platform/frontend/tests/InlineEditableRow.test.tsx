import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { InlineEditableRow } from '../src/components/InlineEditableRow.js';

function renderInTable(isEditing: boolean) {
  return render(
    <table>
      <tbody>
        <InlineEditableRow
          isEditing={isEditing}
          readOnlyContent={<td>Read-only content</td>}
          editContent={<td>Edit content</td>}
        />
      </tbody>
    </table>,
  );
}

describe('InlineEditableRow', () => {
  it('renders readOnlyContent and not editContent when isEditing is false', () => {
    renderInTable(false);
    expect(screen.getByText('Read-only content')).toBeInTheDocument();
    expect(screen.queryByText('Edit content')).not.toBeInTheDocument();
  });

  it('renders editContent and not readOnlyContent when isEditing is true', () => {
    renderInTable(true);
    expect(screen.getByText('Edit content')).toBeInTheDocument();
    expect(screen.queryByText('Read-only content')).not.toBeInTheDocument();
  });
});
