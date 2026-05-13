import { useMemo } from 'react';
import { useTeamData, type AsyncResult } from './TeamDataProvider';
import {
  daysInStage,
  STAGE_AGING_AT_RISK_DAYS,
  type TeamDealRow,
} from './teamQueries';
import { Card, CardHeader, CardFooter } from '../shared/Card';
import { Badge } from '../shared/Badge';
import { teamStyles, formatCurrency } from './teamCardChrome';
import { palette, radius, typography } from '../shared/theme';

interface StageStats {
  stage: string;
  count: number;
  totalAmount: number;
  /** Average days in stage across deals where stageEntryDate is set. */
  avgDaysInStage: number | undefined;
  /** Deals over the aging threshold (currently STAGE_AGING_AT_RISK_DAYS). */
  staleCount: number;
}

const UNKNOWN_STAGE = '(no stage)';

export function BottlenecksAgingByStage() {
  const { deals } = useTeamData();
  return (
    <Card>
      <CardHeader
        title="Bottlenecks / Aging by Stage"
        subtitle={`Stale = deal in stage more than ${STAGE_AGING_AT_RISK_DAYS} days.`}
      />
      <Body deals={deals} />
    </Card>
  );
}

function Body({ deals }: { deals: AsyncResult<TeamDealRow[]> }) {
  const stats = useMemo<StageStats[]>(() => {
    if (deals.kind !== 'ready') return [];
    return computeStageStats(deals.data);
  }, [deals]);

  if (deals.kind === 'loading') return <p style={teamStyles.muted}>Loading bottlenecks…</p>;
  if (deals.kind === 'failed')
    return <ErrorBlock title="Could not load bottlenecks" detail={deals.message} />;
  if (stats.length === 0)
    return <p style={teamStyles.muted}>No active deals on the team yet.</p>;

  const maxAvg = Math.max(...stats.map((s) => s.avgDaysInStage ?? 0));

  return (
    <>
      <ul style={teamStyles.list}>
        {stats.map((s) => (
          <li key={s.stage} style={teamStyles.row}>
            <div style={styles.headerRow}>
              <span style={styles.stage}>{s.stage}</span>
              <div style={styles.metaRow}>
                <Badge variant="neutral">{s.count}</Badge>
                {s.staleCount > 0 && <Badge variant="atRisk">{s.staleCount} stale</Badge>}
                <span style={styles.amount}>{formatCurrency(s.totalAmount)}</span>
              </div>
            </div>
            <div style={styles.statRow}>
              <span style={styles.statLabel}>Avg in stage</span>
              <span style={styles.statValue}>
                {s.avgDaysInStage != null ? `${s.avgDaysInStage} day${s.avgDaysInStage === 1 ? '' : 's'}` : '—'}
              </span>
              <div style={styles.barTrack}>
                <div
                  style={{
                    ...styles.barFill,
                    width: maxAvg > 0 && s.avgDaysInStage != null
                      ? `${(s.avgDaysInStage / maxAvg) * 100}%`
                      : 0,
                    background:
                      s.avgDaysInStage != null && s.avgDaysInStage > STAGE_AGING_AT_RISK_DAYS
                        ? palette.atRisk
                        : palette.primary,
                  }}
                />
              </div>
            </div>
          </li>
        ))}
      </ul>
      <CardFooter>
        <span>Stages sorted slowest first. Bar gauges average days in stage.</span>
      </CardFooter>
    </>
  );
}

function computeStageStats(deals: TeamDealRow[], now: Date = new Date()): StageStats[] {
  const map = new Map<string, { count: number; totalAmount: number; daysSum: number; daysN: number; stale: number }>();
  for (const d of deals) {
    const stage = d.stage ?? UNKNOWN_STAGE;
    const slot = map.get(stage) ?? { count: 0, totalAmount: 0, daysSum: 0, daysN: 0, stale: 0 };
    slot.count++;
    slot.totalAmount += d.amount ?? 0;
    const days = daysInStage(d, now);
    if (days != null) {
      slot.daysSum += days;
      slot.daysN++;
      if (days > STAGE_AGING_AT_RISK_DAYS) slot.stale++;
    }
    map.set(stage, slot);
  }

  const out: StageStats[] = [...map.entries()].map(([stage, v]) => ({
    stage,
    count: v.count,
    totalAmount: v.totalAmount,
    avgDaysInStage: v.daysN > 0 ? Math.round(v.daysSum / v.daysN) : undefined,
    staleCount: v.stale,
  }));

  out.sort((a, b) => {
    const aAvg = a.avgDaysInStage ?? -1;
    const bAvg = b.avgDaysInStage ?? -1;
    return bAvg - aAvg;
  });
  return out;
}

function ErrorBlock({ title, detail }: { title: string; detail: string }) {
  return (
    <div style={teamStyles.errorBox} role="alert">
      <div style={teamStyles.errorTitle}>{title}</div>
      <div style={teamStyles.errorDetail}>{detail}</div>
      <div style={teamStyles.errorHint}>Refresh to retry.</div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  headerRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: 6 },
  stage: { fontSize: typography.size.base, fontWeight: typography.weight.semibold, color: palette.text },
  metaRow: { display: 'flex', alignItems: 'center', gap: 8 },
  amount: { fontSize: typography.size.sm, color: palette.textMuted, fontVariantNumeric: 'tabular-nums' },
  statRow: { display: 'flex', alignItems: 'center', gap: 12 },
  statLabel: {
    fontSize: typography.size.xs,
    textTransform: 'uppercase',
    letterSpacing: typography.letterSpacing.label,
    color: palette.textSubtle,
    fontWeight: typography.weight.semibold,
    whiteSpace: 'nowrap',
  },
  statValue: {
    fontSize: typography.size.sm,
    color: palette.text,
    fontVariantNumeric: 'tabular-nums',
    whiteSpace: 'nowrap',
  },
  barTrack: { flex: 1, height: 6, background: palette.divider, borderRadius: radius.pill, overflow: 'hidden' },
  barFill: { height: '100%', transition: 'width 200ms ease' },
};
