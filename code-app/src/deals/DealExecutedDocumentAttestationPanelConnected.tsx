import { DealExecutedDocumentAttestationPanel } from './DealExecutedDocumentAttestationPanel';
import { useDealData } from './DealDataProvider';

/**
 * Final LOS Completion arc — Workstream F. Same precedent as
 * `DealConditionVerificationPanelConnected.tsx` / `DealCommitmentPanelConnected.tsx`: kept in its
 * own file so `DealExecutedDocumentAttestationPanel.tsx`'s own test suite can keep rendering it
 * standalone, unmounted from any provider, without pulling `DealDataProvider.tsx` (and the
 * generated-service SDK graph behind it) into that suite's import graph. This wrapper is the only
 * consumer of `DealDataProvider`'s `refresh`; the base panel stays fully self-contained and
 * prop-driven.
 */
export function DealExecutedDocumentAttestationPanelConnected({
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
    <DealExecutedDocumentAttestationPanel
      dealId={dealId}
      authorized={authorized}
      actorEmail={actorEmail}
      systemUserId={systemUserId}
      onAttestationSubmitted={() => refresh('after-executed-document-attestation-submitted')}
    />
  );
}
