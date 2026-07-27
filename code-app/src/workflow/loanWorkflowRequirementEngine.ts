import { normalizeDocumentName as normalizeName } from '../shared/deals/documentNameNormalization';
import type { DealDetail } from '../deals/dealQueries';
import type { DealTasksResult } from '../deals/dealTaskQueries';
import type { DealDocumentsResult } from '../deals/dealDocumentQueries';
import type { CreditMemoData } from '../deals/creditMemoQueries';
import { deriveLoanWorkflowReadiness } from './loanWorkflowRules';
import { getLoanWorkflowStage } from './loanWorkflowStages';
import type { LoanWorkflowRequirement, LoanWorkflowStageDefinition } from './loanWorkflowTypes';
import type { CanonicalStageCode, StageOrderingResult } from './stageOrderingContract';
import {
  evaluateCanonicalStageTransition,
  type CanonicalTransitionRequest,
  type DealStatusCode,
  type StructuredDeclineReason,
} from './canonicalStageTransition';
import {
  authoredDeepRequirementsForScope,
  requirementsForScope,
  shallowRequirementMeta,
} from './loanWorkflowRequirementRegistry';
import {
  evaluateRiskRatingReadiness,
  evaluateUnderwritingRecommendationReadiness,
  type RiskRatingRecord,
  type RiskRatingPolicy,
  type UnderwritingRecommendationRecord,
} from './underwritingDeepFacts';
import { evaluateCreditApprovalDecisionReadiness, type CreditApprovalDecisionRecord } from './creditApprovalDecisionTypes';
import { evaluateCreditMemoFinalizationReadiness } from './creditMemoFinalizationReadiness';
import { evaluateCommitmentReadiness, type CommitmentRecord } from './commitmentRecordTypes';
import { evaluateConditionVerificationReadiness, type ConditionVerificationRecord } from './conditionVerificationTypes';
import { evaluateExecutedDocumentAttestationReadiness, type ExecutedDocumentAttestationRecord } from './executedDocumentAttestationTypes';
import { evaluateBookingQcReadiness, type BookingQcCheckRecord } from './bookingQcCheckTypes';
import { evaluateAdverseActionReadiness, type AdverseActionRecord } from './adverseActionRecordTypes';
import type { BoardingHandoffReadiness } from './boardingHandoffReadiness';
import type { FundingAuthorizationRecord } from '../funding/fundingAuthorizationTypes';
import type {
  CanonicalRequirement,
  EvaluatedRequirement,
  RequirementCategory,
  RequirementScope,
  RequirementStatus,
  StageExitReadiness,
  TransitionReadiness,
} from './loanWorkflowRequirementTypes';

/**
 * ARC Phase 1 — Requirement evaluation engine.
 *
 * Evaluates the canonical requirement registry against the deal's facts and returns, per requirement,
 * whether it is met / unmet / untracked / unavailable, whether it blocks, where it is resolved, and
 * who owns it — the single evaluated result the UI AND the write policy can share.
 *
 * COMPATIBILITY (ARC Phase 1 rule): the currently-tracked (shallow) facts are evaluated through the
 * EXISTING live readiness function `deriveLoanWorkflowReadiness` — clearly marked below as the
 * `LEGACY tracked-fact adapter`. This guarantees the engine's blocking decision is behavior-identical
 * to today's live gate for tracked facts (so Intake → Underwriting and the PR #68 Stage Map are
 * unchanged). Deep facts that are not yet tracked (registry `tracked: false`) fail closed as
 * `untracked` blockers — never fabricated as met. Later ARC PRs replace the legacy adapter per fact
 * with typed backings. This engine is INERT until a consuming ARC PR wires it; it flips no gate.
 */

