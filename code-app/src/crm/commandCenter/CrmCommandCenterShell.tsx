import type { CSSProperties } from 'react';
import { palette, spacing, typography } from '../../shared/theme';
import { CrmCommandCenter } from './CrmCommandCenter';

/**
 * Phase 146I — CRM Command Center shell.
 * Thin wrapper for route mounting. No permission widening.
 * If route mounting cannot be done safely, this remains unmounted.
 */
export function CrmCommandCenterShell() {
  return (
    <div style={shellStyle}>
      <header style={headerStyle}>
        <h2 style={titleStyle}>CRM Command Center</h2>
        <p style={subtitleStyle}>
          Salesforce and nCino intelligence — read-only, preview-only, dry-run only
        </p>
      </header>
      <CrmCommandCenter />
    </div>
  );
}

const shellStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: spacing.lg,
  padding: spacing.xl,
  background: palette.pageBg,
  minHeight: '100vh',
};

const headerStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: spacing.xs,
};

const titleStyle: CSSProperties = {
  margin: 0,
  fontSize: typography.size.xl,
  fontWeight: typography.weight.bold,
  color: palette.text,
  letterSpacing: typography.letterSpacing.heading,
};

const subtitleStyle: CSSProperties = {
  margin: 0,
  fontSize: typography.size.sm,
  color: palette.textSubtle,
};
