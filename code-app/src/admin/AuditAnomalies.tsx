import { useAdminData, type AsyncResult } from './AdminDataProvider';
import type { AuditAnomalyRow, AuditOutcomeKey } from './adminDiagnosticsQueries';
import { Card, CardHeader, CardFooter } from '../shared/Card';
import { Badge } from '../shared/Badge';
import { adminStyles, formatDateTime } from './adminCardChrome';
import { palette, type SeverityKey } from '../shared/theme';

const PREVIEW_LIMIT = 8;

export function AuditAnomalies() {
  const { auditAnomalies } = useAdminData();
  return (
    <Card>
      <CardHeader
        title="Audit Anomalies / Access Denials"
        subtitle={subtitleFor(auditAnomalies)}
      />
      <Body data={auditAnomalies} />
    </Card>
  );
}

function subtitleFor(r: AsyncResult<AuditAnomalyRow[]>): string | undefined {
  if (r.kind !== 'ready') return undefined;
  if (r.data.length === 0) return undefined;
  const denied = r.data.filter(
    (a) => a.outcomeKey === 'Denied' || a.outcomeKey === 'Blocked',
  ).length;
  return `${r.data.length} non-success events · ${denied} denied/blocked`;
}

function Body({ data }: { data: AsyncResult<AuditAnomalyRow[]> }) {
  if (data.kind === 'loading') return <p style={adminStyles.muted}>Loading audit events…</p>;
  if (data.kind === 'failed')
    return <ErrorBlock title="Could not load audit events" detail={data.message} />;
  if (data.data.length === 0)
    return <p style={adminStyles.muted}>No audit anomalies.</p>;

  const preview = data.data.slice(0, PREVIEW_LIMIT);
  const overflow = data.data.length - preview.length;

  return (
    <>
      <ul style={adminStyles.list}>
        {preview.map((e) => (
          <li key={e.id} style={adminStyles.row}>
            <div style={adminStyles.rowHead}>
              <span style={adminStyles.rowTitle}>{e.eventName}</span>
              <Badge variant={severityForOutcome(e.outcomeKey)}>
                {e.outcomeStatus ?? 'Non-success'}
              </Badge>
            </div>
            {e.failureReason && (
              <p style={{ margin: 0, fontSize: '0.9rem', color: palette.text, lineHeight: 1.4 }}>
                {e.failureReason}
              </p>
            )}
            <div style={adminStyles.rowMeta}>
              {e.eventCategory && (
                <span>
                  <span style={adminStyles.metaLabel}>Category:</span> {e.eventCategory}
                </span>
              )}
              {e.actorUserName && (
                <span>
                  <span style={adminStyles.metaLabel}>Actor:</span> {e.actorUserName}
                </span>
              )}
              {e.entityType && (
                <span>
                  <span style={adminStyles.metaLabel}>Entity:</span> {e.entityType}
                </span>
              )}
              <span>
                <span style={adminStyles.metaLabel}>When:</span>{' '}
                {formatDateTime(e.changedDate) ?? '—'}
              </span>
            </div>
          </li>
        ))}
      </ul>
      <CardFooter>
        <span>Sourced from cr664_AuditEvent where OutcomeStatus ne Succeeded.</span>
        {overflow > 0 && (
          <span>+ {overflow} more non-success event{overflow === 1 ? '' : 's'} not shown.</span>
        )}
      </CardFooter>
    </>
  );
}

function severityForOutcome(o: AuditOutcomeKey | undefined): SeverityKey {
  if (o === 'Denied' || o === 'Blocked') return 'blocked';
  if (o === 'Failed') return 'atRisk';
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
