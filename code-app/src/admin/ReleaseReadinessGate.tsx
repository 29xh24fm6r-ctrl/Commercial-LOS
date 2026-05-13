import { useAdminData } from './AdminDataProvider';
import {
  deriveReleaseReadiness,
  type ReleaseCategoryRow,
  type ReleaseCategoryStatus,
} from '../shared/governance/releaseReadiness';
import { stageProgressionDiagnostics } from '../shared/governance/stageProgressionAvailability';
import { Card, CardHeader, CardFooter } from '../shared/Card';
import { Badge, StatusDot } from '../shared/Badge';
import { adminStyles } from './adminCardChrome';
import {
  palette,
  radius,
  spacing,
  typography,
  type SeverityKey,
} from '../shared/theme';

/**
 * Phase 30: read-only Release Readiness / Governance Gate.
 *
 * Aggregates the diagnostics observable from inside the app and shows
 * an honest gate. Per the brief guardrail, anything that cannot be
 * observed in-app — most importantly build/test status — is marked
 * Not Wired rather than assumed Ready. The card has no actions: no
 * promote button, no overrides, no remediation invocations.
 *
 * Static architectural inputs (workspace isolation,
 * permission-before-query, transitional executive fallback list, and
 * the governed-write inventory) are passed in from this file. Update
 * the constants below as those facts evolve. A future phase that adds
 * a runtime-observable test/build status feed can wire it through
 * deriveReleaseReadiness without touching the categories.
 */

// Static architectural invariants — verified by repository structure
// and routing wiring, captured here as the single point of truth for
// this gate. Flip via deliberate refactor only.
const WORKSPACE_ISOLATION_VERIFIED = true;
const PERMISSION_BEFORE_QUERY_VERIFIED = true;

// Executive surfaces still on transitional operational fallback (no
// snapshot entity in Dataverse yet). Update this list as snapshot
// entities ship.
const EXEC_TRANSITIONAL_FALLBACK_FEATURES: readonly string[] = [
  'PipelineByStage',
  'MonthlyClosingForecast',
];

// Governed writes shipped. Update this inventory whenever a new
// governed-write phase lands.
const GOVERNED_WRITES_SHIPPED: readonly { id: string; label: string }[] = [
  { id: 'data-quality-flag-resolve', label: 'Data Quality Flag resolve' },
  { id: 'alert-resolve', label: 'Alert resolve' },
  { id: 'alert-dismiss', label: 'Alert dismiss' },
  { id: 'deal-task-complete', label: 'Deal task complete' },
  { id: 'deal-document-request', label: 'Deal document request' },
  { id: 'credit-memo-draft-save', label: 'Credit memo draft save' },
];

export function ReleaseReadinessGate() {
  const { dataQuality, auditAnomalies, alerts, refreshStatus } = useAdminData();

  const dataQualityOpenCount =
    dataQuality.kind === 'ready' ? dataQuality.data.length : undefined;
  const auditAnomalyCount =
    auditAnomalies.kind === 'ready' ? auditAnomalies.data.length : undefined;
  const totalOpenAlerts = alerts.kind === 'ready' ? alerts.data.length : undefined;
  const criticalAlertCount =
    alerts.kind === 'ready'
      ? alerts.data.filter((a) => a.severityKey === 'Critical').length
      : undefined;
  const refreshStatusStaleFlag =
    refreshStatus.kind === 'ready'
      ? refreshStatus.data?.staleDataFlag ?? null
      : undefined;

  const readiness = deriveReleaseReadiness({
    stage: stageProgressionDiagnostics(),
    dataQualityOpenCount,
    auditAnomalyCount,
    criticalAlertCount,
    totalOpenAlerts,
    refreshStatusStaleFlag,
    execTransitionalFallbackFeatures: EXEC_TRANSITIONAL_FALLBACK_FEATURES,
    governedWritesShipped: GOVERNED_WRITES_SHIPPED,
    workspaceIsolationVerified: WORKSPACE_ISOLATION_VERIFIED,
    permissionBeforeQueryVerified: PERMISSION_BEFORE_QUERY_VERIFIED,
  });

  return (
    <Card>
      <CardHeader
        title="Release Readiness Gate"
        subtitle="Aggregated, derived-only governance signal across the platform."
        trailing={
          <Badge variant={statusToSeverity(readiness.overall)}>
            {overallLabel(readiness.overall)}
          </Badge>
        }
      />
      <ul style={adminStyles.list} aria-label="Release readiness categories">
        {readiness.sortedCategories.map((row) => (
          <CategoryRow key={row.id} row={row} />
        ))}
      </ul>
      <CardFooter>
        <span>
          Read-only governance gate. No promotion or remediation action is
          performed here.
        </span>
        <span>
          Anything not observable in-app is reported as Not Wired, not assumed
          Ready.
        </span>
      </CardFooter>
    </Card>
  );
}

function CategoryRow({ row }: { row: ReleaseCategoryRow }) {
  const sev = statusToSeverity(row.status);
  return (
    <li style={adminStyles.row}>
      <div style={adminStyles.rowHead}>
        <span style={adminStyles.rowTitle}>
          <StatusDot variant={sev} /> {row.label}
        </span>
        <Badge variant={sev} appearance="outline">
          {statusLabel(row.status)}
        </Badge>
      </div>
      <p style={styles.reason}>{row.reason}</p>
      <p style={styles.nextAction}>
        <span style={styles.nextActionLabel}>Next action: </span>
        {row.nextAction}
      </p>
    </li>
  );
}

function statusToSeverity(s: ReleaseCategoryStatus): SeverityKey {
  if (s === 'blocked') return 'blocked';
  if (s === 'needs-review') return 'atRisk';
  if (s === 'not-wired') return 'neutral';
  return 'clear';
}

function statusLabel(s: ReleaseCategoryStatus): string {
  if (s === 'blocked') return 'Blocked';
  if (s === 'needs-review') return 'Needs Review';
  if (s === 'not-wired') return 'Not Wired';
  return 'Ready';
}

function overallLabel(s: ReleaseCategoryStatus): string {
  if (s === 'blocked') return 'Not ready to promote — blockers open';
  if (s === 'needs-review') return 'Review required before promotion';
  if (s === 'not-wired') return 'Cannot fully verify — signals not wired';
  return 'Ready to promote';
}

const styles: Record<string, React.CSSProperties> = {
  reason: {
    margin: 0,
    paddingTop: 4,
    fontSize: typography.size.sm,
    color: palette.text,
    lineHeight: typography.lineHeight.snug,
  },
  nextAction: {
    margin: 0,
    paddingTop: 2,
    fontSize: typography.size.sm,
    color: palette.textMuted,
    lineHeight: typography.lineHeight.snug,
    background: palette.surface,
    borderTop: `1px dashed ${palette.divider}`,
    paddingLeft: spacing.xxs,
    paddingRight: spacing.xxs,
    paddingBottom: 4,
    borderRadius: radius.sm,
  },
  nextActionLabel: {
    fontSize: typography.size.xs,
    textTransform: 'uppercase',
    letterSpacing: typography.letterSpacing.label,
    color: palette.textSubtle,
    fontWeight: typography.weight.semibold,
  },
};
