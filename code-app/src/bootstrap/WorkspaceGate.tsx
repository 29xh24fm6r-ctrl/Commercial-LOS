import { Navigate } from 'react-router-dom';
import { useBootstrap } from './BootstrapContext';
import { useEntitledRoutes } from './workspaceEntitlements';
import { LoadingState } from '../shared/LoadingState';

interface WorkspaceGateProps {
  /** Path of the workspace this gate protects, e.g. "/workspaces/banker". */
  allowed: string;
  children: React.ReactNode;
}

/**
 * Hard execution boundary per spec W3: a user can only render workspaces
 * they are authorized for. Phase 124C widens the original
 * "bootstrap-resolved primary route only" rule to also admit
 * **additional entitled routes** surfaced by `useEntitledRoutes()`
 * (today: manager workspace when `loadManagerIdentity` returns
 * `kind: 'ready'`). Bouncing still applies when the requested
 * workspace is neither the primary route nor an entitled additional
 * route — the gate never leaks an unauthorized workspace.
 *
 * While the entitlement probe is in flight the gate renders the
 * loading state instead of bouncing, so an entitled user does not
 * get bounced back to their primary route in the moment between
 * router mount and entitlement resolve.
 */
export function WorkspaceGate({ allowed, children }: WorkspaceGateProps) {
  const { route } = useBootstrap();
  // Hooks must run unconditionally. The entitlement probe is
  // cheap (one Dataverse row by upn, cached at module level) so
  // calling it on every workspace navigation is fine.
  const entitled = useEntitledRoutes();
  // Fast path: bootstrap-primary route always renders.
  if (route === allowed) {
    return <>{children}</>;
  }
  if (entitled.kind === 'loading') {
    return <LoadingState message="Resolving workspace entitlements…" />;
  }
  if (entitled.routes.includes(allowed)) {
    return <>{children}</>;
  }
  return <Navigate to={route} replace />;
}
