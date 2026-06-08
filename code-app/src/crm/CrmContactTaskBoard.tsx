import { useMemo, type CSSProperties } from 'react';
import { Card, CardHeader, CardFooter } from '../shared/Card';
import { palette, spacing, typography } from '../shared/theme';
import type { CrmMaster } from '../shared/crm/crmTypes';
import { deriveCrmContactTasks } from '../shared/crm/deriveCrmContactTasks';

interface Props {
  master: CrmMaster;
  asOfDate?: string | Date;
}

/**
 * Phase 141B-H — CRM contact task board. Pure derivation; no task writes; no
 * task is faked complete; honest empty state.
 */
export function CrmContactTaskBoard({ master, asOfDate }: Props) {
  const tasks = useMemo(() => deriveCrmContactTasks({ master, asOfDate }), [master, asOfDate]);
  return (
    <Card>
      <CardHeader title="CRM contact tasks" subtitle={`${tasks.length} task(s)`} />
      {tasks.length === 0 ? (
        <p style={emptyStyle}>No CRM contact tasks.</p>
      ) : (
        <div role="table" aria-label="CRM contact tasks" style={tableStyle}>
          {tasks.map((t) => (
            <div role="row" key={t.taskId} style={rowStyle}>
              <span style={severityStyle(t.severity)}>{t.severity}</span>
              <span style={typeStyle}>{t.taskType}</span>
              <span style={labelStyle}>{t.entityLabel ?? t.entityId}</span>
              <span style={blockerStyle}>{t.blocker ?? ''}</span>
              <span style={statusStyle}>{t.status}</span>
            </div>
          ))}
        </div>
      )}
      <CardFooter>
        <span>Read-only derivation — CRM tasks are not persisted in this phase.</span>
      </CardFooter>
    </Card>
  );
}

const tableStyle: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 2, overflowX: 'auto' };
const rowStyle: CSSProperties = { display: 'flex', gap: spacing.sm, alignItems: 'center', borderTop: `1px solid ${palette.border}`, padding: `${spacing.xs} 0` };
function severityStyle(severity: string): CSSProperties {
  return { minWidth: 70, fontSize: typography.size.xs, textTransform: 'uppercase', letterSpacing: typography.letterSpacing.label, fontWeight: typography.weight.semibold, color: severity === 'high' ? palette.blockedFg : severity === 'medium' ? palette.atRiskFg : palette.textSubtle };
}
const typeStyle: CSSProperties = { flex: '1 0 180px', fontSize: typography.size.sm, color: palette.text };
const labelStyle: CSSProperties = { flex: '1 0 140px', fontSize: typography.size.sm, color: palette.text };
const blockerStyle: CSSProperties = { flex: '1 0 200px', fontSize: typography.size.sm, color: palette.textSubtle };
const statusStyle: CSSProperties = { minWidth: 80, fontSize: typography.size.sm, color: palette.textSubtle };
const emptyStyle: CSSProperties = { margin: 0, fontSize: typography.size.sm, color: palette.textSubtle, fontStyle: 'italic' };
