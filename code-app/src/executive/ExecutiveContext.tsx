import { createContext, useContext } from 'react';

export interface ExecutiveIdentity {
  upn: string;
  fullName: string;
  profileName: string;
}

const ExecutiveContext = createContext<ExecutiveIdentity | null>(null);

export function ExecutiveIdentityProvider({
  value,
  children,
}: {
  value: ExecutiveIdentity;
  children: React.ReactNode;
}) {
  return <ExecutiveContext.Provider value={value}>{children}</ExecutiveContext.Provider>;
}

export function useExecutive(): ExecutiveIdentity {
  const ctx = useContext(ExecutiveContext);
  if (!ctx) {
    throw new Error('useExecutive must be used inside <ExecutiveProvider>.');
  }
  return ctx;
}
