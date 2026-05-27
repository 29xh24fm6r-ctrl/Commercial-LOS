import { useState } from 'react';
import { useDealData, type AsyncResult } from './DealDataProvider';
import { useOptionalBanker } from '../banker/BankerContext';
import type { DealTask, DealTasksResult } from './dealTaskQueries';
import { completeTask, type CompleteTaskOutcome } from './dealTaskActions';
import { CompleteTaskModal } from './CompleteTaskModal';
import { Card, CardHeader } from '../shared/Card';
import { Badge, StatusDot } from '../shared/Badge';
import { CountBadge } from '../shared/cockpitPrimitives';
import { palette, radius, spacing, typography, type SeverityKey } from '../shared/theme';

interface DealTasksProps {
  /** Phase 36: when true (manager read-only path), no write surface
   *  renders — no Complete button, no modal, no writeDisabledReason
   *  banner. Defaults to false (banker behavior unchanged). */
  readOnly?: boolean;
}

export function DealTasks({ readOnly = false }: DealTasksProps = {}) {
  const { deal, tasks, refresh } = useDealData();
  const banker = useOptionalBanker();
  const [pendingTask, setPendingTask] = useState<DealTask | null>(null);

  async function handleConfirm(note: string): Promise<CompleteTaskOutcome> {
    if (!pendingTask || !banker?.systemUserId) {
      return { kind: 'unknown', message: 'Cannot submit: missing task or system user id.' };
    }
    const outcome = await completeTask({
      taskId: pendingTask.id,
      taskName: pendingTask.title,
      // dealId is the already-authorized deal id from DealDataProvider —
      // never trusted from the route param directly.
      dealId: deal.id,
      priorAssigneeName: pendingTask.assigneeName,
      systemUserId: banker.systemUserId,
      completionNote: note,
    });
    refresh('after-task-complete');
    return outcome;
  }

  const subtitle = subtitleFor(tasks);
  const canWrite = !readOnly && !!banker?.systemUserId;

  // Phase 125D — right-rail count badge: open-task count with a
  // tone driven by overdue presence. Renders only when the slot
  // has resolved (otherwise the count would be a fake "0").
  const openCount = tasks.kind === 'ready' ? tasks.data.open.length : undefined;
  const overdueCount =
    tasks.kind === 'ready' ? tasks.data.open.filter(isOverdue).length : 0;
  const headerTrailing =
    openCount !== undefined ? (
      <CountBadge
        count={openCount}
        tone={overdueCount > 0 ? 'atRisk' : openCount === 0 ? 'clear' : 'info'}
        aria-label={`${openCount} open task${openCount === 1 ? '' : 's'}${overdueCount > 0 ? `, ${overdueCount} overdue` : ''}`}
      />
    ) : undefined;

  return (
    <>
      <Card>
        <CardHeader title="Tasks / Next Actions" subtitle={subtitle} trailing={headerTrailing} />
        {!readOnly && banker?.writeDisabledReason && (
          <p style={styles.writeDisabledBanner} role="status">
            <strong>Complete disabled:</strong> {banker.writeDisabledReason}
          </p>
        )}
        <Body
          tasks={tasks}
          canWrite={canWrite}
          onComplete={(task) => setPendingTask(task)}
        />
      </Card>
      {!readOnly && pendingTask && (
        <CompleteTaskModal
          task={pendingTask}
          onConfirm={handleConfirm}
          onClose={() => setPendingTask(null)}
        />
      )}
    </>
  );
}

function subtitleFor(tasks: AsyncResult<DealTasksResult>): string | undefined {
  if (tasks.kind !== 'ready') return undefined;
  const open = tasks.data.open.length;
  const completed = tasks.data.completed.length;
  if (open === 0 && completed === 0) return undefined;
  const overdue = tasks.data.open.filter((t) => isOverdue(t)).length;
  const parts = [`${open} open`, `${completed} completed`];
  if (overdue > 0) parts.push(`${overdue} overdue`);
  return parts.join(' · ');
}

function Body({
  tasks,
  canWrite,
  onComplete,
}: {
  tasks: AsyncResult<DealTasksResult>;
  canWrite: boolean;
  onComplete: (task: DealTask) => void;
}) {
  if (tasks.kind === 'loading') return <p style={styles.muted}>Loading tasks…</p>;
  if (tasks.kind === 'failed') return <ErrorBlock title="Could not load tasks" detail={tasks.message} />;

  const { open, completed } = tasks.data;
  if (open.length === 0 && completed.length === 0) {
    return <p style={styles.muted}>No tasks on this deal yet.</p>;
  }

  return (
    <div style={styles.lists}>
      <TaskList
        groupLabel="Open"
        badgeCount={open.length}
        tasks={open}
        emptyHint="No open tasks."
        canWrite={canWrite}
        onComplete={onComplete}
      />
      <TaskList
        groupLabel="Recently completed"
        badgeCount={completed.length}
        tasks={completed}
        emptyHint="No completed tasks yet."
        canWrite={false}
        onComplete={onComplete}
      />
    </div>
  );
}

