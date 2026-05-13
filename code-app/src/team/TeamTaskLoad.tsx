import { useMemo } from 'react';
import { useTeamData, type AsyncResult } from './TeamDataProvider';
import { isPastDue, type TeamTaskRow } from './teamQueries';
import { Card, CardHeader, CardFooter } from '../shared/Card';
import { Badge } from '../shared/Badge';
import { teamStyles, formatDate } from './teamCardChrome';
import { palette, spacing, typography } from '../shared/theme';

interface TaskRollup {
  totals: { open: number; completed: number; overdue: number };
  overduePreview: TeamTaskRow[];
  byAssignee: Array<{ assignee: string; open: number; overdue: number }>;
}

const OVERDUE_PREVIEW_LIMIT = 6;
const ASSIGNEE_LIMIT = 6;
const UNASSIGNED = '(unassigned)';

export function TeamTaskLoad() {
  const { tasks } = useTeamData();
  return (
    <Card>
      <CardHeader title="Team Task Load" />
      <Body tasks={tasks} />
    </Card>
  );
}

function Body({ tasks }: { tasks: AsyncResult<TeamTaskRow[]> }) {
  const rollup = useMemo<TaskRollup | null>(() => {
    if (tasks.kind !== 'ready') return null;
    return summarize(tasks.data);
  }, [tasks]);

  if (tasks.kind === 'loading') return <p style={teamStyles.muted}>Loading task load…</p>;
  if (tasks.kind === 'failed')
    return <ErrorBlock title="Could not load task load" detail={tasks.message} />;
  if (!rollup) return null;
  if (rollup.totals.open + rollup.totals.completed === 0)
    return <p style={teamStyles.muted}>No active tasks on the team yet.</p>;

  return (
    <>
      <div style={teamStyles.grid}>
        <Stat label="Open" value={rollup.totals.open.toString()} color={palette.text} />
        <Stat
          label="Overdue"
          value={rollup.totals.overdue.toString()}
          color={rollup.totals.overdue > 0 ? palette.atRiskFg : undefined}
        />
        <Stat label="Completed" value={rollup.totals.completed.toString()} />
      </div>

      {rollup.byAssignee.length > 0 && (
        <div style={styles.subBlock}>
          <h4 style={styles.subHeading}>By assignee</h4>
          <ul style={teamStyles.list}>
            {rollup.byAssignee.map((row) => (
              <li key={row.assignee} style={teamStyles.row}>
                <div style={styles.rowHead}>
                  <span style={styles.assignee}>{row.assignee}</span>
                  <div style={styles.metaRow}>
                    <Badge variant="neutral">{row.open} open</Badge>
                    {row.overdue > 0 && <Badge variant="atRisk">{row.overdue} overdue</Badge>}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {rollup.overduePreview.length > 0 && (
        <div style={styles.subBlock}>
          <h4 style={styles.subHeading}>Most overdue</h4>
          <ul style={teamStyles.list}>
            {rollup.overduePreview.map((t) => (
              <li key={t.id} style={teamStyles.row}>
                <div style={styles.rowHead}>
                  <span style={styles.taskTitle}>{t.title}</span>
                  <Badge variant="atRisk">Due {formatDate(t.dueDate) ?? '—'}</Badge>
                </div>
                <div style={styles.dealHint}>
                  <span style={styles.metaLabel}>Assignee:</span> {t.assigneeName ?? UNASSIGNED}
                  {t.dealName && (
                    <>
                      {'  '}
                      <span style={styles.metaLabel}>Deal:</span> {t.dealName}
                    </>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      <CardFooter>
        <span>Aggregated across all active tasks on team deals.</span>
      </CardFooter>
    </>
  );
}

function summarize(tasks: TeamTaskRow[], now: Date = new Date()): TaskRollup {
  let open = 0;
  let completed = 0;
  let overdue = 0;
  const overdueList: TeamTaskRow[] = [];
  const assigneeMap = new Map<string, { open: number; overdue: number }>();

  for (const t of tasks) {
    if (t.completed) {
      completed++;
      continue;
    }
    open++;
    const isOver = isPastDue(t.dueDate, now);
    if (isOver) {
      overdue++;
      overdueList.push(t);
    }
    const key = t.assigneeName ?? UNASSIGNED;
    const slot = assigneeMap.get(key) ?? { open: 0, overdue: 0 };
    slot.open++;
    if (isOver) slot.overdue++;
    assigneeMap.set(key, slot);
  }

  overdueList.sort((a, b) => {
    if (!a.dueDate && !b.dueDate) return 0;
    if (!a.dueDate) return 1;
    if (!b.dueDate) return -1;
    return a.dueDate.localeCompare(b.dueDate);
  });

  const byAssignee = [...assigneeMap.entries()]
    .map(([assignee, v]) => ({ assignee, open: v.open, overdue: v.overdue }))
    .sort((a, b) => b.open - a.open)
    .slice(0, ASSIGNEE_LIMIT);

  return {
    totals: { open, completed, overdue },
    overduePreview: overdueList.slice(0, OVERDUE_PREVIEW_LIMIT),
    byAssignee,
  };
}

function Stat({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div style={teamStyles.stat}>
      <div style={teamStyles.statLabel}>{label}</div>
      <div style={{ ...teamStyles.statValue, color: color ?? palette.text }}>{value}</div>
    </div>
  );
}

function ErrorBlock({ title, detail }: { title: string; detail: string }) {
  return (
    <div style={teamStyles.errorBox} role="alert">
      <div style={teamStyles.errorTitle}>{title}</div>
      <div style={teamStyles.errorDetail}>{detail}</div>
      <div style={teamStyles.errorHint}>Refresh to retry.</div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  subBlock: { display: 'flex', flexDirection: 'column', gap: spacing.xs },
  subHeading: {
    margin: 0,
    fontSize: typography.size.xs,
    textTransform: 'uppercase',
    letterSpacing: typography.letterSpacing.label,
    color: palette.textSubtle,
    fontWeight: typography.weight.semibold,
  },
  rowHead: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacing.sm,
    flexWrap: 'wrap',
  },
  assignee: { fontSize: typography.size.base, fontWeight: typography.weight.medium, color: palette.text },
  taskTitle: { fontSize: typography.size.base, fontWeight: typography.weight.medium, color: palette.text },
  metaRow: { display: 'flex', gap: spacing.xs, alignItems: 'center' },
  dealHint: { fontSize: typography.size.sm, color: palette.textMuted, marginTop: 4 },
  metaLabel: { color: palette.textSubtle },
};
