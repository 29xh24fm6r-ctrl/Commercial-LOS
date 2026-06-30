import { forwardRef, type InputHTMLAttributes } from 'react';

export type InputProps = InputHTMLAttributes<HTMLInputElement>;

/** Intaglio text input — warm surface, Treasury-Blue focus. */
export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { className = '', ...rest },
  ref,
) {
  return <input ref={ref} className={['ig-input', className].filter(Boolean).join(' ')} {...rest} />;
});

export interface SearchFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  /** Accessible label (rendered visually hidden if no visible label exists). */
  label?: string;
}

function SearchGlyph() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <circle cx="11" cy="11" r="7" />
      <path d="m21 21-4.3-4.3" />
    </svg>
  );
}

/** Search input with a leading magnifier glyph. */
export const SearchField = forwardRef<HTMLInputElement, SearchFieldProps>(function SearchField(
  { className = '', label = 'Search', type = 'search', placeholder = 'Search…', ...rest },
  ref,
) {
  return (
    <span className={['ig-search', className].filter(Boolean).join(' ')}>
      <SearchGlyph />
      <input ref={ref} className="ig-input" type={type} placeholder={placeholder} aria-label={label} {...rest} />
    </span>
  );
});
