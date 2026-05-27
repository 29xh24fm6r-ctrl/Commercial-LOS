import { useMemo } from 'react';
import { useDealData } from './DealDataProvider';
import { deriveDealCockpitMetrics } from './dealCockpitMetrics';
import { Card, CardHeader, CardFooter } from '../shared/Card';
import { WorkstreamBar } from '../shared/cockpitPrimitives';
import { palette, spacing, typography } from '../shared/theme';

/**
 * Phase 125D — Deal Workstream Panel.
 *
 * Four horizontal mini progress bars summarizing the four
 * workstreams the deal must complete on its way to funding:
 *
 *   Tasks         — open vs. completed (overdue badged)
 *   Documents     — outstanding vs. received+reviewed (denominator)
 *   Credit memo   — state ("none" / "draft" / "borrower-safe" /
 *                   "final" / "stale") — bar width = state index
 *                   in the canonical progression
 *   Communication — total communication events; bar = honest event
 *                   count vs. a small reference scale (every event
 *                   logged on the deal). Communication is the
 *                   "are we actively engaging the borrower" signal,
 *                   not an outcome claim.
 *
 * The panel is read-only. It never writes, never sends, never
 * advances stage. Bars are derived from
 * `deriveDealCockpitMetrics`; the same numbers the metric deck
 * uses, so the cockpit reads as one consistent instrument panel.
 */
export function DealWorkstreamPanel() {
  const { deal, tasks, documents, creditMemo, activity } = useDealData();
  const now = useMemo(() => new Date(), []);
  const metrics = useMemo(
    () =>
      deriveDealCockpitMetrics(
        {
          deal,
          tasks: tasks.kind === 'ready' ? tasks.data : undefined,
          documents: documents.kind === 'ready' ? documents.data : undefined,
          creditMemo: creditMemo.kind === 'ready' ? creditMemo.data : undefined,
          activity: activity.kind === 'ready' ? activity.data : undefined,
        },
        now,
      ),
    [deal, tasks, documents, creditMemo, activity, now],
  );

  const tasksTotal = metrics.taskOpenCount + metrics.taskCompletedCount;
  const docsTotal =
    metrics.docOutstandingCount + metrics.docReceivedCount + metrics.docReviewedCount;
  const docsDone = metrics.docReceivedCount + metrics.docReviewedCount;

  // Memo state index in canonical progression (none → draft →
  // borrower-safe → final). Stale renders the draft index so the
  // bar shows progress without claiming finality.
  const memoIndex = memoStateIndex(metrics.memoState);
  const memoMax = 3;

  // Communication progress — capped at 8 so the bar reads as
  // "actively engaged" without overpromising. The detail line
  // surfaces the raw count + "last touched N days ago" so the
  // banker sees the honest underlying number.
  const commsTotalCap = 8;
  const commsCount = metrics.rightRail.communicationEvents;

  return (
    <Card>
      <CardHeader
        title="Workstreams"
        subtitle="Derived from authorized records — never AI, never predictive."
      />
      <div style={styles.grid}>
        <WorkstreamBar
          label="Tasks"
          done={metrics.taskCompletedCount}
          total={tasksTotal}
          detail={
            metrics.taskOverdueCount > 0
              ? `${metrics.taskOverdueCount} overdue · ${metrics.taskOpenCount} open`
              : tasksTotal === 0
                ? 'No tasks recorded'
                : `${metrics.taskOpenCount} open`
          }
          tone={
            metrics.taskOverdueCount > 0
              ? 'atRisk'
              : tasksTotal === 0
                ? 'neutral'
                : metrics.taskOpenCount === 0
                  ? 'clear'
                  : 'info'
          }
        />
        <WorkstreamBar
          label="Documents"
          done={docsDone}
          total={docsTotal}
          detail={
            docsTotal === 0
              ? 'No documents tracked'
              : `${metrics.docOutstandingCount} outstanding · ${metrics.docReceivedCount} received · ${metrics.docReviewedCount} reviewed`
          }
          tone={
            docsTotal === 0
              ? 'neutral'
              : metrics.docOutstandingCount === 0
                ? 'clear'
                : 'info'
          }
        />
        <WorkstreamBar
          label="Credit memo"
          done={memoIndex}
          total={memoMax}
          detail={memoStateDetail(metrics.memoState, metrics.memoCount)}
          tone={
            metrics.memoState === 'final'
              ? 'clear'
              : metrics.memoState === 'stale'
                ? 'atRisk'
                : metrics.memoState === 'none'
                  ? 'neutral'
                  : 'info'
          }
        />
        <WorkstreamBar
          label="Communication"
          done={Math.min(commsCount, commsTotalCap)}
          total={commsTotalCap}
          detail={communicationDetail(metrics)}
          tone={
            metrics.communicationState === 'none'
              ? 'neutral'
              : metrics.daysSinceLastTouched !== undefined &&
                  metrics.daysSinceLastTouched >= 14
                ? 'atRisk'
                : 'info'
          }
        />
      </div>
      <CardFooter>
        <span>
          Each bar reflects authorized record counts only — no fabricated
          forecasts, no AI completion estimates, no approval-odds claim.
        </span>
      </CardFooter>
    </Card>
  );
}

function memoStateIndex(
  state: ReturnType<typeof deriveDealCockpitMetrics>['memoState'],
): number {
  switch (state) {
    case 'none':
      return 0;
    case 'draft':
    case 'stale':
    case 'unknown':
      return 1;
    case 'borrower-safe':
      return 2;
    case 'final':
      return 3;
  }
}

function memoStateDetail(
  state: ReturnType<typeof deriveDealCockpitMetrics>['memoState'],
  count: number,
): string {
  if (count === 0) return 'No memo records yet';
  switch (state) {
    case 'final':
      return `${count} memo${count === 1 ? '' : 's'} · final`;
    case 'borrower-safe':
      return `${count} memo${count === 1 ? '' : 's'} · borrower-safe`;
    case 'draft':
      return `${count} memo${count === 1 ? '' : 's'} · draft`;
    case 'stale':
      return `${count} memo${count === 1 ? '' : 's'} · stale`;
    case 'unknown':
    case 'none':
      return `${count} memo${count === 1 ? '' : 's'}`;
  }
}

function communicationDetail(
  m: ReturnType<typeof deriveDealCockpitMetrics>,
): string {
  if (m.communicationState === 'unknown') return 'Activity feed loading…';
  if (m.communicationState === 'none') return 'No communication events recorded yet';
  const days = m.daysSinceLastTouched;
  const tail =
    days === undefined
      ? 'no recent timestamp'
      : days <= 0
        ? 'last touched today'
        : days === 1
          ? 'last touched 1d ago'
          : `last touched ${days}d ago`;
  return `${m.rightRail.communicationEvents} event${m.rightRail.communicationEvents === 1 ? '' : 's'} · ${tail}`;
}

const styles: Record<string, React.CSSProperties> = {
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
    gap: `${spacing.sm} ${spacing.lg}`,
    minWidth: 0,
  },
};

// silence unused warning; the import is here so future workstream
// surfaces can lift colors directly from theme without re-importing.
void palette;
void typography;
