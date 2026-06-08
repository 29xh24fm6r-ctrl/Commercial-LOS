import type { CSSProperties } from 'react';
import { palette, spacing, typography, radius } from '../shared/theme';
import type { BoardingSurfaceMode } from './portfolioBoardingAccess';

interface Props {
  mode: BoardingSurfaceMode;
  message: string;
}

/**
 * Phase 140M — honest status banner for the boarding surface. It reflects the
 * resolved access mode (not_configured / read_only / live) so the operator
 * always knows whether writes are possible. No fake data.
 */
export function PortfolioLoanBoardingStatusBanner({ mode, message }: Props) {
  const tone =
    mode === 'live'
      ? { fg: palette.clearFg, bg: palette.clearBg }
      : mode === 'read_only'
        ? { fg: palette.atRiskFg, bg: palette.atRiskBg }
        : { fg: palette.blockedFg, bg: palette.blockedBg };
  return (
    <div
      role="status"
      aria-label="Portfolio boarding status"
      style={{ ...bannerStyle, color: tone.fg, background: tone.bg }}
    >
      <span style={labelStyle}>{labelFor(mode)}</span>
      <span style={messageStyle}>{message}</span>
    </div>
  );
}

function labelFor(mode: BoardingSurfaceMode): string {
  switch (mode) {
    case 'live':
      return 'Live';
    case 'read_only':
      return 'Read-only';
    case 'not_configured':
      return 'Not configured';
    case 'unauthorized':
      return 'Unavailable';
  }
}

const bannerStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: spacing.md,
  padding: `${spacing.sm} ${spacing.md}`,
  borderRadius: radius.md,
  fontSize: typography.size.sm,
};
const labelStyle: CSSProperties = {
  fontSize: typography.size.xs,
  fontWeight: typography.weight.semibold,
  textTransform: 'uppercase',
  letterSpacing: typography.letterSpacing.label,
};
const messageStyle: CSSProperties = { fontSize: typography.size.sm };
