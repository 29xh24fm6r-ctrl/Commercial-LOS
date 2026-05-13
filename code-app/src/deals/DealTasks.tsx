import { useDealData, type AsyncResult } from './DealDataProvider';
import type { DealTask, DealTasksResult } from './dealTaskQueries';
import { Card, CardHeader } from '../shared/Card';
import { Badge, StatusDot } from '../shared/Badge';
import { palette, radius, spacing, typography, type SeverityKey } from '../shared/theme';

export function DealTasks() {
  const { tasks } = useDealData();
  const subtitle = subtitleFor(tasks);
  return (
    <Card>
      <CardHeader title="Tasks / Next Actions" subtitle={subtitle} />
      <Body tasks={tasks} />
    </Card>
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

function Body({ tasks }: { tasks: AsyncResult<DealTasksResult> }) {
  if (tasks.kind === 'loading') return <p style={styles.muted}>Loading tasks…</p>;
  if (tasks.kind === 'failed') return <ErrorBlock title="Could not load tasks" detail={tasks.message} />;

  const { open, completed } = tasks.data;
  if (open.length === 0 && completed.length === 0) {
    return <p style={styles.muted}>No tasks on this deal yet.</p>;
  }

  return (
    <div style={styles.lists}>
      <TaskList groupLabel="Open" badgeCount={open.length} tasks={open} emptyHint="No open tasks." />
      <TaskList
        groupLabel="Recently completed"
        badgeCount={completed.length}
        tasks={completed}
        emptyHint="No completed tasks yet."
      />
    </div>
  );
}

function TaskList({
  groupLabel,
  badgeCount,
  tasks,
  emptyHint,
}: {
  groupLabel: string;
  badgeCount: number;
  tasks: DealTask[];
  emptyHint: string;
}) {
  return (
    <div style={styles.group}>
      <div style={styles.groupHeaderRow}>
        <h4 style={styles.groupHeading}>{groupLabel}</h4>
        <Badge variant="neutral">{badgeCount}</Badge>
      </div>
      {tasks.length === 0 ? (
        <p style={styles.muted}>{emptyHint}</p>
      ) : (
        <ul style={styles.list}>
          {tasks.map((t) => (
            <TaskRow key={t.id} task={t} />
          ))}
        </ul>
      )}
    </div>
  );
}

function TaskRow({ task }: { task: DealTask }) {
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
    fontSize: typography.size.md,
    fontStyle: 'italic',
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
