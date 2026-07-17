import { type CSSProperties } from 'react';
import { Card, CardHeader, CardFooter } from '../shared/Card';
import { Badge } from '../shared/Badge';
import { palette, spacing, typography } from '../shared/theme';
import { deriveCrmTimeline, CRM_TASK_PERSISTENCE_AVAILABLE, type CrmTimelineInput } from './crmActivityTaskModel';

/**
 * Phase 193E — CRM activity / task / timeline surface (read + gated actions).
 *
 * Presentational. Renders a chronological timeline of loaded activities and
 * tasks with source labels and explicit empty/undated handling. No fake history,
 * no fake completed task, no email/SMS send. The "Log activity" action is a
 * callback the host wires to the gated persistence adapter and stays disabled
 * unless the persistence gate is satisfied; task creation is disabled (not yet
 * persistable) rather than faked.
 */

interface Props {
  input: CrmTimelineInput;
  persistenceGateSatisfied?: boolean;
  onLogActivity?: () => void;
}

const noop = () => {};

export function CrmActivityTimeline({ input, persistenceGateSatisfied = false, onLogActivity = noop }: Props) {
  const vm = deriveCrmTimeline(input);

  return (
    <Card>
      <CardHeader
        title="CRM Activities & Tasks"
        subtitle="Read-only timeline — history shown as recorded, never fabricated"
        trailing={
          vm.overdueTaskCount > 0 ? (
            <Badge variant="atRisk" aria-label={`${vm.overdueTaskCount} overdue tasks`}>
              {vm.overdueTaskCount} overdue
            </Badge>
          ) : (
            <Badge variant="neutral">{vm.taskCount} tasks</Badge>
          )
        }
      />

      <div data-testid="crm-activity-timeline" data-has-history={String(vm.hasHistory)} data-overdue={vm.overdueTaskCount}>
        <div style={summaryStyle} data-testid="crm-timeline-summary">
          activities {vm.activityCount} · tasks {vm.taskCount} · open {vm.openTaskCount} · overdue {vm.overdueTaskCount}
        </div>

        {vm.emptyCopy ? (
          <div style={mutedStyle} data-testid="crm-timeline-empty">
            {vm.emptyCopy}
          </div>
        ) : (
          <ol style={listStyle}>
            {vm.entries.map((e) => (
              <li key={`${e.kind}-${e.id}`} style={entryStyle} data-timeline-entry={e.kind} data-entry-id={e.id}>
                <span style={kindChipStyle}>{e.kind}</span>
                <span style={titleStyle}>{e.title ?? '(untitled)'}</span>
                <span style={metaStyle}>
                  {e.occurredAt ?? 'undated'} · {e.status ?? 'unknown'} · {e.sourceLabel}
                </span>
              </li>
            ))}
          </ol>
        )}

        <section style={actionsStyle} aria-label="Activity actions">
          <button
            type="button"
            style={persistenceGateSatisfied ? btnStyle : btnDisabledStyle}
            data-testid="crm-timeline-log-activity"
            disabled={!persistenceGateSatisfied}
            aria-disabled={!persistenceGateSatisfied}
            onClick={persistenceGateSatisfied ? onLogActivity : noop}
          >
            Log activity
          </button>
          <button
            type="button"
            style={btnDisabledStyle}
            data-testid="crm-timeline-create-task"
            disabled
            aria-disabled="true"
            data-task-persistence-available={String(CRM_TASK_PERSISTENCE_AVAILABLE)}
          >
            Create task (not yet persistable)
          </button>
        </section>
      </div>

      <CardFooter>
        <span data-testid="crm-timeline-footer">
          Read-only CRM timeline. No fabricated activity/task history, no fake completion, no
          borrower communication. Logging a new activity here requires an authorized persistence
          connection.
        </span>
      </CardFooter>
    </Card>
  );
}

const summaryStyle: CSSProperties = { fontSize: typography.size.xs, color: palette.textSubtle, marginBottom: spacing.sm };
const mutedStyle: CSSProperties = { fontSize: typography.size.sm, color: palette.textMuted, fontStyle: 'italic' };
const listStyle: CSSProperties = { margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: spacing.xs };
const entryStyle: CSSProperties = { display: 'flex', gap: spacing.sm, alignItems: 'baseline', flexWrap: 'wrap', paddingTop: spacing.xs, borderTop: `1px solid ${palette.divider}` };
const kindChipStyle: CSSProperties = { fontSize: typography.size.xs, textTransform: 'uppercase', letterSpacing: typography.letterSpacing.label, color: palette.textSubtle, minWidth: 64 };
const titleStyle: CSSProperties = { fontSize: typography.size.sm, color: palette.text, fontWeight: typography.weight.medium };
const metaStyle: CSSProperties = { fontSize: typography.size.xs, color: palette.textSubtle };
const actionsStyle: CSSProperties = { display: 'flex', gap: spacing.sm, paddingTop: spacing.sm, borderTop: `1px solid ${palette.divider}`, marginTop: spacing.sm };
const btnStyle: CSSProperties = { fontSize: typography.size.sm, padding: `${spacing.xs} ${spacing.md}`, borderRadius: 4, border: `1px solid ${palette.border}`, background: palette.surface, color: palette.text, cursor: 'pointer' };
const btnDisabledStyle: CSSProperties = { ...btnStyle, opacity: 0.5, cursor: 'not-allowed' };
