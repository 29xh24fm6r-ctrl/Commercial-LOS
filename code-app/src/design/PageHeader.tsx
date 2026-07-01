import type { ReactNode } from 'react';
import { palette, spacing, typography } from '../shared/theme';

export interface PageHeaderProps {
  /** Page title — rendered in the Fraunces display face. */
  title: string;
  /** One supporting line. */
  subtitle?: string;
  /** Optional trailing actions (keep to one primary). */
  actions?: ReactNode;
  /** Show the engraved Seal-Red security rule beneath the header. Default true. */
  rule?: boolean;
}

/**
 * Intaglio PageHeader — the consistent surface header: a confident display title,
 * one supporting line, an optional single primary action, and the engraved
 * security rule. One per surface; the identity is spent here.
 */
export function PageHeader({ title, subtitle, actions, rule = true }: PageHeaderProps) {
  return (
    <>
      <header
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: spacing.lg,
        }}
      >
        <div style={{ minWidth: 0 }}>
          <h1
            style={{
              margin: 0,
              fontFamily: typography.display,
              fontSize: typography.size.hero,
              fontWeight: typography.weight.semibold,
              letterSpacing: '-0.012em',
              color: palette.text,
              lineHeight: 1.1,
            }}
          >
            {title}
          </h1>
          {subtitle && (
            <p style={{ margin: `${spacing.xxs} 0 0`, color: palette.textMuted, fontSize: typography.size.md }}>
              {subtitle}
            </p>
          )}
        </div>
        {actions && <div style={{ flexShrink: 0, display: 'flex', gap: spacing.sm, alignItems: 'center' }}>{actions}</div>}
      </header>
      {rule && <hr className="cc-security-rule" style={{ marginTop: spacing.md }} />}
    </>
  );
}
