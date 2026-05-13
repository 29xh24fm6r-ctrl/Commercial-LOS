import { useParams } from 'react-router-dom';
import { useBootstrap } from '../bootstrap/BootstrapContext';
import { WORKSPACE_ROUTES } from '../bootstrap/workspaceRoutes';
import { BankerProvider } from '../banker/BankerProvider';
import { BankerDealWorkspace } from './BankerDealWorkspace';
import { ErrorState } from '../shared/ErrorState';

/**
 * Deal route dispatcher. Branches on the user's resolved workspace and
 * wraps in the appropriate workspace-specific provider before any deal
 * query runs. Only banker context is supported in phase 4; other roles
 * (manager, team, executive, admin) see an explicit denial until their
 * deal-access flows are designed.
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

  return (
    <ErrorState
      title="Access denied"
      detail="Deal access from this workspace is not available yet."
      hint="Return to your workspace."
    />
  );
}
