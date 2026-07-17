import { useAdminData } from './AdminDataProvider';
import { OperatorLaunchConsole } from '../access/OperatorLaunchConsole';
import { adminStyles } from './adminCardChrome';
import { Card, CardHeader } from '../shared/Card';

/**
 * Factory Arc Phase 4 — Platform Operations Workspace.
 *
 * The admin-only surface for the 12 capabilities the phase asks operators to
 * inspect (runtime flag, route/DI wiring, actor-authorization requirement,
 * audit-sink state, latest smoke evidence, latest successful/failed write,
 * deployment commit, enabled-by/-on, rollback). Reuses the existing
 * observe-only OperatorLaunchConsole (Phase 210) — this wrapper only supplies
 * its live data via useAdminData().platformOperations and handles the async
 * loading/error states; it performs no write of its own.
 *
 * Gated identically to every other panel in AdminWorkspaceContent: the route
 * is only reachable after WorkspaceGate + adminWorkspaceEntitlementQuery.ts's
 * live, fail-closed Dataverse entitlement check — bankers are redirected away
 * before this component (or its data) ever mounts, not merely hidden by CSS.
 */
export function PlatformOperationsWorkspacePanel() {
  const { platformOperations } = useAdminData();

  if (platformOperations.kind === 'loading') {
    return (
      <Card>
        <CardHeader title="Platform Operations" subtitle="Runtime capability, wiring, and audit posture." />
        <p style={adminStyles.muted}>Loading platform operations…</p>
      </Card>
    );
  }
  if (platformOperations.kind === 'failed') {
    return (
      <Card>
        <CardHeader title="Platform Operations" subtitle="Runtime capability, wiring, and audit posture." />
        <div style={adminStyles.errorBox} role="alert">
          <div style={adminStyles.errorTitle}>Could not load platform operations</div>
          <div style={adminStyles.errorDetail}>{platformOperations.message}</div>
          <div style={adminStyles.errorHint}>Refresh to retry.</div>
        </div>
      </Card>
    );
  }

  return <OperatorLaunchConsole input={platformOperations.data} />;
}
