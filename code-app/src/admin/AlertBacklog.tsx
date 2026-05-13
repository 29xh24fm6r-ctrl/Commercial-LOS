import { useMemo } from 'react';
import { useAdminData, type AsyncResult } from './AdminDataProvider';
import type { AlertRow, AlertSeverityKey } from './adminDiagnosticsQueries';
import { Card, CardHeader, CardFooter } from '../shared/Card';
import { Badge } from '../shared/Badge';
import { adminStyles, formatDate } from './adminCardChrome';
import { palette, type SeverityKey } from '../shared/theme';

interface AlertSummary {
  total: number;
  critical: number;
  high: number;
  unassigned: number;
  slaBreached: number;
}

const PREVIEW_LIMIT = 6;

export function AlertBacklog() {
  const { alerts } = useAdminData();
  return (
    <Card>
      <CardHeader title="Alert / Blocker Backlog" />
      <Body alerts={alerts} />
    </Card>
  );
}

function Body({ alerts }: { alerts: AsyncResult<AlertRow[]> }) {
  const summary = useMemo<AlertSummary | null>(() => {
    if (alerts.kind !== 'ready') return null;
    return summarize(alerts.data);
  }, [alerts]);

  if (alerts.kind === 'loading') return <p style={adminStyles.muted}>Loading alerts…</p>;
  if (alerts.kind === 'failed')
    return <ErrorBlock title="Could not load alert backlog" detail={alerts.message} />;
  if (!summary) return null;
  if (summary.total === 0) return <p style={adminStyles.muted}>No open alerts.</p>;

  const preview = alerts.data.slice(0, PREVIEW_LIMIT);

  return (
    <>
      <div style={adminStyles.grid}>
        <Stat label="Open" value={summary.total.toString()} />
        <Stat
          label="Critical"
          value={summary.critical.toString()}
          color={summary.critical > 0 ? palette.blockedFg : undefined}
        />
        <Stat
          label="SLA breached"
          value={summary.slaBreached.toString()}
          color={summary.slaBreached > 0 ? palette.blockedFg : undefined}
        />
        <Stat
          label="Unassigned"
          value={summary.unassigned.toString()}
          color={summary.unassigned > 0 ? palette.atRiskFg : undefined}
        />
        <Stat
          label="High"
          value={summary.high.toString()}
          color={summary.high > 0 ? palette.atRiskFg : undefined}
        />
      </div>
      <ul style={adminStyles.list}>
        {preview.map((a) => {
          const now = Date.now();
          const isBreached =
            a.slaBreachDate && new Date(a.slaBreachDate).getTime() < now;
          return (
            <li key={a.id} style={adminStyles.row}>
              <div style={adminStyles.rowHead}>
                <span style={adminStyles.rowTitle}>{a.alertName}</span>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {isBreached && <Badge variant="blocked">SLA breached</Badge>}
                  {a.severityKey && (
                    <Badge variant={severityKey(a.severityKey)}>{a.severity ?? a.severityKey}</Badge>
                  )}
                  {!a.assignedToId && <Badge variant="atRisk" appearance="outline">Unassigned</Badge>}
                </div>
              </div>
              <div style={adminStyles.rowMeta}>
                {a.alertCategory && (
                  <span>
                    <span style={adminStyles.metaLabel}>Category:</span> {a.alertCategory}
                  </span>
                )}
                {a.assignedToName && (
                  <span>
                    <span style={adminStyles.metaLabel}>Owner:</span> {a.assignedToName}
                  </span>
                )}
                {a.dueDate && (
                  <span>
                    <span style={adminStyles.metaLabel}>Due:</span>{' '}
                    {formatDate(a.dueDate) ?? '—'}
                  </span>
                )}
                {a.escalationLevel != null && a.escalationLevel > 0 && (
                  <span>
                    <span style={adminStyles.metaLabel}>Escalation:</span>{' '}
                    L{a.escalationLevel}
                  </span>
                )}
              </div>
            </li>
          );
        })}
      </ul>
      <CardFooter>
        <span>
          Sourced from cr664_AlertQueue where AlertStatus not in {'{Resolved, Closed}'}.
        </span>
        {alerts.data.length > preview.length && (
          <span>+ {alerts.data.length - preview.length} more alert{alerts.data.length - preview.length === 1 ? '' : 's'} not shown.</span>
        )}
      </CardFooter>
    </>
  );
}

function summarize(alerts: AlertRow[]): AlertSummary {
  let critical = 0;
  let high = 0;
  let unassigned = 0;
  let slaBreached = 0;
  const now = Date.now();
  for (const a of alerts) {
    if (a.severityKey === 'Critical') critical++;
    else if (a.severityKey === 'High') high++;
    if (!a.assignedToId) unassigned++;
    if (a.slaBreachDate && new Date(a.slaBreachDate).getTime() < now) slaBreached++;
  }
  return { total: alerts.length, critical, high, unassigned, slaBreached };
}

function severityKey(k: AlertSeverityKey): SeverityKey {
  if (k === 'Critical') return 'blocked';
  if (k === 'High') return 'atRisk';
  if (k === 'Medium') return 'neutral';
  return 'clear';
}

function Stat({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div style={adminStyles.stat}>
      <div style={adminStyles.statLabel}>{label}</div>
      <div style={{ ...adminStyles.statValue, color: color ?? palette.text }}>{value}</div>
    </div>
  );
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
