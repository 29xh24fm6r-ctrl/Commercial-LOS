import { useMemo } from 'react';
import { useAdminData } from './AdminDataProvider';
import { Card, CardHeader, CardFooter } from '../shared/Card';
import { Badge } from '../shared/Badge';
import { adminStyles } from './adminCardChrome';
import { palette, spacing, typography, type SeverityKey } from '../shared/theme';

type CategoryStatus = 'critical' | 'warning' | 'healthy' | 'not-wired' | 'loading' | 'failed';

interface CategoryStat {
  label: string;
  status: CategoryStatus;
  detail: string;
}

/**
 * Synthesizes a top-line system health view from the other diagnostic
 * AsyncResults already loaded by AdminDataProvider. No queries of its
 * own — pure derivation. Critical > Warning > Healthy hierarchy is
 * enforced by sorting (critical categories sort first).
 */
export function SystemHealthSummary() {
  const { dataQuality, auditAnomalies, alerts, refreshStatus, configuration } =
    useAdminData();

  const stats = useMemo<CategoryStat[]>(() => {
    const out: CategoryStat[] = [];

    out.push(deriveDataQuality(dataQuality));
    out.push(deriveAuditAnomalies(auditAnomalies));
    out.push(deriveAlerts(alerts));
    out.push(deriveRefresh(refreshStatus));
    out.push(deriveConfiguration(configuration));

    return out.sort((a, b) => statusRank(a.status) - statusRank(b.status));
  }, [dataQuality, auditAnomalies, alerts, refreshStatus, configuration]);

  const overall = overallStatus(stats);

  return (
    <Card accentColor={accentForOverall(overall)}>
      <CardHeader
        title="System Health Summary"
        subtitle="Critical > Warning > Healthy; rolled up across categories."
        trailing={<Badge variant={severityForStatus(overall)}>{labelForStatus(overall)}</Badge>}
      />
      <ul style={styles.list}>
        {stats.map((s) => (
          <li key={s.label} style={styles.row}>
            <div style={styles.rowLeft}>
              <Badge variant={severityForStatus(s.status)} appearance="outline">
                {labelForStatus(s.status)}
              </Badge>
              <span style={styles.label}>{s.label}</span>
            </div>
            <span style={styles.detail}>{s.detail}</span>
          </li>
        ))}
      </ul>
      <CardFooter>
        <span>
          Derived from data-quality, audit, alert, refresh-status, and configuration loads.
        </span>
      </CardFooter>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Derivers
// ---------------------------------------------------------------------------

function deriveDataQuality(
  r: ReturnType<typeof useAdminData>['dataQuality'],
): CategoryStat {
  if (r.kind === 'loading') return { label: 'Data Quality', status: 'loading', detail: 'Loading…' };
  if (r.kind === 'failed')
    return { label: 'Data Quality', status: 'failed', detail: 'Could not load' };
  const n = r.data.length;
  if (n === 0) return { label: 'Data Quality', status: 'healthy', detail: 'No open flags' };
  if (n >= 10)
    return { label: 'Data Quality', status: 'critical', detail: `${n} open flags` };
  return { label: 'Data Quality', status: 'warning', detail: `${n} open flag${n === 1 ? '' : 's'}` };
}

function deriveAuditAnomalies(
  r: ReturnType<typeof useAdminData>['auditAnomalies'],
): CategoryStat {
  if (r.kind === 'loading') return { label: 'Audit Anomalies', status: 'loading', detail: 'Loading…' };
  if (r.kind === 'failed')
    return { label: 'Audit Anomalies', status: 'failed', detail: 'Could not load' };
  const n = r.data.length;
  const denials = r.data.filter((a) => a.outcomeKey === 'Denied' || a.outcomeKey === 'Blocked').length;
  if (n === 0) return { label: 'Audit Anomalies', status: 'healthy', detail: 'No anomalies' };
  if (denials > 0)
    return {
      label: 'Audit Anomalies',
      status: 'critical',
      detail: `${denials} denied/blocked of ${n} events`,
    };
  return { label: 'Audit Anomalies', status: 'warning', detail: `${n} non-success event${n === 1 ? '' : 's'}` };
}

function deriveAlerts(r: ReturnType<typeof useAdminData>['alerts']): CategoryStat {
  if (r.kind === 'loading') return { label: 'Alert Backlog', status: 'loading', detail: 'Loading…' };
  if (r.kind === 'failed') return { label: 'Alert Backlog', status: 'failed', detail: 'Could not load' };
  const open = r.data.length;
  if (open === 0) return { label: 'Alert Backlog', status: 'healthy', detail: 'No open alerts' };
  const now = Date.now();
  const slaBreached = r.data.filter(
    (a) => a.slaBreachDate && new Date(a.slaBreachDate).getTime() < now,
  ).length;
  const critical = r.data.filter((a) => a.severityKey === 'Critical').length;
  if (slaBreached > 0 || critical > 0)
    return {
      label: 'Alert Backlog',
      status: 'critical',
      detail: `${slaBreached} SLA-breached · ${critical} critical · ${open} total`,
    };
  const unassigned = r.data.filter((a) => !a.assignedToId).length;
  if (unassigned > 0)
    return {
      label: 'Alert Backlog',
      status: 'warning',
      detail: `${unassigned} unassigned of ${open}`,
    };
  return { label: 'Alert Backlog', status: 'warning', detail: `${open} open` };
}

function deriveRefresh(r: ReturnType<typeof useAdminData>['refreshStatus']): CategoryStat {
  if (r.kind === 'loading') return { label: 'Snapshot Refresh', status: 'loading', detail: 'Loading…' };
  if (r.kind === 'failed') return { label: 'Snapshot Refresh', status: 'failed', detail: 'Could not load' };
  if (!r.data) return { label: 'Snapshot Refresh', status: 'not-wired', detail: 'No refresh-status record published' };
  if (r.data.staleDataFlag)
    return { label: 'Snapshot Refresh', status: 'critical', detail: 'Stale data flag set' };
  return { label: 'Snapshot Refresh', status: 'healthy', detail: r.data.refreshStatusName };
}

function deriveConfiguration(
  r: ReturnType<typeof useAdminData>['configuration'],
): CategoryStat {
  if (r.kind === 'loading') return { label: 'Configuration', status: 'loading', detail: 'Loading…' };
  if (r.kind === 'failed') return { label: 'Configuration', status: 'failed', detail: 'Could not load' };
  const s = r.data.systemSettings.length;
  const k = r.data.activeKpiThresholds.length;
  if (s === 0 && k === 0)
    return { label: 'Configuration', status: 'not-wired', detail: 'No settings or thresholds configured' };
  return { label: 'Configuration', status: 'healthy', detail: `${s} settings · ${k} active KPI thresholds` };
}

// ---------------------------------------------------------------------------
// Status helpers
// ---------------------------------------------------------------------------

function statusRank(s: CategoryStatus): number {
  switch (s) {
    case 'critical':
      return 0;
    case 'warning':
      return 1;
    case 'failed':
      return 2;
    case 'loading':
      return 3;
    case 'not-wired':
      return 4;
    case 'healthy':
      return 5;
  }
}

function overallStatus(stats: CategoryStat[]): CategoryStatus {
  if (stats.some((s) => s.status === 'critical')) return 'critical';
  if (stats.some((s) => s.status === 'warning')) return 'warning';
  if (stats.some((s) => s.status === 'failed')) return 'failed';
  if (stats.every((s) => s.status === 'loading')) return 'loading';
  return 'healthy';
}

function severityForStatus(s: CategoryStatus): SeverityKey {
  if (s === 'critical' || s === 'failed') return 'blocked';
  if (s === 'warning') return 'atRisk';
  if (s === 'healthy') return 'clear';
  return 'neutral';
}

function accentForOverall(s: CategoryStatus): string {
  if (s === 'critical' || s === 'failed') return palette.blocked;
  if (s === 'warning') return palette.atRisk;
  if (s === 'healthy') return palette.clear;
  return palette.neutral;
}

function labelForStatus(s: CategoryStatus): string {
  switch (s) {
    case 'critical':
      return 'Critical';
    case 'warning':
      return 'Warning';
    case 'healthy':
      return 'Healthy';
    case 'not-wired':
      return 'Not wired';
    case 'loading':
      return 'Loading';
    case 'failed':
      return 'Load failed';
  }
}

const styles: Record<string, React.CSSProperties> = {
  list: adminStyles.list,
  row: {
    ...adminStyles.row,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  } as React.CSSProperties,
  rowLeft: { display: 'flex', alignItems: 'center', gap: spacing.sm },
  label: { fontSize: typography.size.base, fontWeight: typography.weight.medium, color: palette.text },
  detail: { fontSize: typography.size.sm, color: palette.textMuted },
};