export interface WorkflowRequirementFacts {
  readonly deal: DealDetail;
  readonly tasks?: DealTasksResult;
  readonly documents?: DealDocumentsResult;
  readonly creditMemo?: CreditMemoData;
  readonly tasksUnavailable?: boolean;
  readonly documentsUnavailable?: boolean;
  readonly creditMemoUnavailable?: boolean;
  // ARC Phase 3 model, Factory Arc Phase 5 persistence, Production Remediation Phase 6 enforcement
  // (N-14/N-15) — supplied by `deriveRiskRatingRecordFromDeal`/`deriveUnderwritingRecommendationRecordFromDeal`
  // (underwritingDeepFacts.ts) from the deal's own persisted record; absent when nothing has been
  // recorded yet, never fabricated.
  readonly riskRating?: RiskRatingRecord;
  readonly riskRatingPolicy?: RiskRatingPolicy;
  readonly underwritingRecommendation?: UnderwritingRecommendationRecord;
  /**
   * Factory Arc Phase 12 — the deal's current funding-authorization record (supplied by a loader;
   * see DealDataProvider.tsx's `fundingAuthorization`). Absent means either the record hasn't loaded
   * yet or genuinely doesn't exist (no funding has been requested) — CLOSING_FUNDING:funds_disbursed
   * fails closed as unmet in either case, never fabricated as met.
   */
  readonly fundingAuthorization?: FundingAuthorizationRecord;
  /**
   * Final LOS Completion arc (Workstream C/K) — the deal's Credit Approval Decision history
   * (supplied by a loader; see DealDataProvider.tsx's `creditApprovalDecisions`). Absent/empty means
   * either the records haven't loaded yet or none have genuinely been recorded —
   * CREDIT_APPROVAL:approval_decision/:approval_authority/:approval_conditions all fail closed as
   * unmet in either case, never fabricated as met.
   */
  readonly creditApprovalDecisions?: readonly CreditApprovalDecisionRecord[];
  /**
   * Final LOS Completion arc (Workstream D/K) — the deal's Commitment Record history (supplied by a
   * loader; see DealDataProvider.tsx's `commitments`). Absent/empty means either the records
   * haven't loaded yet or none have genuinely been recorded — COMMITMENT:commitment_issued/
   * :borrower_acceptance both fail closed as unmet in either case, never fabricated as met.
   */
  readonly commitments?: readonly CommitmentRecord[];
  /**
   * Final LOS Completion arc (Workstream E/K) — the deal's Condition Verification history
   * (supplied by a loader; see DealDataProvider.tsx's `conditionVerifications`). Absent/empty means
   * either the records haven't loaded yet or none have genuinely been recorded —
   * DOCUMENTATION:conditions_precedent/:collateral_verified/:insurance_verified all fail closed as
   * unmet in either case, never fabricated as met.
   */
  readonly conditionVerifications?: readonly ConditionVerificationRecord[];
  /**
   * Final LOS Completion arc (Workstream F/K) — the deal's Executed Document Attestation history
   * (supplied by a loader; see DealDataProvider.tsx's `executedDocumentAttestations`).
   * Absent/empty means either the records haven't loaded yet or none have genuinely been recorded —
   * CLOSING_FUNDING:executed_docs fails closed as unmet in either case, never fabricated as met.
   */
  readonly executedDocumentAttestations?: readonly ExecutedDocumentAttestationRecord[];
  /**
   * Final LOS Completion arc (Workstream H/K) — the deal's Booking QC Check history (supplied by a
   * loader; see DealDataProvider.tsx's `bookingQcChecks`). Absent/empty means either the records
   * haven't loaded yet or none have genuinely been recorded — CLOSING_FUNDING:booking_qc fails
   * closed as unmet in either case, never fabricated as met.
   */
  readonly bookingQcChecks?: readonly BookingQcCheckRecord[];
  /**
   * Final LOS Completion arc (Workstream J) — the deal's Adverse Action Record history (supplied by
   * a loader; see DealDataProvider.tsx's `adverseActionRecords`). Absent/empty means either the
   * records haven't loaded yet or the obligation genuinely hasn't been documented yet —
   * DECLINE:adverse_action fails closed as unmet in either case, never fabricated as met. Only
   * meaningful once the deal is actually DECLINED (see deriveTransitionReadiness below).
   */
  readonly adverseActionRecords?: readonly AdverseActionRecord[];
  /**
   * Final LOS Completion arc (Workstream H) — the deal's real portfolio boarded-loan handoff
   * evidence, reconciled against the deal's own stage (see boardingHandoffReadiness.ts /
   * loadBoardingHandoffForDeal.ts). Absent means the read hasn't completed yet — both
   * BOARDED:boarded_loan_record and BOARDED:servicing_owner fail closed as unmet, never fabricated
   * as met, when this is undefined.
   */
  readonly boardingHandoff?: BoardingHandoffReadiness;
}

