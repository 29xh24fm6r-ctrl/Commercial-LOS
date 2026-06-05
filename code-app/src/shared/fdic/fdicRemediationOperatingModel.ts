/**
 * Phase 140A — FDIC Remediation Lending OS Mega Foundation.
 *
 * This is the platform-wide operating model that organizes every theme
 * the 2025 FDIC Safety & Soundness Report of Examination raised about
 * Credit Underwriting and Loan Administration into a single, honest
 * control architecture across the entire Commercial Lending OS.
 *
 * FDIC remediation is modeled here as a GOVERNANCE / EVIDENCE layer, not
 * as a one-off portfolio dashboard:
 *
 *   Portfolio                = command center (control tower)
 *   Credit Administration    = control execution layer
 *   Banker / Deal Workspace  = source evidence layer
 *   Independent Loan Review  = independent challenge layer
 *   ACL / CECL Workbench     = finance reserve support layer
 *   Appraisal / Evaluation   = collateral compliance layer
 *   Executive / Board        = accountability layer
 *   Governance Evidence Ledger = proof / audit layer
 *
 * Discipline (HARD rules — pinned by tests):
 *   - This module is STATIC. No IO, no service calls, no runtime probes.
 *     Every entry reflects a known property of the codebase as of this
 *     phase. Status changes only through a deliberate edit backed by a
 *     real code change.
 *   - NO fake regulatory compliance claims. The strings "FDIC approved",
 *     "compliant", "remediated", and "examiner ready" are NEVER used as a
 *     status value. The only honest statuses are the four in
 *     `FDIC_CONTROL_STATUSES`.
 *   - A control is only `wired_with_evidence` when current platform code
 *     truly produces the required evidence. As of Phase 140A, nothing is
 *     `wired_with_evidence` — the platform has the surfaces but not the
 *     governed evidence capture. Everything defaults to `mapped_not_wired`
 *     or `evidence_gap`.
 *   - Evidence presence does NOT equal remediation. Evidence must be
 *     independently reviewed and approved before any regulatory claim is
 *     made anywhere — and that claim is out of scope for the platform.
 */

// ---------------------------------------------------------------------------
// Finding themes
// ---------------------------------------------------------------------------

/** The FDIC report's finding themes, normalized to platform vocabulary. */
export type FDICFindingTheme =
  | 'board_oversight'
  | 'repayment_source'
  | 'underwriting_quality'
  | 'mis_data_accuracy'
  | 'loan_documentation'
  | 'dual_control_data_entry'
  | 'appraisal_evaluation'
  | 'independent_loan_review'
  | 'problem_credit_monitoring'
  | 'classified_assets'
  | 'special_mention'
  | 'acl_cecl'
  | 'portfolio_growth_concentration';

export const FDIC_FINDING_THEMES: readonly FDICFindingTheme[] = Object.freeze([
  'board_oversight',
  'repayment_source',
  'underwriting_quality',
  'mis_data_accuracy',
  'loan_documentation',
  'dual_control_data_entry',
  'appraisal_evaluation',
  'independent_loan_review',
  'problem_credit_monitoring',
  'classified_assets',
  'special_mention',
  'acl_cecl',
  'portfolio_growth_concentration',
]);

// ---------------------------------------------------------------------------
// Workspaces
// ---------------------------------------------------------------------------

/** The eight logical workspaces the remediation operating model spans. */
export type FDICWorkspace =
  | 'banker_deal_workspace'
  | 'credit_administration_workspace'
  | 'portfolio_command_center'
  | 'independent_loan_review_workspace'
  | 'acl_cecl_workbench'
  | 'appraisal_review_queue'
  | 'executive_board_oversight'
  | 'governance_evidence_ledger';

export const FDIC_WORKSPACES: readonly FDICWorkspace[] = Object.freeze([
  'banker_deal_workspace',
  'credit_administration_workspace',
  'portfolio_command_center',
  'independent_loan_review_workspace',
  'acl_cecl_workbench',
  'appraisal_review_queue',
  'executive_board_oversight',
  'governance_evidence_ledger',
]);

