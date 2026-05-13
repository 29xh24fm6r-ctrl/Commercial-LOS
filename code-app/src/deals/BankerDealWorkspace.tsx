import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useBanker } from '../banker/BankerContext';
import { WORKSPACE_ROUTES } from '../bootstrap/workspaceRoutes';
import { loadDealForBanker, type DealLoadResult } from './dealQueries';
import { DealHeader } from './DealHeader';
import { DealSummary } from './DealSummary';
import { DealBlockers } from './DealBlockers';
import { DealTasks } from './DealTasks';
import { DealDocuments } from './DealDocuments';
import { DealDataProvider } from './DealDataProvider';
import { PlaceholderCard } from './PlaceholderCard';
import { LoadingState } from '../shared/LoadingState';
import { ErrorState } from '../shared/ErrorState';

const PLACEHOLDER_SECTIONS: Array<{ title: string; hint: string }> = [
  { title: 'Activity Timeline', hint: 'Calls, meetings, emails, and system events — coming in a later phase.' },
  { title: 'Borrower Communication', hint: 'Outreach history and quick actions — coming in a later phase.' },
  { title: 'Credit Memo', hint: 'Draft, generate, and export — coming in a later phase.' },
];

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
        <Link to={WORKSPACE_ROUTES.banker} style={styles.back}>
          ← Banker Workspace
        </Link>
      </nav>
      <main style={styles.main}>
        <DealDataProvider deal={deal}>
          <DealHeader />
          <DealBlockers />
          <DealSummary />
          <DealTasks />
          <DealDocuments />
          <div style={styles.grid}>
            {PLACEHOLDER_SECTIONS.map((s) => (
              <PlaceholderCard key={s.title} title={s.title} hint={s.hint} />
            ))}
          </div>
        </DealDataProvider>
      </main>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    fontFamily: 'system-ui, sans-serif',
    minHeight: '100vh',
    background: '#fafafa',
    color: '#1a1a1a',
  },
  crumbs: {
    padding: '1rem 2rem 0',
  },
  back: {
    color: '#4a5fc1',
    textDecoration: 'none',
    fontSize: '0.9rem',
  },
  main: { padding: '1rem 2rem 2rem' },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
    gap: '1rem',
  },
};
