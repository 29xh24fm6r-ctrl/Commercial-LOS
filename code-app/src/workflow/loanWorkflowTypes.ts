import type { CreditMemoData } from '../deals/creditMemoQueries';
import type { DealDocumentsResult } from '../deals/dealDocumentQueries';
import type { DealDetail } from '../deals/dealQueries';
import type { DealTasksResult } from '../deals/dealTaskQueries';
import type { CanonicalStageCode } from './stageOrderingContract';

/**
 * Stage-vocabulary reconciliation (2026-07): the loan workflow spine now speaks the
 * ONE canonical vocabulary — the ratified seven `CanonicalStageCode`s
 * (INTAKE … BOARDED) that key the live `cr664_dealstagereferences` table. This
 * replaces the retired legacy 11-stage Opportunity/Qualification ids so a stored
 * `deal.stage` (a canonical `cr664_StageReference` name) resolves correctly AND a
 * future governed stage-advance write can resolve its target stage reference bind
 * without fabricating a legacy→canonical map.
 */
export type LoanWorkflowStageId = CanonicalStageCode;

export type LoanWorkflowRequirementType =
  | 'field'
  | 'document'
  | 'task'
  | 'credit'
  | 'closing'
  | 'unavailable';

export type LoanWorkflowSeverity = 'blocked' | 'at-risk' | 'clear';

export interface LoanWorkflowRequirement {
  id: string;
  label: string;
  type: LoanWorkflowRequirementType;
}

export interface LoanWorkflowStageDefinition {
  id: LoanWorkflowStageId;
  label: string;
  entryCriteria: readonly string[];
  exitCriteria: readonly string[];
  requiredFields: readonly LoanWorkflowRequirement[];
  requiredDocuments: readonly LoanWorkflowRequirement[];
  requiredTasks: readonly LoanWorkflowRequirement[];
  creditRequirements: readonly LoanWorkflowRequirement[];
  closingRequirements: readonly LoanWorkflowRequirement[];
  allowedNextStages: readonly LoanWorkflowStageId[];
  blockerRules: readonly string[];
}

export interface LoanWorkflowBlocker {
  id: string;
  label: string;
  type: LoanWorkflowRequirementType;
  severity: Exclude<LoanWorkflowSeverity, 'clear'>;
}

export interface LoanWorkflowReadiness {
  status: LoanWorkflowSeverity;
  blockers: readonly LoanWorkflowBlocker[];
  missingFields: readonly LoanWorkflowRequirement[];
  missingDocuments: readonly LoanWorkflowRequirement[];
  missingTasks: readonly LoanWorkflowRequirement[];
  creditBlockers: readonly LoanWorkflowBlocker[];
  closingBlockers: readonly LoanWorkflowBlocker[];
}

export interface LoanWorkflowState {
  currentStage: LoanWorkflowStageDefinition;
  currentStageSource: 'matched' | 'defaulted';
  nextPermittedStages: readonly LoanWorkflowStageDefinition[];
  readiness: LoanWorkflowReadiness;
  nextBestSafeAction: string;
  unavailableInputs: readonly string[];
}

export interface LoanWorkflowDeriveInput {
  deal: DealDetail;
  tasks?: DealTasksResult;
  documents?: DealDocumentsResult;
  creditMemo?: CreditMemoData;
  tasksUnavailable?: boolean;
  documentsUnavailable?: boolean;
  creditMemoUnavailable?: boolean;
}
