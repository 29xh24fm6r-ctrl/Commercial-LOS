/**
 * LOS Full Commercial Loan Workflow Activation ARC — PR 0 machine-readable truth matrix.
 *
 * PURE, INERT DATA. No IO, no imports of runtime modules, no side effects. This is the
 * machine-readable companion to docs/LOS_WORKFLOW_TRUTH_MATRIX.md, capturing the HONEST current
 * state of each stage transition so later arc PRs (esp. PR 22 certification) can measure progress
 * against one source of truth. It CHANGES NO RUNTIME BEHAVIOR and is not wired into any gate,
 * write path, or UI — it is descriptive only (registered as intentionally-unrouted).
 *
 * Grounded in source as of master 14d521f. Update this ONLY by re-auditing the named source files;
 * never edit a status to "make the matrix greener".
 */

/** Whether the transition performs a live governed persisted write today. */
export type LiveWriteStatus = 'live' | 'preview-only';

/** How deep the CURRENTLY-LIVE gate is for this transition. */
export type GateDepth = 'fact-backed' | 'shallow' | 'absent-facts';

/** Backing quality of a workflow fact. */
export type FactBacking = 'tracked' | 'tracked-non-blocking' | 'shallow' | 'absent-placeholder' | 'unrouted-module';

export interface WorkflowTransitionTruth {
  readonly id: string;
  readonly label: string;
  /** Canonical from/to stage codes, or the non-forward kind. */
  readonly from: string;
  readonly to: string;
  readonly kind: 'advance' | 'return' | 'decline' | 'withdraw';
  readonly liveWrite: LiveWriteStatus;
  readonly gateDepth: GateDepth;
  /** The live path can write audit + timeline and perform readback (capability present). */
  readonly auditTimelineReadbackCapable: boolean;
  /** A machine-proven smoke artifact (outcome passed + affectedRecordIds) exists for THIS transition. */
  readonly smokeProven: boolean;
  readonly recommendedPrs: readonly number[];
  readonly sourceFiles: readonly string[];
  readonly gaps: readonly string[];
}

export interface WorkflowFactTruth {
  readonly fact: string;
  readonly backing: FactBacking;
  readonly inLiveGate: boolean;
  readonly source: string;
  readonly recommendedPrs: readonly number[];
}

export const LOS_WORKFLOW_TRANSITIONS: readonly WorkflowTransitionTruth[] = Object.freeze([
  {
    id: 'T1', label: 'Intake → Underwriting', from: 'INTAKE', to: 'UNDERWRITING', kind: 'advance',
    liveWrite: 'live', gateDepth: 'shallow', auditTimelineReadbackCapable: true, smokeProven: false,
    recommendedPrs: [4, 5, 23, 24],
    sourceFiles: ['src/workflow/loanWorkflowStages.ts', 'src/workflow/loanWorkflowRules.ts', 'src/workflow/stageAdvanceWriteDependency.ts', 'src/deals/buildLiveStageAdvanceDeps.ts', 'src/deals/DealStageProgressionCard.tsx'],
    gaps: ['document gating by name substring', 'required tasks are non-blocking (at-risk)', 'borrower/guarantor/ownership verification not a typed fact', 'no machine-proven smoke'],
  },
  {
    id: 'T2', label: 'Underwriting → Credit Approval', from: 'UNDERWRITING', to: 'CREDIT_APPROVAL', kind: 'advance',
    liveWrite: 'live', gateDepth: 'absent-facts', auditTimelineReadbackCapable: true, smokeProven: false,
    recommendedPrs: [6, 7, 3],
    sourceFiles: ['src/workflow/loanWorkflowStages.ts', 'src/workflow/loanWorkflowRules.ts', 'src/workflow/stageGateContract.ts', 'src/portfolio/riskRating/dualRiskRating.ts'],
    gaps: ['risk rating absent/placeholder', 'underwriting recommendation not a typed fact', 'spreading/repayment/collateral analysis presence-only'],
  },
  {
    id: 'T3', label: 'Credit Approval → Commitment', from: 'CREDIT_APPROVAL', to: 'COMMITMENT', kind: 'advance',
    liveWrite: 'live', gateDepth: 'shallow', auditTimelineReadbackCapable: true, smokeProven: false,
    recommendedPrs: [8, 9],
    sourceFiles: ['src/workflow/loanWorkflowStages.ts', 'src/workflow/loanWorkflowRules.ts', 'src/workflow/stageGateContract.ts', 'src/workflow/approvalAuthorityMatrix.ts'],
    gaps: ['credit memo presence-only (no lifecycle status)', 'approval decision/authority/conditions not schema-backed records and not in the live gate', 'no routing/committee/amount-tier authority'],
  },
  {
    id: 'T4', label: 'Commitment → Documentation', from: 'COMMITMENT', to: 'DOCUMENTATION', kind: 'advance',
    liveWrite: 'live', gateDepth: 'absent-facts', auditTimelineReadbackCapable: true, smokeProven: false,
    recommendedPrs: [13],
    sourceFiles: ['src/workflow/loanWorkflowStages.ts', 'src/workflow/loanWorkflowRules.ts'],
    gaps: ['commitment issuance/acceptance not tracked (document-name presence only)', 'expired/superseded commitment cannot block'],
  },
  {
    id: 'T5', label: 'Documentation → Closing & Funding', from: 'DOCUMENTATION', to: 'CLOSING_FUNDING', kind: 'advance',
    liveWrite: 'live', gateDepth: 'absent-facts', auditTimelineReadbackCapable: true, smokeProven: false,
    recommendedPrs: [14],
    sourceFiles: ['src/workflow/loanWorkflowStages.ts', 'src/workflow/loanWorkflowRules.ts'],
    gaps: ['conditions precedent are derived, not real records', 'collateral/insurance/lien/title verification absent', 'documentation prep/execution status absent'],
  },
  {
    id: 'T6', label: 'Closing & Funding → Boarded', from: 'CLOSING_FUNDING', to: 'BOARDED', kind: 'advance',
    liveWrite: 'live', gateDepth: 'absent-facts', auditTimelineReadbackCapable: true, smokeProven: false,
    recommendedPrs: [15, 16],
    sourceFiles: ['src/workflow/loanWorkflowStages.ts', 'src/workflow/portfolioBoardingStatus.ts', 'src/portfolioBoarding/existingLoanEntryAdapter.ts'],
    gaps: ['executed docs / funds disbursed / booking-QC not typed facts', 'boarding derived from stage string regex, not a boarded-loan handoff record', 'the passing portfolioBoarding smoke is the separate manual existing-loan path, not the LOS advance'],
  },
  {
    id: 'T7', label: 'Return', from: '*', to: 'prior', kind: 'return',
    liveWrite: 'preview-only', gateDepth: 'shallow', auditTimelineReadbackCapable: true, smokeProven: false,
    recommendedPrs: [10, 21],
    sourceFiles: ['src/workflow/canonicalStageTransition.ts', 'src/deals/buildLiveCanonicalTransitionDeps.ts', 'src/workflow/StageWorkflowControl.tsx', 'src/navigation/intentionallyUnrouted.ts'],
    gaps: ['engine built + audited but WIRED_DISABLED (preview-only)', 'no return/rework record or required remediation items', 'no live readback proof captured'],
  },
  {
    id: 'T8', label: 'Decline', from: '*', to: 'DECLINED', kind: 'decline',
    liveWrite: 'preview-only', gateDepth: 'shallow', auditTimelineReadbackCapable: true, smokeProven: false,
    recommendedPrs: [11],
    sourceFiles: ['src/workflow/canonicalStageTransition.ts', 'src/deals/buildLiveCanonicalTransitionDeps.ts', 'src/workflow/StageWorkflowControl.tsx'],
    gaps: ['preview-only', 'no reason-code schema', 'adverse-action requirement/notification tracking absent', 'no authority/committee control on decline'],
  },
  {
    id: 'T9', label: 'Withdraw', from: '*', to: 'WITHDRAWN', kind: 'withdraw',
    liveWrite: 'preview-only', gateDepth: 'shallow', auditTimelineReadbackCapable: true, smokeProven: false,
    recommendedPrs: [12],
    sourceFiles: ['src/workflow/canonicalStageTransition.ts', 'src/deals/buildLiveCanonicalTransitionDeps.ts', 'src/workflow/StageWorkflowControl.tsx'],
    gaps: ['preview-only', 'no reason-code schema', 'no reopen workflow'],
  },
]);

