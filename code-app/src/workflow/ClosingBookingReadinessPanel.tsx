import { useDealData } from '../deals/DealDataProvider';
import { Badge } from '../shared/Badge';
import { Card, CardHeader } from '../shared/Card';
import { palette, spacing, typography } from '../shared/theme';
import { deriveClosingReadiness } from './closingReadiness';

export function ClosingBookingReadinessPanel() {
  const { tasks, documents } = useDealData();
  const readiness = deriveClosingReadiness({
    tasks: tasks.kind === 'ready' ? tasks.data : undefined,
    documents: documents.kind === 'ready' ? documents.data : undefined,
    tasksUnavailable: tasks.kind !== 'ready',
    documentsUnavailable: documents.kind !== 'ready',
  });
  const tone = readiness.bookingReady ? 'clear' : 'atRisk';

  return (
    <Card>
      <CardHeader
        title="Closing + Booking Readiness"
        subtitle="Closing documents, booking package, and post-close exception projection."
        trailing={<Badge variant={tone}>{readiness.bookingReady ? 'booking ready' : 'not ready'}</Badge>}
      />
      <dl style={styles.metrics}>
        <Metric label="Closing" value={readiness.closingReady ? 'Ready' : 'Blocked'} />
        <Metric label="Booking" value={readiness.bookingReady ? 'Ready' : 'Blocked'} />
        <Metric label="Post-close exceptions" value={String(readiness.postCloseExceptions.length)} />
      </dl>
      {readiness.blockers.length > 0 ? (
        <ul style={styles.list}>
          {readiness.blockers.map((item) => <li key={item}>{item}</li>)}
        </ul>
      ) : (
        <p style={styles.empty}>No closing or booking blockers projected from loaded evidence.</p>
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
    gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
    gap: spacing.md,
    margin: 0,
  },
  metricLabel: { color: palette.textSubtle, fontSize: typography.size.xs, textTransform: 'uppercase' },
  metricValue: { margin: 0, color: palette.text, fontWeight: typography.weight.semibold },
  list: { margin: 0, paddingLeft: spacing.lg, color: palette.textMuted },
  empty: { margin: 0, color: palette.textMuted },
};
