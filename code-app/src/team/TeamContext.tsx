import { createContext, useContext } from 'react';
import type { TeamIdentity } from './teamQueries';

const TeamContext = createContext<TeamIdentity | null>(null);

export function TeamIdentityProvider({
  value,
  children,
}: {
  value: TeamIdentity;
  children: React.ReactNode;
}) {
  return <TeamContext.Provider value={value}>{children}</TeamContext.Provider>;
}

export function useTeam(): TeamIdentity {
  const ctx = useContext(TeamContext);
  if (!ctx) {
    throw new Error('useTeam must be used inside <TeamProvider>.');
  }
  return ctx;
}
