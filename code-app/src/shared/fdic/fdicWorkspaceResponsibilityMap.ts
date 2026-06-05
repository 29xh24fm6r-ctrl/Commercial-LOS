/**
 * Phase 140A — FDIC Workspace Responsibility Map.
 *
 * Declares, for each of the eight remediation workspaces, what it OWNS,
 * what it SUPPORTS, what evidence it PRODUCES and CONSUMES, the UI surface
 * it will eventually carry, and its honest current limitations.
 *
 * This is the architecture that keeps the FDIC remediation from collapsing
 * into a single overloaded portfolio dashboard. Ownership is distributed:
 *
 *   - Portfolio is the COMMAND CENTER (control tower) — it sees and trends
 *     but is NOT the sole owner of remediation.
 *   - Credit Administration is the CONTROL EXECUTION layer — documents,
 *     core-data reconciliation, dual control, appraisal routing.
 *   - Banker / Deal Workspace is the SOURCE EVIDENCE layer.
 *   - Independent Loan Review is the INDEPENDENT CHALLENGE layer.
 *   - ACL / CECL Workbench is the FINANCE RESERVE SUPPORT layer.
 *   - Appraisal / Evaluation Queue is the COLLATERAL COMPLIANCE layer.
 *   - Executive / Board is the ACCOUNTABILITY layer.
 *   - Governance Evidence Ledger is the PROOF / AUDIT layer.
 *
 * Discipline:
 *   - STATIC. No IO. `controlsOwned` / `controlsSupported` reference real
 *     control ids from `fdicRemediationOperatingModel`.
 *   - `currentLimitations` is honest about what is NOT wired today. No
 *     `futureUISurface` entry implies the surface exists now.
 */

import type {
  FDICWorkspace,
  FDICEvidenceType,
} from './fdicRemediationOperatingModel';
import { FDIC_REMEDIATION_CONTROLS } from './fdicRemediationOperatingModel';

export interface FDICWorkspaceResponsibility {
  workspace: FDICWorkspace;
  title: string;
  purpose: string;
  /** Control ids whose PRIMARY workspace is this one. */
  controlsOwned: readonly string[];
  /** Control ids this workspace supports but does not primarily own. */
  controlsSupported: readonly string[];
  evidenceProduced: readonly FDICEvidenceType[];
  evidenceConsumed: readonly FDICEvidenceType[];
  /** The UI surface this workspace will carry in a future phase (not now). */
  futureUISurface: string;
  /** Honest statement of what this workspace does NOT do yet. */
  currentLimitations: string;
}

