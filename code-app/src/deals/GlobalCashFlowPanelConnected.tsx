import { GlobalCashFlowPanel } from './GlobalCashFlowPanel';
import { useDealData } from './DealDataProvider';
import type { DealDetail } from './dealQueries';
import type { VerifiedProfilePatch } from './write/updateDealProfile';

/**
 * Factory mission PR B — the DealDataProvider-aware wrapper `BankerDealWorkspace.tsx` mounts.
 * Kept in its OWN file (not inlined into `GlobalCashFlowPanel.tsx`), same reasoning as
 * `DealFundingAuthorizationPanelConnected.tsx`'s header: importing `useDealData` in the base panel
 * would pull the real `DealDataProvider.tsx` (and the generated-service SDK graph) into every test
 * that imports it, including its own standalone-render test suite.
 *
 * Fixes the credit-memo stale-read defect: before this wrapper existed, a Global Cash Flow save
 * wrote a real, readback-verified `cr664_financialspreadinputs` value but never told
 * `DealDataProvider` about it, so the in-context `deal.financialSpreadInputsJson` stayed stale
 * until a full browser reload remounted the workspace — meaning the credit memo (and anything else
 * reading `deal` from context in the same session) could read pre-save figures right after a
 * banker was told "Saved." `applyVerifiedDealPatch` merges the exact readback-verified field the
 * write already computed (note the field-name translation: `VerifiedProfilePatch.globalCashFlowInputs`
 * -> `DealDetail.financialSpreadInputsJson`, the two schemas name this differently).
 */
export function GlobalCashFlowPanelConnected({
  deal,
  authorized,
  actorEmail,
  actorSystemUserId,
}: {
  deal: DealDetail;
  authorized: boolean;
  actorEmail: string | undefined;
  actorSystemUserId: string | undefined;
}) {
  const { applyVerifiedDealPatch } = useDealData();
  return (
    <GlobalCashFlowPanel
      deal={deal}
      authorized={authorized}
      actorEmail={actorEmail}
      actorSystemUserId={actorSystemUserId}
      onSaved={(verified: VerifiedProfilePatch) => {
        if (verified.globalCashFlowInputs === undefined) return;
        applyVerifiedDealPatch?.({ financialSpreadInputsJson: verified.globalCashFlowInputs });
      }}
    />
  );
}
