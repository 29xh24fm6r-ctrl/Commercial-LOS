import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useBanker } from './BankerContext';
import {
  loadBankerWorkQueueData,
  type BankerWorkQueueData,
} from './workQueueQueries';
import {
  deriveBankerWorkQueue,
  type WorkQueueItem,
  type WorkQueueSeverity,
} from './workQueue';
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
 * Phase 32: banker-scoped My Work Queue. Read-only card.
 *
 * Surfaces the banker's daily operating list: blocked deals, overdue
 * tasks, overdue documents, at-risk deals, memo reviews, and
 * closing-soon deals — all already-authorized via the banker
 * pipeline two-step fetch. Each row links into the existing Deal
 * Workspace; the queue itself never writes to Dataverse.
 */

type State =
  | { kind: 'loading' }
  | { kind: 'ready'; data: BankerWorkQueueData }
  | { kind: 'failed'; message: string };

const MAX_ROWS = 60;

export function MyWorkQueue() {
  const { bankerId } = useBanker();
  const navigate = useNavigate();
  const [state, setState] = useState<State>({ kind: 'loading' });

  useEffect(() => {
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

  if (state.kind === 'loading') {
    return (
      <Card>
        <CardHeader title="My Work Queue" subtitle="Loading banker-scoped work items…" />
        <LoadingState message="" />
      </Card>
    );
  }

  if (state.kind === 'failed') {
    return (
      <Card>
        <CardHeader title="My Work Queue" subtitle="Could not load work items." />
        <div style={styles.errorBox} role="alert">
          <div style={styles.errorTitle}>Could not load My Work Queue</div>
          <div style={styles.errorDetail}>{state.message}</div>
          <div style={styles.errorHint}>Refresh to retry.</div>
        </div>
      </Card>
    );
  }

  const items = deriveBankerWorkQueue({ data: state.data });
  const visible = items.slice(0, MAX_ROWS);
  const counts = countBySeverity(items);

  if (items.length === 0) {
    return (
      <Card>
        <CardHeader title="My Work Queue" subtitle="No urgent work items." />
        <p style={styles.empty}>
          No urgent work items across your active deals at this time. Keep an
          eye on Personal Pipeline for upcoming closings.
        </p>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader
        title="My Work Queue"
        subtitle={subtitleFor(counts)}
        trailing={
          <Badge variant={overallSeverity(counts)}>{overallBadge(counts)}</Badge>
        }
      />
      <ul style={styles.list} aria-label="My work queue items">
        {visible.map((item) => (
          <Row
            key={item.id}
            item={item}
            onOpen={() => navigate(`/deals/${item.dealId}`)}
          />
        ))}
      </ul>
      {items.length > MAX_ROWS && (
        <p style={styles.muted}>
          Showing the {MAX_ROWS} most urgent of {items.length} work items. Resolve
          a few and refresh to see the rest.
        </p>
      )}
      <CardFooter>
        <span>
          Banker-scoped, derived from your assigned deals only. No all-data
          fallback.
        </span>
        <span>Read-only — open a row to act on it in the Deal Workspace.</span>
      </CardFooter>
    </Card>
  );
}

function Row({ item, onOpen }: { item: WorkQueueItem; onOpen: () => void }) {
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

function severityToKey(s: WorkQueueSeverity): SeverityKey {
  if (s === 'blocked') return 'blocked';
  if (s === 'overdue') return 'atRisk';
  if (s === 'at-risk') return 'atRisk';
  return 'info';
}

function severityLabel(s: WorkQueueSeverity): string {
  if (s === 'blocked') return 'Blocked';
  if (s === 'overdue') return 'Overdue';
  if (s === 'at-risk') return 'At risk';
  return 'Upcoming';
}

function typeLabel(t: WorkQueueItem['type']): string {
  switch (t) {
    case 'blocked-deal':
      return 'Blocked deal';
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

function countBySeverity(items: readonly WorkQueueItem[]): SeverityCounts {
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
  errorHint: { color: palette.textMuted, fontSize: typography.size.xs, fontStyle: 'italic' },
};
