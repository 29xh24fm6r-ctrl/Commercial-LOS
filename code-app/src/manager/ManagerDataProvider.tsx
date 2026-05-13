import { createContext, useContext, useEffect, useState } from 'react';
import { useManager } from './ManagerContext';
import {
  loadTeamPipeline,
  loadTeamBankers,
  type TeamDeal,
  type TeamBanker,
} from './managerQueries';

export type AsyncResult<T> =
  | { kind: 'loading' }
  | { kind: 'ready'; data: T }
  | { kind: 'failed'; message: string };

export interface ManagerData {
  teamPipeline: AsyncResult<TeamDeal[]>;
  teamBankers: AsyncResult<TeamBanker[]>;
}

const ManagerDataContext = createContext<ManagerData | null>(null);

export function useManagerData(): ManagerData {
  const ctx = useContext(ManagerDataContext);
  if (!ctx) {
    throw new Error('useManagerData must be used inside <ManagerDataProvider>.');
  }
  return ctx;
}

/**
 * Manager-scoped data provider. Mounts only inside ManagerProvider,
 * so the team id is already authorized for the current user. Fires
 * team-pipeline and team-bankers queries in parallel; all manager
 * cards consume the result — no duplicate fetches.
 */
export function ManagerDataProvider({ children }: { children: React.ReactNode }) {
  const { teamId } = useManager();
  const [teamPipeline, setTeamPipeline] = useState<AsyncResult<TeamDeal[]>>({
    kind: 'loading',
  });
  const [teamBankers, setTeamBankers] = useState<AsyncResult<TeamBanker[]>>({
    kind: 'loading',
  });

  useEffect(() => {
    let cancelled = false;
    setTeamPipeline({ kind: 'loading' });
    setTeamBankers({ kind: 'loading' });

    loadTeamPipeline(teamId)
      .then((data) => {
        if (!cancelled) setTeamPipeline({ kind: 'ready', data });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : String(err);
        setTeamPipeline({ kind: 'failed', message });
      });

    loadTeamBankers(teamId)
      .then((data) => {
        if (!cancelled) setTeamBankers({ kind: 'ready', data });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : String(err);
        setTeamBankers({ kind: 'failed', message });
      });

    return () => {
      cancelled = true;
    };
  }, [teamId]);

  return (
    <ManagerDataContext.Provider value={{ teamPipeline, teamBankers }}>
      {children}
    </ManagerDataContext.Provider>
  );
}
