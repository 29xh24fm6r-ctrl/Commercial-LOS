import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useBanker } from './BankerContext';
import {
  loadBankerWorkQueueData,
  type BankerWorkQueueData,
} from './workQueueQueries';
import {
  deriveBankerOpenTasks,
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
  completeTask,
  createDocumentReviewTask,
  type CompleteTaskOutcome,
  type CreateDocumentReviewTaskOutcome,
} from '../deals/dealTaskActions';
import { ReceiveDocumentModal } from '../deals/ReceiveDocumentModal';
import { ReviewDocumentModal } from '../deals/ReviewDocumentModal';
import { CreateDocumentReviewTaskModal } from '../deals/CreateDocumentReviewTaskModal';
import { CompleteTaskModal } from '../deals/CompleteTaskModal';
import type { DealDocument } from '../deals/dealDocumentQueries';
import type { DealTask } from '../deals/dealTaskQueries';
import { LoadingState } from '../shared/LoadingState';
import { Card, CardHeader, CardFooter } from '../shared/Card';
import { Badge, StatusDot } from '../shared/Badge';
import {
  MAX_WORK_QUEUE_ROWS,
  countBySeverity,
  filterAlertWorkItems,
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

/**
 * P1-10 / P2-17 — `filter` selects which slice of the banker's work queue this surface shows so a
 * badge's destination matches the badge's meaning:
 *   - 'all'    → the full work list (Tasks & Actions): blockers, overdue, at-risk, upcoming.
 *   - 'alerts' → only the act-now ALERT tier (blockers + overdue) counted by the "My Alerts" badge,
 *                so opening My Alerts is no longer a mislabeled duplicate of the full Tasks queue.
 */
export type MyWorkQueueFilter = 'all' | 'alerts';

export interface MyWorkQueueProps {
  readonly filter?: MyWorkQueueFilter;
  /**
   * Remediation 2026-07-22 (Workstream F) — fires after every successful
   * in-queue write (task complete, document receive/review, create review
   * task) so a parent shell (BankerShell) holding its own separate
   * loadBankerWorkQueueData snapshot (tab badges, header "N tasks pending",
   * right-rail My Tasks panel) can refresh too, without this component
   * taking on ownership of that shared state.
   */
  readonly onDataChanged?: () => void;
}

export function MyWorkQueue({ filter = 'all', onDataChanged }: MyWorkQueueProps = {}) {
  const { bankerId, fullName, email, systemUserId } = useBanker();
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
  // Remediation 2026-07-22 (Workstream F) — Complete action for a real "My Tasks" row.
  const [pendingComplete, setPendingComplete] =
    useState<{ dealId: string; task: DealTask } | null>(null);

  const reload = useCallback(() => {
    let cancelled = false;
    setState({ kind: 'loading' });
    loadBankerWorkQueueData(bankerId, { includeTestDeals: true })
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
      actorEmail: email,
      receiveNote: note,
    });
    if (outcome.kind === 'success' || outcome.kind === 'governance-partial') {
      // Either branch persisted the receiveddate stamp; the queue's
      // outstanding filter will drop the row on next reload.
      reload();
      onDataChanged?.();
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
      actorEmail: email,
      reviewerName: fullName,
      reviewNote: note,
    });
    if (outcome.kind === 'success' || outcome.kind === 'governance-partial') {
      // Either branch persisted cr664_reviewer; the queue's
      // pendingReview filter (no reviewer) will drop the row on
      // next reload. Phase 54's signal also clears.
      reload();
      onDataChanged?.();
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
      actorEmail: email,
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
      onDataChanged?.();
    }
    return outcome;
  }

  // Remediation 2026-07-22 (Workstream F) — the "My Tasks" section's Complete
  // action. Reuses the same governed completeTask write DealTasks.tsx uses;
  // a completed task drops out of BankerWorkQueueData.tasks on next reload
  // (loadOpenTasksForDeals already filters cr664_completed != true).
  async function handleCompleteConfirm(note: string): Promise<CompleteTaskOutcome> {
    if (!pendingComplete || !systemUserId) {
      return { kind: 'unknown', message: 'Cannot submit: missing task or system user id.' };
    }
    const outcome = await completeTask({
      taskId: pendingComplete.task.id,
      taskName: pendingComplete.task.title,
      dealId: pendingComplete.dealId,
      priorAssigneeName: pendingComplete.task.assigneeName,
      systemUserId,
      actorEmail: email,
      completionNote: note,
    });
    if (outcome.kind === 'success' || outcome.kind === 'governance-partial') {
      reload();
      onDataChanged?.();
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

  const isAlerts = filter === 'alerts';

  // P1-10 / P2-17 — 'alerts' mode is UNCHANGED: one merged card restricted to the shared ALERT
  // tier (blocked + overdue, including overdue tasks) so "My Alerts" shows exactly what its badge
  // counts. Remediation 2026-07-22 (Workstream F) only restructures the 'all' ("Tasks & Actions")
  // mode below, where real tasks and risk signals were previously interleaved in one list under a
  // single "My Work Queue" title — see the two-section render further down.
  if (isAlerts) {
    const allItems = deriveBankerWorkQueue({ data: state.data });
    const items = filterAlertWorkItems(allItems);
    const visible = items.slice(0, MAX_WORK_QUEUE_ROWS);
    const counts = countBySeverity(items);

    if (items.length === 0) {
      return (
        <Card>
          <CardHeader title="My Alerts" subtitle="No urgent alerts." />
          <p style={styles.empty}>
            No blocked or overdue items across your active deals right now. Check Tasks & Actions
            for upcoming and at-risk work.
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
            title="My Alerts"
            subtitle={subtitleForCounts(counts)}
            trailing={
              <Badge variant={overallSeverityKey(counts)}>{overallBadgeLabel(counts)}</Badge>
            }
          />
          <ul style={styles.list} aria-label="My work queue items">
            {visible.map((item) => (
              <Row
                key={item.id}
                item={item}
                canReceive={canReceive}
                canReview={canReceive}
                onOpen={() => navigate(`/deals/${item.dealId}`)}
                onReceive={(meta) => setPendingReceive({ dealId: item.dealId, meta })}
                onReview={(meta) => setPendingReview({ dealId: item.dealId, meta })}
                onCreateReviewTask={(meta) => setPendingReviewTask({ dealId: item.dealId, meta })}
              />
            ))}
          </ul>
          {items.length > MAX_WORK_QUEUE_ROWS && (
            <p style={styles.muted}>
              Showing the {MAX_WORK_QUEUE_ROWS} most urgent of {items.length} work items. Resolve a
              few and refresh to see the rest.
            </p>
          )}
          <CardFooter>
            <span>Scoped to your active deals.</span>
            <span>
              Open a row to act in the Deal Workspace, or use Mark received / Mark reviewed inline
              for documents.
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
            openTasks={[]}
            bankerName={fullName}
            onConfirm={handleCreateReviewTaskConfirm}
            onClose={() => setPendingReviewTask(null)}
          />
        )}
      </>
    );
  }

  // 'all' mode ("Tasks & Actions") — Remediation 2026-07-22 (Workstream F): two clearly separate
  // sections instead of one merged list. "My Tasks" is built independently from the banker's real
  // open tasks (deriveBankerOpenTasks); "Signals" is everything else (blocked/at-risk deals, memo
  // review, overdue/pending-review documents) — the overdue-task rows that used to appear here are
  // excluded so a task is never shown twice across the two sections.
  const taskItems = deriveBankerOpenTasks({ data: state.data });
  const signalItems = deriveBankerWorkQueue({ data: state.data }).filter(
    (i) => i.type !== 'open-task',
  );
  const visibleTasks = taskItems.slice(0, MAX_WORK_QUEUE_ROWS);
  const visibleSignals = signalItems.slice(0, MAX_WORK_QUEUE_ROWS);
  const signalCounts = countBySeverity(signalItems);

  if (taskItems.length === 0 && signalItems.length === 0) {
    return (
      <Card>
        <CardHeader title="Tasks & Actions" subtitle="No urgent work items." />
        <p style={styles.empty}>
          No open tasks or signals across your active deals at this time. Keep an eye on Personal
          Pipeline for upcoming closings.
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
          title="My Tasks"
          subtitle={
            taskItems.length === 0
              ? 'No open tasks.'
              : `${taskItems.length} open task${taskItems.length === 1 ? '' : 's'}`
          }
          trailing={
            <Badge variant={taskItems.some((t) => t.severity === 'overdue') ? 'atRisk' : 'neutral'}>
              {taskItems.length}
            </Badge>
          }
        />
        {taskItems.length === 0 ? (
          <p style={styles.empty}>No open tasks assigned to you on your active deals.</p>
        ) : (
          <>
            <ul style={styles.list} aria-label="My tasks">
              {visibleTasks.map((item) => (
                <TaskRow
                  key={item.id}
                  item={item}
                  canComplete={!!systemUserId}
                  onOpen={() => navigate(`/deals/${item.dealId}`)}
                  onComplete={() =>
                    setPendingComplete({
                      dealId: item.dealId,
                      task: {
                        id: item.taskMetadata!.taskId,
                        title: item.title,
                        completed: false,
                        dueDate: item.dateIso,
                        assigneeName: undefined,
                        modifiedOn: undefined,
                      },
                    })
                  }
                />
              ))}
            </ul>
            {taskItems.length > MAX_WORK_QUEUE_ROWS && (
              <p style={styles.muted}>
                Showing the {MAX_WORK_QUEUE_ROWS} most urgent of {taskItems.length} open tasks.
              </p>
            )}
          </>
        )}
        <CardFooter>
          <span>Scoped to your active deals, including active smoke/test-originated deals.</span>
          <span>Open a row to act in the Deal Workspace, or complete inline.</span>
        </CardFooter>
      </Card>
      <Card>
        <CardHeader
          title="Signals"
          subtitle={
            signalItems.length === 0 ? 'No active signals.' : subtitleForCounts(signalCounts)
          }
          trailing={
            signalItems.length > 0 && (
              <Badge variant={overallSeverityKey(signalCounts)}>
                {overallBadgeLabel(signalCounts)}
              </Badge>
            )
          }
        />
        {signalItems.length === 0 ? (
          <p style={styles.empty}>
            No blocked, at-risk, or document signals across your active deals right now.
          </p>
        ) : (
          <>
            <ul style={styles.list} aria-label="Deal and document signals">
              {visibleSignals.map((item) => (
                <Row
                  key={item.id}
                  item={item}
                  canReceive={canReceive}
                  canReview={canReceive /* same gate: systemUserId present */}
                  onOpen={() => navigate(`/deals/${item.dealId}`)}
                  onReceive={(meta) => setPendingReceive({ dealId: item.dealId, meta })}
                  onReview={(meta) => setPendingReview({ dealId: item.dealId, meta })}
                  onCreateReviewTask={(meta) => setPendingReviewTask({ dealId: item.dealId, meta })}
                />
              ))}
            </ul>
            {signalItems.length > MAX_WORK_QUEUE_ROWS && (
              <p style={styles.muted}>
                Showing the {MAX_WORK_QUEUE_ROWS} most urgent of {signalItems.length} signals.
              </p>
            )}
          </>
        )}
        <CardFooter>
          <span>Blocked, at-risk, and document review signals — not tasks assigned to you.</span>
          <span>
            Open a row to act in the Deal Workspace, or use Mark received / Mark reviewed inline
            for documents.
          </span>
        </CardFooter>
      </Card>
      {pendingComplete && (
        <CompleteTaskModal
          task={pendingComplete.task}
          onConfirm={handleCompleteConfirm}
          onClose={() => setPendingComplete(null)}
        />
      )}
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

/**
 * Remediation 2026-07-22 (Workstream F) — a real "My Tasks" row: the deal
 * task itself, with an inline Complete action (reusing the same governed
 * completeTask write DealTasks.tsx uses) alongside the existing
 * click-to-navigate behavior. No document/signal actions — those live on
 * Row, in the separate Signals section.
 */
function TaskRow({
  item,
  canComplete,
  onOpen,
  onComplete,
}: {
  item: WorkQueueItem;
  canComplete: boolean;
  onOpen: () => void;
  onComplete: () => void;
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
        <Badge variant={sev}>{severityLabel(item.severity)}</Badge>
      </div>
      <p style={styles.rowReason}>{item.reason}</p>
      <div style={styles.rowMeta}>
        <span>
          <span style={styles.metaLabel}>Deal: </span>
          {item.dealName}
        </span>
        {item.dateIso && (
          <span>
            <span style={styles.metaLabel}>Due: </span>
            {formatQueueDate(item.dateIso) ?? '—'}
          </span>
        )}
      </div>
      {canComplete && item.taskMetadata && (
        <div style={styles.rowActions}>
          <button
            type="button"
            onClick={(e) => {
              // Stop the row's onClick from also firing — Complete must not also navigate.
              e.stopPropagation();
              onComplete();
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.stopPropagation();
              }
            }}
            style={styles.receiveButton}
            aria-label={`Complete task ${item.title}`}
          >
            Complete
          </button>
        </div>
      )}
    </li>
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
    case 'open-task':
      return 'Task';
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
