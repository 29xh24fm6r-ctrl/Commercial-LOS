import { DealConditionVerificationPanel } from './DealConditionVerificationPanel';
import { useDealData } from './DealDataProvider';

/**
 * Final LOS Completion arc — Workstream E. Same precedent as
 * `DealCommitmentPanelConnected.tsx` / `DealCreditApprovalDecisionPanelConnected.tsx`: kept in its
 * own file so `DealConditionVerificationPanel.tsx`'s own test suite can keep rendering it
 * standalone, unmounted from any provider, without pulling `DealDataProvider.tsx` (and the
 * generated-service SDK graph behind it) into that suite's import graph. This wrapper is the only
 * consumer of `DealDataProvider`'s `refresh`; the base panel stays fully self-contained and
 * prop-driven.
 */
export function DealConditionVerificationPanelConnected({
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
  const { refresh } = useDealData();
  return (
    <DealConditionVerificationPanel
      dealId={dealId}
      authorized={authorized}
      actorEmail={actorEmail}
      systemUserId={systemUserId}
      onVerificationSubmitted={() => refresh('after-condition-verification-submitted')}
    />
  );
}
