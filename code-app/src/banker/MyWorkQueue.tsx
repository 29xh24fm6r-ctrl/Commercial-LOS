import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useBanker } from './BankerContext';
import {
  loadBankerWorkQueueData,
  type BankerWorkQueueData,
} from './workQueueQueries';
import {
  deriveBankerWorkQueue,
  type WorkQueueDocumentMetadata,
  type WorkQueueItem,
} from './workQueue';
import {
  markDocumentReceived,
  type MarkDocumentReceivedOutcome,
} from '../deals/documentActions';
import { ReceiveDocumentModal } from '../deals/ReceiveDocumentModal';
import type { DealDocument } from '../deals/dealDocumentQueries';
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
 * Phase 32: banker-scoped My Work Queue.
 * Phase 53: overdue-document rows now expose a "Mark received"
 * action that reuses the Phase 51 governed write
 * (markDocumentReceived + ReceiveDocumentModal). Successful receive
 * triggers a queue reload; the resolved row drops out automatically
 * because the underlying query filters on cr664_receiveddate IS NULL.
 *
 * Surfaces the banker's daily operating list: blocked deals, overdue
 * tasks, overdue documents, at-risk deals, memo reviews, and
 * closing-soon deals — all already-authorized via the banker
 * pipeline two-step fetch. Each row links into the existing Deal
 * Workspace. The Mark-received quick action is the only in-queue
 * write surface; everything else still routes through the deal
 * workspace.
 */

type State =
  | { kind: 'loading' }
  | { kind: 'ready'; data: BankerWorkQueueData }
  | { kind: 'failed'; message: string };

export function MyWorkQueue() {
  const { bankerId, systemUserId } = useBanker();
  const navigate = useNavigate();
  const [state, setState] = useState<State>({ kind: 'loading' });
  const [pendingReceive, setPendingReceive] =
    useState<{ dealId: string; meta: WorkQueueDocumentMetadata } | null>(null);

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

  async function handleReceiveConfirm(
    note: string,
  ): Promise<MarkDocumentReceivedOutcome> {
    if (!pendingReceive || !systemUserId) {
      return {
        kind: 'unknown',
        message: 'Cannot submit: missing document or system user id.',
      };
    }
    const outcome = await markDocumentReceived({
      documentId: pendingReceive.meta.documentId,
      documentName: pendingReceive.meta.documentName,
      dealId: pendingReceive.dealId,
      systemUserId,
      receiveNote: note,
    });
    if (outcome.kind === 'success' || outcome.kind === 'governance-partial') {
      // Either branch persisted the receiveddate stamp; the queue's
      // outstanding filter will drop the row on next reload.
      reload();
    }
    return outcome;
  }

  // Banker-only by construction (MyWorkQueue lives under
  // BankerProvider; Phase 48 isolation guard prevents other roles
  // from importing it). systemUserId presence is the per-banker
  // gate — same convention as DealDocuments. writeDisabledReason
  // is a Deal-Workspace banner concern; the queue stays clean.
  const canReceive = !!systemUserId;

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
  const visible = items.slice(0, MAX_WORK_QUEUE_ROWS);
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

  const modalDoc = pendingReceive ? toDealDocumentShape(pendingReceive.meta) : null;

  return (
    <>
      <Card>
        <CardHeader
          title="My Work Queue"
          subtitle={subtitleForCounts(counts)}
          trailing={
            <Badge variant={overallSeverityKey(counts)}>
              {overallBadgeLabel(counts)}
            </Badge>
          }
        />
        <ul style={styles.list} aria-label="My work queue items">
          {visible.map((item) => (
            <Row
              key={item.id}
              item={item}
              canReceive={canReceive}
              onOpen={() => navigate(`/deals/${item.dealId}`)}
              onReceive={(meta) =>
                setPendingReceive({ dealId: item.dealId, meta })
              }
            />
          ))}
        </ul>
        {items.length > MAX_WORK_QUEUE_ROWS && (
          <p style={styles.muted}>
            Showing the {MAX_WORK_QUEUE_ROWS} most urgent of {items.length} work
            items. Resolve a few and refresh to see the rest.
          </p>
        )}
        <CardFooter>
          <span>
            Banker-scoped, derived from your assigned deals only. No all-data
            fallback.
          </span>
          <span>
            Open a row to act in the Deal Workspace, or use Mark received
            inline for outstanding documents.
          </span>
        </CardFooter>
      </Card>
      {modalDoc && pendingReceive && (
        <ReceiveDocumentModal
          doc={modalDoc}
          onConfirm={handleReceiveConfirm}
          onClose={() => setPendingReceive(null)}
        />
      )}
    </>
  );
}

