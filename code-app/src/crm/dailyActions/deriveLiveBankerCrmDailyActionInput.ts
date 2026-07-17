/**
 * CRM-ELITE-1 Phase 4 — live banker CRM daily action queue input.
 *
 * Populates ONLY the categories backed by real live signals:
 *   - missingContactReadiness: orgs where contactCount === 0 (a real, evidenced
 *     zero — NOT orgs whose contact data failed to load, which is `undefined`
 *     and honestly excluded).
 *   - activityGaps: orgs whose activity signal (from the already-implemented,
 *     unmodified deriveCrmRelationshipHealth) is 'watch' (stale activity) or a
 *     real evidenced absence of any activity ('unknown' severity WITH a real
 *     activityCount of 0 — never the domain-didn't-load 'unknown' case, where
 *     activityCount is undefined).
 *
 * All other categories (matchConflicts, sourceOfTruthConflicts,
 * syncPreviewBlocked, ncinoWorkflowGaps, salesforceOpportunityGaps) are
 * DELIBERATELY passed as empty arrays — there is no live signal behind them
 * (they belong to the unrouted Salesforce/nCino metaphor lane, out of scope
 * per this spec's §0). Do not connect them to any data source as part of this
 * phase.
 */

import { deriveCrmRelationshipHealth } from '../crmRelationshipHealthModel';
import type { BankerCrmDailyActionInput } from './bankerCrmDailyActionQueue';
import type { OrgHealthInputResult } from '../workspace/crmRelationshipHealthData';

export function deriveLiveBankerCrmDailyActionInput(
  orgHealthInputs: readonly OrgHealthInputResult[],
  dealHrefByOrgId: ReadonlyMap<string, string | undefined>,
): BankerCrmDailyActionInput {
  const missingContactReadiness: Array<{ dealName?: string; dealRouteHref?: string; description: string }> = [];
  const activityGaps: Array<{ dealName?: string; dealRouteHref?: string; description: string }> = [];

  for (const { organizationId, organizationName, input } of orgHealthInputs) {
    const dealRouteHref = dealHrefByOrgId.get(organizationId);

    if (input.contactCount === 0) {
      missingContactReadiness.push({
        dealName: organizationName,
        dealRouteHref,
        description: `${organizationName} has no CRM contacts on record.`,
      });
    }

    const activitySignal = deriveCrmRelationshipHealth(input).signals.find((s) => s.key === 'activity');
    const isStale = activitySignal?.severity === 'watch';
    const isEvidencedAbsence = activitySignal?.severity === 'unknown' && input.activityCount === 0;
    if (activitySignal && (isStale || isEvidencedAbsence)) {
      activityGaps.push({
        dealName: organizationName,
        dealRouteHref,
        description: `${organizationName}: ${activitySignal.evidence}`,
      });
    }
  }

  return {
    matchConflicts: [],
    sourceOfTruthConflicts: [],
    syncPreviewBlocked: [],
    missingContactReadiness,
    activityGaps,
    ncinoWorkflowGaps: [],
    salesforceOpportunityGaps: [],
  };
}
