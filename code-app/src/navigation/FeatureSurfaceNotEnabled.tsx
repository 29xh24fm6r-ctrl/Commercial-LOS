import type { CSSProperties } from 'react';
import { palette, spacing, typography } from '../shared/theme';

interface FeatureSurfaceNotEnabledProps {
  /** Human label of the surface, e.g. "Platform metadata catalog". */
  label: string;
  /** The default-off route flag that gates this surface. */
  flagName: string;
}

/**
 * Honest "not yet enabled" state for a feature surface whose route flag is off.
 * Never blank, never a write affordance — just states the surface exists, is
 * read-only, and is gated by a default-off flag.
 */
export function FeatureSurfaceNotEnabled({ label, flagName }: FeatureSurfaceNotEnabledProps) {
  return (
    <section role="status" aria-label={`${label} not enabled`} style={styles.container}>
      <div style={styles.card}>
        <h1 style={styles.title}>{label} — not yet enabled</h1>
        <p style={styles.detail}>
          This read-only surface is wired into the app but gated by a default-off route
          flag. It performs no writes.
        </p>
        <p style={styles.hint}>
          Enable <code>{flagName}</code> to reveal the read-only preview.
        </p>
      </div>
    </section>
  );
}

const styles: Record<string, CSSProperties> = {
  container: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: '60vh',
    padding: spacing.xl,
    fontFamily: typography.family,
    background: palette.pageBg,
  },
  card: {
    maxWidth: 520,
    background: palette.surface,
    border: `1px solid ${palette.border}`,
    borderRadius: 8,
    padding: `${spacing.xl} ${spacing.xxl}`,
    display: 'flex',
    flexDirection: 'column',
    gap: spacing.sm,
    textAlign: 'left',
  },
  title: {
    margin: 0,
    color: palette.text,
    fontSize: typography.size.xl,
    fontWeight: typography.weight.semibold,
    letterSpacing: typography.letterSpacing.heading,
  },
  detail: {
    margin: 0,
    color: palette.text,
    fontSize: typography.size.base,
    lineHeight: typography.lineHeight.snug,
  },
  hint: {
    margin: 0,
    color: palette.textMuted,
    fontSize: typography.size.sm,
    lineHeight: typography.lineHeight.snug,
  },
};
