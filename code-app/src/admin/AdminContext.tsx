import { createContext, useContext } from 'react';

export interface AdminIdentity {
  upn: string;
  fullName: string;
  profileName: string;
  /** Entra Object ID for the authenticated user. */
  entraObjectId: string | undefined;
  /** Dataverse systemuserid resolved from entraObjectId. Undefined if
   *  the lookup failed or no systemuser exists for this Entra OID.
   *  When undefined, write actions must be disabled — they require
   *  this id for the audit-event ChangedBy lookup. */
  systemUserId: string | undefined;
  /** Reason systemUserId is undefined, surfaced to the UI so we don't
   *  silently hide write controls. */
  writeDisabledReason: string | undefined;
}

const AdminContext = createContext<AdminIdentity | null>(null);

export function AdminIdentityProvider({
  value,
  children,
}: {
  value: AdminIdentity;
  children: React.ReactNode;
}) {
  return <AdminContext.Provider value={value}>{children}</AdminContext.Provider>;
}

export function useAdmin(): AdminIdentity {
  const ctx = useContext(AdminContext);
  if (!ctx) {
    throw new Error('useAdmin must be used inside <AdminProvider>.');
  }
  return ctx;
}
