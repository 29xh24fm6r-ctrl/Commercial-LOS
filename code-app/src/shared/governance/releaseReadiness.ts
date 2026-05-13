import type {
  StageProgressionDiagnostics,
  DiagnosticSeverity,
} from './stageProgressionAvailability';

/**
 * Phase 30: read-only release readiness / governance gate.
 *
 * Pure function. Aggregates the diagnostics the app can ACTUALLY
 * observe and reports an honest gate. Per the brief guardrail:
 *
 *   "Do not make this a fake launch checklist. It must be computed
 *    from existing diagnostics/static known architecture flags.
 *    Anything not observable in-app must be marked Not Wired, not
 *    assumed Ready."
 *
 * Status order (max wins for overall rollup AND for display sort):
 *   blocked > needs-review > not-wired > ready
 *
 * That ordering is deliberate: "Not Wired" sorts ABOVE "Ready" so the
 * gate never reports green when a key signal cannot be observed.
 */

export type ReleaseCategoryStatus = 'ready' | 'needs-review' | 'blocked' | 'not-wired';

export interface ReleaseCategoryRow {
  id: string;
  label: string;
  status: ReleaseCategoryStatus;
  /** Short, factual reason for the current status. */
  reason: string;
  /** Process-language next action. Never a fix button label. */
  nextAction: string;
}

export interface ReleaseReadinessInput {
  /** Phase 29 stage governance shape — Blocked here means the
   *  Advance Stage write is gated by missing schema. */
  stage: StageProgressionDiagnostics;
  /** Phase 18 admin DQ flag count. undefined = still loading. */
  dataQualityOpenCount: number | undefined;
  /** Phase 17 audit anomaly count. undefined = still loading. */
  auditAnomalyCount: number | undefined;
  /** Count of open alerts whose severityKey === 'Critical'.
   *  undefined = still loading. */
  criticalAlertCount: number | undefined;
  /** Count of all open alerts (any severity). undefined = still loading. */
  totalOpenAlerts: number | undefined;
  /** cr664_profitabilityrefreshstatus.cr664_staledataflag. undefined =
   *  still loading; null = no refresh-status row exists at all. */
  refreshStatusStaleFlag: boolean | null | undefined;
  /** Executive cards still on transitional operational fallback
   *  (snapshot entities do not exist yet). Static, captured at app
   *  build time. Empty array = no remaining transitional fallback. */
  execTransitionalFallbackFeatures: readonly string[];
  /** Governed-write inventory shipped to date. Static, captured at app
   *  build time. Drives the coverage category. */
  governedWritesShipped: readonly { id: string; label: string }[];
  /** Static architectural invariants. These are properties of how the
   *  app is wired (sealed role modules, WorkspaceGate routing,
   *  permission-before-query providers). They flip via deliberate
   *  refactor only — passed in so the gate stays a pure function. */
  workspaceIsolationVerified: boolean;
  permissionBeforeQueryVerified: boolean;
}

export interface ReleaseReadinessResult {
  overall: ReleaseCategoryStatus;
  categories: readonly ReleaseCategoryRow[];
  /** Categories sorted for display:
   *  blocked -> needs-review -> not-wired -> ready. */
  sortedCategories: readonly ReleaseCategoryRow[];
}

const STATUS_RANK: Record<ReleaseCategoryStatus, number> = {
  blocked: 0,
  'needs-review': 1,
  'not-wired': 2,
  ready: 3,
};

function maxStatus(...statuses: ReleaseCategoryStatus[]): ReleaseCategoryStatus {
  return statuses.reduce<ReleaseCategoryStatus>(
    (acc, s) => (STATUS_RANK[s] < STATUS_RANK[acc] ? s : acc),
    'ready',
  );
}

function severityToStatus(s: DiagnosticSeverity): ReleaseCategoryStatus {
  if (s === 'blocked') return 'blocked';
  if (s === 'at-risk') return 'needs-review';
  return 'ready';
}

export function deriveReleaseReadiness(
  input: ReleaseReadinessInput,
): ReleaseReadinessResult {
  const rows: ReleaseCategoryRow[] = [];

  rows.push(workspaceIsolationRow(input));
  rows.push(permissionBeforeQueryRow(input));
  rows.push(executiveSnapshotSafetyRow(input));
  rows.push(adminDiagnosticsHealthRow(input));
  rows.push(governedWriteCoverageRow(input));
  rows.push(stageProgressionReadinessRow(input));
  rows.push(dataQualityAlertBacklogRow(input));
  rows.push(testCoverageBuildVerificationRow());

  const overall = maxStatus(...rows.map((r) => r.status));
  const sorted = [...rows].sort(
    (a, b) => STATUS_RANK[a.status] - STATUS_RANK[b.status],
  );

  return { overall, categories: rows, sortedCategories: sorted };
}

