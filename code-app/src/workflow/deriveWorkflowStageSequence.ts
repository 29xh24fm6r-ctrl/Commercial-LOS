/**
 * Phase 142C — Workflow stage sequence deriver.
 *
 * PURE, READ-ONLY. Derives the stage sequence for a route and reports
 * current/next/blocked/completed stages from readiness context. It never updates
 * the live current stage, never marks a live stage complete (only "candidate
 * completed" based on evidence), and never auto-completes an approval stage.
 */

import type {
  WorkflowRouteStage,
  WorkflowRoutingInput,
  WorkflowRoutingBlocker,
} from './workflowRoutingConfigTypes';

interface StageSpec { label: string; requiresEvidence: boolean; dependsOn: readonly string[] }

export const STAGE_CATALOG: Readonly<Record<string, StageSpec>> = Object.freeze({
  intake: { label: 'Intake', requiresEvidence: false, dependsOn: [] },
  borrower_documents: { label: 'Borrower documents', requiresEvidence: true, dependsOn: ['intake'] },
  spreading: { label: 'Spreading', requiresEvidence: true, dependsOn: ['borrower_documents'] },
  underwriting: { label: 'Underwriting', requiresEvidence: false, dependsOn: ['borrower_documents'] },
  covenant_testing: { label: 'Covenant testing', requiresEvidence: true, dependsOn: ['spreading'] },
  package_preparation: { label: 'Package preparation', requiresEvidence: true, dependsOn: ['covenant_testing'] },
  manager_review: { label: 'Manager review', requiresEvidence: false, dependsOn: ['package_preparation'] },
  credit_committee_review: { label: 'Credit committee review', requiresEvidence: false, dependsOn: ['manager_review'] },
  board_package_review: { label: 'Board package review', requiresEvidence: false, dependsOn: ['manager_review'] },
  fdic_package_review: { label: 'FDIC package review', requiresEvidence: false, dependsOn: ['package_preparation'] },
  closing_or_monitoring: { label: 'Closing / monitoring', requiresEvidence: false, dependsOn: ['manager_review'] },
  annual_review_complete_candidate: { label: 'Annual review complete (candidate)', requiresEvidence: true, dependsOn: ['manager_review'] },
});

const APPROVAL_STAGES = new Set(['manager_review', 'credit_committee_review', 'board_package_review', 'fdic_package_review']);

export function buildRouteStages(stageKeys: readonly string[]): WorkflowRouteStage[] {
  return stageKeys.map((k) => {
    const spec = STAGE_CATALOG[k] ?? { label: k, requiresEvidence: false, dependsOn: [] };
    return { stageKey: k, label: spec.label, requiresEvidence: spec.requiresEvidence, dependsOn: spec.dependsOn };
  });
}

export interface DeriveWorkflowStageSequenceInput {
  stages: readonly WorkflowRouteStage[];
  currentStageKey?: string;
  input: WorkflowRoutingInput;
  evidenceComplete?: boolean;
}

export interface WorkflowStageSequenceResult {
  stages: readonly WorkflowRouteStage[];
  currentStage?: string;
  nextStage?: string;
  blockedStages: readonly string[];
  completedStages: readonly string[];
  warnings: readonly string[];
  blockers: readonly WorkflowRoutingBlocker[];
}

export function deriveWorkflowStageSequence(
  args: DeriveWorkflowStageSequenceInput,
): WorkflowStageSequenceResult {
  const { stages, input } = args;
  const keys = stages.map((s) => s.stageKey);

  const financialsMissing = input.documentReadiness === 'missing' || input.documentReadiness === 'partial';
  const covenantUnknown = input.covenantStatus === 'unknown' || input.covenantStatus === 'review_required';
  const evidenceMissing = args.evidenceComplete === false || input.packageReadiness === 'blocked';

  const blockedStages: string[] = [];
  const blockers: WorkflowRoutingBlocker[] = [];
  for (const k of keys) {
    if ((k === 'spreading' || k === 'covenant_testing') && financialsMissing) {
      blockedStages.push(k);
      blockers.push({ code: 'financials_missing', message: `Stage "${k}" is blocked: borrower financials are missing/partial.` });
    } else if (k === 'package_preparation' && (covenantUnknown || evidenceMissing)) {
      blockedStages.push(k);
      blockers.push({ code: 'evidence_or_covenant_missing', message: 'Stage "package_preparation" is blocked: covenant unknown or evidence missing.' });
    }
  }

  // Candidate-completed (evidence-based) — NEVER an approval stage.
  const completedStages: string[] = [];
  for (const k of keys) {
    if (APPROVAL_STAGES.has(k)) continue;
    if (k === 'intake' || k === 'underwriting') completedStages.push(k);
    else if ((k === 'borrower_documents' || k === 'spreading') && input.documentReadiness === 'complete') completedStages.push(k);
    else if (k === 'covenant_testing' && input.covenantStatus === 'in_compliance') completedStages.push(k);
  }

  const currentStage = args.currentStageKey && keys.includes(args.currentStageKey) ? args.currentStageKey : undefined;
  const idx = currentStage ? keys.indexOf(currentStage) : -1;
  const nextStage = idx >= 0 && idx + 1 < keys.length ? keys[idx + 1] : undefined;

  const warnings: string[] = [];
  if (blockedStages.length > 0) warnings.push('One or more downstream stages are blocked by missing data.');

  return { stages, currentStage, nextStage, blockedStages, completedStages, warnings, blockers };
}
