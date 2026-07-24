import { DealFundingAuthorizationPanel } from './DealFundingAuthorizationPanel';
import { useDealData } from './DealDataProvider';
import type { DealDetail } from './dealQueries';

/**
 * Factory Arc Phase 12 — the DealDataProvider-aware wrapper `BankerDealWorkspace.tsx` mounts.
 * Kept in its OWN file (not inlined into `DealFundingAuthorizationPanel.tsx`) so that file's static
 * import graph stays exactly as it was before this phase: importing `useDealData` there would pull
 * the real `DealDataProvider.tsx` (and, through it, the generated-service SDK graph) into every test
 * that imports `DealFundingAuthorizationPanel.tsx` — including this component's own 9-test suite,
 * which deliberately renders it standalone, unmounted from any provider. This wrapper is the only
 * consumer of `DealDataProvider`'s `refresh`; the base component stays fully self-contained and
 * prop-driven (`onFundingConfirmed`).
 */
export function DealFundingAuthorizationPanelConnected({
  deal,
  authorized,
  actorEmail,
}: {
  deal: DealDetail;
  authorized: boolean;
  actorEmail: string | undefined;
}) {
  const { refresh } = useDealData();
  return (
    <DealFundingAuthorizationPanel
      deal={deal}
      authorized={authorized}
      actorEmail={actorEmail}
      onFundingConfirmed={() => refresh('after-funding-confirmed')}
    />
  );
}
