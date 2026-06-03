import { BankerProvider } from '../banker/BankerProvider';
import { BankerShell } from '../banker/BankerShell';
import { useBootstrap } from '../bootstrap/BootstrapContext';
import {
  deriveWorkspaceLinks,
  useEntitledRoutes,
} from '../bootstrap/workspaceEntitlements';
import { WORKSPACE_ROUTES } from '../bootstrap/workspaceRoutes';

/**
 * Phase 117: BankerWorkspace is the route entry point only. Identity
 * resolution lives in `BankerProvider`; UX shell + tabs + KPI grid
 * + right rail live in `BankerShell`. The split keeps the route file
 * to a single import + a single composition.
 *
 * Permission-before-render is preserved: `BankerProvider` blocks
 * rendering until a `cr664_Banker` row resolves against the
 * signed-in UPN. Read-only mode (no Dataverse systemuser provisioned)
 * is surfaced through the shell's header banner, not by silently
 * letting writes through.
 *
 * Phase 124C: surfaces the workspace switcher when the signed-in
 * user is entitled to additional workspaces beyond the
 * bootstrap-primary one (today: manager workspace when
 * `loadManagerIdentity` returns `kind: 'ready'`). Single-workspace
 * users continue to see the original static workspace pill.
 */
export function BankerWorkspace() {
  const bootstrap = useBootstrap();
  const entitled = useEntitledRoutes();
  // Phase 126C — surface the Portfolio Workspace switcher entry only
  // for bankers who are ALSO manager-entitled (the same Phase 124C
  // probe that already widens the gate for the manager route adds
  // the portfolio rendering option). Banker-only users never see it.
  const managerEntitled = entitled.routes.includes(WORKSPACE_ROUTES.manager);
  const workspaceLinks = deriveWorkspaceLinks({
    bootstrapRoute: bootstrap.route,
    currentRoute: WORKSPACE_ROUTES.banker,
    entitledRoutes: entitled.routes,
    includePortfolioSurface: managerEntitled,
  });
  return (
    <BankerProvider>
      <BankerShell
        workspaceName={bootstrap.workspaceName}
        workspaceLinks={workspaceLinks}
      />
    </BankerProvider>
  );
}
