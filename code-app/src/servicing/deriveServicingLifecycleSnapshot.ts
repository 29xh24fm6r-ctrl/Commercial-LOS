/**
 * Phase 142E — Servicing lifecycle SNAPSHOT deriver.
 *
 * PURE, READ-ONLY. Aggregates the stage + obligations + collateral / insurance /
 * tickler / covenant-reporting / maturity statuses into one lifecycle health
 * snapshot. Highest-severity blocker wins; next best actions are operational
 * (no approval / waiver / send language); no writes, no fake balances/payments.
 */

import type {
  ServicingLifecycleInput,
  ServicingLifecycleSnapshot,
  ServicingLifecycleStatus,
  ServicingLifecycleMilestone,
  ServicingLifecycleObligation,
  ServicingCollateralSecurityStatus,
  ServicingInsuranceStatus,
  ServicingTicklerStatus,
  ServicingCovenantReportingStatus,
  ServicingMaturityRenewalStatus,
  ServicingExceptionStatus,
  ServicingOwnershipTransferStatus,
  ServicingLifecycleBlocker,
  ServicingLifecycleWarning,
  ServicingLifecycleNextAction,
} from './servicingLifecycleTypes';
import type { ServicingLifecycleStageResult } from './deriveServicingLifecycleStage';

export interface DeriveServicingLifecycleSnapshotInput {
  input: ServicingLifecycleInput;
  stage: ServicingLifecycleStageResult;
  obligations: readonly ServicingLifecycleObligation[];
  collateralSecurityStatus: ServicingCollateralSecurityStatus;
  insuranceStatus: ServicingInsuranceStatus;
  ticklerStatus: ServicingTicklerStatus;
  covenantReportingStatus: ServicingCovenantReportingStatus;
  maturityRenewalStatus: ServicingMaturityRenewalStatus;
  exceptionStatus?: ServicingExceptionStatus;
  ownershipTransferStatus?: ServicingOwnershipTransferStatus;
}

const SEVERITY_TO_STATUS: Record<number, ServicingLifecycleStatus> = {
  6: 'exception_active',
  5: 'blocked_missing_evidence',
  4: 'blocked_missing_data',
  3: 'review_required',
  2: 'attention_required',
  1: 'healthy_with_caveats',
  0: 'healthy',
};

function statusSeverity(status: string): number {
  if (status === 'exception_active') return 6;
  if (status === 'expired' || status === 'missing_evidence') return 5;
  if (status === 'unknown_missing_data' || status === 'review_required') return 3;
  if (status === 'attention_required') return 2;
  if (status === 'complete_with_caveats' || status === 'renewal_or_maturity_review' || status === 'healthy_with_caveats') return 1;
  return 0;
}

function stageSeverity(stage: string): number {
  if (stage === 'covenant_exception_monitoring' || stage === 'servicing_exception_remediation' || stage === 'payoff_or_exit_review') return 6;
  if (stage === 'unknown_review_required') return 3;
  if (stage === 'renewal_or_maturity_review' || stage === 'annual_review_due') return 2;
  if (stage === 'boarding_in_progress' || stage === 'boarded_pending_verification') return 1;
  return 0;
}

export function deriveServicingLifecycleSnapshot(
  args: DeriveServicingLifecycleSnapshotInput,
): ServicingLifecycleSnapshot {
  const { input, stage } = args;
  const exceptionStatus: ServicingExceptionStatus = args.exceptionStatus ?? {
    status: input.servicingExceptionActive || input.covenantExceptionActive ? 'exception_active' : 'none',
    openExceptions: [], blockers: [], warnings: [], nextBestAction: { code: 'monitor_exceptions', label: 'Continue exception monitoring (read-only).' },
  };
  const ownershipTransferStatus: ServicingOwnershipTransferStatus = args.ownershipTransferStatus ?? {
    status: 'no_transfer', blockers: [], warnings: [], nextBestAction: { code: 'none', label: 'No ownership transfer pending.' },
  };

  const components = [
    args.collateralSecurityStatus, args.insuranceStatus, args.ticklerStatus,
    args.covenantReportingStatus, args.maturityRenewalStatus, exceptionStatus, ownershipTransferStatus,
  ];

  const severity = Math.max(
    stageSeverity(stage.lifecycleStage),
    ...components.map((c) => statusSeverity(c.status)),
  );
  const lifecycleStatus = SEVERITY_TO_STATUS[severity] ?? 'review_required';

  const blockers: ServicingLifecycleBlocker[] = [...stage.blockers, ...components.flatMap((c) => c.blockers)];
  const warnings: ServicingLifecycleWarning[] = [...stage.warnings, ...components.flatMap((c) => c.warnings)];

  const nextBestActions: ServicingLifecycleNextAction[] = [];
  const seenCodes = new Set<string>();
  const pushAction = (a: ServicingLifecycleNextAction) => { if (a.code !== 'none' && !seenCodes.has(a.code)) { seenCodes.add(a.code); nextBestActions.push(a); } };
  if (severity > 0) {
    for (const c of components) if (statusSeverity(c.status) > 0) pushAction(c.nextBestAction);
    pushAction(stage.nextBestAction);
  }
  if (nextBestActions.length === 0) pushAction({ code: 'monitor_lifecycle', label: 'Continue read-only lifecycle monitoring.' });

  const milestones: ServicingLifecycleMilestone[] = [
    { milestoneKey: 'boarded', label: 'Boarded', status: input.boardedLoan?.verified ? 'candidate_complete' : input.boardedLoan?.exists ? 'pending' : 'not_applicable' },
    { milestoneKey: 'booked', label: 'Booked / active', status: stage.lifecycleStage === 'booked_active' || stage.lifecycleStage === 'active_monitoring' ? 'candidate_complete' : 'pending' },
    { milestoneKey: 'annual_review', label: 'Annual review', status: input.annualReviewDueStatus === 'due' || input.annualReviewDueStatus === 'past_due' ? 'pending' : 'not_applicable' },
  ];

  const evidenceDocumentIds = Array.from(new Set(args.obligations.flatMap((o) => o.sourceDocumentIds)));

  return {
    lifecycleId: input.lifecycleId,
    sourceLoanId: input.sourceLoanId,
    sourceDealId: input.sourceDealId,
    boardedLoanId: input.boardedLoanId,
    borrowerName: input.borrowerName,
    lifecycleStage: stage.lifecycleStage,
    lifecycleStatus,
    milestones,
    obligations: args.obligations,
    readiness: { status: lifecycleStatus, blockers, warnings },
    health: { status: lifecycleStatus, summary: `Lifecycle ${lifecycleStatus.replace(/_/g, ' ')} at stage ${stage.lifecycleStage.replace(/_/g, ' ')}.` },
    collateralSecurityStatus: args.collateralSecurityStatus,
    insuranceStatus: args.insuranceStatus,
    ticklerStatus: args.ticklerStatus,
    covenantReportingStatus: args.covenantReportingStatus,
    maturityRenewalStatus: args.maturityRenewalStatus,
    exceptionStatus,
    ownershipTransferStatus,
    blockers,
    warnings,
    nextBestActions,
    auditSummary: { lifecycleId: input.lifecycleId, evidenceDocumentIds, containsFakeBalance: false, containsPaymentPosting: false, readOnly: true },
  };
}
