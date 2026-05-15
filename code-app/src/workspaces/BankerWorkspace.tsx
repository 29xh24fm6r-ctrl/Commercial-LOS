import { BankerProvider } from '../banker/BankerProvider';
import { useBanker } from '../banker/BankerContext';
import { PersonalPipeline } from '../banker/PersonalPipeline';
import { PersonalActivitySummary } from '../banker/PersonalActivitySummary';
import { RelationshipMemory } from '../banker/RelationshipMemory';
import { MyWorkQueue } from '../banker/MyWorkQueue';
import { palette, spacing, typography } from '../shared/theme';

export function BankerWorkspace() {
  return (
    <BankerProvider>
      <BankerWorkspaceContent />
    </BankerProvider>
  );
}

function BankerWorkspaceContent() {
  const { fullName, email } = useBanker();
  return (
    <div style={styles.page}>
      <header style={styles.header}>
        <div style={styles.titleBlock}>
          <div style={styles.eyebrow}>Commercial Lending</div>
          <h1 style={styles.title}>Banker Command Center</h1>
          <p style={styles.subtitle}>
            Personal pipeline, active deals, and quick-action surface.
          </p>
        </div>
        <div style={styles.who} aria-label="Signed in banker">
          <div style={styles.whoLabel}>Signed in as</div>
          <div style={styles.whoName}>{fullName}</div>
          <div style={styles.whoEmail}>{email}</div>
        </div>
      </header>
      <main style={styles.main}>
        <PersonalActivitySummary />
        <MyWorkQueue />
        <RelationshipMemory />
        <PersonalPipeline />
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
  header: {
    padding: `${spacing.xl} ${spacing.xxl}`,
    background: palette.surface,
    borderBottom: `1px solid ${palette.border}`,
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: spacing.lg,
    flexWrap: 'wrap',
  },
  titleBlock: {
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
    minWidth: 0,
  },
  eyebrow: {
    fontSize: typography.size.xs,
    letterSpacing: typography.letterSpacing.label,
    textTransform: 'uppercase',
    color: palette.primary,
    fontWeight: typography.weight.semibold,
  },
  title: {
    margin: 0,
    fontSize: typography.size.xxl,
    fontWeight: typography.weight.semibold,
    color: palette.text,
    letterSpacing: typography.letterSpacing.hero,
    lineHeight: typography.lineHeight.tight,
  },
  subtitle: {
    margin: 0,
    color: palette.textMuted,
    fontSize: typography.size.md,
    lineHeight: typography.lineHeight.snug,
  },
  who: {
    textAlign: 'right',
    display: 'flex',
    flexDirection: 'column',
    gap: 1,
  },
  whoLabel: {
    fontSize: typography.size.xs,
    letterSpacing: typography.letterSpacing.label,
    textTransform: 'uppercase',
    color: palette.textSubtle,
  },
  whoName: {
    fontWeight: typography.weight.semibold,
    color: palette.text,
    fontSize: typography.size.base,
  },
  whoEmail: {
    color: palette.textMuted,
    fontSize: typography.size.sm,
  },
  main: {
    padding: `${spacing.xl} ${spacing.xxl}`,
  },
};
