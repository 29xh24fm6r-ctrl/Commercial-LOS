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
  const workspaceLinks = deriveWorkspaceLinks({
    bootstrapRoute: bootstrap.route,
    currentRoute: WORKSPACE_ROUTES.banker,
    entitledRoutes: entitled.routes,
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
