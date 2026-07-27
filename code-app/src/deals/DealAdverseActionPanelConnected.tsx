import { DealAdverseActionPanel } from './DealAdverseActionPanel';
import { useDealData } from './DealDataProvider';

/**
 * Final LOS Completion arc — Workstream J. Same precedent as
 * `DealBookingQcPanelConnected.tsx`: kept in its own file so `DealAdverseActionPanel.tsx`'s own test
 * suite can keep rendering it standalone, unmounted from any provider, without pulling
 * `DealDataProvider.tsx` (and the generated-service SDK graph behind it) into that suite's import
 * graph. This wrapper is the only consumer of `DealDataProvider`'s `refresh`; the base panel stays
 * fully self-contained and prop-driven.
 */
export function DealAdverseActionPanelConnected({
  dealId,
  dealStatus,
  authorized,
  actorEmail,
  systemUserId,
}: {
  dealId: string;
  dealStatus: string | undefined;
  authorized: boolean;
  actorEmail: string | undefined;
  systemUserId: string | undefined;
}) {
  const { refresh } = useDealData();
  return (
    <DealAdverseActionPanel
      dealId={dealId}
      dealStatus={dealStatus}
      authorized={authorized}
      actorEmail={actorEmail}
      systemUserId={systemUserId}
      onRecordSubmitted={() => refresh('after-adverse-action-record-submitted')}
    />
  );
}
