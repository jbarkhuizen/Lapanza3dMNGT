import type { InputHTMLAttributes } from 'react';

interface FormFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string;
}

export function FormField({ label, error, id, className, ...inputProps }: FormFieldProps) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-sm font-medium text-slate-700">
        {label}
      </label>
      <input
        id={id}
        {...inputProps}
        {...(inputProps.type === 'number' && inputProps.step === undefined ? { step: 'any' } : {})}
        className={`rounded border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none ${className ?? ''}`}
      />
      {error && <span className="text-sm text-red-600">{error}</span>}
    </div>
  );
}
