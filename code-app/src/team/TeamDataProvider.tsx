import { createContext, useContext, useEffect, useState } from 'react';
import { useTeam } from './TeamContext';
import { mapBusinessSafeReadError } from '../shared/errors/businessSafeErrorMapping';
import {
  loadTeamDeals,
  loadTeamMemberBankerIds,
  loadTeamTasks,
  loadTeamDocuments,
  loadTeamMemos,
  loadTeamMemoSections,
  type TeamDealRow,
  type TeamTaskRow,
  type TeamDocumentRow,
  type TeamMemoRow,
  type TeamMemoSectionRow,
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
  /** Phase 95 — per-deal credit memo draft sections scoped to the
   *  team. Used by the TeamAutopilotRollup to run the Phase 73
   *  consistency check + emit the memo-consistency-findings signal. */
  memoSections: AsyncResult<TeamMemoSectionRow[]>;
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
  const [memoSections, setMemoSections] = useState<
    AsyncResult<TeamMemoSectionRow[]>
  >({ kind: 'loading' });

  useEffect(() => {
    let cancelled = false;
    setDeals({ kind: 'loading' });
    setTasks({ kind: 'loading' });
    setDocuments({ kind: 'loading' });
    setMemos({ kind: 'loading' });
    setMemoSections({ kind: 'loading' });

    function bind<T>(setter: (r: AsyncResult<T>) => void, promise: Promise<T>): void {
      promise
        .then((data) => {
          if (!cancelled) setter({ kind: 'ready', data });
        })
        .catch((err: unknown) => {
          if (cancelled) return;
          const raw = err instanceof Error ? err.message : String(err);
          // Final LOS Completion arc (146 Factory arc, Workstream 146-G) — never render a raw
          // Dataverse/transport error verbatim; this single chokepoint fixes every team-domain
          // sibling consumer of TeamDataProvider's AsyncResult.
          setter({ kind: 'failed', message: mapBusinessSafeReadError(raw).safeMessage });
        });
    }

    // P0-4 — resolve the team's member banker ids first, then scope the pipeline to deals owned by
    // the team OR assigned to a member banker, so a legitimate active deal whose Owning Team was
    // skipped still appears in team oversight. If the banker load fails, fall back to team-owned-only.
    bind(
      setDeals,
      loadTeamMemberBankerIds(teamId)
        .then((memberBankerIds) => loadTeamDeals(teamId, { memberBankerIds }))
        .catch(() => loadTeamDeals(teamId)),
    );
    // N-03 — resolve member banker ids first so the child loaders get the same Owning-Team
    // fallback the deal list above already has; fall back to team-only scope if that lookup fails.
    bind(
      setTasks,
      loadTeamMemberBankerIds(teamId)
        .then((memberBankerIds) => loadTeamTasks(teamId, memberBankerIds))
        .catch(() => loadTeamTasks(teamId)),
    );
    bind(
      setDocuments,
      loadTeamMemberBankerIds(teamId)
        .then((memberBankerIds) => loadTeamDocuments(teamId, memberBankerIds))
        .catch(() => loadTeamDocuments(teamId)),
    );
    bind(
      setMemos,
      loadTeamMemberBankerIds(teamId)
        .then((memberBankerIds) => loadTeamMemos(teamId, memberBankerIds))
        .catch(() => loadTeamMemos(teamId)),
    );
    bind(
      setMemoSections,
      loadTeamMemberBankerIds(teamId)
        .then((memberBankerIds) => loadTeamMemoSections(teamId, memberBankerIds))
        .catch(() => loadTeamMemoSections(teamId)),
    );

    return () => {
      cancelled = true;
    };
  }, [teamId]);

  return (
    <TeamDataContext.Provider value={{ deals, tasks, documents, memos, memoSections }}>
      {children}
    </TeamDataContext.Provider>
  );
}
