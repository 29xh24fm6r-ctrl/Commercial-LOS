/**
 * Phase 142C — Credit committee route deriver.
 *
 * PURE, READ-ONLY. Decides whether (and which) credit committee is required from
 * the matched rule's committee policy + readiness context. Voting and approval
 * are STRUCTURALLY disabled; it records no votes, submits no package, and makes
 * no approval/decline/waiver.
 *
 * There is deliberately NO amount-based escalation here: OGB has ratified a
 * single authorized-approver gate with no amount tiers (see
 * approvalAuthorityMatrix.ts). A committee is only in play when a rule
 * explicitly sets a non-'none' committeePolicy (e.g. a covenant exception or
 * construction/project-based route) — never merely because the loan amount
 * crosses a threshold.
 */

import {
  type WorkflowRoutingInput,
  type WorkflowCommitteeRoute,
  type WorkflowCommitteeType,
  type WorkflowPackageReadiness,
  type WorkflowRoutingBlocker,
} from './workflowRoutingConfigTypes';

export interface DeriveCreditCommitteeRouteInput {
  input: WorkflowRoutingInput;
  routeKey: string;
  committeePolicy: WorkflowCommitteeType;
  packageReadiness?: WorkflowPackageReadiness;
  covenantStatus?: WorkflowRoutingInput['covenantStatus'];
  evidenceComplete?: boolean;
}

export function deriveCreditCommitteeRoute(
  args: DeriveCreditCommitteeRouteInput,
): WorkflowCommitteeRoute {
  const committeeType: WorkflowCommitteeType = args.committeePolicy;
  const committeeRequired = committeeType !== 'none';

  const reasonCodes: string[] = [];
  if (args.committeePolicy !== 'none') reasonCodes.push('committee_policy');
  if (args.covenantStatus === 'breach' || args.covenantStatus === 'review_required') reasonCodes.push('covenant_exception');

  const requiredMaterials: string[] = ['annual_review_credit_memo'];
  if (args.covenantStatus === 'breach' || args.covenantStatus === 'review_required') requiredMaterials.push('covenant_testing_support');
  if (committeeType === 'executive_credit_review' || committeeType === 'board_visibility_only') requiredMaterials.push('annual_review_board_package');

  const packageReadiness = args.packageReadiness ?? 'unknown';
  const evidenceReadiness: WorkflowCommitteeRoute['evidenceReadiness'] =
    args.evidenceComplete === true ? 'complete' : args.evidenceComplete === false ? 'missing' : 'unknown';

  const missingMaterials: string[] = [];
  if (committeeRequired && (packageReadiness === 'blocked' || packageReadiness === 'unknown')) missingMaterials.push('annual_review_credit_memo');
  if (args.covenantStatus === 'unknown' || args.covenantStatus === 'review_required') missingMaterials.push('covenant_testing_support');
  if (committeeRequired && evidenceReadiness === 'missing') missingMaterials.push('evidence_inventory');

  const blockers: WorkflowRoutingBlocker[] = [];
  for (const m of missingMaterials) blockers.push({ code: 'missing_material', message: `Committee-ready blocked: missing ${m}.` });
  if (args.covenantStatus === 'breach') blockers.push({ code: 'covenant_breach', message: 'A covenant breach finding is open (review required).' });

  const nextBestAction = missingMaterials.length > 0
    ? { code: 'complete_committee_materials', label: 'Complete the missing committee materials and evidence.' }
    : committeeRequired
      ? { code: 'prepare_committee_review', label: 'Prepare the committee review package (no submission or vote occurs here).' }
      : { code: 'no_committee_required', label: 'No credit committee is required for this route.' };

  return {
    committeeRequired,
    committeeType,
    reasonCodes,
    requiredMaterials,
    missingMaterials,
    packageReadiness,
    evidenceReadiness,
    votingEnabled: false,
    approvalEnabled: false,
    blockers,
    warnings: [],
    nextBestAction,
  };
}
