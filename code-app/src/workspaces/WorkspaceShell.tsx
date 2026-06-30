import { PageHeader } from '../design';
import { palette, spacing, typography } from '../shared/theme';

interface WorkspaceShellProps {
  title: string;
  subtitle: string;
  children?: React.ReactNode;
}

/** Generic workspace shell — Intaglio header + tokenized surface. */
export function WorkspaceShell({ title, subtitle, children }: WorkspaceShellProps) {
  return (
    <div style={styles.page}>
      <div style={styles.headerWrap}>
        <PageHeader title={title} subtitle={subtitle} />
      </div>
      <main style={styles.main}>
        {children ?? <p style={styles.placeholder}>This workspace is not configured yet.</p>}
      </main>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    fontFamily: typography.family,
    minHeight: '100vh',
    color: palette.text,
    background: palette.pageBg,
  },
  headerWrap: {
    padding: `${spacing.xl} ${spacing.xxl} 0`,
  },
  main: { padding: spacing.xxl },
  placeholder: { color: palette.textMuted },
};
