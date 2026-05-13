import { createContext, useContext } from 'react';
import type { BootstrapResult } from './bootstrapFlow';

const BootstrapContext = createContext<BootstrapResult | null>(null);

export function BootstrapProvider({
  value,
  children,
}: {
  value: BootstrapResult;
  children: React.ReactNode;
}) {
  return <BootstrapContext.Provider value={value}>{children}</BootstrapContext.Provider>;
}

export function useBootstrap(): BootstrapResult {
  const ctx = useContext(BootstrapContext);
  if (!ctx) {
    throw new Error('useBootstrap must be used inside <AuthGate>.');
  }
  return ctx;
}