function workspaceIsolationRow(input: ReleaseReadinessInput): ReleaseCategoryRow {
  if (input.workspaceIsolationVerified) {
    return {
      id: 'workspace-isolation',
      label: 'Workspace isolation',
      status: 'ready',
      reason:
        'Sealed role-module discipline holds (admin / banker / manager / executive / team / deals). WorkspaceGate enforces routing for each role.',
      nextAction:
        'Maintain on every new role surface — pure shared utilities only, no cross-role component imports.',
    };
  }
  return {
    id: 'workspace-isolation',
    label: 'Workspace isolation',
    status: 'needs-review',
    reason: 'Workspace isolation invariant has not been re-verified for this build.',
    nextAction: 'Re-confirm sealed role-module discipline before promotion.',
  };
}

function permissionBeforeQueryRow(
  input: ReleaseReadinessInput,
): ReleaseCategoryRow {
  if (input.permissionBeforeQueryVerified) {
    return {
      id: 'permission-before-query',
      label: 'Permission-before-query architecture',
      status: 'ready',
      reason:
        'Every role provider authorizes the caller before issuing data queries (loadDealForBanker, loadTeamForManager, etc.). DealDataProvider mounts only after BankerDealWorkspace is in its ready state.',
      nextAction:
        'Keep the loadXForRole pattern as the only entry point when adding new role-scoped reads.',
    };
  }
  return {
    id: 'permission-before-query',
    label: 'Permission-before-query architecture',
    status: 'needs-review',
    reason:
      'Permission-before-query invariant has not been re-verified for this build.',
    nextAction:
      'Re-confirm that no role surface issues queries before its identity provider resolves.',
  };
}

function executiveSnapshotSafetyRow(
  input: ReleaseReadinessInput,
): ReleaseCategoryRow {
  // True blocker: latest snapshot row reports stale data.
  if (input.refreshStatusStaleFlag === true) {
    return {
      id: 'executive-snapshot-safety',
      label: 'Executive snapshot safety',
      status: 'blocked',
      reason:
        'Latest cr664_profitabilityrefreshstatus row reports staleDataFlag = true. Executive snapshot reads are not fresh.',
      nextAction:
        'Investigate the refresh pipeline before promoting; do not let executive surfaces render stale official numbers.',
    };
  }
  if (input.refreshStatusStaleFlag === undefined) {
    return {
      id: 'executive-snapshot-safety',
      label: 'Executive snapshot safety',
      status: 'not-wired',
      reason: 'Refresh-status query is still loading; freshness cannot yet be observed.',
      nextAction: 'Re-check once the admin diagnostics queries finish loading.',
    };
  }
  if (input.execTransitionalFallbackFeatures.length > 0) {
    const list = input.execTransitionalFallbackFeatures.join(', ');
    return {
      id: 'executive-snapshot-safety',
      label: 'Executive snapshot safety',
      status: 'needs-review',
      reason: `Transitional operational fallback still in use for: ${list}. Snapshot entities for these surfaces do not exist yet.`,
      nextAction:
        'Promote each transitional surface to a governed snapshot read before final launch.',
    };
  }
  return {
    id: 'executive-snapshot-safety',
    label: 'Executive snapshot safety',
    status: 'ready',
    reason:
      'Latest snapshot row reports fresh data and no executive surface is on transitional fallback.',
    nextAction:
      'Continue monitoring refresh-status cadence — fresh today does not imply fresh tomorrow.',
  };
}

function adminDiagnosticsHealthRow(
  input: ReleaseReadinessInput,
): ReleaseCategoryRow {
  // If any of the core admin counts is undefined the diagnostics
  // haven't finished loading; we cannot honestly call this Ready.
  if (
    input.dataQualityOpenCount === undefined ||
    input.auditAnomalyCount === undefined ||
    input.totalOpenAlerts === undefined ||
    input.criticalAlertCount === undefined
  ) {
    return {
      id: 'admin-diagnostics-health',
      label: 'Admin diagnostics health',
      status: 'not-wired',
      reason:
        'One or more admin diagnostic queries are still loading; the full health picture is not yet observable.',
      nextAction:
        'Re-check once Data Quality, Audit Anomalies, and Alert Backlog cards finish loading.',
    };
  }
  return {
    id: 'admin-diagnostics-health',
    label: 'Admin diagnostics health',
    status: 'ready',
    reason: `Admin diagnostic queries all loaded (DQ flags ${input.dataQualityOpenCount}, audit anomalies ${input.auditAnomalyCount}, open alerts ${input.totalOpenAlerts}).`,
    nextAction:
      'Triage the open items via their respective admin cards. Counts surfaced here do not constitute promotion blockers on their own.',
  };
}

