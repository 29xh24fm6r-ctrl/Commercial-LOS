import { createContext, useContext, useEffect, useState } from 'react';
import { useManager } from './ManagerContext';
import {
  loadTeamPipeline,
  loadTeamBankers,
  loadManagerTeamTasks,
  loadManagerTeamDocuments,
  loadManagerTeamMemos,
  loadManagerTeamMemoSections,
  type TeamDeal,
  type TeamBanker,
  type TeamScopedTask,
  type TeamScopedDocument,
  type TeamScopedMemo,
  type TeamScopedMemoSection,
} from './managerQueries';

export type AsyncResult<T> =
  | { kind: 'loading' }
  | { kind: 'ready'; data: T }
  | { kind: 'failed'; message: string };

export interface ManagerData {
  teamPipeline: AsyncResult<TeamDeal[]>;
  teamBankers: AsyncResult<TeamBanker[]>;
  /** Phase 87 — manager-authorized child data scoped by the manager's
   *  team. Drives the Phase 87 broadening of ManagerAutopilotRollup
   *  signal coverage from 4-of-8 to 7-of-8 signals. Existing manager
   *  cards (TeamPipelineSummary / TeamWorkQueue / DealsByStage /
   *  ClosingForecast / AtRiskBlockedDeals / ActivitySummary /
   *  BankerWorkloadSummary) do not consume these slots; only the
   *  rollup does. */
  teamTasks: AsyncResult<TeamScopedTask[]>;
  teamDocuments: AsyncResult<TeamScopedDocument[]>;
  teamMemos: AsyncResult<TeamScopedMemo[]>;
  /** Phase 95 — per-deal credit memo draft sections across the
   *  manager's team. Used by the rollup + morning-catch-up cards to
   *  run the Phase 73 consistency check and emit the
   *  memo-consistency-findings signal. Loaded in parallel with the
   *  other Phase 87 child slots. */
  teamMemoSections: AsyncResult<TeamScopedMemoSection[]>;
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
 * so the team id is already authorized for the current user.
 *
 * Fires team-pipeline, team-bankers (Phase 14), and the three Phase 87
 * child-data loaders (tasks, documents, memos) in parallel. Each
 * child loader filters by the parent deal's team (
 * cr664_Deal/_cr664_team_value eq <teamId>) — same boundary the
 * pipeline query uses. The rollup card waits for the four data slots
 * it consumes (pipeline + tasks + documents + memos) before
 * derivation; other manager cards continue to function on their
 * existing slot subset.
 */
export function ManagerDataProvider({ children }: { children: React.ReactNode }) {
  const { teamId } = useManager();
  const [teamPipeline, setTeamPipeline] = useState<AsyncResult<TeamDeal[]>>({
    kind: 'loading',
  });
  const [teamBankers, setTeamBankers] = useState<AsyncResult<TeamBanker[]>>({
    kind: 'loading',
  });
  const [teamTasks, setTeamTasks] = useState<AsyncResult<TeamScopedTask[]>>({
    kind: 'loading',
  });
  const [teamDocuments, setTeamDocuments] = useState<
    AsyncResult<TeamScopedDocument[]>
  >({ kind: 'loading' });
  const [teamMemos, setTeamMemos] = useState<AsyncResult<TeamScopedMemo[]>>({
    kind: 'loading',
  });
  const [teamMemoSections, setTeamMemoSections] = useState<
    AsyncResult<TeamScopedMemoSection[]>
  >({ kind: 'loading' });

  useEffect(() => {
    let cancelled = false;
    setTeamPipeline({ kind: 'loading' });
    setTeamBankers({ kind: 'loading' });
    setTeamTasks({ kind: 'loading' });
    setTeamDocuments({ kind: 'loading' });
    setTeamMemos({ kind: 'loading' });
    setTeamMemoSections({ kind: 'loading' });

    function bind<T>(
      loader: () => Promise<T>,
      setter: (r: AsyncResult<T>) => void,
    ): void {
      loader()
        .then((data) => {
          if (!cancelled) setter({ kind: 'ready', data });
        })
        .catch((err: unknown) => {
          if (cancelled) return;
          const message = err instanceof Error ? err.message : String(err);
          setter({ kind: 'failed', message });
        });
    }

    bind(() => loadTeamPipeline(teamId), setTeamPipeline);
    bind(() => loadTeamBankers(teamId), setTeamBankers);
    bind(() => loadManagerTeamTasks(teamId), setTeamTasks);
    bind(() => loadManagerTeamDocuments(teamId), setTeamDocuments);
    bind(() => loadManagerTeamMemos(teamId), setTeamMemos);
    bind(() => loadManagerTeamMemoSections(teamId), setTeamMemoSections);

    return () => {
      cancelled = true;
    };
  }, [teamId]);

  return (
    <ManagerDataContext.Provider
      value={{
        teamPipeline,
        teamBankers,
        teamTasks,
        teamDocuments,
        teamMemos,
        teamMemoSections,
      }}
    >
      {children}
    </ManagerDataContext.Provider>
  );
}
