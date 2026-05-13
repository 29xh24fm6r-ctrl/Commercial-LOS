import type { CSSProperties } from 'react';
import { palette, radius, spacing, typography } from '../shared/theme';

/**
 * Shared inline styles for the executive cards. Pulled out to keep each
 * card file focused on data and presentation rather than redeclaring
 * the same chrome objects. All styles use theme.ts tokens.
 */
export const execStyles: Record<string, CSSProperties> = {
  muted: {
    margin: 0,
    color: palette.textMuted,
    fontSize: typography.size.md,
    fontStyle: 'italic',
  },
  asOfLine: {
    margin: 0,
    fontSize: typography.size.xs,
    letterSpacing: typography.letterSpacing.label,
    textTransform: 'uppercase',
    color: palette.textSubtle,
    fontWeight: typography.weight.semibold,
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
    gap: spacing.md,
  },
  stat: {
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
    padding: `${spacing.sm} ${spacing.md}`,
    background: palette.surfaceAlt,
    border: `1px solid ${palette.divider}`,
    borderRadius: radius.sm,
  },
  statLabel: {
    fontSize: typography.size.xs,
    textTransform: 'uppercase',
    letterSpacing: typography.letterSpacing.label,
    color: palette.textSubtle,
    fontWeight: typography.weight.semibold,
  },
  statValue: {
    fontSize: typography.size.xxl,
    fontWeight: typography.weight.semibold,
    color: palette.text,
    fontVariantNumeric: 'tabular-nums',
    letterSpacing: typography.letterSpacing.heading,
    lineHeight: typography.lineHeight.tight,
  },
  list: {
    listStyle: 'none',
    margin: 0,
    padding: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: spacing.xs,
  },
  row: {
    padding: `${spacing.sm} ${spacing.md}`,
    background: palette.surfaceAlt,
    border: `1px solid ${palette.divider}`,
    borderRadius: radius.sm,
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacing.sm,
  },
  rowLabel: {
    fontSize: typography.size.base,
    fontWeight: typography.weight.medium,
    color: palette.text,
  },
  rowMeta: {
    display: 'flex',
    gap: spacing.xs,
    alignItems: 'center',
  },
  amount: {
    fontSize: typography.size.sm,
    color: palette.textMuted,
    fontVariantNumeric: 'tabular-nums',
  },
  fallbackNote: {
    margin: 0,
    fontSize: typography.size.xs,
    color: palette.atRiskFg,
    background: palette.atRiskBg,
    border: `1px solid ${palette.atRiskBg}`,
    padding: `${spacing.xxs} ${spacing.sm}`,
    borderRadius: radius.sm,
    lineHeight: typography.lineHeight.snug,
  },
  errorBox: {
    background: palette.blockedBg,
    border: `1px solid ${palette.blockedBg}`,
    borderRadius: radius.sm,
    padding: `${spacing.xs} ${spacing.md}`,
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
  },
  errorTitle: {
    color: palette.blockedFg,
    fontWeight: typography.weight.semibold,
    fontSize: typography.size.md,
  },
  errorDetail: { color: palette.text, fontSize: typography.size.sm },
  errorHint: {
    color: palette.textMuted,
    fontSize: typography.size.xs,
    fontStyle: 'italic',
  },
};

export function formatCurrency(amount: number): string {
  return amount.toLocaleString(undefined, {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  });
}

export function formatDate(iso: string | undefined): string | undefined {
  if (!iso) return undefined;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return undefined;
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}