function governedWriteCoverageRow(
  input: ReleaseReadinessInput,
): ReleaseCategoryRow {
  const n = input.governedWritesShipped.length;
  if (n === 0) {
    return {
      id: 'governed-write-coverage',
      label: 'Governed write coverage',
      status: 'blocked',
      reason: 'No governed writes are wired yet.',
      nextAction:
        'Implement at least one governed write following the audit + timeline + correlation-id coordination pattern.',
    };
  }
  // 5 writes is the current Phase-18..25 shipping baseline. Surface
  // the count factually rather than gating on an arbitrary threshold.
  const names = input.governedWritesShipped.map((w) => w.label).join(', ');
  return {
    id: 'governed-write-coverage',
    label: 'Governed write coverage',
    status: 'ready',
    reason: `${n} governed write${n === 1 ? '' : 's'} shipped (${names}). Each follows the established audit + timeline + correlation-id coordination pattern.`,
    nextAction:
      'Continue adding write surfaces with the same coordination pattern. Do not bypass the established outcome union.',
  };
}

function stageProgressionReadinessRow(
  input: ReleaseReadinessInput,
): ReleaseCategoryRow {
  const status = severityToStatus(input.stage.overallSeverity);
  if (status === 'blocked') {
    return {
      id: 'stage-progression-readiness',
      label: 'Stage progression readiness',
      status: 'blocked',
      reason: `Stage progression write is gated by the schema. ${input.stage.checks
        .filter((c) => c.severity === 'blocked')
        .map((c) => c.label)
        .join(' and ')} are missing.`,
      nextAction:
        'Follow the Stage Governance Diagnostics remediation list. Phase 28 stays blocked until the schema gap is closed.',
    };
  }
  if (status === 'needs-review') {
    return {
      id: 'stage-progression-readiness',
      label: 'Stage progression readiness',
      status: 'needs-review',
      reason:
        'Stage governance diagnostics report at-risk conditions short of a hard block.',
      nextAction:
        'Resolve the at-risk checks before promotion.',
    };
  }
  return {
    id: 'stage-progression-readiness',
    label: 'Stage progression readiness',
    status: 'ready',
    reason:
      'Stage governance diagnostics report no blockers. Stage progression write is available.',
    nextAction:
      'Maintain the diagnostic checks as the schema evolves; re-run after any change to the stage reference table.',
  };
}

function dataQualityAlertBacklogRow(
  input: ReleaseReadinessInput,
): ReleaseCategoryRow {
  if (
    input.criticalAlertCount === undefined ||
    input.dataQualityOpenCount === undefined ||
    input.auditAnomalyCount === undefined
  ) {
    return {
      id: 'data-quality-alert-backlog',
      label: 'Data quality / alert backlog',
      status: 'not-wired',
      reason:
        'Backlog signals are still loading; counts cannot yet be observed.',
      nextAction:
        'Re-check once the admin queries finish loading.',
    };
  }
  if (input.criticalAlertCount > 0) {
    return {
      id: 'data-quality-alert-backlog',
      label: 'Data quality / alert backlog',
      status: 'blocked',
      reason: `${input.criticalAlertCount} critical alert${input.criticalAlertCount === 1 ? '' : 's'} are currently unresolved.`,
      nextAction:
        'Resolve or dismiss every Critical-severity alert before promoting. Use the Alert Backlog card to action them.',
    };
  }
  if (input.dataQualityOpenCount > 0 || input.auditAnomalyCount > 0) {
    const bits: string[] = [];
    if (input.dataQualityOpenCount > 0) {
      bits.push(`${input.dataQualityOpenCount} open data quality flag${input.dataQualityOpenCount === 1 ? '' : 's'}`);
    }
    if (input.auditAnomalyCount > 0) {
      bits.push(`${input.auditAnomalyCount} audit anomal${input.auditAnomalyCount === 1 ? 'y' : 'ies'}`);
    }
    return {
      id: 'data-quality-alert-backlog',
      label: 'Data quality / alert backlog',
      status: 'needs-review',
      reason: `${bits.join(' and ')} still open.`,
      nextAction:
        'Triage via the Data Quality Flags and Audit Anomalies cards. Resolve or document each before promotion.',
    };
  }
  return {
    id: 'data-quality-alert-backlog',
    label: 'Data quality / alert backlog',
    status: 'ready',
    reason:
      'No critical alerts, no open data quality flags, and no audit anomalies observed at this time.',
    nextAction: 'Continue monitoring via the existing admin diagnostics cards.',
  };
}

function testCoverageBuildVerificationRow(): ReleaseCategoryRow {
  // The brief is explicit: do not pretend to know test/build status.
  // The app has no runtime hook into CI or the local build. This row
  // therefore stays "not-wired" until that observability lands.
  return {
    id: 'test-coverage-build-verification',
    label: 'Test coverage / build verification',
    status: 'not-wired',
    reason:
      'The app has no in-process signal for npm run build or npm test results. Build/test verification is performed out-of-band by CI and is not observable from this dashboard.',
    nextAction:
      'Confirm `npm run build` clean and the full test suite green via CI before promoting. Wire a build/test status feed into this row only when a governed data source exists.',
  };
}
