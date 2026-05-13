import { createContext, useContext } from 'react';

export interface AdminIdentity {
  upn: string;
  fullName: string;
  profileName: string;
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
