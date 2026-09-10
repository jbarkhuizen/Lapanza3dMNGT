import type { InputHTMLAttributes } from 'react';

interface NumberFieldProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'type'> {
  label: string;
  value: number | string;
  onChange: (raw: string) => void;
  /**
   * When provided, renders a "x" button that explicitly clears the field.
   * Only pass this in edit mode: clicking it is meant to send an explicit
   * `null` to the PATCH endpoint (distinct from leaving the field blank,
   * which just omits the key and leaves the stored value untouched -- the
   * bug this component exists to fix). There's nothing meaningful to send
   * `null` for on a record that doesn't exist yet, so omit `onClear`
   * entirely on create forms.
   */
  onClear?: () => void;
  error?: string;
}

export function NumberField({ id, label, value, onChange, onClear, error, className, ...inputProps }: NumberFieldProps) {
  const canClear = onClear !== undefined && value !== '' && value !== undefined;

  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-sm font-medium text-slate-700">
        {label}
      </label>
      <div className="flex items-center gap-2">
        <input
          id={id}
          type="number"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          {...inputProps}
          {...(inputProps.step === undefined ? { step: 'any' } : {})}
          className={`flex-1 rounded border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none ${className ?? ''}`}
        />
        {canClear && (
          <button
            type="button"
            onClick={onClear}
            aria-label={`Clear ${label}`}
            title={`Clear ${label}`}
            className="rounded border border-slate-300 px-2 py-2 text-sm leading-none text-slate-500 hover:bg-slate-100"
          >
            {'\u00d7'}
          </button>
        )}
      </div>
      {error && <span className="text-sm text-red-600">{error}</span>}
    </div>
  );
}