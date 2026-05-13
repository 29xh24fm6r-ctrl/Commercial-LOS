import { useEffect, useState } from 'react';
import { useBootstrap } from '../bootstrap/BootstrapContext';
import { AdminIdentityProvider, type AdminIdentity } from './AdminContext';
import { resolveCurrentSystemUserId } from './currentUserLookup';
import { LoadingState } from '../shared/LoadingState';

type State =
  | { kind: 'loading' }
  | { kind: 'ready'; identity: AdminIdentity };

/**
 * Admin identity resolver. Bootstrap routing already confirmed the
 * current user belongs to /workspaces/admin. AdminProvider extends
 * that by attempting to resolve the user's Dataverse systemuserid —
 * needed for any write that includes the cr664_AuditEvent ChangedBy
 * lookup (which is required on Base).
 *
 * If systemuserid lookup fails or returns no match, the workspace
 * still renders read-only diagnostics; write actions are hidden with
 * an explicit reason on AdminIdentity.writeDisabledReason. The whole
 * admin workspace does not block — that would punish admins for the
 * dev-mock case or a missing user provisioning.
 *
 * src/admin/ stays sealed: no imports from other role modules.
 */
export function AdminProvider({ children }: { children: React.ReactNode }) {
  const bootstrap = useBootstrap();
  const [state, setState] = useState<State>({ kind: 'loading' });

  useEffect(() => {
    let cancelled = false;
    setState({ kind: 'loading' });

    resolveCurrentSystemUserId(bootstrap.entraObjectId)
      .then((systemUserId) => {
        if (cancelled) return;
        const writeDisabledReason = !bootstrap.entraObjectId
          ? 'No Entra object id available from sign-in context.'
          : systemUserId
            ? undefined
            : 'No Dataverse systemuser is provisioned for the current Entra identity. Ask an admin to provision your account.';
        setState({
          kind: 'ready',
          identity: {
            upn: bootstrap.upn,
            fullName: bootstrap.fullName,
            profileName: bootstrap.profileName,
            entraObjectId: bootstrap.entraObjectId,
            systemUserId: systemUserId ?? undefined,
            writeDisabledReason,
          },
        });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        // Lookup itself failed (network/permission). Render workspace
        // read-only with an explicit reason.
        const message = err instanceof Error ? err.message : String(err);
        setState({
          kind: 'ready',
          identity: {
            upn: bootstrap.upn,
            fullName: bootstrap.fullName,
            profileName: bootstrap.profileName,
            entraObjectId: bootstrap.entraObjectId,
            systemUserId: undefined,
            writeDisabledReason: `Could not resolve current user (${message}).`,
          },
        });
      });

    return () => {
      cancelled = true;
    };
  }, [bootstrap.entraObjectId, bootstrap.upn, bootstrap.fullName, bootstrap.profileName]);

  if (state.kind === 'loading') {
    return <LoadingState message="Loading admin profile…" />;
  }
  return (
    <AdminIdentityProvider value={state.identity}>{children}</AdminIdentityProvider>
  );
}
