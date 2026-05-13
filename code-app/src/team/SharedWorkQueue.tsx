import { useNavigate } from 'react-router-dom';
import { useTeamData, type AsyncResult } from './TeamDataProvider';
import type {
  TeamDealRow,
  TeamDocumentRow,
  TeamMemoRow,
  TeamTaskRow,
} from './teamQueries';
import {
  deriveSharedWorkQueue,
  type SharedWorkQueueItem,
} from './sharedWorkQueueRules';
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
 * Phase 34: Team-scoped Shared Work Queue card. Read-only.
 *
 * Consolidates the team's blocked deals, overdue tasks (including
 * unassigned ones), overdue documents, at-risk deals, memo reviews,
 * and closing-soon items into one prioritized list. Reads exclusively
 * from TeamDataProvider — no banker or manager module is imported,
 * no all-data fallback path exists.
 *
 * Rows are intentionally TEXT-ONLY (no /deals/:id link). The Phase 33
 * audit confirmed DealRoute grants deal-workspace access only to the
 * banker workspace today; clicking through from the team workspace
 * would land on the existing "Access denied" state. A separate later
 * phase will introduce governed team drill-through.
 */

export function SharedWorkQueue() {
  const { deals, tasks, documents, memos } = useTeamData();
  const navigate = useNavigate();

  const readiness = computeReadiness(deals, tasks, documents, memos);
  if (readiness !== 'ready') return renderShell(readiness, deals, tasks, documents, memos);

  const items = deriveSharedWorkQueue({
    deals: deals.kind === 'ready' ? deals.data : [],
    tasks: tasks.kind === 'ready' ? tasks.data : [],
    documents: documents.kind === 'ready' ? documents.data : [],
    memos: memos.kind === 'ready' ? memos.data : [],
  });
  const visible = items.slice(0, MAX_WORK_QUEUE_ROWS);
  const counts = countBySeverity(items);

  if (items.length === 0) {
    return (
      <Card>
        <CardHeader
          title="Shared Work Queue"
          subtitle="No urgent shared work items."
        />
        <p style={styles.empty}>
          No urgent items across your team's shared workload at this time. Keep an
          eye on Bottlenecks and the Closing Calendar for emerging signal.
        </p>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader
        title="Shared Work Queue"
        subtitle={subtitleForCounts(counts)}
        trailing={
          <Badge variant={overallSeverityKey(counts)}>
            {overallBadgeLabel(counts)}
          </Badge>
        }
      />
      <ul style={styles.list} aria-label="Shared work queue items">
        {visible.map((item) => (
          <Row
            key={item.id}
            item={item}
            onOpen={() => navigate(`/deals/${item.dealId}`)}
          />
        ))}
      </ul>
      {items.length > MAX_WORK_QUEUE_ROWS && (
        <p style={styles.muted}>
          Showing the {MAX_WORK_QUEUE_ROWS} most urgent of {items.length} shared
          work items.
        </p>
      )}
      <CardFooter>
        <span>
          Team-scoped, derived from authorized team deals, tasks, documents, and
          memos only. No all-data fallback.
        </span>
        <span>
          Open a row to view the deal in read-only mode. Write actions remain
          banker-only.
        </span>
      </CardFooter>
    </Card>
  );
}

function Row({
  item,
  onOpen,
}: {
  item: SharedWorkQueueItem;
  onOpen: () => void;
}) {
  const sev = severityToKey(item.severity);
  return (
    <li
      style={styles.row}
      className="cc-row-hover"
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onOpen();
        }
      }}
      tabIndex={0}
      role="link"
      aria-label={`Open deal ${item.dealName}`}
    >
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
          <span style={styles.metaLabel}>Owner: </span>
          {item.ownerName ?? 'Unassigned'}
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

// Team-specific item-type label. typeLabel stays per-role because
// each role's WorkQueueItemType enum is distinct.
function typeLabel(t: SharedWorkQueueItem['type']): string {
  switch (t) {
    case 'blocked-deal':
      return 'Blocked deal';
    case 'unassigned-task':
      return 'Unassigned task';
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

type Readiness = 'loading' | 'failed' | 'ready';

function computeReadiness(
  deals: AsyncResult<TeamDealRow[]>,
  tasks: AsyncResult<TeamTaskRow[]>,
  documents: AsyncResult<TeamDocumentRow[]>,
  memos: AsyncResult<TeamMemoRow[]>,
): Readiness {
  if (
    deals.kind === 'loading' ||
    tasks.kind === 'loading' ||
    documents.kind === 'loading' ||
    memos.kind === 'loading'
  ) {
    return 'loading';
  }
  if (
    deals.kind === 'failed' ||
    tasks.kind === 'failed' ||
    documents.kind === 'failed' ||
    memos.kind === 'failed'
  ) {
    return 'failed';
  }
  return 'ready';
}

function renderShell(
  state: Readiness,
  deals: AsyncResult<TeamDealRow[]>,
  tasks: AsyncResult<TeamTaskRow[]>,
  documents: AsyncResult<TeamDocumentRow[]>,
  memos: AsyncResult<TeamMemoRow[]>,
) {
  if (state === 'loading') {
    return (
      <Card>
        <CardHeader title="Shared Work Queue" subtitle="Loading shared work items…" />
        <LoadingState message="" />
      </Card>
    );
  }
  const message =
    (deals.kind === 'failed' && deals.message) ||
    (tasks.kind === 'failed' && tasks.message) ||
    (documents.kind === 'failed' && documents.message) ||
    (memos.kind === 'failed' && memos.message) ||
    'Unknown error';
  return (
    <Card>
      <CardHeader title="Shared Work Queue" subtitle="Could not load work items." />
      <div style={styles.errorBox} role="alert">
        <div style={styles.errorTitle}>Could not load Shared Work Queue</div>
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
    cursor: 'pointer',
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
  errorHint: {
    color: palette.textMuted,
    fontSize: typography.size.xs,
    fontStyle: 'italic',
  },
};
