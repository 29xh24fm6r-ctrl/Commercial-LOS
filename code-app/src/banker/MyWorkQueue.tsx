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
  markDocumentReviewed,
  type MarkDocumentReceivedOutcome,
  type MarkDocumentReviewedOutcome,
} from '../deals/documentActions';
import {
  createDocumentReviewTask,
  type CreateDocumentReviewTaskOutcome,
} from '../deals/dealTaskActions';
import { ReceiveDocumentModal } from '../deals/ReceiveDocumentModal';
import { ReviewDocumentModal } from '../deals/ReviewDocumentModal';
import { CreateDocumentReviewTaskModal } from '../deals/CreateDocumentReviewTaskModal';
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
  const { bankerId, fullName, systemUserId } = useBanker();
  const navigate = useNavigate();
  const [state, setState] = useState<State>({ kind: 'loading' });
  const [pendingReceive, setPendingReceive] =
    useState<{ dealId: string; meta: WorkQueueDocumentMetadata } | null>(null);
  const [pendingReview, setPendingReview] =
    useState<{ dealId: string; meta: WorkQueueDocumentMetadata } | null>(null);
  // Phase 70: create-review-task action from a pending-review row.
  // The work queue doesn't carry per-deal task data, so the modal's
  // duplicate-task hint is necessarily skipped here (openTasks=[]).
  const [pendingReviewTask, setPendingReviewTask] =
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

  async function handleReviewConfirm(
    note: string,
  ): Promise<MarkDocumentReviewedOutcome> {
    if (!pendingReview || !systemUserId) {
      return {
        kind: 'unknown',
        message: 'Cannot submit: missing document or system user id.',
      };
    }
    const outcome = await markDocumentReviewed({
      documentId: pendingReview.meta.documentId,
      documentName: pendingReview.meta.documentName,
      dealId: pendingReview.dealId,
      systemUserId,
      reviewerName: fullName,
      reviewNote: note,
    });
    if (outcome.kind === 'success' || outcome.kind === 'governance-partial') {
      // Either branch persisted cr664_reviewer; the queue's
      // pendingReview filter (no reviewer) will drop the row on
      // next reload. Phase 54's signal also clears.
      reload();
    }
    return outcome;
  }

  async function handleCreateReviewTaskConfirm(
    note: string,
  ): Promise<CreateDocumentReviewTaskOutcome> {
    if (!pendingReviewTask || !systemUserId) {
      return {
        kind: 'unknown',
        message: 'Cannot submit: missing document or system user id.',
      };
    }
    const outcome = await createDocumentReviewTask({
      dealId: pendingReviewTask.dealId,
      documentId: pendingReviewTask.meta.documentId,
      documentName: pendingReviewTask.meta.documentName,
      systemUserId,
      bankerName: fullName,
      followUpNote: note,
    });
    if (outcome.kind === 'success' || outcome.kind === 'governance-partial') {
      // Refresh the work queue so any future pending-review rows
      // reflect the latest state. The pending-review row itself
      // does NOT drop out of the queue (Phase 70 does not stamp
      // cr664_reviewer — that's still Phase 55's job); the
      // reload just keeps state coherent.
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
        <LoadingState message="Loading your work queue…" />
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

  const receiveModalDoc = pendingReceive
    ? toDealDocumentShape(pendingReceive.meta, 'outstanding')
    : null;
  const reviewModalDoc = pendingReview
    ? toDealDocumentShape(pendingReview.meta, 'received')
    : null;
  const reviewTaskModalDoc = pendingReviewTask
    ? toDealDocumentShape(pendingReviewTask.meta, 'received')
    : null;

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
              canReview={canReceive /* same gate: systemUserId present */}
              onOpen={() => navigate(`/deals/${item.dealId}`)}
              onReceive={(meta) =>
                setPendingReceive({ dealId: item.dealId, meta })
              }
              onReview={(meta) =>
                setPendingReview({ dealId: item.dealId, meta })
              }
              onCreateReviewTask={(meta) =>
                setPendingReviewTask({ dealId: item.dealId, meta })
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
          <span>Scoped to your active deals.</span>
          <span>
            Open a row to act in the Deal Workspace, or use Mark received /
            Mark reviewed inline for documents.
          </span>
        </CardFooter>
      </Card>
      {receiveModalDoc && pendingReceive && (
        <ReceiveDocumentModal
          doc={receiveModalDoc}
          onConfirm={handleReceiveConfirm}
          onClose={() => setPendingReceive(null)}
        />
      )}
      {reviewModalDoc && pendingReview && fullName && (
        <ReviewDocumentModal
          doc={reviewModalDoc}
          reviewerName={fullName}
          onConfirm={handleReviewConfirm}
          onClose={() => setPendingReview(null)}
        />
      )}
      {reviewTaskModalDoc && pendingReviewTask && (
        <CreateDocumentReviewTaskModal
          doc={reviewTaskModalDoc}
          // Phase 70: the work-queue surface doesn't carry per-deal
          // open-tasks data; duplicate-task hinting is skipped here
          // by passing an empty list. The hint surfaces when the
          // same action is invoked from the Deal Workspace, where
          // openTasks is loaded by DealDataProvider.
          openTasks={[]}
          bankerName={fullName}
          onConfirm={handleCreateReviewTaskConfirm}
          onClose={() => setPendingReviewTask(null)}
        />
      )}
    </>
  );
}

function Row({
  item,
  canReceive,
  canReview,
  onOpen,
  onReceive,
  onReview,
  onCreateReviewTask,
}: {
  item: WorkQueueItem;
  canReceive: boolean;
  canReview: boolean;
  onOpen: () => void;
  onReceive: (meta: WorkQueueDocumentMetadata) => void;
  onReview: (meta: WorkQueueDocumentMetadata) => void;
  onCreateReviewTask: (meta: WorkQueueDocumentMetadata) => void;
}) {
  const sev = severityToKey(item.severity);
  const showReceive =
    canReceive &&
    item.type === 'overdue-document' &&
    item.documentMetadata !== undefined;
  const showReview =
    canReview &&
    item.type === 'pending-review-document' &&
    item.documentMetadata !== undefined;
  // Phase 70: same gate + row type as the Mark-reviewed action; the
  // two surfaces sit side-by-side on a pending-review-document row
  // so the banker can either review now OR schedule a follow-up.
  const showCreateReviewTask = showReview;
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
      {showReview && item.documentMetadata && (
        <div style={styles.rowActions}>
          <button
            type="button"
            onClick={(e) => {
              // Stop the row's onClick — Mark reviewed should not
              // also navigate.
              e.stopPropagation();
              onReview(item.documentMetadata!);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.stopPropagation();
              }
            }}
            style={styles.receiveButton}
            aria-label={`Mark document ${item.title} reviewed`}
          >
            Mark reviewed
          </button>
          {showCreateReviewTask && (
            <button
              type="button"
              onClick={(e) => {
                // Stop the row's onClick — Create review task should
                // not also navigate. Phase 70: this is the
                // schedule-a-follow-up sibling to Mark reviewed.
                e.stopPropagation();
                onCreateReviewTask(item.documentMetadata!);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.stopPropagation();
                }
              }}
              style={styles.reviewTaskButton}
              aria-label={`Create review task for document ${item.title}`}
            >
              Create review task
            </button>
          )}
        </div>
      )}
    </li>
  );
}

function toDealDocumentShape(
  meta: WorkQueueDocumentMetadata,
  status: 'outstanding' | 'received',
): DealDocument {
  // The modal renders read-only summary facts (name, due date, last
  // requested for receive; reviewer + received-status for review)
  // and reads `id` for nothing — the parent constructs the action
  // input from documentMetadata directly. We provide honest values
  // for the fields the modal renders and leave unrelated fields at
  // safe defaults.
  return {
    id: meta.documentId,
    name: meta.documentName,
    dueDate: meta.dueDate,
    requestDate: meta.requestDate,
    receivedDate: meta.receivedDate,
    reviewer: undefined,
    uploaded: false,
    modifiedOn: undefined,
    status,
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
  reviewTaskButton: {
    // Phase 70 sibling to receiveButton — visually neutral so it
    // doesn't compete with the primary "Mark reviewed" action.
    background: palette.surfaceAlt,
    color: palette.text,
    border: `1px solid ${palette.border}`,
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
