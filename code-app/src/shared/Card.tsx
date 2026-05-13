import type { CSSProperties, ReactNode } from 'react';
import { palette, radius, shadow, spacing, typography } from './theme';

interface CardProps {
  /** Optional 3px accent stripe across the top, e.g. severity color. */
  accentColor?: string;
  /** Optional inline style override (rare — prefer composition). */
  style?: CSSProperties;
  children: ReactNode;
}

export function Card({ accentColor, style, children }: CardProps) {
  return (
    <section
      style={{
        ...cardStyle,
        ...(accentColor ? { borderTop: `3px solid ${accentColor}` } : null),
        ...style,
      }}
    >
      {children}
    </section>
  );
}

interface CardHeaderProps {
  title: string;
  subtitle?: string;
  /** Right-aligned slot (badges, meta). */
  trailing?: ReactNode;
}

export function CardHeader({ title, subtitle, trailing }: CardHeaderProps) {
  return (
    <header style={cardHeaderStyle}>
      <div style={cardTitleBlockStyle}>
        <h3 style={cardTitleStyle}>{title}</h3>
        {subtitle && <p style={cardSubtitleStyle}>{subtitle}</p>}
      </div>
      {trailing && <div style={cardTrailingStyle}>{trailing}</div>}
    </header>
  );
}

interface CardFooterProps {
  children: ReactNode;
}

export function CardFooter({ children }: CardFooterProps) {
  return <footer style={cardFooterStyle}>{children}</footer>;
}

const cardStyle: CSSProperties = {
  background: palette.surface,
  border: `1px solid ${palette.border}`,
  borderRadius: radius.md,
  boxShadow: shadow.card,
  padding: `${spacing.lg} ${spacing.xl}`,
  marginBottom: spacing.lg,
  display: 'flex',
  flexDirection: 'column',
  gap: spacing.md,
};

const cardHeaderStyle: CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'flex-start',
  gap: spacing.md,
};

const cardTitleBlockStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 2,
  minWidth: 0,
};

const cardTitleStyle: CSSProperties = {
  margin: 0,
  fontSize: typography.size.lg,
  fontWeight: typography.weight.semibold,
  color: palette.text,
  letterSpacing: typography.letterSpacing.heading,
  lineHeight: typography.lineHeight.tight,
};

const cardSubtitleStyle: CSSProperties = {
  margin: 0,
  fontSize: typography.size.sm,
  color: palette.textMuted,
  lineHeight: typography.lineHeight.snug,
};

const cardTrailingStyle: CSSProperties = {
  display: 'flex',
  gap: spacing.xs,
  flexShrink: 0,
  alignItems: 'center',
};

const cardFooterStyle: CSSProperties = {
  borderTop: `1px solid ${palette.divider}`,
  paddingTop: spacing.sm,
  display: 'flex',
  flexDirection: 'column',
  gap: 2,
  fontSize: typography.size.xs,
  color: palette.textSubtle,
};
