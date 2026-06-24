import type { CSSProperties } from 'react';
import { Badge } from '../shared/Badge';
import { Card, CardFooter, CardHeader } from '../shared/Card';
import { palette, radius, shadow, spacing, typography } from '../shared/theme';
import {
  deriveAdminOperatorActionQueueModel,
  type OperatorActionGroupState,
} from './adminOperatorActionQueueModel';

const BADGE_BY_STATE: Record<OperatorActionGroupState, 'clear' | 'atRisk'> = {
  clear: 'clear',
  'action-required': 'atRisk',
};

export function AdminOperatorActionQueue() {
  const vm = deriveAdminOperatorActionQueueModel();

  return (
    <section aria-label="Admin Operator Action Queue" data-admin-operator-action-queue>
      <Card accentColor={palette.cobalt}>
        <CardHeader
          title={vm.title}
          subtitle="Go-live blocker clearing — grouped operator tasks (read-only)"
          trailing={
            <Badge variant={vm.totalOpenActions > 0 ? 'atRisk' : 'clear'}>
              {vm.totalOpenActions > 0 ? `${vm.totalOpenActions} open` : 'All clear'}
            </Badge>
          }
        />

        <p style={styles.posture}>{vm.posture}</p>

        <div style={styles.groups}>
          {vm.groups.map((group) => (
            <article key={group.id} style={styles.group} data-action-group={group.id}>
              <div style={styles.groupHead}>
                <h3 style={styles.groupTitle}>{group.label}</h3>
                <Badge variant={BADGE_BY_STATE[group.state]}>
                  {group.state === 'clear' ? 'clear' : `${group.actions.length} action${group.actions.length === 1 ? '' : 's'}`}
                </Badge>
              </div>
              {group.actions.length === 0 ? (
                <p style={styles.clear}>No open operator actions in this category.</p>
              ) : (
                <ul style={styles.list}>
                  {group.actions.map((action) => (
                    <li key={action.id} style={styles.item}>
                      <span style={styles.itemTitle}>{action.title}</span>
                      <span style={styles.itemDetail}>{action.detail}</span>
                    </li>
                  ))}
                </ul>
              )}
            </article>
          ))}
        </div>

        <CardFooter>
          {vm.certifications.map((cert) => (
            <span key={cert}>{cert}</span>
          ))}
        </CardFooter>
      </Card>
    </section>
  );
}

const styles: Record<string, CSSProperties> = {
  posture: {
    fontSize: typography.size.md,
    color: palette.textMuted,
    margin: 0,
    marginBottom: spacing.lg,
    maxWidth: 1100,
    lineHeight: typography.lineHeight.snug,
  },
  groups: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
    gap: spacing.md,
  },
  group: {
    display: 'flex',
    flexDirection: 'column',
    gap: spacing.sm,
    background: palette.surface,
    border: `1px solid ${palette.panelBorder}`,
    borderRadius: radius.md,
    boxShadow: shadow.card,
    padding: spacing.md,
  },
  groupHead: {
    display: 'flex',
    justifyContent: 'space-between',
    gap: spacing.sm,
    alignItems: 'flex-start',
  },
  groupTitle: {
    fontSize: typography.size.base,
    fontWeight: typography.weight.semibold,
    color: palette.text,
    margin: 0,
  },
  clear: {
    fontSize: typography.size.sm,
    color: palette.textMuted,
    margin: 0,
  },
  list: {
    margin: 0,
    padding: 0,
    listStyle: 'none',
    display: 'flex',
    flexDirection: 'column',
    gap: spacing.sm,
  },
  item: {
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
    borderTop: `1px solid ${palette.panelBorder}`,
    paddingTop: spacing.sm,
  },
  itemTitle: {
    fontSize: typography.size.sm,
    fontWeight: typography.weight.semibold,
    color: palette.text,
  },
  itemDetail: {
    fontSize: typography.size.xs,
    color: palette.textMuted,
    lineHeight: typography.lineHeight.snug,
  },
};
