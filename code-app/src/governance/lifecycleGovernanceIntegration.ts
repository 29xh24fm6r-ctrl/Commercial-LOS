import {
  createLifecycleGovernanceCoordinator,
  type CreditLifecyclePoint,
  type LegacyControlDecision,
  type LifecycleGovernanceContext,
  type LifecycleGovernanceCoordinator,
  type LifecycleGovernanceGateResult,
} from './lifecycleGovernance';

export interface LifecycleGovernanceInvocation {
  readonly coordinator: LifecycleGovernanceCoordinator;
  readonly context: LifecycleGovernanceContext;
}

/**
 * Optional injection keeps existing call sites and legacy controls intact.
 * When omitted, the pinned LEGACY_ONLY coordinator is used. Shadow/cutover code
 * must inject its mode and server explicitly; environment variables cannot
 * silently activate governance.
 */
export async function evaluateLifecycleBeforeWrite(
  lifecyclePoint: CreditLifecyclePoint,
  invocation: LifecycleGovernanceInvocation | undefined,
  legacyDecision: LegacyControlDecision,
): Promise<LifecycleGovernanceGateResult> {
  const coordinator = invocation?.coordinator ?? createLifecycleGovernanceCoordinator();
  const context = invocation?.context ?? {
    bankId: 'legacy-unresolved',
    caseId: 'legacy-unresolved',
    actorSystemUserId: 'legacy-unresolved',
    requestedAt: new Date(0).toISOString(),
    operationCorrelationId: 'legacy-only',
  };
  return coordinator.evaluate(lifecyclePoint, context, legacyDecision);
}

export interface LifecycleRuntimeBoundary {
  readonly lifecyclePoint: CreditLifecyclePoint;
  readonly clientModule: string;
  readonly clientOperation: string;
  readonly serverEntity: string;
  readonly serverMessages: readonly ('Create' | 'Update')[];
  readonly legacyControlRetained: true;
}

/**
 * Reviewable coverage contract for the lifecycle mutation boundary. These are
 * integration targets, not production registrations; PR 8 owns registration.
 */
export const LIFECYCLE_RUNTIME_BOUNDARIES: readonly LifecycleRuntimeBoundary[] = [
  {
    lifecyclePoint: 'origination',
    clientModule: 'src/deals/dealOriginationOrchestrator.ts',
    clientOperation: 'orchestrateDealOrigination',
    serverEntity: 'cr664_loandeal',
    serverMessages: ['Create'],
    legacyControlRetained: true,
  },
  {
    lifecyclePoint: 'underwriting',
    clientModule: 'src/deals/DealRiskRatingPanel.tsx',
    clientOperation: 'updateDealProfile (risk rating)',
    serverEntity: 'cr664_loandeal',
    serverMessages: ['Update'],
    legacyControlRetained: true,
  },
  {
    lifecyclePoint: 'recommendation',
    clientModule: 'src/deals/DealRiskRatingPanel.tsx',
    clientOperation: 'updateDealProfile (underwriting recommendation)',
    serverEntity: 'cr664_loandeal',
    serverMessages: ['Update'],
    legacyControlRetained: true,
  },
  {
    lifecyclePoint: 'approval',
    clientModule: 'src/creditApproval/submitCreditApprovalDecision.ts',
    clientOperation: 'submitCreditApprovalDecision',
    serverEntity: 'cr664_creditapprovaldecision',
    serverMessages: ['Create'],
    legacyControlRetained: true,
  },
  {
    lifecyclePoint: 'exception-approval',
    clientModule: 'src/documentation/submitConditionVerificationAction.ts',
    clientOperation: 'submitConditionVerificationAction',
    serverEntity: 'cr664_conditionverification',
    serverMessages: ['Create'],
    legacyControlRetained: true,
  },
  {
    lifecyclePoint: 'commitment',
    clientModule: 'src/commitment/submitCommitmentAction.ts',
    clientOperation: 'submitCommitmentAction',
    serverEntity: 'cr664_commitmentrecord',
    serverMessages: ['Create'],
    legacyControlRetained: true,
  },
  {
    lifecyclePoint: 'closing',
    clientModule: 'src/closing/submitBookingQcCheckAction.ts',
    clientOperation: 'submitBookingQcCheckAction',
    serverEntity: 'cr664_bookingqccheck',
    serverMessages: ['Create'],
    legacyControlRetained: true,
  },
  {
    lifecyclePoint: 'funding-authorization',
    clientModule: 'src/funding/fundingApprovalAdapter.ts',
    clientOperation: 'approveFunding',
    serverEntity: 'cr664_fundingauthorization',
    serverMessages: ['Update'],
    legacyControlRetained: true,
  },
  {
    lifecyclePoint: 'disbursement-confirmation',
    clientModule: 'src/funding/fundingDisbursementConfirmation.ts',
    clientOperation: 'confirmFundingDisbursement',
    serverEntity: 'cr664_fundingauthorization',
    serverMessages: ['Update'],
    legacyControlRetained: true,
  },
  {
    lifecyclePoint: 'boarding',
    clientModule: 'src/portfolioBoarding/existingLoanEntryAdapter.ts',
    clientOperation: 'boardExistingLoan',
    serverEntity: 'cr664_portfolioboardedloan',
    serverMessages: ['Create'],
    legacyControlRetained: true,
  },
  {
    lifecyclePoint: 'servicing',
    clientModule: 'src/admin/assignServicingOwnerWrite.ts',
    clientOperation: 'writeAssignServicingOwner',
    serverEntity: 'cr664_portfolioboardedloan',
    serverMessages: ['Update'],
    legacyControlRetained: true,
  },
  {
    lifecyclePoint: 'modification',
    clientModule: 'src/portfolioBoarding/portfolioLoanBoardingDataverseWriteClient.ts',
    clientOperation: 'buildLivePortfolioBoardingDataverseWriteClient.update',
    serverEntity: 'cr664_portfolioboardedloan',
    serverMessages: ['Update'],
    legacyControlRetained: true,
  },
  {
    lifecyclePoint: 'renewal',
    clientModule: 'src/portfolioAnnualReview/annualReviewPersistenceAdapter.ts',
    clientOperation: 'saveAnnualReviewPackage',
    serverEntity: 'cr664_portfolioboardedloanreview',
    serverMessages: ['Create'],
    legacyControlRetained: true,
  },
] as const;

export function validateLifecycleRuntimeBoundaries(): readonly string[] {
  const points = new Set<CreditLifecyclePoint>();
  const errors: string[] = [];
  for (const boundary of LIFECYCLE_RUNTIME_BOUNDARIES) {
    if (points.has(boundary.lifecyclePoint)) {
      errors.push(`Duplicate runtime boundary for ${boundary.lifecyclePoint}.`);
    }
    points.add(boundary.lifecyclePoint);
    if (!boundary.clientModule.startsWith('src/') || boundary.clientOperation.trim().length === 0) {
      errors.push(`Invalid client boundary for ${boundary.lifecyclePoint}.`);
    }
    if (!boundary.serverEntity.startsWith('cr664_') || boundary.serverMessages.length === 0) {
      errors.push(`Invalid server boundary for ${boundary.lifecyclePoint}.`);
    }
  }
  return errors;
}
