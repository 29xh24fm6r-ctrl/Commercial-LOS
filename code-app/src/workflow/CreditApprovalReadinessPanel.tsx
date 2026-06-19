import { useDealData } from '../deals/DealDataProvider';
import { Badge } from '../shared/Badge';
import { Card, CardHeader } from '../shared/Card';
import { palette, spacing, typography } from '../shared/theme';
import { deriveCreditReadiness } from './creditReadiness';

export function CreditApprovalReadinessPanel() {
  const { tasks, documents, creditMemo } = useDealData();
  const readiness = deriveCreditReadiness({
    tasks: tasks.kind === 'ready' ? tasks.data : undefined,
    documents: documents.kind === 'ready' ? documents.data : undefined,
    creditMemo: creditMemo.kind === 'ready' ? creditMemo.data : undefined,
    creditMemoUnavailable: creditMemo.kind !== 'ready',
  });
  const tone = readiness.status === 'ready' ? 'clear' : readiness.status === 'unavailable' ? 'neutral' : 'blocked';

  return (
    <Card>
      <CardHeader
        title="Credit Approval Readiness"
        subtitle="Memo, section, approval, and committee evidence projection."
        trailing={<Badge variant={tone}>{readiness.status}</Badge>}
      />
      <dl style={styles.metrics}>
        <Metric label="Memo complete" value={readiness.memoComplete ? 'Yes' : 'No'} />
        <Metric label="Committee package" value={readiness.committeePackageReady ? 'Ready' : 'Not ready'} />
      </dl>
      {readiness.missingArtifacts.length > 0 ? (
        <ul style={styles.list}>
          {readiness.missingArtifacts.map((item) => <li key={item}>{item}</li>)}
        </ul>
      ) : (
        <p style={styles.empty}>No credit approval blockers projected from loaded evidence.</p>
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
    gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
    gap: spacing.md,
    margin: 0,
  },
  metricLabel: { color: palette.textSubtle, fontSize: typography.size.xs, textTransform: 'uppercase' },
  metricValue: { margin: 0, color: palette.text, fontWeight: typography.weight.semibold },
  list: { margin: 0, paddingLeft: spacing.lg, color: palette.textMuted },
  empty: { margin: 0, color: palette.textMuted },
};
