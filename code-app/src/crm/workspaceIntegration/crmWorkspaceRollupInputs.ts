/**
 * CRM-ELITE-1 Phase 3 — live manager/executive CRM rollup derivation.
 *
 * Replaces the hardcoded manager/executive strip in crmWorkspacePreviewInputs.ts
 * with real derivations over the pure `deriveCrmManagerRollup` /
 * `deriveCrmExecutiveRollup` (crmRelationshipRollups.ts, unmodified).
 * Entitlement-before-render: a non-entitled viewer gets the honest "not
 * entitled" copy, never a fallthrough to numbers. Empty input yields honest
 * zeros — never the old static "CRM is active" strings. The Salesforce/nCino
 * fields are inherently metaphor-lane concepts with no live counterpart in this
 * spec's scope — their copy is corrected to a neutral, accurate statement
 * rather than wired to fabricated data.
 */

import {
  deriveCrmManagerRollup,
  deriveCrmExecutiveRollup,
  type CrmRollupInput,
} from '../crmRelationshipRollups';
import type { CrmManagerSurfaceInput } from './CrmManagerWorkingSurface';
import type { CrmExecutiveSurfaceInput } from './CrmExecutiveWorkingSurface';

const NOT_APPLICABLE_CRM = 'Not applicable — no external CRM sync configured';
const NOT_APPLICABLE_WORKFLOW = 'Not applicable — no external loan-workflow sync configured';
const NOT_ENTITLED = 'Not entitled to CRM rollup data';

function nextStepForAtRiskCount(atRiskCount: number): string {
  return atRiskCount > 0
    ? `Review ${atRiskCount} account(s) with declining relationship signals.`
    : 'No accounts currently flagged — review team coverage periodically.';
}

export function deriveManagerCrmSurfaceInput(
  rollupInput: CrmRollupInput,
  crmCommandCenterHref: string | undefined,
): CrmManagerSurfaceInput {
  const rollup = deriveCrmManagerRollup(rollupInput);
  if (!rollup.entitled) {
    return {
      teamCrmReadiness: NOT_ENTITLED,
      bankerFollowUpWorkload: 0,
      accountsNeedingAttention: 0,
      salesforceReadinessByPipeline: NOT_APPLICABLE_CRM,
      ncinoReadinessByPipeline: NOT_APPLICABLE_WORKFLOW,
      syncPreviewBlockedCount: 0,
      nextSafeManagerStep: NOT_ENTITLED,
      crmCommandCenterHref,
    };
  }

  const totalAccounts = rollup.totalAccounts;
  const unknownCount = rollup.byBanker.reduce((n, b) => n + b.health.unknown, 0);
  const atRiskCount = rollup.byBanker.reduce((n, b) => n + b.health['at-risk'], 0);
  const readyCount = totalAccounts - unknownCount;
  const openTaskSum = rollupInput.accounts.reduce((n, a) => n + a.openTasks, 0);

  return {
    teamCrmReadiness:
      totalAccounts === 0
        ? 'No CRM accounts on record yet'
        : `${readyCount} of ${totalAccounts} account(s) have sufficient CRM evidence`,
    bankerFollowUpWorkload: openTaskSum,
    accountsNeedingAttention: atRiskCount,
    salesforceReadinessByPipeline: NOT_APPLICABLE_CRM,
    ncinoReadinessByPipeline: NOT_APPLICABLE_WORKFLOW,
    syncPreviewBlockedCount: 0,
    nextSafeManagerStep: nextStepForAtRiskCount(atRiskCount),
    crmCommandCenterHref,
  };
}

export function deriveExecutiveCrmSurfaceInput(
  rollupInput: CrmRollupInput,
  crmCommandCenterHref: string | undefined,
): CrmExecutiveSurfaceInput {
  const rollup = deriveCrmExecutiveRollup(rollupInput);
  if (!rollup.entitled) {
    return {
      crmCoverageStatus: NOT_ENTITLED,
      salesforceActivationPosture: NOT_APPLICABLE_CRM,
      ncinoActivationPosture: NOT_APPLICABLE_WORKFLOW,
      accountsNeedingAttention: 0,
      productStrategyCrmReadiness: NOT_ENTITLED,
      revenueDataAvailability: 'Not available (no revenue figures shown)',
      nextExecutiveStep: NOT_ENTITLED,
      crmCommandCenterHref,
    };
  }

  const atRiskCount = rollup.health['at-risk'];

  return {
    crmCoverageStatus:
      rollup.totalAccounts === 0
        ? 'No CRM accounts on record yet'
        : `${rollup.coveragePct ?? 0}% of accounts have a coverage team on record`,
    salesforceActivationPosture: NOT_APPLICABLE_CRM,
    ncinoActivationPosture: NOT_APPLICABLE_WORKFLOW,
    accountsNeedingAttention: atRiskCount,
    productStrategyCrmReadiness:
      rollup.totalAccounts === 0
        ? 'No CRM accounts on record yet'
        : `${rollup.sourceFactPct ?? 0}% of accounts have source-linked CRM evidence`,
    revenueDataAvailability: 'Not available (no revenue figures shown)',
    nextExecutiveStep: nextStepForAtRiskCount(atRiskCount),
    crmCommandCenterHref,
  };
}
