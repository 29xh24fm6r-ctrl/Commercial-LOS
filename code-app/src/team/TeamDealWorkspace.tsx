import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTeam } from './TeamContext';
import { WORKSPACE_ROUTES } from '../bootstrap/workspaceRoutes';
import { loadDealForTeam, type DealLoadResult } from '../deals/dealQueries';
import { DealHeader } from '../deals/DealHeader';
import { DealSummary } from '../deals/DealSummary';
import { DealBlockers } from '../deals/DealBlockers';
import { DealStageProgressionCard } from '../deals/DealStageProgressionCard';
import { DealTasks } from '../deals/DealTasks';
import { DealDocuments } from '../deals/DealDocuments';
import { CreditMemo } from '../deals/CreditMemo';
import { ActivityTimeline } from '../deals/ActivityTimeline';
import { BorrowerCommunication } from '../deals/BorrowerCommunication';
import { DealDataProvider } from '../deals/DealDataProvider';
import { LoadingState } from '../shared/LoadingState';
import { ErrorState } from '../shared/ErrorState';
import { Badge } from '../shared/Badge';
import { palette, spacing, typography } from '../shared/theme';

/**
 * Phase 37: Team Deal Workspace — read-only.
 *
 * Mirrors Phase 36's ManagerDealWorkspace structure but routes
 * through loadDealForTeam and reads team context from useTeam().
 * Every write-capable card is rendered with readOnly = true so
 * Complete / Request / Generate Draft / Draft Borrower Update
 * surfaces are never exposed.
 *
 * Sealed-module discipline: imports the deal-workspace components
 * from src/deals/ (shared deal render surface) and the team
 * provider from its own role module. Does NOT import from
 * src/banker/ or src/manager/.
 */

interface TeamDealWorkspaceProps {
  dealId: string;
}

export function TeamDealWorkspace({ dealId }: TeamDealWorkspaceProps) {
  const { teamId, teamName } = useTeam();
  const [state, setState] = useState<DealLoadResult | { kind: 'loading' }>({
    kind: 'loading',
  });

  useEffect(() => {
    let cancelled = false;
    setState({ kind: 'loading' });
    loadDealForTeam(dealId, teamId)
      .then((res) => {
        if (!cancelled) setState(res);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : String(err);
        setState({ kind: 'failed', message });
      });
    return () => {
      cancelled = true;
    };
  }, [dealId, teamId]);

  if (state.kind === 'loading') return <LoadingState message="Loading deal…" />;

  if (state.kind === 'denied') {
    return (
      <ErrorState
        title="Access denied"
        detail={`This deal is not on your team (${teamName}).`}
        hint="Return to the Team Command Center."
      />
    );
  }

  if (state.kind === 'not-found') {
    return (
      <ErrorState
        title="Deal not found"
        detail="No deal exists with that id, or it has been removed."
        hint="Return to the Team Command Center."
      />
    );
  }

  if (state.kind === 'failed') {
    return (
      <ErrorState
        title="Could not load deal"
        detail={state.message}
        hint="Refresh to retry."
      />
    );
  }

  const { deal } = state;
  return (
    <div style={styles.page}>
      <nav style={styles.crumbs} aria-label="Breadcrumb">
        <Link to={WORKSPACE_ROUTES.team} className="cc-link" style={styles.back}>
          ← Team Command Center
        </Link>
        <span style={styles.crumbSep} aria-hidden="true">
          /
        </span>
        <span style={styles.crumbCurrent}>{deal.name}</span>
        <Badge variant="neutral" appearance="outline">
          Read-only · Team view
        </Badge>
      </nav>
      <main style={styles.main}>
        <DealDataProvider deal={deal}>
          <DealHeader />
          <DealBlockers />
          <DealStageProgressionCard />
          <DealSummary />
          <DealTasks readOnly />
          <DealDocuments readOnly />
          <CreditMemo readOnly />
          <ActivityTimeline />
          <BorrowerCommunication readOnly />
        </DealDataProvider>
      </main>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    fontFamily: typography.family,
    minHeight: '100vh',
    background: palette.pageBg,
    color: palette.text,
  },
  crumbs: {
    padding: `${spacing.md} ${spacing.xxl} 0`,
    display: 'flex',
    alignItems: 'center',
    gap: spacing.xs,
    fontSize: typography.size.sm,
  },
  back: { fontSize: typography.size.sm },
  crumbSep: { color: palette.textSubtle },
  crumbCurrent: {
    color: palette.textMuted,
    fontWeight: typography.weight.medium,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    maxWidth: 360,
  },
  main: { padding: `${spacing.md} ${spacing.xxl} ${spacing.xxl}` },
};
