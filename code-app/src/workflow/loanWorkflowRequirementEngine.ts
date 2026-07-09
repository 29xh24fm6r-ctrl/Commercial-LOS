import type { DealDetail } from '../deals/dealQueries';
import type { DealTasksResult } from '../deals/dealTaskQueries';
import type { DealDocumentsResult } from '../deals/dealDocumentQueries';
import type { CreditMemoData } from '../deals/creditMemoQueries';
import { deriveLoanWorkflowReadiness } from './loanWorkflowRules';
import { getLoanWorkflowStage } from './loanWorkflowStages';
import type { LoanWorkflowRequirement, LoanWorkflowStageDefinition } from './loanWorkflowTypes';
import type { CanonicalStageCode } from './stageOrderingContract';
import {
  requirementsForScope,
  shallowRequirementMeta,
} from './loanWorkflowRequirementRegistry';
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

/** Evaluate one tracked stage-def requirement (field/document/task/credit/closing) via the legacy adapter. */
function evaluateShallow(
  scope: RequirementScope,
  category: RequirementCategory,
  raw: LoanWorkflowRequirement,
  legacy: LegacyEval,
): EvaluatedRequirement {
  const meta = shallowRequirementMeta(scope, category, raw.id);
  // Fallback metadata (should not happen — registry is derived from the same stage defs).
  const req: CanonicalRequirement = meta ?? {
    id: `${scope}:${category}:${raw.id}`, scope, label: raw.label, description: raw.label,
    category, severity: category === 'task' ? 'recommended' : 'blocking',
    resolverSurface: category === 'field' ? 'Deal Profile' : category === 'document' ? 'Documents' : category === 'task' ? 'Tasks' : 'Credit Memo',
    responsibleRole: 'banker', backingType: category === 'field' ? 'deal_field' : category === 'document' ? 'document_requirement' : category === 'task' ? 'task_status' : 'memo_status',
    tracked: true, uiCopy: raw.label, blockerReason: `${raw.label} is required.`,
  };
  const unmet = legacy.unmetIds.has(`${category}:${raw.id}`);
  const dataUnavailable =
    (category === 'document' && legacy.unavailable.documents) ||
    (category === 'task' && legacy.unavailable.tasks) ||
    (category === 'credit' && legacy.unavailable.creditMemo);
  const status: RequirementStatus = dataUnavailable ? 'unavailable' : unmet ? 'unmet' : 'met';
  const reason = status === 'unavailable'
    ? `${req.label} could not be confirmed — its data source is unavailable (fail-closed).`
    : req.blockerReason;
  return evaluated(req, status, reason);
}

/**
 * Evaluate every requirement gating a stage's exit: the tracked (shallow) facts via the legacy
 * adapter, plus the deep facts (untracked → fail-closed blockers naming the missing capability).
 */
export function evaluateStageExitRequirements(
  stageCode: CanonicalStageCode,
  facts: WorkflowRequirementFacts,
): EvaluatedRequirement[] {
  const stage = getLoanWorkflowStage(stageCode);
  const legacy = evaluateLegacyTrackedFacts(stage, facts);
  const shallow: EvaluatedRequirement[] = [
    ...stage.requiredFields.map((r) => evaluateShallow(stageCode, 'field', r, legacy)),
    ...stage.requiredDocuments.map((r) => evaluateShallow(stageCode, 'document', r, legacy)),
    ...stage.requiredTasks.map((r) => evaluateShallow(stageCode, 'task', r, legacy)),
    ...stage.creditRequirements.map((r) => evaluateShallow(stageCode, 'credit', r, legacy)),
    ...stage.closingRequirements.map((r) => evaluateShallow(stageCode, 'closing', r, legacy)),
  ];
  // Deep facts: not yet tracked → fail closed as untracked blockers (never fabricated as met).
  const deep = requirementsForScope(stageCode)
    .filter((r) => !r.tracked)
    .map((r) => evaluated(r, 'untracked', r.blockerReason));
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

/**
 * The engine's readiness verdict for a specific transition. Forward advances evaluate the source
 * stage's exit; non-forward paths (return/decline/withdraw) are PREVIEW-ONLY in ARC Phase 1 and
 * report their placeholder requirements (all untracked) — they are not yet live.
 */
export function deriveTransitionReadiness(
  from: RequirementScope,
  kind: 'advance' | 'return' | 'decline' | 'withdraw',
  facts: WorkflowRequirementFacts,
  requestedTo?: CanonicalStageCode,
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
  // Non-forward — preview-only in Phase 1.
  const scope: RequirementScope = kind === 'return' ? 'RETURN' : kind === 'decline' ? 'DECLINE' : 'WITHDRAW';
  const reqs = requirementsForScope(scope).map((r) => evaluated(r, 'untracked', r.blockerReason));
  const exit: StageExitReadiness = { scope, status: 'blocked', requirements: reqs, blocking: [], recommended: [], untracked: reqs };
  return { from, kind, status: 'preview-only', exit, reason: `The governed ${kind} path is not yet live (preview-only).` };
}
