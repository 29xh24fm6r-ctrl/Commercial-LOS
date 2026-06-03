import type { CSSProperties } from 'react';
import { palette, spacing, typography } from '../shared/theme';

export function CopilotNotConfiguredState() {
  return (
    <div style={containerStyle} role="status">
      <div style={iconStyle} aria-hidden="true">
        {'//'}
      </div>
      <p style={titleStyle}>Copilot not configured</p>
      <p style={detailStyle}>
        The Microsoft Copilot connector has not been registered for this
        environment. Local summaries are available from data already loaded on
        your screen.
      </p>
      <p style={hintStyle}>
        Contact your administrator to enable the Copilot connector.
      </p>
    </div>
  );
}

const containerStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: spacing.sm,
  padding: `${spacing.xl} ${spacing.lg}`,
  textAlign: 'center',
};

const iconStyle: CSSProperties = {
  fontSize: typography.size.xl,
  fontWeight: typography.weight.bold,
  color: palette.textSubtle,
  fontFamily: 'monospace',
};

const titleStyle: CSSProperties = {
  margin: 0,
  fontSize: typography.size.md,
  fontWeight: typography.weight.semibold,
  color: palette.text,
};

const detailStyle: CSSProperties = {
  margin: 0,
  fontSize: typography.size.sm,
  color: palette.textMuted,
  lineHeight: typography.lineHeight.snug,
  maxWidth: 360,
};

const hintStyle: CSSProperties = {
  margin: 0,
  fontSize: typography.size.xs,
  color: palette.textSubtle,
  lineHeight: typography.lineHeight.snug,
};