function Row({
  item,
  canReceive,
  onOpen,
  onReceive,
}: {
  item: WorkQueueItem;
  canReceive: boolean;
  onOpen: () => void;
  onReceive: (meta: WorkQueueDocumentMetadata) => void;
}) {
  const sev = severityToKey(item.severity);
  const showReceive =
    canReceive &&
    item.type === 'overdue-document' &&
    item.documentMetadata !== undefined;
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
            {formatQueueDate(item.dateIso) ?? '—'}
          </span>
        )}
      </div>
      {showReceive && item.documentMetadata && (
        <div style={styles.rowActions}>
          <button
            type="button"
            onClick={(e) => {
              // Stop the row's onClick from also firing — clicking
              // the action button must NOT navigate away.
              e.stopPropagation();
              onReceive(item.documentMetadata!);
            }}
            onKeyDown={(e) => {
              // Same guard for keyboard activation. The row's
              // onKeyDown also fires Enter / Space — stop both.
              if (e.key === 'Enter' || e.key === ' ') {
                e.stopPropagation();
              }
            }}
            style={styles.receiveButton}
            aria-label={`Mark document ${item.title} received`}
          >
            Mark received
          </button>
        </div>
      )}
    </li>
  );
}

function toDealDocumentShape(meta: WorkQueueDocumentMetadata): DealDocument {
  // The modal renders read-only summary facts (name, due date, last
  // requested) and reads `id` for nothing — the parent constructs
  // the action input from documentMetadata directly. We provide
  // honest values for the fields the modal renders and leave
  // unrelated fields at their outstanding-row defaults.
  return {
    id: meta.documentId,
    name: meta.documentName,
    dueDate: meta.dueDate,
    requestDate: meta.requestDate,
    receivedDate: undefined,
    reviewer: undefined,
    uploaded: false,
    modifiedOn: undefined,
    status: 'outstanding',
  };
}

// Banker-specific item-type label. typeLabel stays per-role because
// each role's WorkQueueItemType enum is distinct.
function typeLabel(t: WorkQueueItem['type']): string {
  switch (t) {
    case 'blocked-deal':
      return 'Blocked deal';
    case 'overdue-task':
      return 'Overdue task';
    case 'overdue-document':
      return 'Overdue document';
    case 'pending-review-document':
      return 'Pending review';
    case 'at-risk-deal':
      return 'At-risk deal';
    case 'memo-review':
      return 'Memo review';
    case 'closing-soon':
      return 'Closing soon';
  }
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
  rowActions: {
    display: 'flex',
    gap: spacing.xxs,
    justifyContent: 'flex-end',
    paddingTop: spacing.xs,
  },
  receiveButton: {
    background: palette.surface,
    color: palette.primary,
    border: `1px solid ${palette.primary}`,
    borderRadius: radius.sm,
    padding: `${spacing.xxs} ${spacing.sm}`,
    fontSize: typography.size.xs,
    fontWeight: typography.weight.semibold,
    cursor: 'pointer',
    fontFamily: typography.family,
    letterSpacing: typography.letterSpacing.label,
    textTransform: 'uppercase',
  },
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