function TaskList({
  groupLabel,
  badgeCount,
  tasks,
  emptyHint,
  canWrite,
  onComplete,
}: {
  groupLabel: string;
  badgeCount: number;
  tasks: DealTask[];
  emptyHint: string;
  canWrite: boolean;
  onComplete: (task: DealTask) => void;
}) {
  return (
    <div style={styles.group}>
      <div style={styles.groupHeaderRow}>
        <h4 style={styles.groupHeading}>{groupLabel}</h4>
        <Badge
          variant="neutral"
          title={`${badgeCount} ${groupLabel.toLowerCase()} ${
            badgeCount === 1 ? 'task' : 'tasks'
          }`}
        >
          {badgeCount}
        </Badge>
      </div>
      {tasks.length === 0 ? (
        <p style={styles.muted}>{emptyHint}</p>
      ) : (
        <ul style={styles.list}>
          {tasks.map((t) => (
            <TaskRow
              key={t.id}
              task={t}
              canWrite={canWrite && !t.completed}
              onComplete={onComplete}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function TaskRow({
  task,
  canWrite,
  onComplete,
}: {
  task: DealTask;
  canWrite: boolean;
  onComplete: (task: DealTask) => void;
}) {
  const overdue = isOverdue(task);
  const sev: SeverityKey = task.completed ? 'clear' : overdue ? 'atRisk' : 'info';
  return (
    <li style={styles.row}>
      <StatusDot variant={sev} />
      <div style={styles.rowBody}>
        <div
          style={{
            ...styles.title,
            color: task.completed ? palette.textMuted : palette.text,
            textDecoration: task.completed ? 'line-through' : 'none',
          }}
        >
          {task.title}
        </div>
        <div style={styles.meta}>
          <Meta label="Due" value={formatDate(task.dueDate)} emphasize={overdue} />
          <Meta label="Assignee" value={task.assigneeName} />
          {task.completed && task.modifiedOn && (
            <Meta label="Completed" value={formatDate(task.modifiedOn)} />
          )}
        </div>
      </div>
      {canWrite && (
        <button
          type="button"
          onClick={() => onComplete(task)}
          style={styles.completeButton}
          aria-label={`Complete task ${task.title}`}
        >
          Complete
        </button>
      )}
    </li>
  );
}

function Meta({
  label,
  value,
  emphasize,
}: {
  label: string;
  value: string | undefined;
  emphasize?: boolean;
}) {
  return (
    <span style={styles.metaItem}>
      <span style={styles.metaLabel}>{label}</span>
      <span style={emphasize ? styles.metaValueEmphasis : styles.metaValue}>
        {value ?? '—'}
      </span>
    </span>
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

function isOverdue(task: DealTask): boolean {
  if (task.completed) return false;
  if (!task.dueDate) return false;
  const due = new Date(task.dueDate);
  if (Number.isNaN(due.getTime())) return false;
  return due.getTime() < Date.now();
}

function formatDate(iso: string | undefined): string | undefined {
  if (!iso) return undefined;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return undefined;
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

const styles: Record<string, React.CSSProperties> = {
  muted: {
    margin: 0,
    color: palette.textMuted,
    fontSize: typography.size.sm,
    lineHeight: 1.4,
    padding: `${spacing.md} ${spacing.lg}`,
    background: palette.surfaceAlt,
    border: `1px dashed ${palette.borderStrong}`,
    borderRadius: radius.md,
    textAlign: 'center' as const,
  },
  writeDisabledBanner: {
    margin: 0,
    padding: `${spacing.xs} ${spacing.md}`,
    background: palette.atRiskBg,
    color: palette.atRiskFg,
    fontSize: typography.size.sm,
    border: `1px solid ${palette.atRiskBg}`,
    borderRadius: radius.sm,
    lineHeight: typography.lineHeight.snug,
  },
  lists: { display: 'flex', flexDirection: 'column', gap: spacing.md },
  group: { display: 'flex', flexDirection: 'column', gap: spacing.xs },
  groupHeaderRow: { display: 'flex', alignItems: 'center', gap: spacing.xs },
  groupHeading: {
    margin: 0,
    fontSize: typography.size.xs,
    textTransform: 'uppercase',
    letterSpacing: typography.letterSpacing.label,
    color: palette.textSubtle,
    fontWeight: typography.weight.semibold,
  },
  list: {
    listStyle: 'none',
    margin: 0,
    padding: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: spacing.xs,
  },
  row: {
    display: 'flex',
    gap: spacing.sm,
    alignItems: 'flex-start',
    padding: `${spacing.sm} ${spacing.md}`,
    background: palette.surfaceAlt,
    border: `1px solid ${palette.divider}`,
    borderRadius: radius.sm,
  },
  rowBody: { display: 'flex', flexDirection: 'column', gap: 4, flex: 1, minWidth: 0 },
  title: { fontSize: typography.size.base, fontWeight: typography.weight.medium },
  meta: {
    display: 'flex',
    gap: spacing.md,
    flexWrap: 'wrap',
    fontSize: typography.size.sm,
    color: palette.textMuted,
  },
  metaItem: { whiteSpace: 'nowrap', display: 'inline-flex', gap: 4 },
  metaLabel: { color: palette.textSubtle },
  metaValue: { color: palette.text },
  metaValueEmphasis: { color: palette.atRiskFg, fontWeight: typography.weight.semibold },
  completeButton: {
    flexShrink: 0,
    alignSelf: 'center',
    background: palette.primary,
    color: palette.textInverse,
    border: 'none',
    borderRadius: radius.sm,
    padding: `${spacing.xxs} ${spacing.sm}`,
    fontSize: typography.size.xs,
    fontWeight: typography.weight.semibold,
    cursor: 'pointer',
    fontFamily: typography.family,
    letterSpacing: typography.letterSpacing.label,
    textTransform: 'uppercase',
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