/**
 * Evaluate an authored DEEP requirement via its model when the fact is tracked. When the requirement is
 * still untracked (no backing record in the schema), it fails closed as `untracked` (surfaced as a
 * "future" requirement — never fabricated as met). This is dormant while every deep fact is untracked;
 * it is the wire a later phase turns on by flipping the registry entry to `tracked: true` + supplying
 * the fact from a loader.
 */
export function evaluateDeepFactRequirement(req: CanonicalRequirement, facts: WorkflowRequirementFacts): EvaluatedRequirement {
  if (!req.tracked) return evaluated(req, 'untracked', req.blockerReason);
  if (req.id === 'UNDERWRITING:risk_rating') {
    const r = evaluateRiskRatingReadiness(facts.riskRating, facts.deal.id, facts.riskRatingPolicy);
    return evaluated(req, r.met ? 'met' : 'unmet', r.reason);
  }
  if (req.id === 'UNDERWRITING:uw_recommendation') {
    const r = evaluateUnderwritingRecommendationReadiness(facts.underwritingRecommendation, facts.deal.id);
    return evaluated(req, r.met ? 'met' : 'unmet', r.reason);
  }
  if (req.id === 'CLOSING_FUNDING:funds_disbursed') {
    const funded = facts.fundingAuthorization?.authorizationStatus === 'FUNDED';
    return evaluated(req, funded ? 'met' : 'unmet', funded ? '' : req.blockerReason);
  }
  if (req.id === 'CREDIT_APPROVAL:memo_finalized') {
    const r = evaluateCreditMemoFinalizationReadiness(facts.creditMemo);
    return evaluated(req, r.memoFinalized.met ? 'met' : 'unmet', r.memoFinalized.met ? '' : (r.memoFinalized.reason || req.blockerReason));
  }
  if (
    req.id === 'CREDIT_APPROVAL:approval_decision' ||
    req.id === 'CREDIT_APPROVAL:approval_authority' ||
    req.id === 'CREDIT_APPROVAL:approval_conditions'
  ) {
    const r = evaluateCreditApprovalDecisionReadiness(facts.creditApprovalDecisions, facts.deal.id);
    const fact =
      req.id === 'CREDIT_APPROVAL:approval_decision'
        ? r.decisionRecorded
        : req.id === 'CREDIT_APPROVAL:approval_authority'
          ? r.authorityRecorded
          : r.conditionsDocumented;
    return evaluated(req, fact.met ? 'met' : 'unmet', fact.met ? '' : (fact.reason || req.blockerReason));
  }
  if (req.id === 'COMMITMENT:commitment_issued' || req.id === 'COMMITMENT:borrower_acceptance') {
    const r = evaluateCommitmentReadiness(facts.commitments, facts.deal.id);
    const fact = req.id === 'COMMITMENT:commitment_issued' ? r.commitmentIssued : r.borrowerAcceptance;
    return evaluated(req, fact.met ? 'met' : 'unmet', fact.met ? '' : (fact.reason || req.blockerReason));
  }
  if (
    req.id === 'DOCUMENTATION:conditions_precedent' ||
    req.id === 'DOCUMENTATION:collateral_verified' ||
    req.id === 'DOCUMENTATION:insurance_verified'
  ) {
    const r = evaluateConditionVerificationReadiness(facts.conditionVerifications, facts.deal.id);
    const fact =
      req.id === 'DOCUMENTATION:conditions_precedent'
        ? r.conditionsPrecedent
        : req.id === 'DOCUMENTATION:collateral_verified'
          ? r.collateralVerified
          : r.insuranceVerified;
    return evaluated(req, fact.met ? 'met' : 'unmet', fact.met ? '' : (fact.reason || req.blockerReason));
  }
  if (req.id === 'CLOSING_FUNDING:executed_docs') {
    const r = evaluateExecutedDocumentAttestationReadiness(facts.executedDocumentAttestations, facts.deal.id);
    const fact = r.executedDocsAttested;
    return evaluated(req, fact.met ? 'met' : 'unmet', fact.met ? '' : (fact.reason || req.blockerReason));
  }
  if (req.id === 'CLOSING_FUNDING:booking_qc') {
    const r = evaluateBookingQcReadiness(facts.bookingQcChecks, facts.deal.id);
    const fact = r.bookingQcComplete;
    return evaluated(req, fact.met ? 'met' : 'unmet', fact.met ? '' : (fact.reason || req.blockerReason));
  }
  if (req.id === 'BOARDED:boarded_loan_record') {
    const met = facts.boardingHandoff?.boardingCompleted ?? false;
    const reason = facts.boardingHandoff?.blockers[0];
    return evaluated(req, met ? 'met' : 'unmet', met ? '' : (reason || req.blockerReason));
  }
  if (req.id === 'BOARDED:servicing_owner') {
    const met = facts.boardingHandoff?.servicingOwnerAssigned ?? false;
    const reason = facts.boardingHandoff?.blockers.find((blocker) => /servicing owner/i.test(blocker));
    return evaluated(req, met ? 'met' : 'unmet', met ? '' : (reason || req.blockerReason));
  }
  // Tracked deep fact without a model yet → fail closed (should not happen in Phase 3).
  return evaluated(req, 'unmet', req.blockerReason);
}