// ---------------------------------------------------------------------------
// Control status (the ONLY honest statuses)
// ---------------------------------------------------------------------------

/**
 * The four — and only four — honest control statuses.
 *
 * There is deliberately NO `compliant`, `remediated`, `fdic_approved`, or
 * `examiner_ready` status. Those are regulatory conclusions that the
 * platform must never assert; the platform only tracks how far a control
 * has progressed from "mapped on paper" to "wired with real evidence".
 */
export type FDICControlStatus =
  | 'mapped_not_wired'
  | 'evidence_gap'
  | 'partially_wired'
  | 'wired_with_evidence';

export const FDIC_CONTROL_STATUSES: readonly FDICControlStatus[] = Object.freeze([
  'mapped_not_wired',
  'evidence_gap',
  'partially_wired',
  'wired_with_evidence',
]);

/**
 * Phrases that must NEVER be used as a status or as a self-asserted
 * platform claim. Tests pin that none of these appear as a status value on
 * any control. They may appear only in prose that explains the prohibition
 * (e.g. a `notFakeComplianceRule` field, or a docs "no fake compliance"
 * section).
 */
export const FDIC_PROHIBITED_STATUS_CLAIMS: readonly string[] = Object.freeze([
  'fdic approved',
  'fdic_approved',
  'compliant',
  'remediated',
  'examiner ready',
  'examiner_ready',
]);

// ---------------------------------------------------------------------------
// Evidence types
// ---------------------------------------------------------------------------

/** The catalog of evidence kinds a control can require. */
export type FDICEvidenceType =
  | 'repayment_capacity_analysis'
  | 'source_of_repayment_documentation'
  | 'underwriting_memo_support'
  | 'guarantor_financial_review'
  | 'tax_return_support'
  | 'global_cash_flow_support'
  | 'loan_document_inventory'
  | 'legally_enforceable_document_review'
  | 'core_system_reconciliation'
  | 'dual_control_approval'
  | 'appraisal_required_determination'
  | 'appraisal_or_evaluation_report'
  | 'appraisal_review'
  | 'independent_loan_review_report'
  | 'policy_compliance_review'
  | 'risk_rating_review'
  | 'watchlist_review'
  | 'classified_asset_review'
  | 'special_mention_review'
  | 'acl_cecl_support'
  | 'qualitative_factor_support'
  | 'individually_evaluated_loan_support'
  | 'board_report'
  | 'management_commitment_tracking'
  | 'remediation_evidence_packet';

export const FDIC_EVIDENCE_TYPES: readonly FDICEvidenceType[] = Object.freeze([
  'repayment_capacity_analysis',
  'source_of_repayment_documentation',
  'underwriting_memo_support',
  'guarantor_financial_review',
  'tax_return_support',
  'global_cash_flow_support',
  'loan_document_inventory',
  'legally_enforceable_document_review',
  'core_system_reconciliation',
  'dual_control_approval',
  'appraisal_required_determination',
  'appraisal_or_evaluation_report',
  'appraisal_review',
  'independent_loan_review_report',
  'policy_compliance_review',
  'risk_rating_review',
  'watchlist_review',
  'classified_asset_review',
  'special_mention_review',
  'acl_cecl_support',
  'qualitative_factor_support',
  'individually_evaluated_loan_support',
  'board_report',
  'management_commitment_tracking',
  'remediation_evidence_packet',
]);

// ---------------------------------------------------------------------------
// Owner roles
// ---------------------------------------------------------------------------

export type FDICOwnerRole =
  | 'board'
  | 'executive'
  | 'management'
  | 'credit_admin'
  | 'underwriting'
  | 'loan_review'
  | 'portfolio'
  | 'finance'
  | 'banker';

// ---------------------------------------------------------------------------
// Control record
// ---------------------------------------------------------------------------

