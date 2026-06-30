import type { HTMLAttributes } from 'react';

/** Keyboard key cap (e.g. ⌘K). */
export function Kbd({ className = '', children, ...rest }: HTMLAttributes<HTMLElement>) {
  return (
    <kbd className={['ig-kbd', className].filter(Boolean).join(' ')} {...rest}>
      {children}
    </kbd>
  );
}
