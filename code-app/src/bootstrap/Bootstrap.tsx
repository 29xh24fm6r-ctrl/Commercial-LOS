import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { runBootstrap } from './bootstrapFlow';
import { NotProvisionedError, UnresolvedWorkspaceError } from './errors';
import { LoadingState } from '../shared/LoadingState';
import { ErrorState } from '../shared/ErrorState';

type Phase =
  | { kind: 'loading' }
  | { kind: 'not-provisioned'; upn: string }
  | { kind: 'unresolved'; workspaceName: string | undefined }
  | { kind: 'failed'; message: string };

export function Bootstrap() {
  const navigate = useNavigate();
  const [phase, setPhase] = useState<Phase>({ kind: 'loading' });

  useEffect(() => {
    let cancelled = false;
    runBootstrap()
      .then((result) => {
        if (!cancelled) navigate(result.route, { replace: true });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        if (err instanceof NotProvisionedError) {
          setPhase({ kind: 'not-provisioned', upn: err.upn });
        } else if (err instanceof UnresolvedWorkspaceError) {
          setPhase({ kind: 'unresolved', workspaceName: err.workspaceName });
        } else {
          const message = err instanceof Error ? err.message : String(err);
          setPhase({ kind: 'failed', message });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [navigate]);

  switch (phase.kind) {
    case 'loading':
      return <LoadingState message="Signing you in…" />;
    case 'not-provisioned':
      return (
        <ErrorState
          title="Access not provisioned"
          detail={`No LOS profile exists for ${phase.upn}.`}
          hint="Ask an admin to provision your platform profile and workspace entitlements."
        />
      );
    case 'unresolved':
      return (
        <ErrorState
          title="Workspace not recognized"
          detail={
            phase.workspaceName
              ? `Your assigned workspace "${phase.workspaceName}" is not a known landing target.`
              : 'No primary workspace is assigned to your profile.'
          }
          hint="Ask an admin to set your primary workspace or default entitlement."
        />
      );
    case 'failed':
      return (
        <ErrorState
          title="Sign-in failed"
          detail={phase.message}
          hint="Refresh to retry. If this keeps happening, contact your admin."
        />
      );
  }
}