/** The set of currently-tracked requirements a stage's exit gates, evaluated from the live readiness. */
interface LegacyEval {
  readonly unmetIds: ReadonlySet<string>;
  readonly unavailable: { documents: boolean; tasks: boolean; creditMemo: boolean };
}

/**
 * LEGACY tracked-fact adapter — the ONLY shallow evaluation in the engine, delegated to the existing
 * live gate so behavior is identical. Returns the set of stage-def requirement ids that are NOT met.
 */
function evaluateLegacyTrackedFacts(stage: LoanWorkflowStageDefinition, facts: WorkflowRequirementFacts): LegacyEval {
  const readiness = deriveLoanWorkflowReadiness({
    deal: facts.deal,
    stage,
    tasks: facts.tasks,
    documents: facts.documents,
    creditMemo: facts.creditMemo,
    tasksUnavailable: facts.tasksUnavailable,
    documentsUnavailable: facts.documentsUnavailable,
    creditMemoUnavailable: facts.creditMemoUnavailable,
  });
  const unmet = new Set<string>();
  for (const r of readiness.missingFields) unmet.add(`field:${r.id}`);
  for (const r of readiness.missingDocuments) unmet.add(`document:${r.id}`);
  for (const r of readiness.missingTasks) unmet.add(`task:${r.id}`);
  for (const b of readiness.creditBlockers) unmet.add(`credit:${b.id}`);
  for (const b of readiness.closingBlockers) unmet.add(`closing:${b.id}`);
  return {
    unmetIds: unmet,
    unavailable: {
      documents: facts.documentsUnavailable === true,
      tasks: facts.tasksUnavailable === true,
      creditMemo: facts.creditMemoUnavailable === true,
    },
  };
}

function evaluated(req: CanonicalRequirement, status: RequirementStatus, reason: string): EvaluatedRequirement {
  const canBlock = req.severity === 'blocking' && status !== 'met';
  return {
    id: req.id,
    scope: req.scope,
    label: req.label,
    uiCopy: req.uiCopy,
    category: req.category,
    severity: req.severity,
    status,
    whereToResolve: req.resolverSurface,
    responsibleRole: req.responsibleRole,
    backingType: req.backingType,
    tracked: req.tracked,
    canBlockTransition: canBlock,
    reason: status === 'met' ? '' : reason,
  };
}

function fallbackMeta(scope: RequirementScope, category: RequirementCategory, raw: LoanWorkflowRequirement): CanonicalRequirement {
  // Should not happen — the registry is derived from the same stage defs.
  return {
    id: `${scope}:${category}:${raw.id}`, scope, label: raw.label, description: raw.label,
    category, severity: category === 'task' ? 'recommended' : 'blocking',
    resolverSurface: category === 'field' ? 'Deal Profile' : category === 'document' ? 'Documents' : category === 'task' ? 'Tasks' : 'Credit Memo',
    responsibleRole: 'banker', backingType: category === 'field' ? 'deal_field' : category === 'document' ? 'document_requirement' : category === 'task' ? 'task_status' : 'memo_status',
    tracked: true, matchMode: category === 'field' ? 'typed' : 'inferred', uiCopy: raw.label, blockerReason: `${raw.label} is required.`,
  };
}


