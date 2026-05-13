import { ExecutiveProvider } from '../executive/ExecutiveProvider';
import { ExecutiveDataProvider } from '../executive/ExecutiveDataProvider';
import { useExecutive } from '../executive/ExecutiveContext';
import { PortfolioSummary } from '../executive/PortfolioSummary';
import { AtRiskPortfolioSummary } from '../executive/AtRiskPortfolioSummary';
import { BankerProductionRollup } from '../executive/BankerProductionRollup';
import { PipelineByStage } from '../executive/PipelineByStage';
import { MonthlyClosingForecast } from '../executive/MonthlyClosingForecast';
import { palette, spacing, typography } from '../shared/theme';

export function ExecutiveWorkspace() {
  return (
    <ExecutiveProvider>
      <ExecutiveDataProvider>
        <ExecutiveWorkspaceContent />
      </ExecutiveDataProvider>
    </ExecutiveProvider>
  );
}

function ExecutiveWorkspaceContent() {
  const { fullName, upn } = useExecutive();
  return (
    <div style={styles.page}>
      <header style={styles.header}>
        <div style={styles.titleBlock}>
          <div style={styles.eyebrow}>Commercial Lending · Board-safe view</div>
          <h1 style={styles.title}>Executive Command Center</h1>
          <p style={styles.subtitle}>
            Governed portfolio snapshots, readiness, and production roll-up. Read-only;
            no operational drill-through.
          </p>
        </div>
        <div style={styles.context} aria-label="Executive context">
          <div style={styles.contextLabel}>Signed in</div>
          <div style={styles.contextValue}>{fullName}</div>
          <div style={styles.contextEmail}>{upn}</div>
        </div>
      </header>
      <main style={styles.main}>
        <PortfolioSummary />
        <AtRiskPortfolioSummary />
        <BankerProductionRollup />
        <div style={styles.twoCol}>
          <PipelineByStage />
          <MonthlyClosingForecast />
        </div>
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
    maxWidth: 640,
  },
  context: {
    textAlign: 'right',
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
  },
  contextLabel: {
    fontSize: typography.size.xs,
    letterSpacing: typography.letterSpacing.label,
    textTransform: 'uppercase',
    color: palette.textSubtle,
    fontWeight: typography.weight.semibold,
  },
  contextValue: {
    fontWeight: typography.weight.semibold,
    color: palette.text,
    fontSize: typography.size.base,
  },
  contextEmail: { color: palette.textMuted, fontSize: typography.size.sm },
  main: { padding: `${spacing.xl} ${spacing.xxl}` },
  twoCol: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
    gap: spacing.lg,
  },
};
