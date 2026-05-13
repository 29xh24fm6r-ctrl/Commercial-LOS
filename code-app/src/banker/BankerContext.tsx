import { createContext, useContext } from 'react';

export interface BankerIdentity {
  bankerId: string;
  fullName: string;
  email: string;
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
