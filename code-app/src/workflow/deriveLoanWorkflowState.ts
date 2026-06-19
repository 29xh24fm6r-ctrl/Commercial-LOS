import {
  getNextLoanWorkflowStages,
  resolveLoanWorkflowStage,
} from './loanWorkflowStages';
import { deriveLoanWorkflowReadiness } from './loanWorkflowRules';
import type { LoanWorkflowDeriveInput, LoanWorkflowState } from './loanWorkflowTypes';

export function deriveLoanWorkflowState(
  input: LoanWorkflowDeriveInput,
): LoanWorkflowState {
  const { stage, source } = resolveLoanWorkflowStage(input.deal.stage);
  const readiness = deriveLoanWorkflowReadiness({ ...input, stage });
  const nextPermittedStages = getNextLoanWorkflowStages(stage);
  const unavailableInputs = [
    input.tasksUnavailable ? 'tasks' : undefined,
    input.documentsUnavailable ? 'documents' : undefined,
    input.creditMemoUnavailable ? 'credit memo' : undefined,
  ].filter((item): item is string => !!item);

  return {
    currentStage: stage,
    currentStageSource: source,
    nextPermittedStages,
    readiness,
    nextBestSafeAction: nextBestSafeAction(readiness.blockers[0]?.label, nextPermittedStages.length),
    unavailableInputs,
  };
}

function nextBestSafeAction(firstBlocker: string | undefined, nextCount: number): string {
  if (firstBlocker) return firstBlocker;
  if (nextCount > 0) return 'Review readiness evidence before any explicit stage movement.';
  return 'No further lifecycle stage is configured; verify post-close monitoring ownership.';
}