/** Evaluate a field / credit / closing requirement via the legacy live-readiness adapter. */
function evaluateViaLegacy(scope: RequirementScope, category: RequirementCategory, raw: LoanWorkflowRequirement, legacy: LegacyEval): EvaluatedRequirement {
  const req = shallowRequirementMeta(scope, category, raw.id) ?? fallbackMeta(scope, category, raw);
  const dataUnavailable = category === 'credit' && legacy.unavailable.creditMemo;
  const status: RequirementStatus = dataUnavailable ? 'unavailable' : legacy.unmetIds.has(`${category}:${raw.id}`) ? 'unmet' : 'met';
  const reason = status === 'unavailable' ? `${req.label} could not be confirmed — its data source is unavailable (fail-closed).` : req.blockerReason;
  return evaluated(req, status, reason);
}

/**
 * TYPED document evaluation — the authoritative document gate (replaces pure name-substring readiness).
 * Matching to the requirement is by name (inferred — no business-type key in the schema) but the STATUS
 * that satisfies is TYPED: `received` level is met by a received OR reviewed document; `reviewed` level
 * is met ONLY by a reviewed document (an uploaded/received-but-unreviewed document does not satisfy).
 * The schema has no accepted/rejected/waived state, so those never falsely satisfy. Fails closed when
 * document data is unavailable.
 */
export function evaluateDocumentRequirement(req: CanonicalRequirement, facts: WorkflowRequirementFacts): EvaluatedRequirement {
  const level = req.documentReviewLevel ?? 'received';
  if (facts.documentsUnavailable === true || facts.documents === undefined) {
    return evaluated(req, 'unavailable', `${req.label} could not be confirmed — document data is unavailable (fail-closed).`);
  }
  const docs = facts.documents;
  const needle = normalizeName(req.label);
  const matches = [...docs.reviewed, ...docs.received, ...docs.outstanding].filter((d) => normalizeName(d.name).includes(needle));
  const reviewed = matches.find((d) => d.status === 'reviewed');
  const received = matches.find((d) => d.status === 'received');
  const best = reviewed ?? received ?? matches[0];
  const met = level === 'reviewed' ? Boolean(reviewed) : Boolean(reviewed || received);
  const status: RequirementStatus = met ? 'met' : 'unmet';
  let reason = '';
  if (!met) {
    if (matches.length === 0) reason = `No "${req.label}" document is on file.`;
    else if (level === 'reviewed' && received) reason = `"${req.label}" is received but not yet reviewed — a reviewed document is required.`;
    else reason = `"${req.label}" is outstanding.`;
  }
  const e = evaluated(req, status, reason);
  return best ? { ...e, evidence: { recordId: best.id, entity: 'cr664_documentchecklist', status: best.status, reviewedBy: best.reviewer } } : e;
}

/** Evaluate a task requirement: completion by name (inferred), severity from the registry policy. */
export function evaluateTaskRequirement(req: CanonicalRequirement, facts: WorkflowRequirementFacts): EvaluatedRequirement {
  if (facts.tasksUnavailable === true || facts.tasks === undefined) {
    return evaluated(req, 'unavailable', `${req.label} could not be confirmed — task data is unavailable (fail-closed).`);
  }
  const needle = normalizeName(req.label);
  const done = facts.tasks.completed.some((t) => normalizeName(t.title).includes(needle));
  return evaluated(req, done ? 'met' : 'unmet', done ? '' : `Task "${req.label}" is not complete.`);
}

/**
 * Evaluate every requirement gating a stage's exit: fields/credit/closing via the legacy live-readiness
 * adapter (behavior-identical), documents via the TYPED evaluator, tasks via the registry severity
 * policy, plus deep facts (untracked → fail-closed, never fabricated as met).
 */
