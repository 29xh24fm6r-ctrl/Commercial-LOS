import { createContext, useContext } from 'react';

export interface BankerIdentity {
  bankerId: string;
  fullName: string;
  email: string;
  /** Dataverse systemuserid resolved from the current Entra OID. Used
   *  by governed writes (audit/timeline events require a ChangedBy /
   *  EventBy lookup to systemuser). Undefined when the lookup fails or
   *  returns no match — UI must disable write actions in that case. */
  systemUserId: string | undefined;
  /** Reason systemUserId is undefined, surfaced so write UIs can
   *  explain why their controls are disabled. */
  writeDisabledReason: string | undefined;
}

const BankerContext = createContext<BankerIdentity | null>(null);

export function BankerIdentityProvider({
  value,
  children,
}: {
  value: BankerIdentity;
  children: React.ReactNode;
}) {
  return <BankerContext.Provider value={value}>{children}</BankerContext.Provider>;
}

export function useBanker(): BankerIdentity {
  const ctx = useContext(BankerContext);
  if (!ctx) {
    throw new Error('useBanker must be used inside <BankerProvider>.');
  }
  return ctx;
}

/**
 * Phase 36: returns the banker identity when one is mounted, or null
 * when it isn't (e.g. inside ManagerDealWorkspace's read-only path).
 *
 * Deal-workspace cards that may be rendered under either role
 * (DealTasks / DealDocuments / CreditMemo / BorrowerCommunication)
 * use this instead of useBanker so they can short-circuit their
 * write surfaces in read-only manager mode.
 */
export function useOptionalBanker(): BankerIdentity | null {
  return useContext(BankerContext);
}
