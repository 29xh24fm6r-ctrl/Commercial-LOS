import { forwardRef, type HTMLAttributes } from 'react';

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  /** Add default padding (1.25rem). */
  pad?: boolean;
  /** Lift on hover (for clickable cards). */
  interactive?: boolean;
}

/** Intaglio surface card — warm surface, warm 1px border, paper elevation. */
export const Card = forwardRef<HTMLDivElement, CardProps>(function Card(
  { pad = false, interactive = false, className = '', ...rest },
  ref,
) {
  const cls = [
    'ig-card',
    pad ? 'ig-card--pad' : '',
    interactive ? 'ig-card--hover' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');
  return <div ref={ref} className={cls} {...rest} />;
});
