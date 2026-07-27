import { DealRiskRatingPanel } from './DealRiskRatingPanel';
import { useDealData } from './DealDataProvider';
import type { DealDetail } from './dealQueries';
import type { VerifiedProfilePatch } from './write/updateDealProfile';

/**
 * Factory mission PR B — the DealDataProvider-aware wrapper `BankerDealWorkspace.tsx` mounts.
 * Kept in its OWN file, same reasoning as `DealFundingAuthorizationPanelConnected.tsx`'s header.
 *
 * Fixes the credit-memo stale-read defect: before this wrapper existed, saving a risk rating or
 * underwriting recommendation wrote a real, readback-verified value but never told
 * `DealDataProvider` about it, so the in-context `deal.riskRatingInputsJson` /
 * `deal.underwritingRecommendationInputsJson` stayed stale until a full browser reload remounted
 * the workspace — meaning the credit memo (which reads these off the same `deal` object, see
 * `deriveRiskRatingRecordFromDeal`/`deriveUnderwritingRecommendationRecordFromDeal` in
 * `workflow/underwritingDeepFacts.ts`) could show a rating that no longer matches what was just
 * saved, in the same session. `applyVerifiedDealPatch` merges the exact readback-verified field(s)
 * the write already computed (note the field-name translation:
 * `VerifiedProfilePatch.riskRatingInputs` -> `DealDetail.riskRatingInputsJson`,
 * `VerifiedProfilePatch.underwritingRecommendationInputs` -> `DealDetail.underwritingRecommendationInputsJson`
 * — the two schemas name these differently).
 */
export function DealRiskRatingPanelConnected({
  deal,
  ratedBy,
  authorized,
  actorEmail,
  actorSystemUserId,
}: {
  deal: DealDetail;
  ratedBy?: string;
  authorized: boolean;
  actorEmail: string | undefined;
  actorSystemUserId: string | undefined;
}) {
  const { applyVerifiedDealPatch } = useDealData();
  return (
    <DealRiskRatingPanel
      deal={deal}
      ratedBy={ratedBy}
      authorized={authorized}
      actorEmail={actorEmail}
      actorSystemUserId={actorSystemUserId}
      onSaved={(verified: VerifiedProfilePatch) => {
        if (verified.riskRatingInputs === undefined && verified.underwritingRecommendationInputs === undefined) return;
        applyVerifiedDealPatch?.({
          ...(verified.riskRatingInputs !== undefined ? { riskRatingInputsJson: verified.riskRatingInputs } : {}),
          ...(verified.underwritingRecommendationInputs !== undefined
            ? { underwritingRecommendationInputsJson: verified.underwritingRecommendationInputs }
            : {}),
        });
      }}
    />
  );
}
