import { useEffect, useState } from 'react';
import { useBootstrap } from '../bootstrap/BootstrapContext';
import { loadTeamIdentity, type TeamIdentity, type TeamIdentityResult } from './teamQueries';
import { TeamIdentityProvider } from './TeamContext';
import { LoadingState } from '../shared/LoadingState';
import { ErrorState } from '../shared/ErrorState';

type State =
  | { kind: 'loading' }
  | { kind: 'ready'; identity: TeamIdentity }
  | { kind: 'not-banker' }
  | { kind: 'no-team' }
  | { kind: 'failed'; message: string };

/**
 * Resolves the current user's banker record and team before rendering
 * any team-scoped child. Team Workspace explicitly scopes by Team
 * (cr664_Team). Two distinct unconfigured states per phase-16 brief:
 *   not-banker -> 'Team profile missing'
 *   no-team    -> 'Banker resolved, but no team relationship configured'
 *
 * Neither falls back to all deals.
 */
export function TeamProvider({ children }: { children: React.ReactNode }) {
  const { upn } = useBootstrap();
  const [state, setState] = useState<State>({ kind: 'loading' });

  useEffect(() => {
    let cancelled = false;
    setState({ kind: 'loading' });
    loadTeamIdentity(upn)
      .then((res: TeamIdentityResult) => {
        if (cancelled) return;
        if (res.kind === 'ready') setState({ kind: 'ready', identity: res.identity });
        else setState(res);
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
      return <LoadingState message="Loading your team profile…" />;
    case 'not-banker':
      return (
        <ErrorState
          title="Team profile missing"
          detail={`No cr664_Banker record is linked to ${upn}.`}
          hint="Ask an admin to create your banker profile and team assignment before accessing the team workspace."
        />
      );
    case 'no-team':
      return (
        <ErrorState
          title="No team relationship configured"
          detail="Your banker profile loaded, but it is not linked to a team."
          hint="Ask an admin to assign your banker profile to a team. The team workspace scopes data by team."
        />
      );
    case 'failed':
      return (
        <ErrorState
          title="Could not load team profile"
          detail={state.message}
          hint="Refresh to retry."
        />
      );
    case 'ready':
      return <TeamIdentityProvider value={state.identity}>{children}</TeamIdentityProvider>;
  }
}
