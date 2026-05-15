import { useMemo } from 'react';
import { useTeamData, type AsyncResult } from './TeamDataProvider';
import type { TeamDealRow } from './teamQueries';
import {
  derivePerBankerActivity,
  type PerBankerActivity,
} from '../shared/analytics/derivedAnalytics';
import { Card, CardHeader } from '../shared/Card';
import { Badge } from '../shared/Badge';
import { teamStyles, formatCurrency } from './teamCardChrome';
import { palette, radius, spacing, typography } from '../shared/theme';

/**
 * Phase 71: team-side per-banker activity breakdown.
 *
 * Surfaces a deterministic per-banker view derived from the team's
 * active deal pipeline:
 *   - total active deals
 *   - total pipeline volume (with honest count of deals missing
 *     an amount on the record)
 *   - average days in current stage
 *   - count of deals at or past the 30-day stage-aging threshold
 *   - count of deals closing within 14 days
 *
 * The manager workspace already has the parallel
 * `BankerWorkloadSummary` card (Phase 33). Phase 71 brings the
 * same data into the team workspace, which previously lacked any
 * per-banker analytics surface — team members could see shared
 * pipeline aggregates but not who carried what share. The
 * breakdown is read-only; it is not a performance evaluation and
 * does not assert rankings.
 */

export function TeamBankerActivityBreakdown() {
  const { deals } = useTeamData();
  return (
    <Card>
      <CardHeader
        title="Per-Banker Activity"
        subtitle="Workload across the team — derived from current records."
      />
      <Body deals={deals} />
    </Card>
  );
}

function Body({ deals }: { deals: AsyncResult<TeamDealRow[]> }) {
  const now = useMemo(() => new Date(), []);
  const rows = useMemo<PerBankerActivity[]>(() => {
    if (deals.kind !== 'ready') return [];
    return derivePerBankerActivity(deals.data, now);
  }, [deals, now]);

  if (deals.kind === 'loading')
    return <p style={teamStyles.muted}>Loading per-banker activity…</p>;
  if (deals.kind === 'failed')
    return (
      <ErrorBlock
        title="Could not load per-banker activity"
        detail={deals.message}
      />
    );
  if (rows.length === 0) {
    return (
      <p style={teamStyles.muted}>
        No deals with an assigned banker on the team yet. Workload breakdown
        will populate when team deals have banker assignments on the record.
      </p>
    );
  }

  return (
    <div style={styles.section}>
      <div style={styles.tableWrap}>
        <table style={styles.table}>
          <thead>
            <tr>
              <th className="cc-th">Banker</th>
              <th className="cc-th" style={{ textAlign: 'right' }}>
                Deals
              </th>
              <th className="cc-th" style={{ textAlign: 'right' }}>
                Pipeline $
              </th>
              <th className="cc-th" style={{ textAlign: 'right' }}>
                Avg days in stage
              </th>
              <th className="cc-th" style={{ textAlign: 'right' }}>
                May require review
              </th>
              <th className="cc-th" style={{ textAlign: 'right' }}>
                Closing soon
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <BankerRow key={r.bankerId} row={r} />
            ))}
          </tbody>
        </table>
      </div>
      <p style={styles.disclaimer}>
        Derived from current records. This is a workload summary, not a
        performance evaluation. No ranking, no predictive claim, no
        compensation impact.
      </p>
    </div>
  );
}

function BankerRow({ row }: { row: PerBankerActivity }) {
  return (
    <tr>
      <td className="cc-td">
        <span style={styles.bankerName}>{row.bankerName}</span>
      </td>
      <td className="cc-td" style={styles.numCell}>
        {row.totalDeals}
      </td>
      <td className="cc-td" style={styles.numCell}>
        {formatCurrency(row.totalAmount)}
        {row.dealsMissingAmount > 0 && (
          <span style={styles.gapInline}>
            {' '}
            ({row.dealsMissingAmount} missing $)
          </span>
        )}
      </td>
      <td className="cc-td" style={styles.numCell}>
        {row.averageDaysInStage}
      </td>
      <td className="cc-td" style={styles.numCell}>
        {row.stageAtRiskCount > 0 ? (
          <Badge variant="atRisk" appearance="outline">
            {row.stageAtRiskCount}
          </Badge>
        ) : (
          row.stageAtRiskCount
        )}
      </td>
      <td className="cc-td" style={styles.numCell}>
        {row.closingSoonCount}
      </td>
    </tr>
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

const styles: Record<string, React.CSSProperties> = {
  section: { display: 'flex', flexDirection: 'column', gap: spacing.sm },
  tableWrap: { overflowX: 'auto' },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
    fontSize: typography.size.sm,
  },
  bankerName: { color: palette.text, fontWeight: typography.weight.medium },
  numCell: {
    textAlign: 'right',
    fontVariantNumeric: 'tabular-nums',
    color: palette.text,
  },
  gapInline: {
    fontSize: typography.size.xs,
    color: palette.textMuted,
    fontStyle: 'italic',
  },
  disclaimer: {
    margin: 0,
    paddingTop: spacing.xs,
    fontSize: typography.size.xs,
    color: palette.textMuted,
    lineHeight: typography.lineHeight.snug,
    borderTop: `1px dashed ${palette.divider}`,
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
  errorTitle: {
    color: palette.blockedFg,
    fontWeight: typography.weight.semibold,
    fontSize: typography.size.md,
  },
  errorDetail: { color: palette.text, fontSize: typography.size.sm },
  errorHint: {
    color: palette.textMuted,
    fontSize: typography.size.xs,
    fontStyle: 'italic',
  },
};
