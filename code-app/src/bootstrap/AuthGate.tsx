import { useEffect, useState } from 'react';
import { Outlet } from 'react-router-dom';
import { runBootstrap } from './bootstrapFlow';
import type { BootstrapResult } from './bootstrapFlow';
import { NotProvisionedError, UnresolvedWorkspaceError } from './errors';
import { BootstrapProvider } from './BootstrapContext';
import { LoadingState } from '../shared/LoadingState';
import { ErrorState } from '../shared/ErrorState';
import { timed } from '../shared/observability/perfRegistry';

type GateState =
  | { kind: 'loading' }
  | { kind: 'ready'; result: BootstrapResult }
  | { kind: 'not-provisioned'; upn: string }
  | { kind: 'unresolved'; workspaceName: string | undefined }
  | { kind: 'failed'; message: string };

export function AuthGate() {
  const [state, setState] = useState<GateState>({ kind: 'loading' });

  useEffect(() => {
    let cancelled = false;
    timed('AuthGate', 'runBootstrap', () => runBootstrap())
      .then((result) => {
        if (!cancelled) setState({ kind: 'ready', result });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        if (err instanceof NotProvisionedError) {
          setState({ kind: 'not-provisioned', upn: err.upn });
        } else if (err instanceof UnresolvedWorkspaceError) {
          setState({ kind: 'unresolved', workspaceName: err.workspaceName });
        } else {
          const message = err instanceof Error ? err.message : String(err);
          setState({ kind: 'failed', message });
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  switch (state.kind) {
    case 'loading':
      return <LoadingState message="Signing you in…" />;
    case 'not-provisioned':
      return (
        <ErrorState
          title="Access not provisioned"
          detail={`No LOS profile exists for ${state.upn}.`}
          hint="Ask an admin to provision your platform profile and workspace entitlements."
        />
      );
    case 'unresolved':
      return (
        <ErrorState
          title="Workspace not recognized"
          detail={
            state.workspaceName
              ? `Your assigned workspace "${state.workspaceName}" is not a known landing target.`
              : 'No primary workspace is assigned to your profile.'
          }
          hint="Ask an admin to set your primary workspace or default entitlement."
        />
      );
    case 'failed':
      return (
        <ErrorState
          title="Sign-in failed"
          detail={state.message}
          hint="Refresh to retry. If this keeps happening, contact your admin."
        />
      );
    case 'ready':
      return (
        <BootstrapProvider value={state.result}>
          <Outlet />
        </BootstrapProvider>
      );
  }
}
