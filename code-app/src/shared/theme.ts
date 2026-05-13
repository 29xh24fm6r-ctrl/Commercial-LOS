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
 */

export const palette = {
  // Surfaces
  pageBg: '#f1f3f7',
  surface: '#ffffff',
  surfaceAlt: '#f7f8fb',
  surfaceSubtle: '#fbfcfd',

  // Borders / dividers
  border: '#dde1e8',
  borderStrong: '#c6cdd9',
  divider: '#eaecf2',

  // Text
  text: '#1a1f2e',
  textMuted: '#5b6478',
  textSubtle: '#828c9e',
  textInverse: '#ffffff',
  link: '#1f4ea6',

  // Brand / primary (navy — commercial banking)
  primary: '#1f4ea6',
  primaryDim: '#3e6fbf',
  primaryBg: '#e8eef9',
  primaryFg: '#143780',

  // Status — blocked (red, true blockers only)
  blocked: '#b22c3a',
  blockedBg: '#fcebed',
  blockedFg: '#7e1f29',

  // Status — at-risk (amber)
  atRisk: '#a8680c',
  atRiskBg: '#fdf2db',
  atRiskFg: '#6b3f00',

  // Status — clear (green)
  clear: '#1b7a3c',
  clearBg: '#e3f3e8',
  clearFg: '#10532a',

  // Neutral status (draft / pending / system)
  neutral: '#5a6478',
  neutralBg: '#eef0f4',
  neutralFg: '#404655',

  // Info / banker outreach
  info: '#2c5fb8',
  infoBg: '#e6edf8',
  infoFg: '#1c3f7e',
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
