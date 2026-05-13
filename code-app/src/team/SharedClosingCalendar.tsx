import { useMemo } from 'react';
import { useTeamData, type AsyncResult } from './TeamDataProvider';
import type { TeamDealRow } from './teamQueries';
import { Card, CardHeader } from '../shared/Card';
import { Badge } from '../shared/Badge';
import { teamStyles, formatCurrency } from './teamCardChrome';
import { palette, typography } from '../shared/theme';

interface MonthBucket {
  key: string;
  label: string;
  count: number;
  totalAmount: number;
  past: boolean;
}

const NO_DATE_KEY = '__no_date__';
const PAST_KEY = '__past__';

export function SharedClosingCalendar() {
  const { deals } = useTeamData();
  return (
    <Card>
      <CardHeader
        title="Shared Closing Calendar"
        subtitle="Active deals bucketed by target close month."
      />
      <Body deals={deals} />
    </Card>
  );
}

function Body({ deals }: { deals: AsyncResult<TeamDealRow[]> }) {
  const buckets = useMemo<MonthBucket[]>(() => {
    if (deals.kind !== 'ready') return [];
    return bucketByMonth(deals.data);
  }, [deals]);

  if (deals.kind === 'loading') return <p style={teamStyles.muted}>Loading closing calendar…</p>;
  if (deals.kind === 'failed')
    return (
      <div style={teamStyles.errorBox} role="alert">
        <div style={teamStyles.errorTitle}>Could not load closing calendar</div>
        <div style={teamStyles.errorDetail}>{deals.message}</div>
        <div style={teamStyles.errorHint}>Refresh to retry.</div>
      </div>
    );
  if (buckets.length === 0)
    return <p style={teamStyles.muted}>No active deals on the team yet.</p>;

  return (
    <ul style={teamStyles.list}>
      {buckets.map((b) => (
        <li key={b.key} style={teamStyles.row}>
          <div style={styles.headerRow}>
            <span style={b.past ? styles.labelPast : styles.label}>{b.label}</span>
            <div style={styles.metaRow}>
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

function bucketByMonth(deals: TeamDealRow[], now: Date = new Date()): MonthBucket[] {
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

const styles: Record<string, React.CSSProperties> = {
  headerRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  label: { fontSize: typography.size.base, fontWeight: typography.weight.medium, color: palette.text },
  labelPast: { fontSize: typography.size.base, fontWeight: typography.weight.medium, color: palette.atRiskFg },
  metaRow: { display: 'flex', gap: 8, alignItems: 'center' },
  amount: { fontSize: typography.size.sm, color: palette.textMuted, fontVariantNumeric: 'tabular-nums' },
};
