import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useBanker } from '../banker/BankerContext';
import { WORKSPACE_ROUTES } from '../bootstrap/workspaceRoutes';
import { loadDealForBanker, type DealLoadResult } from './dealQueries';
import { DealHeader } from './DealHeader';
import { DealSummary } from './DealSummary';
import { DealAutopilotPanel } from './DealAutopilotPanel';
import { RelationshipContext } from './RelationshipContext';
import { DealBlockers } from './DealBlockers';
import { DealStageProgressionCard } from './DealStageProgressionCard';
import { DealTasks } from './DealTasks';
import { DealDocuments } from './DealDocuments';
import { CreditMemo } from './CreditMemo';
import { ActivityTimeline } from './ActivityTimeline';
import { BorrowerCommunication } from './BorrowerCommunication';
import { TeamsChatHandoff } from './TeamsChatHandoff';
import { DealDataProvider } from './DealDataProvider';
import { LoadingState } from '../shared/LoadingState';
import { ErrorState } from '../shared/ErrorState';
import { palette, spacing, typography } from '../shared/theme';

interface BankerDealWorkspaceProps {
  dealId: string;
}

export function BankerDealWorkspace({ dealId }: BankerDealWorkspaceProps) {
  const { bankerId } = useBanker();
  const [state, setState] = useState<DealLoadResult | { kind: 'loading' }>({ kind: 'loading' });

  useEffect(() => {
    let cancelled = false;
    setState({ kind: 'loading' });
    loadDealForBanker(dealId, bankerId)
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
  }, [dealId, bankerId]);

  if (state.kind === 'loading') return <LoadingState message="Loading deal…" />;

  if (state.kind === 'denied') {
    return (
      <ErrorState
        title="Access denied"
        detail="This deal is not assigned to you."
        hint="Return to your workspace and open a deal from your pipeline."
      />
    );
  }

  if (state.kind === 'not-found') {
    return (
      <ErrorState
        title="Deal not found"
        detail="No deal exists with that id, or it has been removed."
        hint="Return to your workspace."
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
        <Link to={WORKSPACE_ROUTES.banker} className="cc-link" style={styles.back}>
          ← Banker Command Center
        </Link>
        <span style={styles.crumbSep} aria-hidden="true">/</span>
        <span style={styles.crumbCurrent}>{deal.name}</span>
      </nav>
      <main style={styles.main}>
        <DealDataProvider deal={deal}>
          <DealHeader />
          <DealBlockers />
          {/* Phase 80: stage-progression card is the scroll target
              for the autopilot "stage-aging" suggestion. */}
          <div data-deal-card="stage-progression">
            <DealStageProgressionCard />
          </div>
          <DealSummary />
          {/* Phase 80: Deal Autopilot Lite — Next Best Actions panel.
              Deterministic suggestions only; banker decides. */}
          <DealAutopilotPanel />
          <RelationshipContext />
          {/* Phase 80: data-deal-card anchors used by the autopilot
              panel's scrollIntoView. The wrappers preserve the
              existing card layout — no styling change. */}
          <div data-deal-card="tasks">
            <DealTasks />
          </div>
          <div data-deal-card="documents">
            <DealDocuments />
          </div>
          <div data-deal-card="credit-memo">
            <CreditMemo />
          </div>
          <div data-deal-card="activity-timeline">
            <ActivityTimeline />
          </div>
          <div data-deal-card="borrower-communication">
            <BorrowerCommunication />
          </div>
          {/* Phase 86: no-admin Teams chat handoff. Opens the
              banker's own Teams client. No write, no audit, no
              timeline, no Graph. */}
          <div data-deal-card="teams-chat-handoff">
            <TeamsChatHandoff />
          </div>
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
  back: {
    fontSize: typography.size.sm,
  },
  crumbSep: {
    color: palette.textSubtle,
  },
  crumbCurrent: {
    color: palette.textMuted,
    fontWeight: typography.weight.medium,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    maxWidth: 360,
  },
  main: {
    padding: `${spacing.md} ${spacing.xxl} ${spacing.xxl}`,
  },
};
