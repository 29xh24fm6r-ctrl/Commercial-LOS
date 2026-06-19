import type { LoanWorkflowStageId, LoanWorkflowState } from './loanWorkflowTypes';

export type StageTransitionPolicyResult =
  | { allowed: true; from: LoanWorkflowStageId; to: LoanWorkflowStageId }
  | { allowed: false; reason: string; blockers: readonly string[] };

export function evaluateStageTransitionPolicy(
  workflow: LoanWorkflowState,
  requestedNextStageId: LoanWorkflowStageId | undefined,
): StageTransitionPolicyResult {
  if (!requestedNextStageId) {
    return { allowed: false, reason: 'No approved next stage selected.', blockers: [] };
  }
  const approved = workflow.nextPermittedStages.some((stage) => stage.id === requestedNextStageId);
  if (!approved) {
    return {
      allowed: false,
      reason: 'Requested stage is not an approved immediate next stage.',
      blockers: [`${workflow.currentStage.id} -> ${requestedNextStageId} is not allowed.`],
    };
  }
  if (workflow.readiness.status === 'blocked') {
    return {
      allowed: false,
      reason: 'Workflow readiness is blocked.',
      blockers: workflow.readiness.blockers.map((blocker) => blocker.label),
    };
  }
  return { allowed: true, from: workflow.currentStage.id, to: requestedNextStageId };
}