export const FDIC_WORKSPACE_RESPONSIBILITY_MAP: readonly FDICWorkspaceResponsibility[] =
  Object.freeze([
    {
      workspace: 'banker_deal_workspace',
      title: 'Banker / Deal Workspace',
      purpose:
        'Source evidence layer. Where repayment-source and underwriting support is first captured against a deal.',
      controlsOwned: ['FDIC-REPAYMENT-SOURCE-1', 'FDIC-UNDERWRITING-QUALITY-1'],
      controlsSupported: ['FDIC-LOAN-DOC-COMPLETE-1'],
      evidenceProduced: [
        'repayment_capacity_analysis',
        'source_of_repayment_documentation',
        'global_cash_flow_support',
        'underwriting_memo_support',
        'guarantor_financial_review',
        'tax_return_support',
      ],
      evidenceConsumed: ['loan_document_inventory'],
      futureUISurface:
        'Deal-workspace repayment & underwriting evidence capture panels (140B+).',
      currentLimitations:
        'No governed evidence-capture write exists; the deal cockpit shows narrative only and does not persist repayment-source or underwriting evidence artifacts.',
    },
    {
      workspace: 'credit_administration_workspace',
      title: 'Credit Administration Workspace',
      purpose:
        'Control execution layer. Owns document completeness, core-data reconciliation, dual control, and appraisal/evaluation routing.',
      controlsOwned: [
        'FDIC-MIS-DATA-ACCURACY-1',
        'FDIC-LOAN-DOC-COMPLETE-1',
        'FDIC-DUAL-CONTROL-DATA-ENTRY-1',
      ],
      // Credit Admin owns appraisal/evaluation ROUTING (a supporting
      // responsibility); the Appraisal Review Queue owns the determination,
      // report tracking, and independent review (the FDIC-APPRAISAL-EVALUATION-1
      // control itself).
      controlsSupported: [
        'FDIC-APPRAISAL-EVALUATION-1',
        'FDIC-REPAYMENT-SOURCE-1',
        'FDIC-UNDERWRITING-QUALITY-1',
        'FDIC-PROBLEM-CREDIT-MONITORING-1',
      ],
      evidenceProduced: [
        'core_system_reconciliation',
        'loan_document_inventory',
        'legally_enforceable_document_review',
        'dual_control_approval',
        'appraisal_required_determination',
      ],
      evidenceConsumed: [
        'appraisal_or_evaluation_report',
        'appraisal_review',
      ],
      futureUISurface:
        'Credit Admin document / core-data exception queues + dual-control workflow (140C, 140J).',
      currentLimitations:
        'No Credit Administration workspace exists yet; there are no exception queues, no reconciliation, and no dual-control maker/checker workflow.',
    },
    {
      workspace: 'portfolio_command_center',
      title: 'Portfolio Command Center',
      purpose:
        'Command center / control tower. Sees and trends portfolio-level risk, classified assets, special mention, concentration, and watchlist — but is NOT the sole remediation owner.',
      controlsOwned: [
        'FDIC-PROBLEM-CREDIT-MONITORING-1',
        'FDIC-CLASSIFIED-ASSETS-1',
        'FDIC-SPECIAL-MENTION-1',
        'FDIC-GROWTH-CONCENTRATION-1',
      ],
      controlsSupported: [
        'FDIC-MIS-DATA-ACCURACY-1',
        'FDIC-APPRAISAL-EVALUATION-1',
        'FDIC-INDEPENDENT-LOAN-REVIEW-1',
        'FDIC-ACL-CECL-SUPPORT-1',
        'FDIC-BOARD-OVERSIGHT-1',
      ],
      evidenceProduced: [
        'watchlist_review',
        'classified_asset_review',
        'special_mention_review',
      ],
      evidenceConsumed: [
        'core_system_reconciliation',
        'independent_loan_review_report',
        'appraisal_review',
        'acl_cecl_support',
      ],
      futureUISurface:
        'Read-only FDIC Remediation Control Tower section on the Portfolio Command Center (140B).',
      currentLimitations:
        'The existing portfolio surface derives exposure/concentration honestly but carries no classified-asset, special-mention, or watchlist review evidence; the control-tower view is not yet rendered.',
    },
    {
      workspace: 'independent_loan_review_workspace',
      title: 'Independent Loan Review Workspace',
      purpose:
        'Independent challenge layer. Owns the loan-review universe, sampling/review plan, policy-compliance review, risk-rating challenge, and review conclusions.',
      controlsOwned: ['FDIC-INDEPENDENT-LOAN-REVIEW-1'],
      controlsSupported: [
        'FDIC-REPAYMENT-SOURCE-1',
        'FDIC-UNDERWRITING-QUALITY-1',
        'FDIC-CLASSIFIED-ASSETS-1',
        'FDIC-SPECIAL-MENTION-1',
      ],
      evidenceProduced: [
        'independent_loan_review_report',
        'policy_compliance_review',
        'risk_rating_review',
      ],
      evidenceConsumed: [
        'underwriting_memo_support',
        'repayment_capacity_analysis',
        'classified_asset_review',
      ],
      futureUISurface:
        'Independent Loan Review workspace — review universe, sampling plan, conclusions (140D).',
      currentLimitations:
        'No independent loan-review workspace exists; there is no review universe, sampling plan, or risk-rating challenge surface.',
    },
    {
      workspace: 'acl_cecl_workbench',
      title: 'ACL / CECL Workbench',
      purpose:
        'Finance reserve support layer. Owns ACL/CECL support, qualitative factor evidence, individually-evaluated-loan evidence, and the finance/board reserve support packet.',
      controlsOwned: ['FDIC-ACL-CECL-SUPPORT-1'],
      controlsSupported: ['FDIC-CLASSIFIED-ASSETS-1'],
      evidenceProduced: [
        'acl_cecl_support',
        'qualitative_factor_support',
        'individually_evaluated_loan_support',
      ],
      evidenceConsumed: [
        'classified_asset_review',
        'core_system_reconciliation',
      ],
      futureUISurface:
        'ACL / CECL support workbench — qualitative factors + individually evaluated loans (140F).',
      currentLimitations:
        'No ACL/CECL workbench exists; the platform produces no reserve support, qualitative-factor evidence, or individually-evaluated-loan analysis.',
    },
    {
      workspace: 'appraisal_review_queue',
      title: 'Appraisal / Evaluation Review Queue',
      purpose:
        'Collateral compliance layer. Owns appraisal/evaluation determination, report tracking, appraisal review, and exception handling.',
      controlsOwned: ['FDIC-APPRAISAL-EVALUATION-1'],
      controlsSupported: ['FDIC-CLASSIFIED-ASSETS-1'],
      evidenceProduced: [
        'appraisal_required_determination',
        'appraisal_or_evaluation_report',
        'appraisal_review',
      ],
      evidenceConsumed: ['loan_document_inventory'],
      futureUISurface:
        'Appraisal / Evaluation review queue with exception handling (140G).',
      currentLimitations:
        'No appraisal/evaluation queue exists; required-appraisal determinations and appraisal reviews are not tracked anywhere in the platform.',
    },
    {
      workspace: 'executive_board_oversight',
      title: 'Executive / Board Oversight',
      purpose:
        'Accountability layer. Owns management commitments, board-attention items, remediation aging, and board packet status.',
      controlsOwned: ['FDIC-BOARD-OVERSIGHT-1'],
      controlsSupported: [
        'FDIC-CLASSIFIED-ASSETS-1',
        'FDIC-SPECIAL-MENTION-1',
        'FDIC-ACL-CECL-SUPPORT-1',
        'FDIC-GROWTH-CONCENTRATION-1',
      ],
      evidenceProduced: ['board_report', 'management_commitment_tracking'],
      evidenceConsumed: [
        'watchlist_review',
        'classified_asset_review',
        'special_mention_review',
        'acl_cecl_support',
        'independent_loan_review_report',
      ],
      futureUISurface:
        'Board remediation packet + management-commitment aging on the Executive workspace (140H).',
      currentLimitations:
        'The Executive workspace renders honest but does not assemble a remediation packet, track management commitments, or age open items.',
    },
    {
      workspace: 'governance_evidence_ledger',
      title: 'Governance Evidence Ledger',
      purpose:
        'Proof / audit layer. Owns the finding-to-control-to-evidence map, evidence artifact indexing, audit trail/history, and the examiner evidence-packet model.',
      controlsOwned: [],
      controlsSupported: [
        'FDIC-BOARD-OVERSIGHT-1',
        'FDIC-MIS-DATA-ACCURACY-1',
        'FDIC-LOAN-DOC-COMPLETE-1',
        'FDIC-DUAL-CONTROL-DATA-ENTRY-1',
        'FDIC-INDEPENDENT-LOAN-REVIEW-1',
        'FDIC-ACL-CECL-SUPPORT-1',
      ],
      evidenceProduced: ['remediation_evidence_packet'],
      evidenceConsumed: [
        'repayment_capacity_analysis',
        'source_of_repayment_documentation',
        'underwriting_memo_support',
        'core_system_reconciliation',
        'loan_document_inventory',
        'legally_enforceable_document_review',
        'dual_control_approval',
        'appraisal_review',
        'independent_loan_review_report',
        'classified_asset_review',
        'special_mention_review',
        'acl_cecl_support',
        'board_report',
        'management_commitment_tracking',
      ],
      futureUISurface:
        'Governance evidence ledger + examiner evidence-packet model (140I, 140K).',
      currentLimitations:
        'No evidence ledger exists; the finding-to-control-to-evidence map lives only as this static model, with no artifact indexing or audit history.',
    },
  ]);

// ---------------------------------------------------------------------------
// Lookups
// ---------------------------------------------------------------------------

export function getWorkspaceResponsibility(
  workspace: FDICWorkspace,
): FDICWorkspaceResponsibility | undefined {
  return FDIC_WORKSPACE_RESPONSIBILITY_MAP.find(
    (row) => row.workspace === workspace,
  );
}

/**
 * Cross-check helper: the `controlsOwned` listed on a workspace must match
 * the controls whose `primaryWorkspace` is that workspace. Tests pin this so
 * the responsibility map can never drift from the operating model.
 */
export function ownedControlIdsFromModel(
  workspace: FDICWorkspace,
): readonly string[] {
  return FDIC_REMEDIATION_CONTROLS.filter(
    (control) => control.primaryWorkspace === workspace,
  ).map((control) => control.id);
}
