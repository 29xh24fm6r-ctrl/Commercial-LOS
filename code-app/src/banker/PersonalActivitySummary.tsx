import { useCallback, useEffect, useMemo, useState } from 'react';
import { useBanker } from './BankerContext';
import {
  loadBankerWorkQueueData,
  type BankerWorkQueueData,
} from './workQueueQueries';
import { deriveBankerPersonalActivity } from '../shared/analytics/bankerPersonalActivity';
import { Card, CardHeader } from '../shared/Card';
import { palette, radius, spacing, typography } from '../shared/theme';

/**
 * Phase 75: banker-side personal activity / workload snapshot.
 *
 * Surfaces deterministic, source-field-backed counts derived from the
 * banker's active deals + open tasks + outstanding documents + pending
 * review documents + memos. The same data already powers MyWorkQueue;
 * this card adds a higher-altitude snapshot view alongside it.
 *
 * Not a performance score, not a ranking, not predictive. Pure
 * derivation; the disclaimer is explicit at the foot of the card.
 *
 * Banker-only by construction: lives under BankerProvider and is
 * imported only from BankerWorkspace. Manager + team surfaces remain
 * untouched (the Phase 71 ManagerActivitySummary +
 * TeamBankerActivityBreakdown continue to live in their own
 * workspaces).
 */

type State =
  | { kind: 'loading' }
  | { kind: 'ready'; data: BankerWorkQueueData }
  | { kind: 'failed'; message: string };

export function PersonalActivitySummary() {
  const { bankerId } = useBanker();
  const [state, setState] = useState<State>({ kind: 'loading' });

  const reload = useCallback(() => {
    let cancelled = false;
    setState({ kind: 'loading' });
    loadBankerWorkQueueData(bankerId)
      .then((data) => {
        if (!cancelled) setState({ kind: 'ready', data });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : String(err);
        setState({ kind: 'failed', message });
      });
    return () => {
      cancelled = true;
    };
  }, [bankerId]);

  useEffect(() => {
    const cleanup = reload();
    return cleanup;
  }, [reload]);

  if (state.kind === 'loading') {
    return (
      <Card>
        <CardHeader
          title="My Activity Summary"
          subtitle="Loading workload snapshot…"
        />
        <p style={styles.muted}>Loading…</p>
      </Card>
    );
  }
  if (state.kind === 'failed') {
    return (
      <Card>
        <CardHeader
          title="My Activity Summary"
          subtitle="Could not load workload snapshot."
        />
        <ErrorBlock
          title="Could not load activity summary"
          detail={state.message}
        />
      </Card>
    );
  }

  return <Ready data={state.data} />;
}

