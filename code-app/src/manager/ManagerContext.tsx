import { createContext, useContext } from 'react';
import type { ManagerIdentity } from './managerQueries';

const ManagerContext = createContext<ManagerIdentity | null>(null);

export function ManagerIdentityProvider({
  value,
  children,
}: {
  value: ManagerIdentity;
  children: React.ReactNode;
}) {
  return <ManagerContext.Provider value={value}>{children}</ManagerContext.Provider>;
}

export function useManager(): ManagerIdentity {
  const ctx = useContext(ManagerContext);
  if (!ctx) {
    throw new Error('useManager must be used inside <ManagerProvider>.');
  }
  return ctx;
}
