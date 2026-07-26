import { normalizeDocumentName as normalize } from '../shared/deals/documentNameNormalization';
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

  // These three CREDIT_APPROVAL requirement ids ask about review / approval /
  // committee status, which this schema has no field for (CreditMemoStatusKey
  // is only draft/final/stale -- there is no reviewed/approved/committee state
  // to check). Falling into the generic "checked via memo presence" branch
  // below was a real correctness bug: a deal could reach Commitment with a
  // draft memo and ZERO committee involvement, regardless of dollar amount,
  // because any memo record made all three silently read as "met". Every
  // OTHER credit requirement id (e.g. UNDERWRITING's "spreading analysis")
  // keeps the existing memo-presence proxy check unchanged.
  const UNVERIFIABLE_CREDIT_REQUIREMENT_IDS = new Set(['reviewed memo', 'committee package', 'approved credit memo']);

  for (const requirement of stage.creditRequirements) {
    if (requirement.id === 'credit memo' && !hasMemo) {
      blockers.push(blocker(requirement, 'blocked', `Missing credit artifact: ${requirement.label}`));
      continue;
    }
    if (requirement.id.includes('section')) {
      const expected = normalize(requirement.label.replace(' section', ''));
      const hasSection = [...sectionLabels].some((label) => label.includes(expected));
      if (!hasSection) {
        blockers.push(blocker(requirement, 'blocked', `Missing credit memo section: ${requirement.label}`));
      }
      continue;
    }
    if (UNVERIFIABLE_CREDIT_REQUIREMENT_IDS.has(requirement.id)) {
      // Never silently "met" (that was the bug), and never hard-block a live
      // write path with no remediation UI to clear it — surface as always
      // visible/at-risk instead, matching how untracked deep facts are
      // handled elsewhere in this system.
      blockers.push(
        blocker(
          requirement,
          'at-risk',
          `${requirement.label} cannot be verified automatically (no reviewed/approved/committee status is tracked yet) -- confirm manually before relying on this stage gate alone.`,
        ),
      );
      continue;
    }
    if (requirement.id !== 'credit memo' && !hasMemo) {
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
  // D13: there is no real conditions-precedent / post-close-exception record
  // behind these labels -- this proxy only knows the stage has an outstanding
  // required document or task. The old "Closing blocker: <label>" copy
  // implied the labeled condition itself had been checked and failed, which
  // overstates precision this check doesn't have. Name the actual missing
  // item(s) instead so the banker isn't sent chasing a condition-precedent
  // review when the real gap is, say, an unrelated missing document.
  const outstanding = [...missingDocuments, ...missingTasks].map((item) => item.label);
  return stage.closingRequirements.map((requirement) =>
    blocker(
      requirement,
      'blocked',
      `${requirement.label} cannot be confirmed while this stage has an outstanding requirement: ${outstanding.join(', ')}. Resolve it, then re-check.`,
    ),
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
