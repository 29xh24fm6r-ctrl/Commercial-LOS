import { useAdminData, type AsyncResult } from './AdminDataProvider';
import type { DataQualityFlagRow } from './adminDiagnosticsQueries';
import { Card, CardHeader, CardFooter } from '../shared/Card';
import { Badge } from '../shared/Badge';
import { adminStyles, formatDate } from './adminCardChrome';
import { palette, type SeverityKey } from '../shared/theme';

const PREVIEW_LIMIT = 8;

export function DataQualityFlags() {
  const { dataQuality } = useAdminData();
  return (
    <Card>
      <CardHeader title="Data Quality Flags" subtitle={subtitleFor(dataQuality)} />
      <Body data={dataQuality} />
    </Card>
  );
}

function subtitleFor(r: AsyncResult<DataQualityFlagRow[]>): string | undefined {
  if (r.kind !== 'ready') return undefined;
  return `${r.data.length} open`;
}

function Body({ data }: { data: AsyncResult<DataQualityFlagRow[]> }) {
  if (data.kind === 'loading') return <p style={adminStyles.muted}>Loading flags…</p>;
  if (data.kind === 'failed')
    return <ErrorBlock title="Could not load data quality flags" detail={data.message} />;
  if (data.data.length === 0) return <p style={adminStyles.muted}>No open flags.</p>;

  const preview = data.data.slice(0, PREVIEW_LIMIT);
  const overflow = data.data.length - preview.length;

  return (
    <>
      <ul style={adminStyles.list}>
        {preview.map((f) => (
          <li key={f.id} style={adminStyles.row}>
            <div style={adminStyles.rowHead}>
              <span style={adminStyles.rowTitle}>{f.flagName}</span>
              <Badge variant={severityFromType(f.flagType)}>{f.flagType ?? 'Open'}</Badge>
            </div>
            {f.flagDescription && (
              <p style={{ margin: 0, fontSize: '0.9rem', color: palette.text, lineHeight: 1.4 }}>
                {f.flagDescription}
              </p>
            )}
            <div style={adminStyles.rowMeta}>
              <span>
                <span style={adminStyles.metaLabel}>Source:</span>{' '}
                {f.sourceTable ?? '—'}
              </span>
              <span>
                <span style={adminStyles.metaLabel}>Flagged:</span>{' '}
                {formatDate(f.flaggedDate) ?? '—'}
              </span>
            </div>
          </li>
        ))}
      </ul>
      <CardFooter>
        <span>Sourced from cr664_DataQualityFlag where ResolutionStatus = Open.</span>
        {overflow > 0 && (
          <span>+ {overflow} more open flag{overflow === 1 ? '' : 's'} not shown.</span>
        )}
      </CardFooter>
    </>
  );
}

function severityFromType(t: string | undefined): SeverityKey {
  if (!t) return 'atRisk';
  const lower = t.toLowerCase();
  if (lower.includes('critical') || lower.includes('blocking')) return 'blocked';
  if (lower.includes('warning') || lower.includes('stale')) return 'atRisk';
  return 'neutral';
}

function ErrorBlock({ title, detail }: { title: string; detail: string }) {
  return (
    <div style={adminStyles.errorBox} role="alert">
      <div style={adminStyles.errorTitle}>{title}</div>
      <div style={adminStyles.errorDetail}>{detail}</div>
      <div style={adminStyles.errorHint}>Refresh to retry.</div>
    </div>
  );
}
