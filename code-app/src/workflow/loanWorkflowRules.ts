import type { CreditMemoData } from '../deals/creditMemoQueries';
import type { DealDocumentsResult } from '../deals/dealDocumentQueries';
import type { DealDetail } from '../deals/dealQueries';
import type { DealTasksResult } from '../deals/dealTaskQueries';
import type {
  LoanWorkflowBlocker,
  LoanWorkflowReadiness,
  LoanWorkflowRequirement,
  LoanWorkflowStageDefinition,
} from './loanWorkflowTypes';

export function deriveLoanWorkflowReadiness(input: {
  deal: DealDetail;
  stage: LoanWorkflowStageDefinition;
  tasks?: DealTasksResult;
  documents?: DealDocumentsResult;
  creditMemo?: CreditMemoData;
  tasksUnavailable?: boolean;
  documentsUnavailable?: boolean;
  creditMemoUnavailable?: boolean;
}): LoanWorkflowReadiness {
  const missingFields = input.stage.requiredFields.filter(
    (field) => !hasDealValue(input.deal, field.id),
  );
  const documents = input.documents;
  const tasks = input.tasks;
  const missingDocuments = documents
    ? input.stage.requiredDocuments.filter(
        (doc) => !hasReviewedOrReceivedDocument(documents, doc.label),
      )
    : input.stage.requiredDocuments;
  const missingTasks = tasks
    ? input.stage.requiredTasks.filter((task) => !hasCompletedTask(tasks, task.label))
    : input.stage.requiredTasks;

  const blockers: LoanWorkflowBlocker[] = [
    ...missingFields.map((item) => blocker(item, 'blocked', `Missing field: ${item.label}`)),
    ...missingDocuments.map((item) => blocker(item, 'blocked', `Missing document: ${item.label}`)),
    ...missingTasks.map((item) => blocker(item, 'at-risk', `Incomplete task: ${item.label}`)),
  ];

  const creditBlockers = deriveCreditBlockers(
    input.stage,
    input.creditMemo,
    input.creditMemoUnavailable,
  );
  const closingBlockers = deriveClosingBlockers(input.stage, missingDocuments, missingTasks);
  blockers.push(...creditBlockers, ...closingBlockers);

  if (input.tasksUnavailable) {
    blockers.push(unavailableBlocker('tasks', 'Task data unavailable; open tasks are not treated as complete.'));
  }
  if (input.documentsUnavailable) {
    blockers.push(unavailableBlocker('documents', 'Document data unavailable; required documents are not treated as complete.'));
  }
  if (input.creditMemoUnavailable && input.stage.creditRequirements.length > 0) {
    blockers.push(unavailableBlocker('creditMemo', 'Credit memo data unavailable; credit requirements are not treated as complete.'));
  }

  const status = blockers.some((item) => item.severity === 'blocked')
    ? 'blocked'
    : blockers.length > 0
      ? 'at-risk'
      : 'clear';

  return {
    status,
    blockers,
    missingFields,
    missingDocuments,
    missingTasks,
    creditBlockers,
    closingBlockers,
  };
}

function hasDealValue(deal: DealDetail, key: string): boolean {
  const value = deal[key as keyof DealDetail];
  if (typeof value === 'string') return value.trim().length > 0;
  if (typeof value === 'number') return Number.isFinite(value) && value > 0;
  if (typeof value === 'boolean') return true;
  return value !== undefined && value !== null;
}

function hasReviewedOrReceivedDocument(
  documents: DealDocumentsResult,
  label: string,
): boolean {
  const needle = normalize(label);
  return [...documents.received, ...documents.reviewed].some((doc) =>
    normalize(doc.name).includes(needle),
  );
}

function hasCompletedTask(tasks: DealTasksResult, label: string): boolean {
  const needle = normalize(label);
  return tasks.completed.some((task) => normalize(task.title).includes(needle));
}

function deriveCreditBlockers(
  stage: LoanWorkflowStageDefinition,
  creditMemo: CreditMemoData | undefined,
  unavailable: boolean | undefined,
): LoanWorkflowBlocker[] {
  if (stage.creditRequirements.length === 0) return [];
  if (unavailable) return [];

  const blockers: LoanWorkflowBlocker[] = [];
  const hasMemo = (creditMemo?.memos.length ?? 0) > 0;
  const sectionLabels = new Set(
    (creditMemo?.sections ?? []).map((section) => normalize(section.sectionLabel)),
  );

  for (const requirement of stage.creditRequirements) {
    if (requirement.id.includes('memo') && !hasMemo) {
      blockers.push(blocker(requirement, 'blocked', `Missing credit artifact: ${requirement.label}`));
      continue;
    }
    if (requirement.id.includes('section')) {
      const expected = normalize(requirement.label.replace(' section', ''));
      const hasSection = [...sectionLabels].some((label) => label.includes(expected));
      if (!hasSection) {
        blockers.push(blocker(requirement, 'blocked', `Missing credit memo section: ${requirement.label}`));
      }
    }
    if (!requirement.id.includes('memo') && !requirement.id.includes('section') && !hasMemo) {
      blockers.push(blocker(requirement, 'blocked', `Missing credit evidence: ${requirement.label}`));
    }
  }
  return blockers;
}

function deriveClosingBlockers(
  stage: LoanWorkflowStageDefinition,
  missingDocuments: readonly LoanWorkflowRequirement[],
  missingTasks: readonly LoanWorkflowRequirement[],
): LoanWorkflowBlocker[] {
  if (stage.closingRequirements.length === 0) return [];
  if (missingDocuments.length === 0 && missingTasks.length === 0) return [];
  return stage.closingRequirements.map((requirement) =>
    blocker(requirement, 'blocked', `Closing blocker: ${requirement.label}`),
  );
}

function blocker(
  requirement: LoanWorkflowRequirement,
  severity: 'blocked' | 'at-risk',
  label: string,
): LoanWorkflowBlocker {
  return {
    id: requirement.id,
    label,
    type: requirement.type,
    severity,
  };
}

function unavailableBlocker(id: string, label: string): LoanWorkflowBlocker {
  return {
    id: `unavailable-${id}`,
    label,
    type: 'unavailable',
    severity: 'blocked',
  };
}

function normalize(value: string): string {
  return value.trim().toLowerCase().replace(/[-_/]+/g, ' ').replace(/\s+/g, ' ');
}