export interface FDICRemediationControl {
  id: string;
  title: string;
  theme: FDICFindingTheme;
  /** A faithful paraphrase of the FDIC finding — never a claim it is fixed. */
  sourceFindingSummary: string;
  /** The control the institution must operate to address the finding. */
  requiredControl: string;
  /** Evidence the control must produce to be considered wired. */
  evidenceRequired: readonly FDICEvidenceType[];
  /** The single workspace accountable for operating the control. */
  primaryWorkspace: FDICWorkspace;
  /** Workspaces that contribute evidence or consume the control's output. */
  supportingWorkspaces: readonly FDICWorkspace[];
  ownerRole: FDICOwnerRole;
  currentStatus: FDICControlStatus;
  whyItMatters: string;
  /** The explicit guardrail against asserting fake compliance for this control. */
  notFakeComplianceRule: string;
}

/**
 * The 13 required remediation controls. Each maps to exactly one primary
 * workspace, requires at least one evidence type, and defaults to
 * `mapped_not_wired` or `evidence_gap` — because as of Phase 140A the
 * platform has surfaces but not governed evidence capture for any of them.
 */
export const FDIC_REMEDIATION_CONTROLS: readonly FDICRemediationControl[] =
  Object.freeze([
    {
      id: 'FDIC-BOARD-OVERSIGHT-1',
      title: 'Board and executive credit-risk oversight',
      theme: 'board_oversight',
      sourceFindingSummary:
        'Examination noted insufficient board and executive oversight of credit underwriting and loan administration weaknesses, including tracking of management commitments.',
      requiredControl:
        'Board receives a structured remediation packet with current control status, aging of open items, and tracked management commitments at each meeting.',
      evidenceRequired: ['board_report', 'management_commitment_tracking'],
      primaryWorkspace: 'executive_board_oversight',
      supportingWorkspaces: [
        'governance_evidence_ledger',
        'portfolio_command_center',
      ],
      ownerRole: 'board',
      currentStatus: 'mapped_not_wired',
      whyItMatters:
        'Without accountable board oversight, control weaknesses persist unaddressed and remediation stalls.',
      notFakeComplianceRule:
        'A produced board packet is an input to oversight, not proof of remediation; the platform never reports the board as having accepted or closed an item.',
    },
    {
      id: 'FDIC-REPAYMENT-SOURCE-1',
      title: 'Primary and secondary repayment source documentation',
      theme: 'repayment_source',
      sourceFindingSummary:
        'Examination found loans approved without adequate documentation of repayment capacity and identified primary/secondary sources of repayment.',
      requiredControl:
        'Each credit documents a repayment-capacity analysis and an identified primary and secondary source of repayment before approval.',
      evidenceRequired: [
        'repayment_capacity_analysis',
        'source_of_repayment_documentation',
        'global_cash_flow_support',
      ],
      primaryWorkspace: 'banker_deal_workspace',
      supportingWorkspaces: [
        'credit_administration_workspace',
        'independent_loan_review_workspace',
      ],
      ownerRole: 'banker',
      currentStatus: 'evidence_gap',
      whyItMatters:
        'Repayment capacity is the foundation of credit quality; undocumented repayment sources mask elevated default risk.',
      notFakeComplianceRule:
        'A captured repayment analysis is unreviewed source evidence; it does not certify the credit is sound or the finding is closed.',
    },
    {
      id: 'FDIC-UNDERWRITING-QUALITY-1',
      title: 'Underwriting quality and credit-memo support',
      theme: 'underwriting_quality',
      sourceFindingSummary:
        'Examination identified underwriting quality weaknesses, including credit memoranda not supported by guarantor, tax-return, or cash-flow analysis.',
      requiredControl:
        'Each credit memo is supported by guarantor financial review, tax-return support, and a documented underwriting rationale before approval.',
      evidenceRequired: [
        'underwriting_memo_support',
        'guarantor_financial_review',
        'tax_return_support',
      ],
      primaryWorkspace: 'banker_deal_workspace',
      supportingWorkspaces: [
        'credit_administration_workspace',
        'independent_loan_review_workspace',
      ],
      ownerRole: 'underwriting',
      currentStatus: 'evidence_gap',
      whyItMatters:
        'Unsupported underwriting decisions produce inconsistent credit quality and unreliable risk ratings.',
      notFakeComplianceRule:
        'Attached underwriting support is raw evidence pending independent review; presence of a memo never asserts the underwriting met policy.',
    },
    {
      id: 'FDIC-MIS-DATA-ACCURACY-1',
      title: 'MIS / core loan data accuracy and reconciliation',
      theme: 'mis_data_accuracy',
      sourceFindingSummary:
        'Examination found core loan data and management information system (MIS) inaccuracies, with platform records not reconciled to the system of record.',
      requiredControl:
        'Core loan data is periodically reconciled to the system of record with documented exceptions and resolution.',
      evidenceRequired: ['core_system_reconciliation'],
      primaryWorkspace: 'credit_administration_workspace',
      supportingWorkspaces: [
        'portfolio_command_center',
        'governance_evidence_ledger',
      ],
      ownerRole: 'credit_admin',
      currentStatus: 'mapped_not_wired',
      whyItMatters:
        'Inaccurate MIS undermines every downstream risk decision, classification, and reserve calculation.',
      notFakeComplianceRule:
        'A reconciliation artifact records what was compared; it does not assert the core system is accurate until exceptions are resolved and reviewed.',
    },
    {
      id: 'FDIC-LOAN-DOC-COMPLETE-1',
      title: 'Loan document completeness and enforceability',
      theme: 'loan_documentation',
      sourceFindingSummary:
        'Examination identified incomplete loan files and documents that may not be legally enforceable, including missing or unexecuted instruments.',
      requiredControl:
        'Each loan maintains a complete document inventory and a legally-enforceable-document review with tracked exceptions.',
      evidenceRequired: [
        'loan_document_inventory',
        'legally_enforceable_document_review',
      ],
      primaryWorkspace: 'credit_administration_workspace',
      supportingWorkspaces: ['banker_deal_workspace', 'governance_evidence_ledger'],
      ownerRole: 'credit_admin',
      currentStatus: 'evidence_gap',
      whyItMatters:
        'Unenforceable or missing documents impair the institution’s ability to perfect collateral and collect on default.',
      notFakeComplianceRule:
        'A document inventory lists what exists; it never asserts documents are legally enforceable until a qualified review confirms it.',
    },
    {
      id: 'FDIC-DUAL-CONTROL-DATA-ENTRY-1',
      title: 'Dual control and segregation of duties for data entry',
      theme: 'dual_control_data_entry',
      sourceFindingSummary:
        'Examination found loan data entry performed without dual control or adequate segregation of duties, allowing unverified changes to core terms.',
      requiredControl:
        'Material loan data entries require a second-person dual-control approval recorded with maker and checker identity.',
      evidenceRequired: ['dual_control_approval'],
      primaryWorkspace: 'credit_administration_workspace',
      supportingWorkspaces: ['governance_evidence_ledger'],
      ownerRole: 'credit_admin',
      currentStatus: 'mapped_not_wired',
      whyItMatters:
        'Single-person data entry on core terms is a fraud and error exposure with no independent check.',
      notFakeComplianceRule:
        'A dual-control record proves two people acted; it does not by itself certify the entered value is correct.',
    },
    {
      id: 'FDIC-APPRAISAL-EVALUATION-1',
      title: 'Appraisal and evaluation controls',
      theme: 'appraisal_evaluation',
      sourceFindingSummary:
        'Examination identified weaknesses in appraisal and evaluation controls, including missing required-appraisal determinations and absent appraisal reviews.',
      requiredControl:
        'Each collateral-dependent loan has a documented appraisal-required determination, an appraisal or evaluation report, and an independent appraisal review.',
      evidenceRequired: [
        'appraisal_required_determination',
        'appraisal_or_evaluation_report',
        'appraisal_review',
      ],
      primaryWorkspace: 'appraisal_review_queue',
      supportingWorkspaces: [
        'credit_administration_workspace',
        'portfolio_command_center',
      ],
      ownerRole: 'credit_admin',
      currentStatus: 'mapped_not_wired',
      whyItMatters:
        'Unreviewed or absent appraisals produce unreliable collateral values that distort loss and reserve estimates.',
      notFakeComplianceRule:
        'An appraisal on file is not a compliant valuation until the independent appraisal review accepts it.',
    },
    {
      id: 'FDIC-INDEPENDENT-LOAN-REVIEW-1',
      title: 'Independent loan review program',
      theme: 'independent_loan_review',
      sourceFindingSummary:
        'Examination found the independent loan review function inadequate to challenge risk ratings and verify policy compliance across the portfolio.',
      requiredControl:
        'An independent loan review operates a sampling/review plan that challenges risk ratings, reviews policy compliance, and documents conclusions.',
      evidenceRequired: [
        'independent_loan_review_report',
        'risk_rating_review',
        'policy_compliance_review',
      ],
      primaryWorkspace: 'independent_loan_review_workspace',
      supportingWorkspaces: [
        'portfolio_command_center',
        'governance_evidence_ledger',
      ],
      ownerRole: 'loan_review',
      currentStatus: 'mapped_not_wired',
      whyItMatters:
        'Without an independent challenge, optimistic self-ratings go unchecked and problem credits surface too late.',
      notFakeComplianceRule:
        'A review report records the reviewer’s conclusion; it never claims the portfolio is sound or the finding is remediated.',
    },
    {
      id: 'FDIC-PROBLEM-CREDIT-MONITORING-1',
      title: 'Ongoing problem-credit and watchlist monitoring',
      theme: 'problem_credit_monitoring',
      sourceFindingSummary:
        'Examination identified inadequate ongoing monitoring of problem credits, including stale watchlists and untracked deterioration.',
      requiredControl:
        'A maintained watchlist tracks deteriorating credits with documented review cadence and action items.',
      evidenceRequired: ['watchlist_review'],
      primaryWorkspace: 'portfolio_command_center',
      supportingWorkspaces: [
        'credit_administration_workspace',
        'independent_loan_review_workspace',
      ],
      ownerRole: 'portfolio',
      currentStatus: 'mapped_not_wired',
      whyItMatters:
        'Late identification of problem credits delays loss recognition and remediation action.',
      notFakeComplianceRule:
        'A watchlist review captures status as of a date; it does not assert the credit is improving or the risk resolved.',
    },
    {
      id: 'FDIC-CLASSIFIED-ASSETS-1',
      title: 'Classified asset identification and tracking',
      theme: 'classified_assets',
      sourceFindingSummary:
        'Examination identified classified assets not consistently identified, tracked, or reported to management and the board.',
      requiredControl:
        'Classified assets are identified against a defined rating scale, tracked, and reported with documented review.',
      evidenceRequired: ['classified_asset_review'],
      primaryWorkspace: 'portfolio_command_center',
      supportingWorkspaces: [
        'independent_loan_review_workspace',
        'acl_cecl_workbench',
        'executive_board_oversight',
      ],
      ownerRole: 'portfolio',
      currentStatus: 'mapped_not_wired',
      whyItMatters:
        'Under-identified classified assets understate portfolio risk and required reserves.',
      notFakeComplianceRule:
        'A classification review records a rating judgment as of a date; it never asserts the classification is examiner-accepted.',
    },
    {
      id: 'FDIC-SPECIAL-MENTION-1',
      title: 'Special mention identification and tracking',
      theme: 'special_mention',
      sourceFindingSummary:
        'Examination found special-mention credits not consistently flagged or monitored for migration to classified status.',
      requiredControl:
        'Special-mention credits are flagged, monitored for migration, and reviewed on a documented cadence.',
      evidenceRequired: ['special_mention_review'],
      primaryWorkspace: 'portfolio_command_center',
      supportingWorkspaces: [
        'independent_loan_review_workspace',
        'executive_board_oversight',
      ],
      ownerRole: 'portfolio',
      currentStatus: 'mapped_not_wired',
      whyItMatters:
        'Special mention is the early-warning tier; missing it removes the chance to act before a credit is classified.',
      notFakeComplianceRule:
        'A special-mention review records an early-warning judgment; it does not certify the credit will not deteriorate.',
    },
    {
      id: 'FDIC-ACL-CECL-SUPPORT-1',
      title: 'ACL / CECL methodology support',
      theme: 'acl_cecl',
      sourceFindingSummary:
        'Examination identified insufficient support for the allowance for credit losses (ACL/CECL), including qualitative factors and individually evaluated loans.',
      requiredControl:
        'The ACL/CECL estimate is supported by documented qualitative factors and individually-evaluated-loan analysis, reviewed before posting.',
      evidenceRequired: [
        'acl_cecl_support',
        'qualitative_factor_support',
        'individually_evaluated_loan_support',
      ],
      primaryWorkspace: 'acl_cecl_workbench',
      supportingWorkspaces: [
        'portfolio_command_center',
        'executive_board_oversight',
        'governance_evidence_ledger',
      ],
      ownerRole: 'finance',
      currentStatus: 'mapped_not_wired',
      whyItMatters:
        'An unsupported allowance can be materially misstated, affecting capital adequacy and financial reporting.',
      notFakeComplianceRule:
        'Assembled ACL support is an input to the reserve estimate; the platform never asserts the allowance is adequate or GAAP-compliant.',
    },
    {
      id: 'FDIC-GROWTH-CONCENTRATION-1',
      title: 'Loan growth and concentration risk monitoring',
      theme: 'portfolio_growth_concentration',
      sourceFindingSummary:
        'Examination identified rapid loan growth and concentrations without commensurate monitoring or limits.',
      requiredControl:
        'Portfolio growth and concentrations are monitored against documented limits with trend visibility and board reporting.',
      evidenceRequired: ['board_report'],
      primaryWorkspace: 'portfolio_command_center',
      supportingWorkspaces: ['executive_board_oversight'],
      ownerRole: 'portfolio',
      currentStatus: 'mapped_not_wired',
      whyItMatters:
        'Unmonitored concentration risk amplifies losses when a single segment deteriorates.',
      notFakeComplianceRule:
        'A concentration view shows exposure as of a date; it does not assert limits are appropriate or that growth is prudent.',
    },
  ]);