export function evaluateStageExitRequirements(
  stageCode: CanonicalStageCode,
  facts: WorkflowRequirementFacts,
): EvaluatedRequirement[] {
  const stage = getLoanWorkflowStage(stageCode);
  const legacy = evaluateLegacyTrackedFacts(stage, facts);
  const shallow: EvaluatedRequirement[] = [
    ...stage.requiredFields.map((r) => evaluateViaLegacy(stageCode, 'field', r, legacy)),
    ...stage.requiredDocuments.map((r) => evaluateDocumentRequirement(shallowRequirementMeta(stageCode, 'document', r.id) ?? fallbackMeta(stageCode, 'document', r), facts)),
    ...stage.requiredTasks.map((r) => evaluateTaskRequirement(shallowRequirementMeta(stageCode, 'task', r.id) ?? fallbackMeta(stageCode, 'task', r), facts)),
    ...stage.creditRequirements.map((r) => evaluateViaLegacy(stageCode, 'credit', r, legacy)),
    ...stage.closingRequirements.map((r) => evaluateViaLegacy(stageCode, 'closing', r, legacy)),
  ];
  // Deep facts: evaluate via their model when tracked; fail closed as untracked/future otherwise
  // (never fabricated as met). Every deep fact is untracked today, so this surfaces them as "future".
  const deep = authoredDeepRequirementsForScope(stageCode).map((r) => evaluateDeepFactRequirement(r, facts));
  return [...shallow, ...deep];
}

/** The engine's readiness verdict for a stage's exit. */
export function deriveStageExitReadiness(
  stageCode: CanonicalStageCode,
  facts: WorkflowRequirementFacts,
): StageExitReadiness {
  const requirements = evaluateStageExitRequirements(stageCode, facts);
  const blocking = requirements.filter((r) => r.canBlockTransition && r.tracked);
  const untracked = requirements.filter((r) => r.status === 'untracked');
  const recommended = requirements.filter((r) => r.severity === 'recommended' && r.status !== 'met');
  const status: StageExitReadiness['status'] = blocking.length > 0 || untracked.length > 0 ? 'blocked' : 'ready';
  return { scope: stageCode, status, requirements, blocking, recommended, untracked };
}

export interface StageExitPolicyResult {
  readonly allowed: boolean;
  readonly reason: string;
  readonly blocking: readonly EvaluatedRequirement[];
}

/**
 * The LIVE stage-exit policy for ARC Phase 2: a transition is allowed when no TRACKED blocking
 * requirement is unmet. Risk rating and underwriting recommendation are tracked as of Production
 * Remediation Factory Arc Phase 6 (N-14/N-15) and block for real; the remaining untracked deep facts
 * (approval, closing, boarding, …) are NOT yet enforced live — they are surfaced as "future"
 * requirements and gate attestation later, but do not block the transition until their major
 * phase. This is the shared decision the UI button and the write policy agree on (proven equivalent
 * to evaluateStageTransitionPolicy for the current config).
 */
export function evaluateStageExitPolicy(readiness: StageExitReadiness): StageExitPolicyResult {
  const allowed = readiness.blocking.length === 0;
  return {
    allowed,
    blocking: readiness.blocking,
    reason: allowed ? '' : `${readiness.blocking.length} governed exit criteria are not satisfied.`,
  };
}

/** Inputs a non-forward (return/decline/withdraw) readiness check needs — see {@link deriveTransitionReadiness}. */
export interface NonForwardTransitionInput {
  readonly ordering: StageOrderingResult;
  readonly currentStatus: DealStatusCode;
  /** RETURN/WITHDRAW free-text reason. */
  readonly reason?: string;
  /** DECLINE structured reason. */
  readonly declineReason?: StructuredDeclineReason;
  readonly authorized: boolean;
}

/**
 * Governance initiative (2026-07-21) — the engine's readiness verdict for a specific transition.
 * Forward advances evaluate the source stage's exit (unchanged). Non-forward paths (return/decline/
 * withdraw) delegate their pass/fail decision to `canonicalStageTransition.ts`'s pure policy
 * evaluator — the SAME function `StageWorkflowControl.tsx`'s live write path calls — so there is one
 * evaluator for these three transition kinds, not two. This function additionally attaches the
 * registry's descriptive metadata (labels, resolver surfaces, the still-untracked advisory items) for
 * UI display; it does not re-derive the pass/fail decision itself. See
 * `docs/governance/CANONICAL_TRANSITION_POLICY_CONTRACT.md` §10 for the parity discipline this keeps.
 */
