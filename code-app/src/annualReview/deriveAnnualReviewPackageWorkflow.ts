/**
 * Phase 141P — Annual review PACKAGE WORKFLOW deriver.
 *
 * PURE. Combines the memo / board / FDIC packages + readiness + export adapter
 * state into a workflow with READ-ONLY preview actions available and all live
 * actions (approve / submit / file / export / send) blocked. There is no final
 * package state.
 *
 * Discipline (HARD rules — pinned by tests):
 *   - No IO. Available actions are preview-only. Blocked actions are explicit.
 */

import type {
  AnnualReviewMemoPackage,
  AnnualReviewBoardPackage,
  AnnualReviewFdicPackage,
  AnnualReviewPackageReadiness,
  AnnualReviewPackageAuditSummary,
} from './annualReviewPackageTypes';
import type { AnnualReviewPackageExportAdapter } from './annualReviewPackageExportAdapter';

export type AnnualReviewPackageWorkflowStatus =
  | 'draft_preview'
  | 'blocked'
  | 'disabled_not_configured';

export interface AnnualReviewPackageWorkflowAction {
  code: string;
  label: string;
}

export interface AnnualReviewPackageWorkflowState {
  workflowStatus: AnnualReviewPackageWorkflowStatus;
  availableActions: readonly AnnualReviewPackageWorkflowAction[];
  blockedActions: readonly AnnualReviewPackageWorkflowAction[];
  nextBestAction: AnnualReviewPackageWorkflowAction;
  auditSummary: AnnualReviewPackageAuditSummary;
}

export interface DeriveAnnualReviewPackageWorkflowInput {
  memo: AnnualReviewMemoPackage;
  board: AnnualReviewBoardPackage;
  fdic: AnnualReviewFdicPackage;
  readiness: AnnualReviewPackageReadiness;
  exportAdapter: AnnualReviewPackageExportAdapter;
}

const PREVIEW_ACTIONS: readonly AnnualReviewPackageWorkflowAction[] = [
  { code: 'preview_memo', label: 'Preview the draft credit memo.' },
  { code: 'preview_board', label: 'Preview the draft board package.' },
  { code: 'preview_fdic', label: 'Preview the draft FDIC/examiner package.' },
  { code: 'view_evidence', label: 'View the evidence references.' },
];

// Live actions that are ALWAYS blocked in this phase.
const BLOCKED_ACTIONS: readonly AnnualReviewPackageWorkflowAction[] = [
  { code: 'approve_credit', label: 'Approve credit' },
  { code: 'submit_package', label: 'Submit package' },
  { code: 'file_package', label: 'File package' },
  { code: 'export_final', label: 'Export final' },
  { code: 'send_package', label: 'Send package' },
  { code: 'waive_covenant', label: 'Waive covenant' },
];

export function deriveAnnualReviewPackageWorkflow(
  input: DeriveAnnualReviewPackageWorkflowInput,
): AnnualReviewPackageWorkflowState {
  const { readiness } = input;

  const anyBlocked =
    readiness.memoStatus.startsWith('blocked_') ||
    readiness.memoStatus === 'disabled_not_configured';

  const workflowStatus: AnnualReviewPackageWorkflowStatus =
    readiness.memoStatus === 'disabled_not_configured' ? 'disabled_not_configured' : anyBlocked ? 'blocked' : 'draft_preview';

  const nextBestAction: AnnualReviewPackageWorkflowAction =
    readiness.nextBestActions[0] ?? { code: 'review_draft_packages', label: 'Review the draft packages.' };

  return {
    workflowStatus,
    // Even when blocked, only preview actions are ever available — never a live action.
    availableActions: PREVIEW_ACTIONS,
    blockedActions: BLOCKED_ACTIONS,
    nextBestAction,
    auditSummary: readiness.auditSummary,
  };
}
