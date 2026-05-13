import { createContext, useContext, useEffect, useState } from 'react';
import { useTeam } from './TeamContext';
import {
  loadTeamDeals,
  loadTeamTasks,
  loadTeamDocuments,
  loadTeamMemos,
  type TeamDealRow,
  type TeamTaskRow,
  type TeamDocumentRow,
  type TeamMemoRow,
} from './teamQueries';

export type AsyncResult<T> =
  | { kind: 'loading' }
  | { kind: 'ready'; data: T }
  | { kind: 'failed'; message: string };

export interface TeamData {
  deals: AsyncResult<TeamDealRow[]>;
  tasks: AsyncResult<TeamTaskRow[]>;
  documents: AsyncResult<TeamDocumentRow[]>;
  memos: AsyncResult<TeamMemoRow[]>;
}

const TeamDataContext = createContext<TeamData | null>(null);

export function useTeamData(): TeamData {
  const ctx = useContext(TeamDataContext);
  if (!ctx) {
    throw new Error('useTeamData must be used inside <TeamDataProvider>.');
  }
  return ctx;
}

/**
 * Team-scoped data provider. Mounts only inside TeamProvider so the
 * team id is already authorized. Fires deals / tasks / documents in
 * parallel; all six team cards consume from one context — no duplicate
 * fetches and no per-card dealId props.
 */
export function TeamDataProvider({ children }: { children: React.ReactNode }) {
  const { teamId } = useTeam();
  const [deals, setDeals] = useState<AsyncResult<TeamDealRow[]>>({ kind: 'loading' });
  const [tasks, setTasks] = useState<AsyncResult<TeamTaskRow[]>>({ kind: 'loading' });
  const [documents, setDocuments] = useState<AsyncResult<TeamDocumentRow[]>>({ kind: 'loading' });
  const [memos, setMemos] = useState<AsyncResult<TeamMemoRow[]>>({ kind: 'loading' });

  useEffect(() => {
    let cancelled = false;
    setDeals({ kind: 'loading' });
    setTasks({ kind: 'loading' });
    setDocuments({ kind: 'loading' });
    setMemos({ kind: 'loading' });

    function bind<T>(setter: (r: AsyncResult<T>) => void, promise: Promise<T>): void {
      promise
        .then((data) => {
          if (!cancelled) setter({ kind: 'ready', data });
        })
        .catch((err: unknown) => {
          if (cancelled) return;
          const message = err instanceof Error ? err.message : String(err);
          setter({ kind: 'failed', message });
        });
    }

    bind(setDeals, loadTeamDeals(teamId));
    bind(setTasks, loadTeamTasks(teamId));
    bind(setDocuments, loadTeamDocuments(teamId));
    bind(setMemos, loadTeamMemos(teamId));

    return () => {
      cancelled = true;
    };
  }, [teamId]);

  return (
    <TeamDataContext.Provider value={{ deals, tasks, documents, memos }}>
      {children}
    </TeamDataContext.Provider>
  );
}
