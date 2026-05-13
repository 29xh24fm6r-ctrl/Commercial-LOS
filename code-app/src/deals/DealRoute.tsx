import { useParams } from 'react-router-dom';
import { useBootstrap } from '../bootstrap/BootstrapContext';
import { WORKSPACE_ROUTES } from '../bootstrap/workspaceRoutes';
import { BankerProvider } from '../banker/BankerProvider';
import { BankerDealWorkspace } from './BankerDealWorkspace';
import { ManagerProvider } from '../manager/ManagerProvider';
import { ManagerDealWorkspace } from '../manager/ManagerDealWorkspace';
import { ErrorState } from '../shared/ErrorState';

/**
 * Deal route dispatcher. Branches on the user's resolved workspace and
 * wraps in the appropriate workspace-specific provider before any deal
 * query runs.
 *
 * Phase 4: banker context — full read/write deal workspace.
 * Phase 36: manager context — manager-team-scoped read-only deal
 * workspace (no writes; manager authorization via
 * loadDealForManager). Other roles (team, executive, admin) remain
 * intentionally unwired; they see an explicit denial.
 */
export function DealRoute() {
  const { route } = useBootstrap();
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
        <BankerDealWorkspace dealId={dealId} />
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

  return (
    <ErrorState
      title="Access denied"
      detail="Deal access from this workspace is not available yet."
      hint="Return to your workspace."
    />
  );
}
