import { palette, spacing, typography } from './theme';

interface LoadingStateProps {
  message?: string;
}

export function LoadingState({ message = 'Loading…' }: LoadingStateProps) {
  return (
    <div role="status" aria-live="polite" style={styles.container}>
      <div style={styles.spinner} aria-hidden="true" />
      <span style={styles.message}>{message}</span>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
    minHeight: '100vh',
    color: palette.textMuted,
    background: palette.pageBg,
    fontFamily: typography.family,
  },
  spinner: {
    width: 28,
    height: 28,
    border: `3px solid ${palette.divider}`,
    borderTopColor: palette.primary,
    borderRadius: '50%',
    animation: 'spin 0.85s linear infinite',
  },
  message: {
    fontSize: typography.size.sm,
    letterSpacing: typography.letterSpacing.label,
    textTransform: 'uppercase',
    color: palette.textSubtle,
  },
};
