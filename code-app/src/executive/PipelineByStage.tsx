import { useExecutiveData, type AsyncResult } from './ExecutiveDataProvider';
import type { StageAggregate } from './operationalFallbackQueries';
import { Card, CardHeader, CardFooter } from '../shared/Card';
import { Badge } from '../shared/Badge';
import { execStyles, formatCurrency } from './execCardChrome';
import { palette, radius, typography } from '../shared/theme';

/**
 * ⚠️ Uses operational fallback (not snapshot-governed).
 * No stage-aggregate snapshot entity exists in the schema yet. The
 * card surfaces this clearly to the executive viewer in the footer.
 */
export function PipelineByStage() {
  const { fallbackPipelineByStage } = useExecutiveData();
  return (
    <Card>
      <CardHeader
        title="Pipeline by Stage"
        subtitle="Active, non-terminal deals grouped by stage."
        trailing={<Badge variant="atRisk" appearance="outline">Transitional</Badge>}
      />
      <Body data={fallbackPipelineByStage} />
    </Card>
  );
}

function Body({ data }: { data: AsyncResult<StageAggregate[]> }) {
  if (data.kind === 'loading') return <p style={execStyles.muted}>Loading pipeline…</p>;
  if (data.kind === 'failed')
    return <ErrorBlock title="Could not load pipeline aggregate" detail={data.message} />;
  if (data.data.length === 0)
    return <p style={execStyles.muted}>No active deals in the pipeline.</p>;

  const maxCount = Math.max(...data.data.map((g) => g.count));

  return (
    <>
      <ul style={execStyles.list}>
        {data.data.map((g) => (
          <li key={g.stage} style={styles.row}>
            <div style={styles.rowHead}>
              <span style={styles.stage}>{g.stage}</span>
              <div style={styles.rowMeta}>
                <Badge variant="neutral">{g.count}</Badge>
                <span style={execStyles.amount}>{formatCurrency(g.totalAmount)}</span>
              </div>
            </div>
            <div style={styles.barTrack}>
              <div
                style={{
                  ...styles.barFill,
                  width: `${maxCount > 0 ? (g.count / maxCount) * 100 : 0}%`,
                }}
              />
            </div>
          </li>
        ))}
      </ul>
      <p style={execStyles.fallbackNote}>
        Transitional: derived from live operational data (cr664_LoanDeal). A governed
        pipeline-stage snapshot is not yet modeled; counts and totals will be replaced
        by snapshot reads when one is.
      </p>
      <CardFooter>
        <span>Aggregate counts only — no individual deal data leaves this card.</span>
      </CardFooter>
    </>
  );
}

function ErrorBlock({ title, detail }: { title: string; detail: string }) {
  return (
    <div style={execStyles.errorBox} role="alert">
      <div style={execStyles.errorTitle}>{title}</div>
      <div style={execStyles.errorDetail}>{detail}</div>
      <div style={execStyles.errorHint}>Refresh to retry.</div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  row: {
    padding: 0,
    background: 'transparent',
    border: 'none',
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
  },
  rowHead: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  stage: {
    fontSize: typography.size.base,
    fontWeight: typography.weight.medium,
    color: palette.text,
  },
  rowMeta: { display: 'flex', alignItems: 'center', gap: 8 },
  barTrack: {
    height: 6,
    background: palette.divider,
    borderRadius: radius.pill,
    overflow: 'hidden',
  },
  barFill: {
    height: '100%',
    background: palette.primary,
    transition: 'width 200ms ease',
  },
};
