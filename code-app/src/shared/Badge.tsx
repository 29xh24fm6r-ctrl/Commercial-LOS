import type { CSSProperties, ReactNode } from 'react';
import { radius, severityPalette, typography, type SeverityKey } from './theme';

interface BadgeProps {
  /** Severity-based color palette. Defaults to neutral. */
  variant?: SeverityKey;
  /** Visual style: 'soft' (default — tinted bg) or 'outline' (subtle bordered). */
  appearance?: 'soft' | 'outline';
  /** Uppercase / letter-spaced. Defaults true for status-like text. */
  emphasize?: boolean;
  /** Optional tooltip text. Renders as the native `title` attribute
   *  on the span so longer context is available on hover and via
   *  screen readers without bloating the visible badge text. */
  title?: string;
  children: ReactNode;
}

export function Badge({
  variant = 'neutral',
  appearance = 'soft',
  emphasize = true,
  title,
  children,
}: BadgeProps) {
  const p = severityPalette[variant];
  const inline: CSSProperties =
    appearance === 'outline'
      ? {
          ...baseStyle,
          background: 'transparent',
          color: p.fg,
          border: `1px solid ${p.bg}`,
        }
      : {
          ...baseStyle,
          background: p.bg,
          color: p.fg,
        };
  if (emphasize) {
    inline.textTransform = 'uppercase';
    inline.letterSpacing = typography.letterSpacing.label;
    inline.fontSize = typography.size.xs;
  } else {
    inline.fontSize = typography.size.sm;
  }
  return (
    <span style={inline} title={title}>
      {children}
    </span>
  );
}

/** Small colored dot for severity lists (signal rows, timeline rows). */
export function StatusDot({ variant = 'neutral' }: { variant?: SeverityKey }) {
  const p = severityPalette[variant];
  return (
    <span
      aria-hidden="true"
      style={{
        display: 'inline-block',
        width: 10,
        height: 10,
        borderRadius: '50%',
        background: p.dot,
        flexShrink: 0,
      }}
    />
  );
}

const baseStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  padding: '0.15rem 0.55rem',
  borderRadius: radius.pill,
  fontWeight: typography.weight.semibold,
  whiteSpace: 'nowrap',
  lineHeight: 1,
};
