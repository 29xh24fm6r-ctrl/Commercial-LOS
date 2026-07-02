import type { LoanWorkflowStageId } from './loanWorkflowTypes';
import { getLoanWorkflowStage } from './loanWorkflowStages';

export interface LoanWorkflowTemplate {
  stageId: LoanWorkflowStageId;
  checklistDocumentNames: readonly string[];
  taskNames: readonly string[];
}

export const LOAN_WORKFLOW_TEMPLATES: readonly LoanWorkflowTemplate[] =
  Object.freeze([
    'INTAKE',
    'UNDERWRITING',
    'CREDIT_APPROVAL',
    'COMMITMENT',
    'DOCUMENTATION',
    'CLOSING_FUNDING',
    'BOARDED',
  ].map((stageId) => {
    const stage = getLoanWorkflowStage(stageId as LoanWorkflowStageId);
    return {
      stageId: stage.id,
      checklistDocumentNames: stage.requiredDocuments.map((doc) => doc.label),
      taskNames: stage.requiredTasks.map((task) => task.label),
    };
  }));

export function getLoanWorkflowTemplate(stageId: LoanWorkflowStageId): LoanWorkflowTemplate {
  const template = LOAN_WORKFLOW_TEMPLATES.find((item) => item.stageId === stageId);
  if (!template) throw new Error(`Missing loan workflow template for ${stageId}`);
  return template;
}
