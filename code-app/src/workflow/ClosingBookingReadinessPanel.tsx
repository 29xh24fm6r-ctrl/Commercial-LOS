import { useDealData } from '../deals/DealDataProvider';
import { Badge } from '../shared/Badge';
import { Card, CardHeader } from '../shared/Card';
import { palette, spacing, typography } from '../shared/theme';
import { recognizeCanonicalStage } from './stageOrderingContract';
import { deriveClosingReadiness } from './closingReadiness';

/**
 * Booking readiness is only MEANINGFUL once a deal reaches the Closing & Funding stage — that is
 * where closing documents and the booking package exist to evaluate. Before then, the regex-only
 * closing-readiness projection trivially finds no closing/booking blockers on a deal that has none
 * yet, which used to render a misleading green "BOOKING READY" badge on an Intake-stage deal with
 * unresolved advancement blockers. This panel is now stage-aware: below Closing & Funding it reports
 * "not yet evaluated" (pending upstream completion) rather than implying the deal is booking-ready.
 */
const CLOSING_FUNDING_SEQUENCE = 60;

export function ClosingBookingReadinessPanel() {
  const { deal, tasks, documents } = useDealData();
  const readiness = deriveClosingReadiness({
    tasks: tasks.kind === 'ready' ? tasks.data : undefined,
    documents: documents.kind === 'ready' ? documents.data : undefined,
    tasksUnavailable: tasks.kind !== 'ready',
    documentsUnavailable: documents.kind !== 'ready',
  });

  const recognized = recognizeCanonicalStage(deal.stage);
  // Applicable only from Closing & Funding onward. An unrecognized/custom stage is treated as
  // not-yet-applicable (honest) rather than assumed booking-ready.
  const bookingApplicable = recognized !== undefined && recognized.sequence >= CLOSING_FUNDING_SEQUENCE;

  const badge = bookingApplicable ? (
    <Badge variant={readiness.bookingReady ? 'clear' : 'atRisk'}>
      {readiness.bookingReady ? 'booking ready' : 'not ready'}
    </Badge>
  ) : (
    <Badge variant="neutral">not yet evaluated</Badge>
  );

  return (
    <Card>
      <CardHeader
        title="Closing + Booking Readiness"
        subtitle="Closing documents, booking package, and post-close exception projection."
        trailing={<span data-booking-readiness={bookingApplicable ? (readiness.bookingReady ? 'ready' : 'not-ready') : 'not-evaluated'}>{badge}</span>}
      />
      {bookingApplicable ? (
        <>
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
        </>
      ) : (
        <>
          <dl style={styles.metrics}>
            <Metric label="Closing" value="Not yet evaluated" />
            <Metric label="Booking" value="Not yet evaluated" />
            <Metric label="Post-close exceptions" value="—" />
          </dl>
          <p style={styles.empty} data-booking-stage-note>
            Booking readiness is evaluated at the Closing &amp; Funding stage. This deal is at{' '}
            <strong>{deal.stage ?? 'an earlier stage'}</strong> — closing and booking status is pending
            upstream completion, not yet applicable.
          </p>
        </>
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