export const LOS_WORKFLOW_FACTS: readonly WorkflowFactTruth[] = Object.freeze([
  { fact: 'required documents', backing: 'shallow', inLiveGate: true, source: 'src/workflow/loanWorkflowRules.ts:85-93', recommendedPrs: [4] },
  { fact: 'required tasks', backing: 'tracked-non-blocking', inLiveGate: true, source: 'src/workflow/loanWorkflowRules.ts:32-40', recommendedPrs: [5] },
  { fact: 'credit memo', backing: 'shallow', inLiveGate: true, source: 'src/workflow/loanWorkflowRules.ts:100-131', recommendedPrs: [8] },
  { fact: 'risk rating', backing: 'absent-placeholder', inLiveGate: false, source: 'src/workflow/stageGateContract.ts:117-121', recommendedPrs: [6] },
  { fact: 'underwriting recommendation', backing: 'absent-placeholder', inLiveGate: false, source: 'src/workflow/loanWorkflowStages.ts:56-78', recommendedPrs: [7] },
  { fact: 'approval decision/authority/conditions', backing: 'shallow', inLiveGate: false, source: 'src/workflow/stageGateContract.ts:128-133', recommendedPrs: [9] },
  { fact: 'commitment issuance/acceptance', backing: 'absent-placeholder', inLiveGate: false, source: 'src/workflow/loanWorkflowStages.ts:103-115', recommendedPrs: [13] },
  { fact: 'conditions precedent', backing: 'shallow', inLiveGate: true, source: 'src/workflow/loanWorkflowRules.ts:133-143', recommendedPrs: [14] },
  { fact: 'closing/funding/booking-QC', backing: 'absent-placeholder', inLiveGate: false, source: 'src/workflow/loanWorkflowStages.ts:135-147', recommendedPrs: [15] },
  { fact: 'boarded-loan handoff', backing: 'shallow', inLiveGate: true, source: 'src/workflow/portfolioBoardingStatus.ts:18-34', recommendedPrs: [16] },
  { fact: 'covenants/ticklers/monitoring/annual-review/watchlist/early-warning', backing: 'unrouted-module', inLiveGate: false, source: 'src/portfolio/*, src/annualReview/*, src/navigation/intentionallyUnrouted.ts', recommendedPrs: [17, 18, 19] },
]);

/** True only when every transition is a live write AND smoke-proven — the arc's Definition of Done for transitions. */
export function isFullWorkflowLiveAndProven(): boolean {
  return LOS_WORKFLOW_TRANSITIONS.every((t) => t.liveWrite === 'live' && t.smokeProven);
}
