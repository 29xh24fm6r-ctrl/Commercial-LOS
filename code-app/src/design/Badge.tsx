import type { HTMLAttributes } from 'react';
import type { SeverityKey } from '../shared/theme';

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  /** Semantic tone — drives color from the shared severity palette. */
  tone?: SeverityKey;
  /** Show the leading status dot. */
  dot?: boolean;
}

/**
 * Intaglio Badge / StatusPill. Tone maps to the disciplined semantic palette
 * (blocked=Seal Red, atRisk=amber, clear=Ledger Green, neutral=warm slate,
 * info=Treasury Blue) so status color stays consistent everywhere.
 */
export function Badge({ tone = 'neutral', dot = false, className = '', children, ...rest }: BadgeProps) {
  const cls = ['ig-badge', `ig-badge--${tone}`, className].filter(Boolean).join(' ');
  return (
    <span className={cls} {...rest}>
      {dot && <span className="ig-dot" aria-hidden="true" />}
      {children}
    </span>
  );
}
