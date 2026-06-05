/**
 * Phase 140A — FDIC Evidence Architecture.
 *
 * Catalogs the evidence ARTIFACTS the remediation controls require: what
 * each artifact is, which workspace produces it, who consumes it, which
 * controls it backs, its minimum fields, the claims it must NEVER carry,
 * and its honest current availability.
 *
 * THE CENTRAL RULE OF THIS FILE:
 *   Evidence is NOT automatically compliance.
 *   - The presence of an evidence artifact does NOT equal remediation.
 *   - Evidence must be independently reviewed and approved before any
 *     regulatory claim is made.
 *   - No artifact may carry a "compliant", "remediated", "FDIC approved",
 *     or "examiner ready" claim. Those words are listed in
 *     `prohibitedClaims` precisely so the platform refuses to assert them.
 *
 * Discipline:
 *   - STATIC. No IO. As of Phase 140A every artifact's `currentAvailability`
 *     is `not_wired` — the platform captures none of this evidence in a
 *     governed, persisted form yet.
 */

import type {
  FDICEvidenceType,
  FDICWorkspace,
} from './fdicRemediationOperatingModel';
import { FDIC_REMEDIATION_CONTROLS } from './fdicRemediationOperatingModel';

export type FDICEvidenceAvailability =
  | 'not_wired'
  | 'partially_available'
  | 'available';

export interface FDICEvidenceArtifact {
  evidenceType: FDICEvidenceType;
  title: string;
  description: string;
  producedByWorkspace: FDICWorkspace;
  consumedByWorkspaces: readonly FDICWorkspace[];
  /** Control ids that require this evidence (derived-consistent with model). */
  requiredForControls: readonly string[];
  minimumFields: readonly string[];
  /**
   * Claims this artifact must NEVER carry. The platform refuses to stamp any
   * of these on an artifact; only an out-of-band human review can conclude
   * compliance, and that conclusion is not a platform artifact.
   */
  prohibitedClaims: readonly string[];
  currentAvailability: FDICEvidenceAvailability;
}

/**
 * The universal prohibited-claim set every artifact carries. Centralized so
 * a single edit governs all artifacts and tests can pin it exactly.
 */
export const FDIC_UNIVERSAL_PROHIBITED_CLAIMS: readonly string[] = Object.freeze([
  'FDIC approved',
  'compliant',
  'remediated',
  'examiner ready',
]);

/**
 * Human-facing statement of the no-fake-compliance rule. Surfaced in docs
 * and pinned by tests so the rule travels with the evidence model.
 */
export const FDIC_EVIDENCE_NOT_COMPLIANCE_RULE =
  'Evidence presence is not automatically compliance. An evidence artifact is an input that must be independently reviewed and approved before any regulatory claim. Evidence artifact presence does not equal remediation.';

function controlsRequiring(
  evidenceType: FDICEvidenceType,
): readonly string[] {
  return FDIC_REMEDIATION_CONTROLS.filter((control) =>
    control.evidenceRequired.includes(evidenceType),
  ).map((control) => control.id);
}

