import { useParams } from 'react-router-dom';
import { useBootstrap } from '../bootstrap/BootstrapContext';
import { WORKSPACE_ROUTES } from '../bootstrap/workspaceRoutes';
import { BankerProvider } from '../banker/BankerProvider';
import { BankerDealWorkspace } from './BankerDealWorkspace';
import { ManagerProvider } from '../manager/ManagerProvider';
import { ManagerDealWorkspace } from '../manager/ManagerDealWorkspace';
import { TeamProvider } from '../team/TeamProvider';
import { TeamDealWorkspace } from '../team/TeamDealWorkspace';
import { ErrorState } from '../shared/ErrorState';

/**
 * Deal route dispatcher. Branches on the user's resolved workspace and
 * wraps in the appropriate workspace-specific provider before any deal
 * query runs.
 *
 * Phase 4: banker context — full read/write deal workspace.
 * Phase 36: manager context — manager-team-scoped read-only deal
 * workspace (no writes; manager authorization via
 * loadDealForManager).
 * Phase 37: team context — team-scoped read-only deal workspace
 * (no writes; team authorization via loadDealForTeam).
 * Executive / admin remain intentionally unwired and see an explicit
 * denial. Executive must stay snapshot-only per the Phase-37 brief
 * guardrail; admin operational drill-through is a separate
 * governance decision.
 */
export function DealRoute() {
  const { route, workspaceName } = useBootstrap();
  const { dealId } = useParams<{ dealId: string }>();

  if (!dealId) {
    return (
      <ErrorState
        title="Invalid deal"
        detail="No deal id was provided in the URL."
        hint="Return to your workspace and open a deal from your pipeline."
      />
    );
  }

  if (route === WORKSPACE_ROUTES.banker) {
    return (
      <BankerProvider>
        <BankerDealWorkspace dealId={dealId} workspaceName={workspaceName} />
      </BankerProvider>
    );
  }

  if (route === WORKSPACE_ROUTES.manager) {
    return (
      <ManagerProvider>
        <ManagerDealWorkspace dealId={dealId} />
      </ManagerProvider>
    );
  }

  if (route === WORKSPACE_ROUTES.team) {
    return (
      <TeamProvider>
        <TeamDealWorkspace dealId={dealId} />
      </TeamProvider>
    );
  }

  return (
    <ErrorState
      title="Access denied"
      detail="Deal access from this workspace is not available yet."
      hint="Return to your workspace."
    />
  );
}
