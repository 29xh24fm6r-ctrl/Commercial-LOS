import { useEffect, useState } from 'react';
import { useBootstrap } from '../bootstrap/BootstrapContext';
import {
  loadManagerIdentity,
  type ManagerIdentity,
  type ManagerIdentityResult,
} from './managerQueries';
import { ManagerIdentityProvider } from './ManagerContext';
import { LoadingState } from '../shared/LoadingState';
import { ErrorState } from '../shared/ErrorState';

type State =
  | { kind: 'loading' }
  | { kind: 'ready'; identity: ManagerIdentity }
  | { kind: 'not-banker' }
  | { kind: 'no-team' }
  | { kind: 'failed'; message: string };

/**
 * Resolves the cr664_Banker + cr664_Team for the current UPN before
 * rendering manager-scoped children. The Manager Workspace explicitly
 * scopes its data by Team — see managerQueries.ts for the schema
 * decision behind that.
 *
 * Two failure modes have their own dedicated UI per phase-14 guardrail:
 *   not-banker -> "Manager profile missing"
 *   no-team    -> "Manager profile resolved, but no team relationship
 *                  configured"
 *
 * Both are honest about WHY no data is shown rather than rendering
 * an empty dashboard.
 */
export function ManagerProvider({ children }: { children: React.ReactNode }) {
  const { upn } = useBootstrap();
  const [state, setState] = useState<State>({ kind: 'loading' });

  useEffect(() => {
    let cancelled = false;
    setState({ kind: 'loading' });
    loadManagerIdentity(upn)
      .then((res: ManagerIdentityResult) => {
        if (cancelled) return;
        if (res.kind === 'ready') {
          setState({ kind: 'ready', identity: res.identity });
        } else {
          setState(res);
        }
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : String(err);
        setState({ kind: 'failed', message });
      });
    return () => {
      cancelled = true;
    };
  }, [upn]);

  switch (state.kind) {
    case 'loading':
      return <LoadingState message="Loading your manager profile…" />;
    case 'not-banker':
      return (
        <ErrorState
          title="Manager profile missing"
          detail={`No cr664_Banker record is linked to ${upn}.`}
          hint="Ask an admin to create your banker profile and team assignment before accessing the manager workspace."
        />
      );
    case 'no-team':
      return (
        <ErrorState
          title="No team relationship configured"
          detail="Your banker profile loaded, but it is not linked to a team."
          hint="Ask an admin to assign your banker profile to a team. The manager workspace scopes data by team."
        />
      );
    case 'failed':
      return (
        <ErrorState
          title="Could not load manager profile"
          detail={state.message}
          hint="Refresh to retry."
        />
      );
    case 'ready':
      return (
        <ManagerIdentityProvider value={state.identity}>{children}</ManagerIdentityProvider>
      );
  }
}
