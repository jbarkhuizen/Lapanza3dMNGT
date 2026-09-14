import type { ReactNode } from 'react';

interface InlineEditableRowProps {
  isEditing: boolean;
  readOnlyContent: ReactNode;
  editContent: ReactNode;
}

export function InlineEditableRow({ isEditing, readOnlyContent, editContent }: InlineEditableRowProps) {
  if (isEditing) {
    return <tr className="bg-slate-50">{editContent}</tr>;
  }
  return <tr className="border-b border-slate-100">{readOnlyContent}</tr>;
}
