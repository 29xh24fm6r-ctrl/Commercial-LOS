import type { LoanWorkflowTemplate } from './loanWorkflowTemplates';

export type WorkflowGenerationOutcome =
  | { kind: 'success'; detail: string }
  | { kind: 'skipped_duplicate_detected'; detail: string }
  | { kind: 'failed'; detail: string }
  | { kind: 'unauthorized'; detail: string }
  | { kind: 'dependency_not_ready'; detail: string };

export interface WorkflowChecklistGenerationDeps {
  createMissingRows: (names: readonly string[]) => Promise<WorkflowGenerationOutcome>;
}

export interface WorkflowTaskGenerationDeps {
  createMissingTasks: (names: readonly string[]) => Promise<WorkflowGenerationOutcome>;
}

export async function generateWorkflowChecklist(input: {
  authorized: boolean;
  template: LoanWorkflowTemplate;
  existingNames: readonly string[];
  deps?: WorkflowChecklistGenerationDeps;
}): Promise<WorkflowGenerationOutcome> {
  if (!input.authorized) return { kind: 'unauthorized', detail: 'Actor is not authorized.' };
  const missing = missingNames(input.template.checklistDocumentNames, input.existingNames);
  if (missing.length === 0) {
    return { kind: 'skipped_duplicate_detected', detail: 'All checklist rows already exist.' };
  }
  if (!input.deps) {
    return { kind: 'dependency_not_ready', detail: 'No governed checklist write dependency is wired.' };
  }
  return input.deps.createMissingRows(missing);
}

export async function generateWorkflowTasks(input: {
  authorized: boolean;
  template: LoanWorkflowTemplate;
  existingNames: readonly string[];
  deps?: WorkflowTaskGenerationDeps;
}): Promise<WorkflowGenerationOutcome> {
  if (!input.authorized) return { kind: 'unauthorized', detail: 'Actor is not authorized.' };
  const missing = missingNames(input.template.taskNames, input.existingNames);
  if (missing.length === 0) {
    return { kind: 'skipped_duplicate_detected', detail: 'All workflow tasks already exist.' };
  }
  if (!input.deps) {
    return { kind: 'dependency_not_ready', detail: 'No governed task write dependency is wired.' };
  }
  return input.deps.createMissingTasks(missing);
}

function missingNames(templateNames: readonly string[], existingNames: readonly string[]): string[] {
  const existing = new Set(existingNames.map((name) => name.trim().toLowerCase()));
  return templateNames
    .map((name) => name.trim())
    .filter((name) => name.length > 0)
    .filter((name) => !existing.has(name.toLowerCase()));
}
