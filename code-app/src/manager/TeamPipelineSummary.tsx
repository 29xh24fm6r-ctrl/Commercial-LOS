import { useMemo } from 'react';
import { useManagerData, type AsyncResult } from './ManagerDataProvider';
import type { TeamDeal } from './managerQueries';
import { summarizeTeamPipeline, type TeamSignalCounts } from './teamSignals';
import { Card, CardHeader } from '../shared/Card';
import { palette, radius, spacing, typography } from '../shared/theme';

export function TeamPipelineSummary() {
  const { teamPipeline } = useManagerData();
  return (
    <Card>
      <CardHeader title="Team Pipeline Summary" />
      <Body teamPipeline={teamPipeline} />
    </Card>
  );
}

function Body({ teamPipeline }: { teamPipeline: AsyncResult<TeamDeal[]> }) {
  const counts = useMemo<TeamSignalCounts | null>(() => {
    if (teamPipeline.kind !== 'ready') return null;
    return summarizeTeamPipeline(teamPipeline.data);
  }, [teamPipeline]);

  if (teamPipeline.kind === 'loading') return <p style={styles.muted}>Loading team pipeline…</p>;
  if (teamPipeline.kind === 'failed') return <ErrorBlock title="Could not load team pipeline" detail={teamPipeline.message} />;
  if (!counts) return null;

  if (counts.total === 0) {
    return <p style={styles.muted}>No active deals on the team yet.</p>;
  }

  return (
    <div style={styles.grid}>
      <Stat label="Active deals" value={counts.total.toString()} />
      <Stat label="Total amount" value={formatCurrency(counts.totalAmount)} numeric />
      <Stat label="Closing this month" value={counts.closingThisMonth.toString()} numeric />
      <Stat
        label="Past target close"
        value={counts.pastTargetClose.toString()}
        emphasis={counts.pastTargetClose > 0 ? 'atRisk' : undefined}
        numeric
      />
      <Stat
        label="At risk"
        value={counts.atRisk.toString()}
        emphasis={counts.atRisk > 0 ? 'atRisk' : undefined}
        numeric
      />
      <Stat
        label="Blocked"
        value={counts.blocked.toString()}
        emphasis={counts.blocked > 0 ? 'blocked' : undefined}
        numeric
      />
    </div>
  );
}

function Stat({
  label,
  value,
  numeric,
  emphasis,
}: {
  label: string;
  value: string;
  numeric?: boolean;
  emphasis?: 'atRisk' | 'blocked';
}) {
  const valueColor =
    emphasis === 'blocked'
      ? palette.blockedFg
      : emphasis === 'atRisk'
        ? palette.atRiskFg
        : palette.text;
  return (
    <div style={styles.stat}>
      <div style={styles.statLabel}>{label}</div>
      <div
        style={{
          ...styles.statValue,
          color: valueColor,
          fontVariantNumeric: numeric ? 'tabular-nums' : undefined,
        }}
      >
        {value}
      </div>
    </div>
  );
}

function ErrorBlock({ title, detail }: { title: string; detail: string }) {
  return (
    <div style={styles.errorBox} role="alert">
      <div style={styles.errorTitle}>{title}</div>
      <div style={styles.errorDetail}>{detail}</div>
      <div style={styles.errorHint}>Refresh to retry.</div>
    </div>
  );
}

function formatCurrency(amount: number): string {
  return amount.toLocaleString(undefined, {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  });
}

const styles: Record<string, React.CSSProperties> = {
  muted: {
    margin: 0,
    color: palette.textMuted,
    fontSize: typography.size.md,
    fontStyle: 'italic',
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
    gap: spacing.md,
  },
  stat: {
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
    padding: `${spacing.sm} ${spacing.md}`,
    background: palette.surfaceAlt,
    border: `1px solid ${palette.divider}`,
    borderRadius: radius.sm,
  },
  statLabel: {
    fontSize: typography.size.xs,
    textTransform: 'uppercase',
    letterSpacing: typography.letterSpacing.label,
    color: palette.textSubtle,
    fontWeight: typography.weight.semibold,
  },
  statValue: {
    fontSize: typography.size.xxl,
    fontWeight: typography.weight.semibold,
    letterSpacing: typography.letterSpacing.heading,
    lineHeight: typography.lineHeight.tight,
  },
  errorBox: {
    background: palette.blockedBg,
    border: `1px solid ${palette.blockedBg}`,
    borderRadius: radius.sm,
    padding: `${spacing.xs} ${spacing.md}`,
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
  },
  errorTitle: { color: palette.blockedFg, fontWeight: typography.weight.semibold, fontSize: typography.size.md },
  errorDetail: { color: palette.text, fontSize: typography.size.sm },
  errorHint: { color: palette.textMuted, fontSize: typography.size.xs, fontStyle: 'italic' },
};
