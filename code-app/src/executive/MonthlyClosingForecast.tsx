import { useExecutiveData, type AsyncResult } from './ExecutiveDataProvider';
import type { MonthBucketAggregate } from './operationalFallbackQueries';
import { Card, CardHeader, CardFooter } from '../shared/Card';
import { Badge } from '../shared/Badge';
import { execStyles, formatCurrency } from './execCardChrome';
import { palette, typography } from '../shared/theme';

/**
 * ⚠️ Uses operational fallback (not snapshot-governed).
 * No monthly closing-forecast snapshot entity exists in the schema
 * yet. The card surfaces this clearly to the executive viewer.
 */
export function MonthlyClosingForecast() {
  const { fallbackClosingForecast } = useExecutiveData();
  return (
    <Card>
      <CardHeader
        title="Monthly Closing Forecast"
        subtitle="Deals bucketed by target close month."
        trailing={<Badge variant="atRisk" appearance="outline">Transitional</Badge>}
      />
      <Body data={fallbackClosingForecast} />
    </Card>
  );
}

function Body({ data }: { data: AsyncResult<MonthBucketAggregate[]> }) {
  if (data.kind === 'loading') return <p style={execStyles.muted}>Loading forecast…</p>;
  if (data.kind === 'failed')
    return <ErrorBlock title="Could not load closing forecast" detail={data.message} />;
  if (data.data.length === 0)
    return <p style={execStyles.muted}>No active deals in the pipeline.</p>;

  return (
    <>
      <ul style={execStyles.list}>
        {data.data.map((b) => (
          <li key={b.key} style={execStyles.row}>
            <span style={b.past ? styles.labelPast : styles.label}>{b.label}</span>
            <div style={execStyles.rowMeta}>
              {b.past && b.count > 0 ? (
                <Badge variant="atRisk">{b.count}</Badge>
              ) : (
                <Badge variant="neutral">{b.count}</Badge>
              )}
              <span style={execStyles.amount}>{formatCurrency(b.totalAmount)}</span>
            </div>
          </li>
        ))}
      </ul>
      <p style={execStyles.fallbackNote}>
        Transitional: derived from live operational data (cr664_LoanDeal). A governed
        closing-forecast snapshot is not yet modeled; counts and totals will be replaced
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
  label: { fontSize: typography.size.base, fontWeight: typography.weight.medium, color: palette.text },
  labelPast: {
    fontSize: typography.size.base,
    fontWeight: typography.weight.medium,
    color: palette.atRiskFg,
  },
};