export const FDIC_EVIDENCE_ARTIFACTS: readonly FDICEvidenceArtifact[] =
  Object.freeze([
    {
      evidenceType: 'repayment_capacity_analysis',
      title: 'Repayment capacity analysis',
      description:
        'Documented analysis of the borrower’s ability to service the debt from operating cash flow.',
      producedByWorkspace: 'banker_deal_workspace',
      consumedByWorkspaces: [
        'credit_administration_workspace',
        'independent_loan_review_workspace',
      ],
      requiredForControls: controlsRequiring('repayment_capacity_analysis'),
      minimumFields: [
        'dealId',
        'analysisDate',
        'cashFlowBasis',
        'debtServiceCoverage',
        'preparedBy',
      ],
      prohibitedClaims: FDIC_UNIVERSAL_PROHIBITED_CLAIMS,
      currentAvailability: 'not_wired',
    },
    {
      evidenceType: 'source_of_repayment_documentation',
      title: 'Source-of-repayment documentation',
      description:
        'Identification of the primary and secondary sources of repayment with supporting detail.',
      producedByWorkspace: 'banker_deal_workspace',
      consumedByWorkspaces: ['independent_loan_review_workspace'],
      requiredForControls: controlsRequiring('source_of_repayment_documentation'),
      minimumFields: [
        'dealId',
        'primarySource',
        'secondarySource',
        'documentedBy',
      ],
      prohibitedClaims: FDIC_UNIVERSAL_PROHIBITED_CLAIMS,
      currentAvailability: 'not_wired',
    },
    {
      evidenceType: 'core_system_reconciliation',
      title: 'Core-system reconciliation',
      description:
        'Reconciliation of platform loan data to the system of record with documented exceptions.',
      producedByWorkspace: 'credit_administration_workspace',
      consumedByWorkspaces: [
        'portfolio_command_center',
        'governance_evidence_ledger',
      ],
      requiredForControls: controlsRequiring('core_system_reconciliation'),
      minimumFields: [
        'reconciliationDate',
        'fieldsCompared',
        'exceptionsFound',
        'exceptionsResolved',
        'reconciledBy',
      ],
      prohibitedClaims: FDIC_UNIVERSAL_PROHIBITED_CLAIMS,
      currentAvailability: 'not_wired',
    },
    {
      evidenceType: 'loan_document_inventory',
      title: 'Loan-document inventory',
      description:
        'Inventory of the documents present in a loan file against the expected document set.',
      producedByWorkspace: 'credit_administration_workspace',
      consumedByWorkspaces: ['governance_evidence_ledger'],
      requiredForControls: controlsRequiring('loan_document_inventory'),
      minimumFields: [
        'loanId',
        'expectedDocuments',
        'presentDocuments',
        'missingDocuments',
      ],
      prohibitedClaims: FDIC_UNIVERSAL_PROHIBITED_CLAIMS,
      currentAvailability: 'not_wired',
    },
    {
      evidenceType: 'legally_enforceable_document_review',
      title: 'Legally enforceable document review',
      description:
        'Review confirming key loan documents are executed and legally enforceable, with exceptions noted.',
      producedByWorkspace: 'credit_administration_workspace',
      consumedByWorkspaces: ['governance_evidence_ledger'],
      requiredForControls: controlsRequiring('legally_enforceable_document_review'),
      minimumFields: [
        'loanId',
        'documentsReviewed',
        'enforceabilityExceptions',
        'reviewedBy',
      ],
      prohibitedClaims: FDIC_UNIVERSAL_PROHIBITED_CLAIMS,
      currentAvailability: 'not_wired',
    },
    {
      evidenceType: 'dual_control_approval',
      title: 'Dual-control approval record',
      description:
        'Maker/checker record proving a material loan-data entry was independently verified.',
      producedByWorkspace: 'credit_administration_workspace',
      consumedByWorkspaces: ['governance_evidence_ledger'],
      requiredForControls: controlsRequiring('dual_control_approval'),
      minimumFields: [
        'entryId',
        'makerIdentity',
        'checkerIdentity',
        'fieldChanged',
        'approvedAt',
      ],
      prohibitedClaims: FDIC_UNIVERSAL_PROHIBITED_CLAIMS,
      currentAvailability: 'not_wired',
    },
    {
      evidenceType: 'appraisal_review',
      title: 'Appraisal / evaluation review',
      description:
        'Independent review of an appraisal or evaluation report for compliance and reasonableness.',
      producedByWorkspace: 'appraisal_review_queue',
      consumedByWorkspaces: [
        'credit_administration_workspace',
        'portfolio_command_center',
      ],
      requiredForControls: controlsRequiring('appraisal_review'),
      minimumFields: [
        'loanId',
        'appraisalId',
        'reviewType',
        'reviewConclusion',
        'reviewedBy',
      ],
      prohibitedClaims: FDIC_UNIVERSAL_PROHIBITED_CLAIMS,
      currentAvailability: 'not_wired',
    },
    {
      evidenceType: 'independent_loan_review_report',
      title: 'Independent loan review report',
      description:
        'The independent reviewer’s conclusions on a sampled credit, including any risk-rating challenge.',
      producedByWorkspace: 'independent_loan_review_workspace',
      consumedByWorkspaces: [
        'portfolio_command_center',
        'executive_board_oversight',
        'governance_evidence_ledger',
      ],
      requiredForControls: controlsRequiring('independent_loan_review_report'),
      minimumFields: [
        'loanId',
        'reviewDate',
        'assignedRiskRating',
        'reviewerRiskRating',
        'conclusions',
        'reviewedBy',
      ],
      prohibitedClaims: FDIC_UNIVERSAL_PROHIBITED_CLAIMS,
      currentAvailability: 'not_wired',
    },
    {
      evidenceType: 'watchlist_review',
      title: 'Watchlist / problem-credit review',
      description:
        'Periodic review of a watchlist credit documenting status, trend, and action items.',
      producedByWorkspace: 'portfolio_command_center',
      consumedByWorkspaces: ['executive_board_oversight'],
      requiredForControls: controlsRequiring('watchlist_review'),
      minimumFields: [
        'loanId',
        'reviewDate',
        'status',
        'actionItems',
        'reviewedBy',
      ],
      prohibitedClaims: FDIC_UNIVERSAL_PROHIBITED_CLAIMS,
      currentAvailability: 'not_wired',
    },
    {
      evidenceType: 'classified_asset_review',
      title: 'Classified asset review',
      description:
        'Review assigning or confirming a classification rating to a credit, with rationale.',
      producedByWorkspace: 'portfolio_command_center',
      consumedByWorkspaces: [
        'acl_cecl_workbench',
        'executive_board_oversight',
        'governance_evidence_ledger',
      ],
      requiredForControls: controlsRequiring('classified_asset_review'),
      minimumFields: [
        'loanId',
        'classification',
        'rationale',
        'reviewDate',
        'reviewedBy',
      ],
      prohibitedClaims: FDIC_UNIVERSAL_PROHIBITED_CLAIMS,
      currentAvailability: 'not_wired',
    },
    {
      evidenceType: 'special_mention_review',
      title: 'Special mention review',
      description:
        'Review flagging an early-warning credit and assessing migration risk.',
      producedByWorkspace: 'portfolio_command_center',
      consumedByWorkspaces: ['executive_board_oversight'],
      requiredForControls: controlsRequiring('special_mention_review'),
      minimumFields: [
        'loanId',
        'reviewDate',
        'migrationRisk',
        'rationale',
        'reviewedBy',
      ],
      prohibitedClaims: FDIC_UNIVERSAL_PROHIBITED_CLAIMS,
      currentAvailability: 'not_wired',
    },
    {
      evidenceType: 'acl_cecl_support',
      title: 'ACL / CECL support packet',
      description:
        'Documentation supporting the allowance estimate, including methodology and inputs.',
      producedByWorkspace: 'acl_cecl_workbench',
      consumedByWorkspaces: [
        'executive_board_oversight',
        'governance_evidence_ledger',
      ],
      requiredForControls: controlsRequiring('acl_cecl_support'),
      minimumFields: [
        'period',
        'methodology',
        'segments',
        'preparedBy',
      ],
      prohibitedClaims: FDIC_UNIVERSAL_PROHIBITED_CLAIMS,
      currentAvailability: 'not_wired',
    },
    {
      evidenceType: 'qualitative_factor_support',
      title: 'Qualitative factor support',
      description:
        'Documented basis for each qualitative (Q-factor) adjustment to the allowance.',
      producedByWorkspace: 'acl_cecl_workbench',
      consumedByWorkspaces: ['executive_board_oversight'],
      requiredForControls: controlsRequiring('qualitative_factor_support'),
      minimumFields: [
        'period',
        'factor',
        'directionAndMagnitude',
        'supportingBasis',
        'preparedBy',
      ],
      prohibitedClaims: FDIC_UNIVERSAL_PROHIBITED_CLAIMS,
      currentAvailability: 'not_wired',
    },
    {
      evidenceType: 'individually_evaluated_loan_support',
      title: 'Individually evaluated loan support',
      description:
        'Analysis supporting a specific reserve on an individually evaluated credit.',
      producedByWorkspace: 'acl_cecl_workbench',
      consumedByWorkspaces: ['governance_evidence_ledger'],
      requiredForControls: controlsRequiring('individually_evaluated_loan_support'),
      minimumFields: [
        'loanId',
        'period',
        'measurementMethod',
        'specificReserve',
        'preparedBy',
      ],
      prohibitedClaims: FDIC_UNIVERSAL_PROHIBITED_CLAIMS,
      currentAvailability: 'not_wired',
    },
    {
      evidenceType: 'board_report',
      title: 'Board remediation packet',
      description:
        'Packet presented to the board summarizing remediation status, aging, and concentration trends.',
      producedByWorkspace: 'executive_board_oversight',
      consumedByWorkspaces: ['governance_evidence_ledger'],
      requiredForControls: controlsRequiring('board_report'),
      minimumFields: [
        'reportingPeriod',
        'controlStatusSummary',
        'openItemAging',
        'preparedBy',
      ],
      prohibitedClaims: FDIC_UNIVERSAL_PROHIBITED_CLAIMS,
      currentAvailability: 'not_wired',
    },
    {
      evidenceType: 'management_commitment_tracking',
      title: 'Management commitment tracking',
      description:
        'Tracked record of management commitments made to the board or examiners with target dates.',
      producedByWorkspace: 'executive_board_oversight',
      consumedByWorkspaces: ['governance_evidence_ledger'],
      requiredForControls: controlsRequiring('management_commitment_tracking'),
      minimumFields: [
        'commitmentId',
        'description',
        'owner',
        'targetDate',
        'status',
      ],
      prohibitedClaims: FDIC_UNIVERSAL_PROHIBITED_CLAIMS,
      currentAvailability: 'not_wired',
    },
  ]);

// ---------------------------------------------------------------------------
// Lookups
// ---------------------------------------------------------------------------

export function getEvidenceArtifact(
  evidenceType: FDICEvidenceType,
): FDICEvidenceArtifact | undefined {
  return FDIC_EVIDENCE_ARTIFACTS.find(
    (artifact) => artifact.evidenceType === evidenceType,
  );
}
