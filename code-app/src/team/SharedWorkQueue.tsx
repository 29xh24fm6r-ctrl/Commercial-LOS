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
  type SharedWorkQueueSeverity,
} from './sharedWorkQueueRules';
import { LoadingState } from '../shared/LoadingState';
import { Card, CardHeader, CardFooter } from '../shared/Card';
import { Badge, StatusDot } from '../shared/Badge';
import {
  palette,
  radius,
  spacing,
  typography,
  type SeverityKey,
} from '../shared/theme';

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

const MAX_ROWS = 60;

export function SharedWorkQueue() {
  const { deals, tasks, documents, memos } = useTeamData();

  const readiness = computeReadiness(deals, tasks, documents, memos);
  if (readiness !== 'ready') return renderShell(readiness, deals, tasks, documents, memos);

  const items = deriveSharedWorkQueue({
    deals: deals.kind === 'ready' ? deals.data : [],
    tasks: tasks.kind === 'ready' ? tasks.data : [],
    documents: documents.kind === 'ready' ? documents.data : [],
    memos: memos.kind === 'ready' ? memos.data : [],
  });
  const visible = items.slice(0, MAX_ROWS);
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
        subtitle={subtitleFor(counts)}
        trailing={<Badge variant={overallSeverity(counts)}>{overallBadge(counts)}</Badge>}
      />
      <ul style={styles.list} aria-label="Shared work queue items">
        {visible.map((item) => (
          <Row key={item.id} item={item} />
        ))}
      </ul>
      {items.length > MAX_ROWS && (
        <p style={styles.muted}>
          Showing the {MAX_ROWS} most urgent of {items.length} shared work items.
        </p>
      )}
      <CardFooter>
        <span>
          Team-scoped, derived from authorized team deals, tasks, documents, and
          memos only. No all-data fallback.
        </span>
        <span>
          Read-only — deal drill-through from the team workspace is intentionally
          not yet wired.
        </span>
      </CardFooter>
    </Card>
  );
}

function Row({ item }: { item: SharedWorkQueueItem }) {
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
          <span style={styles.metaLabel}>Owner: </span>
          {item.ownerName ?? 'Unassigned'}
        </span>
        {item.dateIso && (
          <span>
            <span style={styles.metaLabel}>Date: </span>
            {formatDate(item.dateIso) ?? '—'}
          </span>
        )}
      </div>
    </li>
  );
}

function severityToKey(s: SharedWorkQueueSeverity): SeverityKey {
  if (s === 'blocked') return 'blocked';
  if (s === 'overdue') return 'atRisk';
  if (s === 'at-risk') return 'atRisk';
  return 'info';
}

function severityLabel(s: SharedWorkQueueSeverity): string {
  if (s === 'blocked') return 'Blocked';
  if (s === 'overdue') return 'Overdue';
  if (s === 'at-risk') return 'At risk';
  return 'Upcoming';
}

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

interface SeverityCounts {
  blocked: number;
  overdue: number;
  atRisk: number;
  upcoming: number;
  total: number;
}

function countBySeverity(items: readonly SharedWorkQueueItem[]): SeverityCounts {
  let blocked = 0;
  let overdue = 0;
  let atRisk = 0;
  let upcoming = 0;
  for (const i of items) {
    if (i.severity === 'blocked') blocked++;
    else if (i.severity === 'overdue') overdue++;
    else if (i.severity === 'at-risk') atRisk++;
    else upcoming++;
  }
  return { blocked, overdue, atRisk, upcoming, total: items.length };
}

function subtitleFor(c: SeverityCounts): string {
  const bits: string[] = [];
  if (c.blocked > 0) bits.push(`${c.blocked} blocked`);
  if (c.overdue > 0) bits.push(`${c.overdue} overdue`);
  if (c.atRisk > 0) bits.push(`${c.atRisk} at risk`);
  if (c.upcoming > 0) bits.push(`${c.upcoming} upcoming`);
  return bits.join(' · ') || `${c.total} work item${c.total === 1 ? '' : 's'}`;
}

function overallSeverity(c: SeverityCounts): SeverityKey {
  if (c.blocked > 0) return 'blocked';
  if (c.overdue > 0 || c.atRisk > 0) return 'atRisk';
  if (c.upcoming > 0) return 'info';
  return 'clear';
}

function overallBadge(c: SeverityCounts): string {
  if (c.blocked > 0) return 'Blockers open';
  if (c.overdue > 0) return 'Overdue items';
  if (c.atRisk > 0) return 'Review needed';
  if (c.upcoming > 0) return 'Upcoming';
  return 'Clear';
}

function formatDate(iso: string | undefined): string | undefined {
  if (!iso) return undefined;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return undefined;
  return d.toLocaleDateString('en-US', {
    timeZone: 'UTC',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
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
