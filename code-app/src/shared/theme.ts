/**
 * Design tokens for the Code App rebuild.
 *
 * Visual target (per memory:vibe-visual-target): professional commercial
 * banking command center — dense, navy/charcoal palette, modest shadows,
 * borders for structure, not airy SaaS aesthetic. Token names are
 * domain-agnostic so future role workspaces (team/manager/exec/admin)
 * can adopt them without re-skinning.
 *
 * Color discipline carried over from the rule-engine phases:
 *   blocked  -> red, reserved for true blocking conditions only
 *   atRisk   -> amber, overdue / stalled / missing
 *   clear    -> green, complete / positive
 *   neutral  -> gray, draft / pending / background
 *   info     -> blue, banker actions / communication
 *   primary  -> navy, brand / chrome accent
 *
 * Phase 79: palette values are CSS-variable references (var(--cc-*))
 * rather than hex literals. The variables themselves live in
 * src/index.css with light + dark declarations, so existing inline
 * styles (style={{ color: palette.text }}) follow the active theme
 * automatically without any consumer change. The variable identifiers
 * are also pinned by themeTokens.test.ts so future renames stay
 * coordinated.
 */

export const palette = {
  // Surfaces
  pageBg: 'var(--cc-page-bg)',
  surface: 'var(--cc-surface)',
  surfaceAlt: 'var(--cc-surface-alt)',
  surfaceSubtle: 'var(--cc-surface-subtle)',

  // Borders / dividers
  border: 'var(--cc-border)',
  borderStrong: 'var(--cc-border-strong)',
  divider: 'var(--cc-divider)',

  // Text
  text: 'var(--cc-text)',
  textMuted: 'var(--cc-text-muted)',
  textSubtle: 'var(--cc-text-subtle)',
  textInverse: 'var(--cc-text-inverse)',
  link: 'var(--cc-link)',

  // Brand / primary (navy — commercial banking)
  primary: 'var(--cc-primary)',
  primaryDim: 'var(--cc-primary-dim)',
  primaryBg: 'var(--cc-primary-bg)',
  primaryFg: 'var(--cc-primary-fg)',

  // Status — blocked (red, true blockers only)
  blocked: 'var(--cc-blocked)',
  blockedBg: 'var(--cc-blocked-bg)',
  blockedFg: 'var(--cc-blocked-fg)',

  // Status — at-risk (amber)
  atRisk: 'var(--cc-at-risk)',
  atRiskBg: 'var(--cc-at-risk-bg)',
  atRiskFg: 'var(--cc-at-risk-fg)',

  // Status — clear (green)
  clear: 'var(--cc-clear)',
  clearBg: 'var(--cc-clear-bg)',
  clearFg: 'var(--cc-clear-fg)',

  // Neutral status (draft / pending / system)
  neutral: 'var(--cc-neutral)',
  neutralBg: 'var(--cc-neutral-bg)',
  neutralFg: 'var(--cc-neutral-fg)',

  // Info / banker outreach
  info: 'var(--cc-info)',
  infoBg: 'var(--cc-info-bg)',
  infoFg: 'var(--cc-info-fg)',
} as const;

export const spacing = {
  /** 4px */
  xxs: '0.25rem',
  /** 8px */
  xs: '0.5rem',
  /** 12px */
  sm: '0.75rem',
  /** 16px */
  md: '1rem',
  /** 20px */
  lg: '1.25rem',
  /** 24px */
  xl: '1.5rem',
  /** 32px */
  xxl: '2rem',
  /** 48px */
  xxxl: '3rem',
} as const;

export const radius = {
  sm: 4,
  md: 6,
  lg: 10,
  pill: 999,
} as const;

export const typography = {
  family:
    '-apple-system, BlinkMacSystemFont, "Segoe UI", "Inter", system-ui, sans-serif',
  mono:
    'ui-monospace, SFMono-Regular, "SF Mono", Consolas, "Liberation Mono", monospace',
  size: {
    xs: '0.72rem',
    sm: '0.82rem',
    md: '0.9rem',
    base: '0.95rem',
    lg: '1.05rem',
    xl: '1.25rem',
    xxl: '1.55rem',
    hero: '1.85rem',
  },
  weight: {
    regular: 400,
    medium: 500,
    semibold: 600,
    bold: 700,
  },
  letterSpacing: {
    label: '0.06em',
    heading: '-0.005em',
    hero: '-0.012em',
  },
  lineHeight: {
    tight: 1.2,
    snug: 1.35,
    normal: 1.5,
  },
} as const;

export const shadow = {
  card: '0 1px 2px rgba(20, 26, 42, 0.04), 0 1px 1px rgba(20, 26, 42, 0.03)',
  rise: '0 4px 12px rgba(20, 26, 42, 0.08)',
} as const;

/**
 * Shared semantic palettes for blocker/severity, used by Badge, Card
 * accent, and per-row dots so the discipline is enforced in one place.
 */
export type SeverityKey = 'blocked' | 'atRisk' | 'clear' | 'neutral' | 'info';

export const severityPalette: Record<
  SeverityKey,
  { fg: string; bg: string; bar: string; dot: string }
> = {
  blocked: {
    fg: palette.blockedFg,
    bg: palette.blockedBg,
    bar: palette.blocked,
    dot: palette.blocked,
  },
  atRisk: {
    fg: palette.atRiskFg,
    bg: palette.atRiskBg,
    bar: palette.atRisk,
    dot: palette.atRisk,
  },
  clear: {
    fg: palette.clearFg,
    bg: palette.clearBg,
    bar: palette.clear,
    dot: palette.clear,
  },
  neutral: {
    fg: palette.neutralFg,
    bg: palette.neutralBg,
    bar: palette.neutral,
    dot: palette.neutral,
  },
  info: {
    fg: palette.infoFg,
    bg: palette.infoBg,
    bar: palette.info,
    dot: palette.info,
  },
};
