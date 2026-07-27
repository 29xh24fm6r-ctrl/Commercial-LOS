import { DealCreditApprovalDecisionPanel } from './DealCreditApprovalDecisionPanel';
import { useDealData } from './DealDataProvider';
import type { BankerCreditAuthority } from '../workflow/creditApprovalAuthority';

/**
 * Final LOS Completion arc — Workstream C. Same precedent as
 * `DealFundingAuthorizationPanelConnected.tsx`: kept in its own file so
 * `DealCreditApprovalDecisionPanel.tsx`'s own test suite can keep rendering it standalone,
 * unmounted from any provider, without pulling `DealDataProvider.tsx` (and the generated-service
 * SDK graph behind it) into that suite's import graph. This wrapper is the only consumer of
 * `DealDataProvider`'s `refresh`; the base panel stays fully self-contained and prop-driven.
 */
export function DealCreditApprovalDecisionPanelConnected({
  dealId,
  dealAmount,
  authorized,
  actorEmail,
  systemUserId,
  bankerId,
  creditAuthority,
  assignedBankerId,
}: {
  dealId: string;
  dealAmount: number | undefined;
  authorized: boolean;
  actorEmail: string | undefined;
  systemUserId: string | undefined;
  bankerId: string | undefined;
  creditAuthority: BankerCreditAuthority | undefined;
  assignedBankerId: string | undefined;
}) {
  const { refresh } = useDealData();
  return (
    <DealCreditApprovalDecisionPanel
      dealId={dealId}
      dealAmount={dealAmount}
      authorized={authorized}
      actorEmail={actorEmail}
      systemUserId={systemUserId}
      bankerId={bankerId}
      creditAuthority={creditAuthority}
      assignedBankerId={assignedBankerId}
      onDecisionSubmitted={() => refresh('after-credit-approval-decision-submitted')}
    />
  );
}
