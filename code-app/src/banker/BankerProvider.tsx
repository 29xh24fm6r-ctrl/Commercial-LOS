import { useEffect, useState } from 'react';
import { Cr664_bankersService } from '../generated/services/Cr664_bankersService';
import type { Cr664_bankers } from '../generated/models/Cr664_bankersModel';
import { useBootstrap } from '../bootstrap/BootstrapContext';
import { resolveCurrentSystemUserId } from '../shared/governance/currentUserLookup';
import { BankerIdentityProvider, type BankerIdentity } from './BankerContext';
import type { BankerCreditAuthorityFields } from './bankerCreditAuthorityFields';
import { LoadingState } from '../shared/LoadingState';
import { ErrorState } from '../shared/ErrorState';
import { mapBusinessSafeReadError } from '../shared/errors/businessSafeErrorMapping';

type State =
  | { kind: 'loading' }
  | { kind: 'ready'; identity: BankerIdentity }
  | { kind: 'not-banker' }
  | { kind: 'failed'; message: string };

function escapeOData(value: string): string {
  return value.replace(/'/g, "''");
}

/**
 * Resolves the cr664_Banker record AND the current Dataverse
 * systemuserid before rendering children. Two parallel lookups:
 *   - cr664_Banker by email (UPN)               -> bankerId
 *   - systemusers by azureactivedirectoryobjectid -> systemUserId
 *
 * The systemUserId lookup is best-effort: if it fails (or returns no
 * match), the workspace still renders read-only with
 * BankerIdentity.writeDisabledReason populated. Banker reads are
 * unaffected by systemuser availability.
 *
 * If the cr664_Banker record itself is missing, this is a hard
 * 'not-banker' state — the banker workspace cannot render usefully
 * without it.
 */
export function BankerProvider({ children }: { children: React.ReactNode }) {
  const bootstrap = useBootstrap();
  const [state, setState] = useState<State>({ kind: 'loading' });

  useEffect(() => {
    let cancelled = false;
    setState({ kind: 'loading' });

    const bankerLookup = Cr664_bankersService.getAll({
      filter: `cr664_email eq '${escapeOData(bootstrap.upn)}'`,
      top: 1,
    });
    const systemUserLookup = resolveCurrentSystemUserId(bootstrap.entraObjectId).catch(
      (err: unknown) => {
        // Lookup error -> treat as "not resolvable" but record reason.
        // We never want the systemuser query to fail the workspace.
        const raw = err instanceof Error ? err.message : String(err);
        // Final LOS Completion arc (146 Factory arc, Workstream 146-G) — this reason feeds
        // writeDisabledReason, rendered verbatim in a "Save disabled: {reason}" banner across
        // many panels (e.g. CreditMemo.tsx); never surface a raw transport error there.
        return { _error: mapBusinessSafeReadError(raw).safeMessage } as const;
      },
    );

    Promise.all([bankerLookup, systemUserLookup])
      .then(([bankerResult, systemUser]) => {
        if (cancelled) return;
        // Cast: the credit-authority fields exist live but are not yet in the generated model —
        // see bankerCreditAuthorityFields.ts for why this is a deliberate, documented stopgap.
        const banker = bankerResult.data?.[0] as (Cr664_bankers & BankerCreditAuthorityFields) | undefined;
        if (!banker) {
          setState({ kind: 'not-banker' });
          return;
        }
        const systemUserId =
          typeof systemUser === 'string' ? systemUser : systemUser === null ? undefined : undefined;
        const lookupError =
          systemUser && typeof systemUser === 'object' && '_error' in systemUser
            ? systemUser._error
            : undefined;
        const writeDisabledReason = !bootstrap.entraObjectId
          ? 'No Entra object id available from sign-in context.'
          : lookupError
            ? `Could not resolve current user (${lookupError}).`
            : !systemUserId
              ? 'No Dataverse systemuser is provisioned for the current Entra identity.'
              : undefined;
        setState({
          kind: 'ready',
          identity: {
            bankerId: banker.cr664_bankerid,
            fullName: banker.cr664_fullname,
            email: banker.cr664_email ?? bootstrap.upn,
            systemUserId,
            writeDisabledReason,
            roleType: banker.cr664_roletypename,
            creditAuthority: {
              approvalLimit: banker.cr664_approvallimit,
              creditCommitteeMember: banker.cr664_creditcommitteemember,
              approvalOverrideAuthority: banker.cr664_approvaloverrideauthority,
            },
          },
        });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const raw = err instanceof Error ? err.message : String(err);
        // Final LOS Completion arc (146 Factory arc, Workstream 146-G) — the whole-workspace
        // failure gate (ErrorState below); never a raw transport error.
        setState({ kind: 'failed', message: mapBusinessSafeReadError(raw).safeMessage });
      });
    return () => {
      cancelled = true;
    };
  }, [bootstrap.upn, bootstrap.entraObjectId]);

  switch (state.kind) {
    case 'loading':
      return <LoadingState message="Loading your banker profile…" />;
    case 'not-banker':
      return (
        <ErrorState
          title="Banker profile missing"
          detail={`No cr664_Banker record is linked to ${bootstrap.upn}.`}
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
