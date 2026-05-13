import { TeamProvider } from '../team/TeamProvider';
import { TeamDataProvider } from '../team/TeamDataProvider';
import { useTeam } from '../team/TeamContext';
import { TeamPipelineSummary } from '../team/TeamPipelineSummary';
import { SharedActiveDeals } from '../team/SharedActiveDeals';
import { BottlenecksAgingByStage } from '../team/BottlenecksAgingByStage';
import { TeamDocumentNeeds } from '../team/TeamDocumentNeeds';
import { TeamTaskLoad } from '../team/TeamTaskLoad';
import { SharedClosingCalendar } from '../team/SharedClosingCalendar';
import { palette, spacing, typography } from '../shared/theme';

export function TeamWorkspace() {
  return (
    <TeamProvider>
      <TeamDataProvider>
        <TeamWorkspaceContent />
      </TeamDataProvider>
    </TeamProvider>
  );
}

function TeamWorkspaceContent() {
  const { fullName, email, teamName } = useTeam();
  return (
    <div style={styles.page}>
      <header style={styles.header}>
        <div style={styles.titleBlock}>
          <div style={styles.eyebrow}>Commercial Lending</div>
          <h1 style={styles.title}>Team Command Center</h1>
          <p style={styles.subtitle}>
            Shared pipeline, bottlenecks, document needs, and task load across the team.
          </p>
        </div>
        <div style={styles.context} aria-label="Team context">
          <div style={styles.contextRow}>
            <div style={styles.contextLabel}>Team</div>
            <div style={styles.contextValue}>{teamName}</div>
          </div>
          <div style={styles.contextRow}>
            <div style={styles.contextLabel}>Signed in</div>
            <div style={styles.contextValue}>{fullName}</div>
          </div>
          <div style={styles.contextEmail}>{email}</div>
        </div>
      </header>
      <main style={styles.main}>
        <TeamPipelineSummary />
        <div style={styles.twoCol}>
          <BottlenecksAgingByStage />
          <SharedClosingCalendar />
        </div>
        <div style={styles.twoCol}>
          <TeamDocumentNeeds />
          <TeamTaskLoad />
        </div>
        <SharedActiveDeals />
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
  titleBlock: { display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 },
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
  context: {
    textAlign: 'right',
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
  },
  contextRow: { display: 'flex', flexDirection: 'column', gap: 1 },
  contextLabel: {
    fontSize: typography.size.xs,
    letterSpacing: typography.letterSpacing.label,
    textTransform: 'uppercase',
    color: palette.textSubtle,
    fontWeight: typography.weight.semibold,
  },
  contextValue: { fontWeight: typography.weight.semibold, color: palette.text, fontSize: typography.size.base },
  contextEmail: { color: palette.textMuted, fontSize: typography.size.sm },
  main: { padding: `${spacing.xl} ${spacing.xxl}` },
  twoCol: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))',
    gap: spacing.lg,
  },
};
