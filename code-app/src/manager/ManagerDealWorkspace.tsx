import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useManager } from './ManagerContext';
import { WORKSPACE_ROUTES } from '../bootstrap/workspaceRoutes';
import { loadDealForManager, type DealLoadResult } from '../deals/dealQueries';
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
 * Phase 36: Manager Deal Workspace — read-only.
 *
 * Mirrors BankerDealWorkspace's load → authorize → render flow but
 * routes through the manager team-scoped authorization
 * (loadDealForManager) and renders each write-capable card in
 * read-only mode. The manager surface NEVER mounts a write modal —
 * the four cards consume their new `readOnly` prop and skip their
 * write buttons entirely.
 *
 * Sealed-module discipline: this file imports the deal-workspace
 * components from src/deals/ (they are the deal-workspace render
 * surface, not banker-specific code). It does NOT import anything
 * from src/banker/.
 */

interface ManagerDealWorkspaceProps {
  dealId: string;
}

export function ManagerDealWorkspace({ dealId }: ManagerDealWorkspaceProps) {
  const { teamId, teamName } = useManager();
  const [state, setState] = useState<DealLoadResult | { kind: 'loading' }>({
    kind: 'loading',
  });

  useEffect(() => {
    let cancelled = false;
    setState({ kind: 'loading' });
    loadDealForManager(dealId, teamId)
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
        hint="Return to the Manager Command Center."
      />
    );
  }

  if (state.kind === 'not-found') {
    return (
      <ErrorState
        title="Deal not found"
        detail="No deal exists with that id, or it has been removed."
        hint="Return to the Manager Command Center."
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
        <Link to={WORKSPACE_ROUTES.manager} className="cc-link" style={styles.back}>
          ← Manager Command Center
        </Link>
        <span style={styles.crumbSep} aria-hidden="true">
          /
        </span>
        <span style={styles.crumbCurrent}>{deal.name}</span>
        <Badge variant="neutral" appearance="outline">
          Read-only · Manager view
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
