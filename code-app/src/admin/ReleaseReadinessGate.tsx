import { useAdminData } from './AdminDataProvider';
import {
  deriveReleaseReadiness,
  type ReleaseCategoryRow,
  type ReleaseCategoryStatus,
} from '../shared/governance/releaseReadiness';
import { stageProgressionDiagnostics } from '../shared/governance/stageProgressionAvailability';
import {
  EXEC_TRANSITIONAL_FALLBACK_FEATURES,
  GOVERNED_WRITES,
  PERMISSION_BEFORE_QUERY_VERIFIED,
  WORKSPACE_ISOLATION_VERIFIED,
} from '../shared/governance/platformInventory';
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

// Phase 40: every non-runtime input above is now sourced from the
// shared platformInventory module so the docs, the test that pins
// known blockers, and this gate all read from one source of truth.
// The constants imported above were previously inline here — the
// rendered behavior is unchanged.
const GOVERNED_WRITES_SHIPPED: readonly { id: string; label: string }[] =
  GOVERNED_WRITES.map((w) => ({ id: w.id, label: w.label }));

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
