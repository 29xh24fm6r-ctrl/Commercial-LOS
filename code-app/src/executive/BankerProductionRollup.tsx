import { useMemo } from 'react';
import { useExecutiveData, type AsyncResult } from './ExecutiveDataProvider';
import type { PerformanceMetricRow } from './snapshotQueries';
import { Card, CardHeader, CardFooter } from '../shared/Card';
import { execStyles, formatDate } from './execCardChrome';
import { palette, radius, spacing, typography } from '../shared/theme';

interface BankerRow {
  bankerKey: string;
  bankerName: string;
  metricsCount: number;
  /** Most recent period end across this banker's metrics. */
  latestPeriodEnd: string | undefined;
  /** Sum of value across this banker's metrics (only meaningful if
   *  the metric set is currency-like; metricType isn't constrained
   *  in the schema). Surface alongside the count to be transparent. */
  totalValue: number;
}

const UNASSIGNED_KEY = '__unassigned__';

export function BankerProductionRollup() {
  const { snapshotPerformance } = useExecutiveData();
  return (
    <Card>
      <CardHeader
        title="Banker Production Rollup"
        subtitle="Banker-keyed performance metrics from the production snapshot."
      />
      <Body snapshotPerformance={snapshotPerformance} />
    </Card>
  );
}

function Body({
  snapshotPerformance,
}: {
  snapshotPerformance: AsyncResult<PerformanceMetricRow[]>;
}) {
  const rows = useMemo<BankerRow[]>(() => {
    if (snapshotPerformance.kind !== 'ready') return [];
    return groupByBanker(snapshotPerformance.data);
  }, [snapshotPerformance]);

  if (snapshotPerformance.kind === 'loading')
    return <p style={execStyles.muted}>Loading banker production…</p>;
  if (snapshotPerformance.kind === 'failed')
    return (
      <ErrorBlock
        title="Could not load banker production"
        detail={snapshotPerformance.message}
      />
    );
  if (rows.length === 0) {
    return (
      <p style={execStyles.muted}>
        No production metrics have been published yet.
      </p>
    );
  }

  return (
    <>
      <div style={styles.tableWrap}>
        <table style={styles.table}>
          <thead>
            <tr>
              <th className="cc-th">Banker</th>
              <th className="cc-th" style={{ textAlign: 'right' }}>Metrics</th>
              <th className="cc-th" style={{ textAlign: 'right' }}>Total value</th>
              <th className="cc-th">Latest period end</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.bankerKey}>
                <td className="cc-td">{r.bankerName}</td>
                <td className="cc-td cc-td-num">{r.metricsCount}</td>
                <td className="cc-td cc-td-num">{r.totalValue.toLocaleString()}</td>
                <td className="cc-td" style={{ color: palette.textMuted }}>
                  {formatDate(r.latestPeriodEnd) ?? '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <CardFooter>
        <span>Sourced from cr664_PerformanceMetric.</span>
        <span>
          Total value is a raw sum across each banker's metric records. Metric type
          is not constrained in the schema; mixing types may produce a non-meaningful
          total. Future phase: filter by metric type / period.
        </span>
      </CardFooter>
    </>
  );
}

function groupByBanker(rows: PerformanceMetricRow[]): BankerRow[] {
  const map = new Map<string, BankerRow>();
  for (const r of rows) {
    const key = r.bankerId ?? UNASSIGNED_KEY;
    const existing = map.get(key);
    if (existing) {
      existing.metricsCount++;
      existing.totalValue += r.value;
      if (!existing.latestPeriodEnd || r.periodEnd > existing.latestPeriodEnd) {
        existing.latestPeriodEnd = r.periodEnd;
      }
    } else {
      map.set(key, {
        bankerKey: key,
        bankerName: r.bankerName ?? '(no banker assigned)',
        metricsCount: 1,
        latestPeriodEnd: r.periodEnd,
        totalValue: r.value,
      });
    }
  }
  return [...map.values()].sort((a, b) => b.metricsCount - a.metricsCount);
}

function ErrorBlock({ title, detail }: { title: string; detail: string }) {
  return (
    <div style={execStyles.errorBox} role="alert">
      <div style={execStyles.errorTitle}>{title}</div>
      <div style={execStyles.errorDetail}>{detail}</div>
      <div style={execStyles.errorHint}>Refresh to retry.</div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  tableWrap: {
    border: `1px solid ${palette.border}`,
    borderRadius: radius.sm,
    overflow: 'auto',
    background: palette.surface,
  },
  table: { width: '100%', borderCollapse: 'collapse' },
};

// suppress noise about unused imports until the type-checker sees them
void spacing;
void typography;
