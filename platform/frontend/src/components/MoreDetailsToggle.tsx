import { useState, Children, type ReactNode } from 'react';

interface MoreDetailsToggleProps {
  children: ReactNode;
}

export function MoreDetailsToggle({ children }: MoreDetailsToggleProps) {
  const [expanded, setExpanded] = useState(false);
  if (Children.count(children) === 0) {
    return null;
  }
  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        onClick={() => setExpanded((prev) => !prev)}
        className="w-fit text-sm text-slate-600 underline"
      >
        {expanded ? '− Hide details' : '+ More details'}
      </button>
      {expanded && <div className="flex flex-col gap-3">{children}</div>}
    </div>
  );
}
