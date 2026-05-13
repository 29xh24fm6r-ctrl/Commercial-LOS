import { useMemo } from 'react';
import { useManagerData, type AsyncResult } from './ManagerDataProvider';
import type { TeamDeal } from './managerQueries';
import { Card, CardHeader } from '../shared/Card';
import { Badge } from '../shared/Badge';
import { palette, radius, spacing, typography } from '../shared/theme';

const UNKNOWN_STAGE = '(no stage)';

interface StageGroup {
  stage: string;
  count: number;
  totalAmount: number;
}

export function DealsByStage() {
  const { teamPipeline } = useManagerData();
  return (
    <Card>
      <CardHeader title="Deals by Stage" />
      <Body teamPipeline={teamPipeline} />
    </Card>
  );
}

function Body({ teamPipeline }: { teamPipeline: AsyncResult<TeamDeal[]> }) {
  const groups = useMemo<StageGroup[]>(() => {
    if (teamPipeline.kind !== 'ready') return [];
    return groupByStage(teamPipeline.data);
  }, [teamPipeline]);

  if (teamPipeline.kind === 'loading') return <p style={styles.muted}>Loading…</p>;
  if (teamPipeline.kind === 'failed') return <ErrorBlock title="Could not load stage breakdown" detail={teamPipeline.message} />;
  if (groups.length === 0) return <p style={styles.muted}>No active deals on the team yet.</p>;

  const maxCount = Math.max(...groups.map((g) => g.count));

  return (
    <ul style={styles.list}>
      {groups.map((g) => (
        <li key={g.stage} style={styles.row}>
          <div style={styles.rowHeader}>
            <span style={styles.stage}>{g.stage}</span>
            <div style={styles.rowMeta}>
              <Badge variant="neutral">{g.count}</Badge>
              <span style={styles.amount}>{formatCurrency(g.totalAmount)}</span>
            </div>
          </div>
          <div style={styles.barTrack}>
            <div
              style={{
                ...styles.barFill,
                width: `${maxCount > 0 ? (g.count / maxCount) * 100 : 0}%`,
              }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}

function groupByStage(deals: TeamDeal[]): StageGroup[] {
  const map = new Map<string, StageGroup>();
  for (const d of deals) {
    const key = d.stage ?? UNKNOWN_STAGE;
    const existing = map.get(key);
    if (existing) {
      existing.count++;
      existing.totalAmount += d.amount ?? 0;
    } else {
      map.set(key, { stage: key, count: 1, totalAmount: d.amount ?? 0 });
    }
  }
  return [...map.values()].sort((a, b) => b.count - a.count);
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
  muted: { margin: 0, color: palette.textMuted, fontSize: typography.size.md, fontStyle: 'italic' },
  list: {
    listStyle: 'none',
    margin: 0,
    padding: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: spacing.sm,
  },
  row: { display: 'flex', flexDirection: 'column', gap: spacing.xxs },
  rowHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: spacing.sm },
  stage: { fontSize: typography.size.base, fontWeight: typography.weight.medium, color: palette.text },
  rowMeta: { display: 'flex', gap: spacing.xs, alignItems: 'center' },
  amount: {
    fontSize: typography.size.sm,
    color: palette.textMuted,
    fontVariantNumeric: 'tabular-nums',
  },
  barTrack: {
    height: 6,
    background: palette.divider,
    borderRadius: radius.pill,
    overflow: 'hidden',
  },
  barFill: {
    height: '100%',
    background: palette.primary,
    transition: 'width 200ms ease',
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
