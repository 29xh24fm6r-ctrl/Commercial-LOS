import { useEffect, useState } from 'react';
import { Cr664_bankersService } from '../generated/services/Cr664_bankersService';
import { useBootstrap } from '../bootstrap/BootstrapContext';
import { BankerIdentityProvider, type BankerIdentity } from './BankerContext';
import { LoadingState } from '../shared/LoadingState';
import { ErrorState } from '../shared/ErrorState';

type State =
  | { kind: 'loading' }
  | { kind: 'ready'; identity: BankerIdentity }
  | { kind: 'not-banker' }
  | { kind: 'failed'; message: string };

function escapeOData(value: string): string {
  return value.replace(/'/g, "''");
}

/**
 * Resolves the cr664_Banker record for the current UPN before rendering
 * children. Pipeline + other banker features depend on bankerId, so this
 * runs before any data query — preserving the W1 permission-before-query
 * rule from SPEC.md.
 */
export function BankerProvider({ children }: { children: React.ReactNode }) {
  const { upn } = useBootstrap();
  const [state, setState] = useState<State>({ kind: 'loading' });

  useEffect(() => {
    let cancelled = false;
    Cr664_bankersService.getAll({
      filter: `cr664_email eq '${escapeOData(upn)}'`,
      top: 1,
    })
      .then((result) => {
        if (cancelled) return;
        const banker = result.data?.[0];
        if (!banker) {
          setState({ kind: 'not-banker' });
          return;
        }
        setState({
          kind: 'ready',
          identity: {
            bankerId: banker.cr664_bankerid,
            fullName: banker.cr664_fullname,
            email: banker.cr664_email ?? upn,
          },
        });
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
      return <LoadingState message="Loading your banker profile…" />;
    case 'not-banker':
      return (
        <ErrorState
          title="Banker profile missing"
          detail={`No cr664_Banker record is linked to ${upn}.`}
          hint="Ask an admin to create your banker profile before accessing the banker workspace."
        />
      );
    case 'failed':
      return (
        <ErrorState
          title="Could not load banker profile"
          detail={state.message}
          hint="Refresh to retry."
        />
      );
    case 'ready':
      return (
        <BankerIdentityProvider value={state.identity}>{children}</BankerIdentityProvider>
      );
  }
}
