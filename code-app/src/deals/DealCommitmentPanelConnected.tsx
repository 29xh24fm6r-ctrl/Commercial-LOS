import { DealCommitmentPanel } from './DealCommitmentPanel';
import { useDealData } from './DealDataProvider';

/**
 * Final LOS Completion arc — Workstream D. Same precedent as
 * `DealCreditApprovalDecisionPanelConnected.tsx` / `DealFundingAuthorizationPanelConnected.tsx`:
 * kept in its own file so `DealCommitmentPanel.tsx`'s own test suite can keep rendering it
 * standalone, unmounted from any provider, without pulling `DealDataProvider.tsx` (and the
 * generated-service SDK graph behind it) into that suite's import graph. This wrapper is the only
 * consumer of `DealDataProvider`'s `refresh`/`creditApprovalDecisions`; the base panel stays fully
 * self-contained and prop-driven.
 */
export function DealCommitmentPanelConnected({
  dealId,
  authorized,
  actorEmail,
  systemUserId,
}: {
  dealId: string;
  authorized: boolean;
  actorEmail: string | undefined;
  systemUserId: string | undefined;
}) {
  const { refresh, creditApprovalDecisions } = useDealData();
  const creditApprovalDecisionsData =
    creditApprovalDecisions?.kind === 'ready' ? creditApprovalDecisions.data : undefined;
  return (
    <DealCommitmentPanel
      dealId={dealId}
      authorized={authorized}
      actorEmail={actorEmail}
      systemUserId={systemUserId}
      creditApprovalDecisions={creditApprovalDecisionsData}
      onCommitmentActionSubmitted={() => refresh('after-commitment-action-submitted')}
    />
  );
}
