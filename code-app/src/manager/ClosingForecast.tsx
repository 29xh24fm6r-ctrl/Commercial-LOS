import { useMemo } from 'react';
import { useManagerData, type AsyncResult } from './ManagerDataProvider';
import type { TeamDeal } from './managerQueries';
import { Card, CardHeader } from '../shared/Card';
import { Badge } from '../shared/Badge';
import { palette, radius, spacing, typography } from '../shared/theme';

interface MonthBucket {
  key: string;
  label: string;
  count: number;
  totalAmount: number;
  past: boolean;
}

const NO_DATE_KEY = '__no_date__';
const PAST_KEY = '__past__';

export function ClosingForecast() {
  const { teamPipeline } = useManagerData();
  return (
    <Card>
      <CardHeader
        title="Closing Forecast"
        subtitle="Forecast windows derived from each deal's target close date."
      />
      <Body teamPipeline={teamPipeline} />
    </Card>
  );
}

function Body({ teamPipeline }: { teamPipeline: AsyncResult<TeamDeal[]> }) {
  const buckets = useMemo<MonthBucket[]>(() => {
    if (teamPipeline.kind !== 'ready') return [];
    return bucketByMonth(teamPipeline.data);
  }, [teamPipeline]);

  if (teamPipeline.kind === 'loading') return <p style={styles.muted}>Loading…</p>;
  if (teamPipeline.kind === 'failed')
    return <ErrorBlock title="Could not load closing forecast" detail={teamPipeline.message} />;

  if (buckets.length === 0)
    return <p style={styles.muted}>No active deals on the team yet.</p>;

  return (
    <ul style={styles.list}>
      {buckets.map((b) => (
        <li key={b.key} style={styles.row}>
          <div style={styles.rowHeader}>
            <span style={b.past ? styles.labelPast : styles.label}>{b.label}</span>
            <div style={styles.rowMeta}>
              {b.past && b.count > 0 ? (
                <Badge variant="atRisk">{b.count}</Badge>
              ) : (
                <Badge variant="neutral">{b.count}</Badge>
              )}
              <span style={styles.amount}>{formatCurrency(b.totalAmount)}</span>
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}

function bucketByMonth(deals: TeamDeal[], now: Date = new Date()): MonthBucket[] {
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
  const buckets = new Map<string, MonthBucket>();

  for (const d of deals) {
    let key: string;
    let label: string;
    let past = false;

    if (!d.targetCloseDate) {
      key = NO_DATE_KEY;
      label = 'No target close date';
    } else {
      const dt = new Date(d.targetCloseDate);
      if (Number.isNaN(dt.getTime())) {
        key = NO_DATE_KEY;
        label = 'No target close date';
      } else if (dt.getTime() < monthStart) {
        key = PAST_KEY;
        label = 'Past target close';
        past = true;
      } else {
        const y = dt.getFullYear();
        const m = dt.getMonth();
        key = `${y}-${String(m + 1).padStart(2, '0')}`;
        label = dt.toLocaleDateString(undefined, { year: 'numeric', month: 'long' });
      }
    }

    const existing = buckets.get(key);
    if (existing) {
      existing.count++;
      existing.totalAmount += d.amount ?? 0;
    } else {
      buckets.set(key, { key, label, count: 1, totalAmount: d.amount ?? 0, past });
    }
  }

  return [...buckets.values()].sort((a, b) => {
    if (a.key === PAST_KEY) return -1;
    if (b.key === PAST_KEY) return 1;
    if (a.key === NO_DATE_KEY) return 1;
    if (b.key === NO_DATE_KEY) return -1;
    return a.key.localeCompare(b.key);
  });
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
  list: { listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: spacing.xs },
  row: {
    padding: `${spacing.sm} ${spacing.md}`,
    background: palette.surfaceAlt,
    border: `1px solid ${palette.divider}`,
    borderRadius: radius.sm,
  },
  rowHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacing.sm,
  },
  label: { fontSize: typography.size.base, fontWeight: typography.weight.medium, color: palette.text },
  labelPast: {
    fontSize: typography.size.base,
    fontWeight: typography.weight.medium,
    color: palette.atRiskFg,
  },
  rowMeta: { display: 'flex', gap: spacing.xs, alignItems: 'center' },
  amount: {
    fontSize: typography.size.sm,
    color: palette.textMuted,
    fontVariantNumeric: 'tabular-nums',
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
