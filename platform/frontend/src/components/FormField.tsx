import type { InputHTMLAttributes } from 'react';

interface FormFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string;
}

export function FormField({ label, error, id, ...inputProps }: FormFieldProps) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-sm font-medium text-slate-700">
        {label}
      </label>
      <input
        id={id}
        {...inputProps}
        className="rounded border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
      />
      {error && <span className="text-sm text-red-600">{error}</span>}
    </div>
  );
}
