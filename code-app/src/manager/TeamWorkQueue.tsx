import { useEffect, useMemo, useState } from 'react';
import { useManagerData, type AsyncResult } from './ManagerDataProvider';
import {
  loadTeamWorkQueueChildren,
  type TeamWorkQueueChildren,
} from './teamWorkQueueQueries';
import {
  deriveTeamWorkQueue,
  type TeamWorkQueueItem,
} from './teamWorkQueueRules';
import { LoadingState } from '../shared/LoadingState';
import { Card, CardHeader, CardFooter } from '../shared/Card';
import { Badge, StatusDot } from '../shared/Badge';
import {
  MAX_WORK_QUEUE_ROWS,
  countBySeverity,
  formatQueueDate,
  overallBadgeLabel,
  overallSeverityKey,
  severityLabel,
  severityToKey,
  subtitleForCounts,
} from '../shared/workQueue/primitives';
import { palette, radius, spacing, typography } from '../shared/theme';

/**
 * Phase 33: manager-team Team Work Queue. Read-only card.
 *
 * Consolidates per-team blocked deals, overdue tasks / documents,
 * at-risk deals, memo reviews, closing-soon items, and unassigned
 * bankers into one prioritized list. Manager-scoped via the team
 * pipeline already loaded by ManagerDataProvider — no banker module
 * is imported, no all-data fallback.
 *
 * Rows are intentionally TEXT-ONLY (no /deals/:id link). DealRoute
 * currently grants deal-workspace access only to bankers; opening a
 * link from this card would land managers on "Access denied". The
 * Phase 28-style permission expansion for manager drill-through is
 * a separate later phase per the brief guardrail.
 */

type ChildState =
  | { kind: 'loading' }
  | { kind: 'ready'; data: TeamWorkQueueChildren }
  | { kind: 'failed'; message: string };