export function deriveTransitionReadiness(
  from: RequirementScope,
  kind: 'advance' | 'return' | 'decline' | 'withdraw',
  facts: WorkflowRequirementFacts,
  requestedTo?: CanonicalStageCode,
  nonForward?: NonForwardTransitionInput,
): TransitionReadiness {
  if (kind === 'advance') {
    const stageCode = from as CanonicalStageCode;
    const stage = getLoanWorkflowStage(stageCode);
    const exit = deriveStageExitReadiness(stageCode, facts);
    const approved = requestedTo === undefined || stage.allowedNextStages.includes(requestedTo);
    if (!approved) {
      return { from, kind, to: requestedTo, status: 'blocked', exit, reason: `${requestedTo} is not an approved next stage from ${stage.label}.` };
    }
    return {
      from, kind, to: requestedTo ?? stage.allowedNextStages[0], status: exit.status,
      exit,
      reason: exit.status === 'blocked' ? `${stage.label} exit criteria are not satisfied.` : '',
    };
  }

  const scope: RequirementScope = kind === 'return' ? 'RETURN' : kind === 'decline' ? 'DECLINE' : 'WITHDRAW';
  const registryReqs = requirementsForScope(scope);

  if (!nonForward) {
    // No policy inputs supplied — cannot evaluate; fail closed exactly like an unmet requirement
    // (never silently "ready"). Callers that want a real verdict must supply `nonForward`.
    const reqs = registryReqs.map((r) => evaluated(r, 'untracked', r.blockerReason));
    const exit: StageExitReadiness = { scope, status: 'blocked', requirements: reqs, blocking: reqs.filter((r) => r.severity === 'blocking'), recommended: reqs.filter((r) => r.severity === 'recommended'), untracked: reqs };
    return { from, kind, status: 'blocked', exit, reason: 'Insufficient inputs to evaluate this transition.' };
  }

  const stageTransitionKind = kind === 'return' ? 'RETURN' : kind === 'decline' ? 'DECLINE' : 'WITHDRAW';
  const request: CanonicalTransitionRequest = {
    kind: stageTransitionKind,
    currentStage: from as CanonicalStageCode,
    currentStatus: nonForward.currentStatus,
    targetStage: kind === 'return' ? requestedTo : undefined,
    reason: nonForward.reason,
    declineReason: nonForward.declineReason,
  };
  const policy = evaluateCanonicalStageTransition({ request, ordering: nonForward.ordering, authorized: nonForward.authorized });

  // Build the requirement list for display: the checkable reason requirement gets a real met/unmet
  // verdict from the policy outcome; DECLINE:adverse_action (Workstream J) gets a real verdict from
  // the durable Adverse Action Record, when one could exist (only once the deal is actually
  // DECLINED — before that, a decline hasn't happened yet, so there is nothing to document, and the
  // item correctly stays a non-blocking 'unmet' advisory rather than a fabricated 'met'). The
  // remaining still-untracked advisory item (RETURN:authorization — see this function's own header
  // comment on why that stays out of scope) stays 'untracked' + 'recommended' (visible, never
  // blocking — see the registry's severity override).
  const reasonReqId = `${scope}:reason`;
  const adverseActionReqId = `${scope}:adverse_action`;
  const requirements = registryReqs.map((r) => {
    if (r.id === reasonReqId) {
      const reasonMissing = !policy.allowed && /reason/i.test(policy.reason);
      return evaluated(r, reasonMissing ? 'unmet' : 'met', r.blockerReason);
    }
    if (r.id === adverseActionReqId) {
      const alreadyDeclined = nonForward.currentStatus === 'DECLINED';
      const readiness = evaluateAdverseActionReadiness(facts.adverseActionRecords, facts.deal.id);
      const met = alreadyDeclined && readiness.adverseActionDocumented.met;
      return evaluated(r, met ? 'met' : 'unmet', met ? '' : r.blockerReason);
    }
    return evaluated(r, 'untracked', r.blockerReason);
  });
  const blocking = requirements.filter((r) => r.canBlockTransition && r.tracked);
  const recommended = requirements.filter((r) => r.severity === 'recommended');
  const untracked = requirements.filter((r) => r.status === 'untracked');
  const exit: StageExitReadiness = {
    scope,
    status: policy.allowed ? 'ready' : 'blocked',
    requirements,
    blocking,
    recommended,
    untracked,
  };
  return {
    from,
    kind,
    to: policy.allowed && kind === 'return' ? policy.to : undefined,
    status: policy.allowed ? 'ready' : 'blocked',
    exit,
    reason: policy.allowed ? '' : policy.reason,
  };
}
