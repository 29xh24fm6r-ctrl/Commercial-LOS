import { Badge } from '../shared/Badge';
import { Card, CardHeader } from '../shared/Card';
import { palette, spacing, typography } from '../shared/theme';
import type { WorkflowLaunchReadinessRollup } from './workflowLaunchReadinessRollups';

export function WorkflowLaunchReadinessPanel({
  title,
  subtitle,
  rollup,
}: {
  title: string;
  subtitle: string;
  rollup: WorkflowLaunchReadinessRollup;
}) {
  const tone = rollup.launchReadinessScore >= 85
    ? 'clear'
    : rollup.launchReadinessScore >= 65
      ? 'atRisk'
      : 'blocked';
  return (
    <Card>
      <CardHeader
        title={title}
        subtitle={subtitle}
        trailing={<Badge variant={tone}>{rollup.launchReadinessScore}% ready</Badge>}
      />
      <dl style={styles.metrics}>
        <Metric label="Missing docs" value={String(rollup.missingDocumentsCount)} />
        <Metric label="Credit gaps" value={String(rollup.incompleteCreditPackages)} />
        <Metric label="Closing bottlenecks" value={String(rollup.closingBottlenecks)} />
        <Metric label="Stale stages" value={String(rollup.staleStageIndicators)} />
      </dl>
      {rollup.notReadyReasons.length > 0 ? (
        <ul style={styles.list}>{rollup.notReadyReasons.map((reason) => <li key={reason}>{reason}</li>)}</ul>
      ) : (
        <p style={styles.empty}>No launch-readiness blockers projected from loaded data.</p>
      )}
    </Card>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt style={styles.metricLabel}>{label}</dt>
      <dd style={styles.metricValue}>{value}</dd>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  metrics: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
    gap: spacing.md,
    margin: 0,
  },
  metricLabel: { color: palette.textSubtle, fontSize: typography.size.xs, textTransform: 'uppercase' },
  metricValue: { margin: 0, color: palette.text, fontWeight: typography.weight.semibold },
  list: { margin: 0, paddingLeft: spacing.lg, color: palette.textMuted },
  empty: { margin: 0, color: palette.textMuted },
};
