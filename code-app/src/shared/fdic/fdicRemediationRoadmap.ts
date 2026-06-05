/**
 * Phase 140A — FDIC Remediation Roadmap.
 *
 * The sequenced build plan that turns the static 140A foundation into wired,
 * evidence-producing workspaces. Every item is `planned` — Phase 140A builds
 * the model, docs, and tests only; no roadmap item is implemented here.
 *
 * Discipline:
 *   - STATIC. No IO. `controlsAddressed` references real control ids; each
 *     item's `dependsOn` references earlier roadmap ids.
 *   - `status` is always 'planned'. Marking an item anything else requires
 *     the phase that actually ships it.
 */

import type {
  FDICWorkspace,
  FDICEvidenceType,
} from './fdicRemediationOperatingModel';

export type FDICRoadmapStatus = 'planned';

export interface FDICRoadmapItem {
  id: string;
  title: string;
  primaryWorkspace: FDICWorkspace;
  controlsAddressed: readonly string[];
  evidenceProduced: readonly FDICEvidenceType[];
  dependsOn: readonly string[];
  whyNext: string;
  status: FDICRoadmapStatus;
}

export const FDIC_REMEDIATION_ROADMAP: readonly FDICRoadmapItem[] = Object.freeze(
  [
    {
      id: '140B',
      title: 'Portfolio FDIC Control Tower (visible UI)',
      primaryWorkspace: 'portfolio_command_center',
      controlsAddressed: [
        'FDIC-PROBLEM-CREDIT-MONITORING-1',
        'FDIC-CLASSIFIED-ASSETS-1',
        'FDIC-SPECIAL-MENTION-1',
        'FDIC-GROWTH-CONCENTRATION-1',
      ],
      evidenceProduced: [],
      dependsOn: [],
      whyNext:
        'Surfaces the read-only control-tower derived in 140A so the whole remediation picture is visible before any workspace is wired.',
      status: 'planned',
    },
    {
      id: '140C',
      title: 'Credit Admin document / core-data exception queues',
      primaryWorkspace: 'credit_administration_workspace',
      controlsAddressed: [
        'FDIC-MIS-DATA-ACCURACY-1',
        'FDIC-LOAN-DOC-COMPLETE-1',
      ],
      evidenceProduced: [
        'core_system_reconciliation',
        'loan_document_inventory',
        'legally_enforceable_document_review',
      ],
      dependsOn: ['140B'],
      whyNext:
        'Document completeness and core-data accuracy are the highest-frequency findings; exception queues turn them into tracked work.',
      status: 'planned',
    },
    {
      id: '140D',
      title: 'Independent Loan Review workspace',
      primaryWorkspace: 'independent_loan_review_workspace',
      controlsAddressed: ['FDIC-INDEPENDENT-LOAN-REVIEW-1'],
      evidenceProduced: [
        'independent_loan_review_report',
        'policy_compliance_review',
        'risk_rating_review',
      ],
      dependsOn: ['140C'],
      whyNext:
        'An independent challenge layer is needed to validate the evidence the source and execution layers begin producing.',
      status: 'planned',
    },
    {
      id: '140E',
      title: 'Problem Credit / Watchlist workflow',
      primaryWorkspace: 'portfolio_command_center',
      controlsAddressed: ['FDIC-PROBLEM-CREDIT-MONITORING-1'],
      evidenceProduced: ['watchlist_review'],
      dependsOn: ['140B', '140D'],
      whyNext:
        'Turns the control-tower visibility into an actioned watchlist review cadence with documented conclusions.',
      status: 'planned',
    },
    {
      id: '140F',
      title: 'ACL / CECL support workbench',
      primaryWorkspace: 'acl_cecl_workbench',
      controlsAddressed: ['FDIC-ACL-CECL-SUPPORT-1'],
      evidenceProduced: [
        'acl_cecl_support',
        'qualitative_factor_support',
        'individually_evaluated_loan_support',
      ],
      dependsOn: ['140D'],
      whyNext:
        'Reserve support depends on reliable classifications and independent review feeding individually evaluated loans.',
      status: 'planned',
    },
    {
      id: '140G',
      title: 'Appraisal / Evaluation review queue',
      primaryWorkspace: 'appraisal_review_queue',
      controlsAddressed: ['FDIC-APPRAISAL-EVALUATION-1'],
      evidenceProduced: [
        'appraisal_required_determination',
        'appraisal_or_evaluation_report',
        'appraisal_review',
      ],
      dependsOn: ['140C'],
      whyNext:
        'Collateral compliance feeds both classification and reserve accuracy; it routes from Credit Admin once exception queues exist.',
      status: 'planned',
    },
    {
      id: '140H',
      title: 'Board remediation packet',
      primaryWorkspace: 'executive_board_oversight',
      controlsAddressed: ['FDIC-BOARD-OVERSIGHT-1'],
      evidenceProduced: ['board_report', 'management_commitment_tracking'],
      dependsOn: ['140B', '140E', '140F'],
      whyNext:
        'The accountability layer can only report once the underlying workspaces produce real status to roll up.',
      status: 'planned',
    },
    {
      id: '140I',
      title: 'Governance evidence ledger',
      primaryWorkspace: 'governance_evidence_ledger',
      controlsAddressed: [
        'FDIC-MIS-DATA-ACCURACY-1',
        'FDIC-LOAN-DOC-COMPLETE-1',
        'FDIC-INDEPENDENT-LOAN-REVIEW-1',
        'FDIC-ACL-CECL-SUPPORT-1',
      ],
      evidenceProduced: ['remediation_evidence_packet'],
      dependsOn: ['140C', '140D', '140F', '140G'],
      whyNext:
        'Once workspaces produce evidence, the ledger indexes it into an auditable finding-to-control-to-evidence trail.',
      status: 'planned',
    },
    {
      id: '140J',
      title: 'Data-entry dual-control workflow',
      primaryWorkspace: 'credit_administration_workspace',
      controlsAddressed: ['FDIC-DUAL-CONTROL-DATA-ENTRY-1'],
      evidenceProduced: ['dual_control_approval'],
      dependsOn: ['140C'],
      whyNext:
        'Segregation of duties on core-data entry depends on the Credit Admin workspace existing first.',
      status: 'planned',
    },
    {
      id: '140K',
      title: 'Examiner evidence packet export / readiness',
      primaryWorkspace: 'governance_evidence_ledger',
      controlsAddressed: [
        'FDIC-BOARD-OVERSIGHT-1',
        'FDIC-INDEPENDENT-LOAN-REVIEW-1',
      ],
      evidenceProduced: ['remediation_evidence_packet'],
      dependsOn: ['140H', '140I', '140J'],
      whyNext:
        'A packet can only be assembled once every upstream evidence stream and the ledger that indexes them exist.',
      status: 'planned',
    },
  ],
);

/** The roadmap id set, pinned by tests so coverage of 140B–140K cannot drop. */
export const FDIC_ROADMAP_IDS: readonly string[] = Object.freeze([
  '140B',
  '140C',
  '140D',
  '140E',
  '140F',
  '140G',
  '140H',
  '140I',
  '140J',
  '140K',
]);

export function getRoadmapItem(id: string): FDICRoadmapItem | undefined {
  return FDIC_REMEDIATION_ROADMAP.find((item) => item.id === id);
}