function Ready({ data }: { data: BankerWorkQueueData }) {
  const now = useMemo(() => new Date(), []);
  const summary = useMemo(
    () => deriveBankerPersonalActivity(data, now),
    [data, now],
  );

  if (summary.activeDeals === 0) {
    return (
      <Card>
        <CardHeader
          title="My Activity Summary"
          subtitle="No active deals assigned to you."
        />
        <p style={styles.muted}>
          When deals are assigned to you, this snapshot will populate from
          current records.
        </p>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader
        title="My Activity Summary"
        subtitle="Workload snapshot — derived from current records."
      />
      <div style={styles.section}>
        <div style={styles.subHeading}>Pipeline shape</div>
        <div style={styles.grid}>
          <Stat
            label="Active deals"
            value={summary.activeDeals.toString()}
            numeric
          />
          <Stat
            label="Total pipeline"
            value={formatCurrency(summary.totalAmount)}
            numeric
          />
        </div>
        {summary.dealsMissingAmount > 0 && (
          <p style={styles.gapHint}>
            {summary.dealsMissingAmount} deal
            {summary.dealsMissingAmount === 1 ? '' : 's'} have no amount on
            the record. Total pipeline above is estimated from available
            fields.
          </p>
        )}

        <div style={styles.subHeading}>Attention</div>
        <div style={styles.grid}>
          <Stat
            label="Closing soon (≤14 days)"
            value={summary.closingSoonCount.toString()}
            emphasis={summary.closingSoonCount > 0 ? 'info' : undefined}
            numeric
          />
          <Stat
            label="Past target close"
            value={summary.pastTargetCloseCount.toString()}
            emphasis={summary.pastTargetCloseCount > 0 ? 'atRisk' : undefined}
            numeric
          />
          <Stat
            label="Stage attention (≥30 days)"
            value={summary.stageAtRiskCount.toString()}
            emphasis={summary.stageAtRiskCount > 0 ? 'atRisk' : undefined}
            numeric
          />
        </div>
        {summary.missingStageEntryDateCount > 0 && (
          <p style={styles.gapHint}>
            {summary.missingStageEntryDateCount} deal
            {summary.missingStageEntryDateCount === 1 ? '' : 's'} excluded
            from stage attention math — no stage-entry date on record.
          </p>
        )}

        <div style={styles.subHeading}>Work items</div>
        <div style={styles.grid}>
          <Stat
            label="Open tasks"
            value={summary.openTaskCount.toString()}
            numeric
          />
          <Stat
            label="Overdue tasks"
            value={summary.overdueTaskCount.toString()}
            emphasis={summary.overdueTaskCount > 0 ? 'atRisk' : undefined}
            numeric
          />
          <Stat
            label="Outstanding documents"
            value={summary.outstandingDocumentCount.toString()}
            numeric
          />
          <Stat
            label="Documents may require review"
            value={summary.pendingReviewDocumentCount.toString()}
            emphasis={
              summary.pendingReviewDocumentCount > 0 ? 'atRisk' : undefined
            }
            numeric
          />
        </div>

        {summary.draftMemoCount > 0 && (
          <>
            <div style={styles.subHeading}>Memos</div>
            <div style={styles.grid}>
              <Stat
                label="Draft credit memos"
                value={summary.draftMemoCount.toString()}
                numeric
              />
            </div>
          </>
        )}

        <p style={styles.disclaimer}>
          Derived from current records. This is a workload snapshot, not a
          performance evaluation. No ranking, no predictive claim, no
          compensation impact. Open the relevant deal to act.
        </p>
      </div>
    </Card>
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
  emphasis?: 'atRisk' | 'info';
}) {
  const valueColor =
    emphasis === 'atRisk'
      ? palette.atRiskFg
      : emphasis === 'info'
        ? palette.primary
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
  section: { display: 'flex', flexDirection: 'column', gap: spacing.md },
  subHeading: {
    fontSize: typography.size.xs,
    textTransform: 'uppercase',
    letterSpacing: typography.letterSpacing.label,
    color: palette.textSubtle,
    fontWeight: typography.weight.semibold,
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
    gap: spacing.sm,
  },
  stat: {
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
    padding: `${spacing.xs} ${spacing.sm}`,
    background: palette.surfaceAlt,
    border: `1px solid ${palette.divider}`,
    borderRadius: radius.sm,
  },
  statLabel: {
    fontSize: typography.size.xs,
    color: palette.textSubtle,
    textTransform: 'uppercase',
    letterSpacing: typography.letterSpacing.label,
    fontWeight: typography.weight.semibold,
  },
  statValue: {
    fontSize: typography.size.lg,
    fontWeight: typography.weight.semibold,
  },
  gapHint: {
    margin: 0,
    fontSize: typography.size.xs,
    color: palette.textMuted,
    fontStyle: 'italic',
    lineHeight: typography.lineHeight.snug,
  },
  disclaimer: {
    margin: 0,
    paddingTop: spacing.xs,
    fontSize: typography.size.xs,
    color: palette.textMuted,
    lineHeight: typography.lineHeight.snug,
    borderTop: `1px dashed ${palette.divider}`,
  },
  muted: {
    margin: 0,
    color: palette.textMuted,
    fontSize: typography.size.sm,
    fontStyle: 'italic',
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