export function TeamWorkQueue() {
  const { teamPipeline } = useManagerData();
  const [children, setChildren] = useState<ChildState>({ kind: 'loading' });

  // Authorized deal ids — derived from the manager-scoped team
  // pipeline. Memoized on the array content so an unchanged team
  // pipeline does not retrigger the child fetch.
  const dealIds = useMemo<string[]>(
    () => (teamPipeline.kind === 'ready' ? teamPipeline.data.map((d) => d.id) : []),
    [teamPipeline],
  );

  useEffect(() => {
    if (teamPipeline.kind !== 'ready') return;
    let cancelled = false;
    setChildren({ kind: 'loading' });
    loadTeamWorkQueueChildren(dealIds)
      .then((data) => {
        if (!cancelled) setChildren({ kind: 'ready', data });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : String(err);
        setChildren({ kind: 'failed', message });
      });
    return () => {
      cancelled = true;
    };
  }, [teamPipeline, dealIds]);

  // Loading + failed gates from the parent provider come first — if
  // we don't have a team pipeline yet, we can't render the queue.
  const parentState = parentReadiness(teamPipeline, children);
  if (parentState !== 'ready') {
    return renderShell(parentState, teamPipeline, children);
  }

  const items = deriveTeamWorkQueue({
    deals: teamPipeline.kind === 'ready' ? teamPipeline.data : [],
    children: children.kind === 'ready'
      ? children.data
      : { tasks: [], outstandingDocuments: [], memos: [] },
  });
  const visible = items.slice(0, MAX_WORK_QUEUE_ROWS);
  const counts = countBySeverity(items);

  if (items.length === 0) {
    return (
      <Card>
        <CardHeader title="Team Work Queue" subtitle="No urgent team work items." />
        <p style={styles.empty}>
          No urgent items across your team's in-flight deals at this time. Keep
          watching the closing forecast and at-risk cards for emerging risk.
        </p>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader
        title="Team Work Queue"
        subtitle={subtitleForCounts(counts)}
        trailing={
          <Badge variant={overallSeverityKey(counts)}>
            {overallBadgeLabel(counts)}
          </Badge>
        }
      />
      <ul style={styles.list} aria-label="Team work queue items">
        {visible.map((item) => (
          <Row key={item.id} item={item} />
        ))}
      </ul>
      {items.length > MAX_WORK_QUEUE_ROWS && (
        <p style={styles.muted}>
          Showing the {MAX_WORK_QUEUE_ROWS} most urgent of {items.length} team
          work items.
        </p>
      )}
      <CardFooter>
        <span>
          Team-scoped, derived from your authorized team pipeline only. No
          all-data fallback.
        </span>
        <span>
          Read-only — deal drill-through from the manager workspace is
          intentionally not yet wired.
        </span>
      </CardFooter>
    </Card>
  );
}

function Row({ item }: { item: TeamWorkQueueItem }) {
  const sev = severityToKey(item.severity);
  return (
    <li style={styles.row}>
      <div style={styles.rowHead}>
        <span style={styles.rowTitle}>
          <StatusDot variant={sev} /> {item.title}
        </span>
        <div style={styles.rowBadges}>
          <Badge variant={sev}>{severityLabel(item.severity)}</Badge>
          <Badge variant="neutral" appearance="outline">
            {typeLabel(item.type)}
          </Badge>
        </div>
      </div>
      <p style={styles.rowReason}>{item.reason}</p>
      <div style={styles.rowMeta}>
        <span>
          <span style={styles.metaLabel}>Deal: </span>
          {item.dealName}
        </span>
        <span>
          <span style={styles.metaLabel}>Banker: </span>
          {item.bankerName ?? 'Unassigned'}
        </span>
        {item.dateIso && (
          <span>
            <span style={styles.metaLabel}>Date: </span>
            {formatQueueDate(item.dateIso) ?? '—'}
          </span>
        )}
      </div>
    </li>
  );
}

// Manager-specific item-type label. typeLabel stays per-role because
// each role's WorkQueueItemType enum is distinct.
function typeLabel(t: TeamWorkQueueItem['type']): string {
  switch (t) {
    case 'blocked-deal':
      return 'Blocked deal';
    case 'unassigned-banker':
      return 'Unassigned banker';
    case 'overdue-task':
      return 'Overdue task';
    case 'overdue-document':
      return 'Overdue document';
    case 'at-risk-deal':
      return 'At-risk deal';
    case 'memo-review':
      return 'Memo review';
    case 'closing-soon':
      return 'Closing soon';
  }
}

type ParentReadiness = 'loading' | 'failed' | 'ready';

function parentReadiness(
  teamPipeline: AsyncResult<unknown>,
  children: ChildState,
): ParentReadiness {
  if (teamPipeline.kind === 'loading' || children.kind === 'loading')
    return 'loading';
  if (teamPipeline.kind === 'failed' || children.kind === 'failed')
    return 'failed';
  return 'ready';
}

function renderShell(
  state: ParentReadiness,
  teamPipeline: AsyncResult<unknown>,
  children: ChildState,
) {
  if (state === 'loading') {
    return (
      <Card>
        <CardHeader title="Team Work Queue" subtitle="Loading team work items…" />
        <LoadingState message="" />
      </Card>
    );
  }
  const message =
    teamPipeline.kind === 'failed'
      ? teamPipeline.message
      : children.kind === 'failed'
        ? children.message
        : 'Unknown error';
  return (
    <Card>
      <CardHeader title="Team Work Queue" subtitle="Could not load work items." />
      <div style={styles.errorBox} role="alert">
        <div style={styles.errorTitle}>Could not load Team Work Queue</div>
        <div style={styles.errorDetail}>{message}</div>
        <div style={styles.errorHint}>Refresh to retry.</div>
      </div>
    </Card>
  );
}

const styles: Record<string, React.CSSProperties> = {
  list: {
    listStyle: 'none',
    margin: 0,
    padding: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: spacing.xs,
  },
  row: {
    padding: `${spacing.sm} ${spacing.md}`,
    background: palette.surfaceAlt,
    border: `1px solid ${palette.divider}`,
    borderRadius: radius.sm,
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
  },
  rowHead: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: spacing.sm,
    flexWrap: 'wrap',
  },
  rowTitle: {
    fontSize: typography.size.base,
    fontWeight: typography.weight.semibold,
    color: palette.text,
    display: 'inline-flex',
    alignItems: 'center',
    gap: spacing.xs,
  },
  rowBadges: { display: 'flex', gap: spacing.xxs, flexWrap: 'wrap' },
  rowReason: {
    margin: 0,
    fontSize: typography.size.sm,
    color: palette.text,
    lineHeight: typography.lineHeight.snug,
  },
  rowMeta: {
    display: 'flex',
    gap: spacing.md,
    flexWrap: 'wrap',
    fontSize: typography.size.sm,
    color: palette.textMuted,
  },
  metaLabel: { color: palette.textSubtle },
  empty: {
    margin: 0,
    color: palette.textMuted,
    fontSize: typography.size.sm,
    fontStyle: 'italic',
  },
  muted: {
    margin: 0,
    color: palette.textMuted,
    fontSize: typography.size.xs,
    fontStyle: 'italic',
    paddingTop: spacing.xs,
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
  errorHint: { color: palette.textMuted, fontSize: typography.size.xs, fontStyle: 'italic' },
};
