import { forwardRef, type SelectHTMLAttributes } from 'react';

export interface SelectOption {
  value: string;
  label: string;
}

export interface SelectProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'children'> {
  options: ReadonlyArray<SelectOption>;
  /** Leading empty option text (the "nothing selected" choice). Omit to require a pick. */
  placeholder?: string;
}

/**
 * Intaglio Select — a native `<select>` skinned to the tokens (accessible by
 * default: keyboard, screen-reader, native option list). Use for validated,
 * on-list choices like party Type.
 */
export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { options, placeholder, className = '', ...rest },
  ref,
) {
  return (
    <span className="ig-select-wrap">
      <select ref={ref} className={['ig-select', className].filter(Boolean).join(' ')} {...rest}>
        {placeholder !== undefined && <option value="">{placeholder}</option>}
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <svg className="ig-select-caret" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
        <path d="m6 9 6 6 6-6" />
      </svg>
    </span>
  );
});
