import { palette, spacing, typography } from './theme';

interface ErrorStateProps {
  title: string;
  detail?: string;
  hint?: string;
}

export function ErrorState({ title, detail, hint }: ErrorStateProps) {
  return (
    <div role="alert" style={styles.container}>
      <div style={styles.card}>
        <h1 style={styles.title}>{title}</h1>
        {detail && <p style={styles.detail}>{detail}</p>}
        {hint && <p style={styles.hint}>{hint}</p>}
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: '100vh',
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
    color: palette.blocked,
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