// ---------------------------------------------------------------------------
// Lookups
// ---------------------------------------------------------------------------

/** The required control id set — pinned by tests so none can silently drop. */
export const FDIC_REQUIRED_CONTROL_IDS: readonly string[] = Object.freeze([
  'FDIC-BOARD-OVERSIGHT-1',
  'FDIC-REPAYMENT-SOURCE-1',
  'FDIC-UNDERWRITING-QUALITY-1',
  'FDIC-MIS-DATA-ACCURACY-1',
  'FDIC-LOAN-DOC-COMPLETE-1',
  'FDIC-DUAL-CONTROL-DATA-ENTRY-1',
  'FDIC-APPRAISAL-EVALUATION-1',
  'FDIC-INDEPENDENT-LOAN-REVIEW-1',
  'FDIC-PROBLEM-CREDIT-MONITORING-1',
  'FDIC-CLASSIFIED-ASSETS-1',
  'FDIC-SPECIAL-MENTION-1',
  'FDIC-ACL-CECL-SUPPORT-1',
  'FDIC-GROWTH-CONCENTRATION-1',
]);

export function getFdicControl(
  id: string,
): FDICRemediationControl | undefined {
  return FDIC_REMEDIATION_CONTROLS.find((control) => control.id === id);
}

export function getFdicControlsByWorkspace(
  workspace: FDICWorkspace,
): readonly FDICRemediationControl[] {
  return FDIC_REMEDIATION_CONTROLS.filter(
    (control) => control.primaryWorkspace === workspace,
  );
}

export function getFdicControlsByTheme(
  theme: FDICFindingTheme,
): readonly FDICRemediationControl[] {
  return FDIC_REMEDIATION_CONTROLS.filter((control) => control.theme === theme);
}

/**
 * True when `value` is one of the four honest statuses. Used by tests and
 * the snapshot deriver to guarantee no fake-compliance status ever leaks in.
 */
export function isHonestFdicStatus(value: string): value is FDICControlStatus {
  return (FDIC_CONTROL_STATUSES as readonly string[]).includes(value);
}
