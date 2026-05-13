import { useEffect, useState } from 'react';
import { loadDealTasks, type DealTask, type DealTasksResult } from './dealTaskQueries';

interface DealTasksProps {
  /** The already-authorized deal id from BankerDealWorkspace.
   *  This component only mounts after loadDealForBanker has resolved
   *  to 'ready', so the deal access check has already passed. */
  dealId: string;
}

type State =
  | { kind: 'loading' }
  | { kind: 'ready'; result: DealTasksResult }
  | { kind: 'failed'; message: string };

/**
 * Read-only task list scoped to the current deal. No edit, complete,
 * or create actions in this phase. Query fires only on mount after
 * the parent has authorized the deal — see prop contract above.
 */
export function DealTasks({ dealId }: DealTasksProps) {
  const [state, setState] = useState<State>({ kind: 'loading' });

  useEffect(() => {
    let cancelled = false;
    setState({ kind: 'loading' });
    loadDealTasks(dealId)
      .then((result) => {
        if (!cancelled) setState({ kind: 'ready', result });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : String(err);
        setState({ kind: 'failed', message });
      });
    return () => {
      cancelled = true;
    };
  }, [dealId]);

  return (
    <section style={styles.card} aria-labelledby="deal-tasks-heading">
      <h3 id="deal-tasks-heading" style={styles.heading}>
        Tasks / Next Actions
      </h3>
      <Body state={state} />
    </section>
  );
}

function Body({ state }: { state: State }) {
  if (state.kind === 'loading') {
    return <p style={styles.muted}>Loading tasks…</p>;
  }
  if (state.kind === 'failed') {
    return (
      <div style={styles.errorBox} role="alert">
        <div style={styles.errorTitle}>Could not load tasks</div>
        <div style={styles.errorDetail}>{state.message}</div>
        <div style={styles.errorHint}>Refresh to retry.</div>
      </div>
    );
  }

  const { open, completed } = state.result;

  if (open.length === 0 && completed.length === 0) {
    return <p style={styles.muted}>No tasks on this deal yet.</p>;
  }

  return (
    <div style={styles.lists}>
      <TaskList
        groupLabel={`Open (${open.length})`}
        tasks={open}
        emptyHint="No open tasks."
      />
      <TaskList
        groupLabel={`Recently completed (${completed.length})`}
        tasks={completed}
        emptyHint="No completed tasks yet."
      />
    </div>
  );
}

function TaskList({
  groupLabel,
  tasks,
  emptyHint,
}: {
  groupLabel: string;
  tasks: DealTask[];
  emptyHint: string;
}) {
  return (
    <div style={styles.group}>
      <h4 style={styles.groupHeading}>{groupLabel}</h4>
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
  return (
    <li style={styles.row}>
      <span
        aria-hidden="true"
        style={{
          ...styles.statusDot,
          background: task.completed ? '#9aa3af' : overdue ? '#a86400' : '#4a5fc1',
        }}
      />
      <div style={styles.rowBody}>
        <div
          style={{
            ...styles.title,
            color: task.completed ? '#777' : '#1a1a1a',
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
      <span style={styles.metaLabel}>{label}:</span>{' '}
      <span style={emphasize ? styles.metaValueEmphasis : styles.metaValue}>
        {value ?? '—'}
      </span>
    </span>
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
  card: {
    background: '#fff',
    border: '1px solid #e5e5e5',
    borderRadius: 6,
    padding: '1.25rem 1.5rem',
    marginBottom: '1.5rem',
    display: 'flex',
    flexDirection: 'column',
    gap: '0.85rem',
  },
  heading: { margin: 0, fontSize: '1.05rem', fontWeight: 600, color: '#222' },
  muted: { margin: 0, color: '#888', fontSize: '0.9rem', fontStyle: 'italic' },
  lists: { display: 'flex', flexDirection: 'column', gap: '1rem' },
  group: { display: 'flex', flexDirection: 'column', gap: '0.4rem' },
  groupHeading: {
    margin: 0,
    fontSize: '0.78rem',
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
    color: '#666',
  },
  list: { listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: '0.5rem' },
  row: {
    display: 'flex',
    gap: '0.65rem',
    alignItems: 'flex-start',
    padding: '0.6rem 0.7rem',
    background: '#fafafa',
    border: '1px solid #ececec',
    borderRadius: 4,
  },
  statusDot: { flexShrink: 0, width: 10, height: 10, borderRadius: '50%', marginTop: 6 },
  rowBody: { display: 'flex', flexDirection: 'column', gap: '0.2rem', flex: 1, minWidth: 0 },
  title: { fontSize: '0.92rem', fontWeight: 500 },
  meta: { display: 'flex', gap: '1rem', flexWrap: 'wrap', fontSize: '0.82rem', color: '#666' },
  metaItem: { whiteSpace: 'nowrap' },
  metaLabel: { color: '#888' },
  metaValue: { color: '#444' },
  metaValueEmphasis: { color: '#a86400', fontWeight: 600 },
  errorBox: {
    background: '#fef6f6',
    border: '1px solid #f3d3d3',
    borderRadius: 4,
    padding: '0.65rem 0.85rem',
    display: 'flex',
    flexDirection: 'column',
    gap: '0.15rem',
  },
  errorTitle: { color: '#7a0014', fontWeight: 600, fontSize: '0.9rem' },
  errorDetail: { color: '#444', fontSize: '0.85rem' },
  errorHint: { color: '#888', fontSize: '0.8rem', fontStyle: 'italic' },
};
