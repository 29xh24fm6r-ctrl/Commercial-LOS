import {
  deriveEliteCrmLosActivationReadiness,
  type EliteReadinessDomain,
} from './eliteCrmLosActivationReadinessModel';
import { deriveFullSystemLaunchReadiness } from './fullSystemLaunchReadinessModel';
import { BORROWER_MESSAGING_ENABLED } from '../deals/dealOriginationFeatureFlags';

/**
 * Phase 234 — Admin operator action queue + go-live blocker clearing.
 *
 * Pure, deterministic, READ-ONLY. Turns the existing readiness BLOCKERS (from the
 * elite CRM + LOS activation readiness model and the full-system launch readiness
 * model) into grouped operator tasks so an operator can see exactly what stands
 * between the current posture and go-live — per category. It performs NO mutation:
 * it neither flips a gate nor executes an action. Every task is a projection of an
 * existing blocker/required-action, never a fabricated instruction.
 */

export type OperatorActionGroupId =
  | 'crm-los-activation'
  | 'new-deal-create'
  | 'document-checklist'
  | 'borrower-communication'
  | 'crm-writeback'
  | 'portfolio-boarding'
  | 'launch-readiness';

export type OperatorActionGroupState = 'clear' | 'action-required';

export interface OperatorActionItem {
  readonly id: string;
  readonly title: string;
  readonly detail: string;
}

export interface OperatorActionGroup {
  readonly id: OperatorActionGroupId;
  readonly label: string;
  readonly state: OperatorActionGroupState;
  readonly actions: readonly OperatorActionItem[];
}

export interface AdminOperatorActionQueueModel {
  readonly title: string;
  readonly posture: string;
  readonly totalOpenActions: number;
  readonly groups: readonly OperatorActionGroup[];
  readonly certifications: readonly string[];
}

const GROUP_LABELS: Record<OperatorActionGroupId, string> = {
  'crm-los-activation': 'Internal CRM + LOS activation',
  'new-deal-create': 'New Deal create',
  'document-checklist': 'Document checklist generation',
  'borrower-communication': 'Borrower communications',
  'crm-writeback': 'CRM writeback / live persistence',
  'portfolio-boarding': 'Portfolio boarding',
  'launch-readiness': 'Full-system launch readiness',
};

const GROUP_ORDER: readonly OperatorActionGroupId[] = [
  'crm-los-activation',
  'new-deal-create',
  'crm-writeback',
  'document-checklist',
  'borrower-communication',
  'portfolio-boarding',
  'launch-readiness',
];

/** Map an elite-readiness domain id to the operator action group it belongs to. */
function groupForEliteDomain(domainId: string): OperatorActionGroupId {
  switch (domainId) {
    case 'new-deal-create':
      return 'new-deal-create';
    case 'document-checklist':
      return 'document-checklist';
    case 'crm-writeback':
      return 'crm-writeback';
    case 'portfolio-boarding':
      return 'portfolio-boarding';
    case 'internal-crm':
    case 'loan-workflow':
    default:
      return 'crm-los-activation';
  }
}

/**
 * Build a task from an elite-readiness domain using CLEAN internal-language group
 * titles (never echoing upstream descriptive labels), so this operator surface
 * always reads as internal OGB CRM / internal lending workflow.
 */
function eliteActionItem(domain: EliteReadinessDomain, groupId: OperatorActionGroupId): OperatorActionItem {
  return {
    id: `elite:${domain.id}`,
    title: `${GROUP_LABELS[groupId]}: ${domain.state === 'blocked' ? 'assemble / verify' : 'clear gate'}`,
    detail: domain.nextAction,
  };
}

export function deriveAdminOperatorActionQueueModel(): AdminOperatorActionQueueModel {
  const elite = deriveEliteCrmLosActivationReadiness();
  const launch = deriveFullSystemLaunchReadiness();

  const actionsByGroup = new Map<OperatorActionGroupId, OperatorActionItem[]>();
  for (const id of GROUP_ORDER) actionsByGroup.set(id, []);

  // 1) Elite CRM + LOS activation: each non-ready domain becomes a grouped task.
  for (const domain of elite.domains) {
    if (domain.state === 'ready') continue;
    const groupId = groupForEliteDomain(domain.id);
    actionsByGroup.get(groupId)!.push(eliteActionItem(domain, groupId));
  }

  // 2) Borrower communications: fail-closed by default; surface the certify task.
  if (!BORROWER_MESSAGING_ENABLED) {
    actionsByGroup.get('borrower-communication')!.push({
      id: 'borrower:live-send',
      title: 'Borrower communications: certify live send',
      detail:
        'Borrower live send is gated by default. Certify the recipient source, borrower-safe content, connector acceptance semantics, and audit/timeline before enabling.',
    });
  }

  // 3) Full-system launch readiness: each non-ready launch domain's required
  //    actions become tasks in the launch-readiness group. The task id is
  //    positional (never echoes an upstream domain id, which can carry internal
  //    vendor-naming) so this operator surface stays clean internal language.
  launch.domains.forEach((domain, domainIndex) => {
    if (domain.status === 'ready') return;
    domain.requiredActions.forEach((action, index) => {
      actionsByGroup.get('launch-readiness')!.push({
        id: `launch:${domainIndex}:${index}`,
        title: `${domain.label}: required action`,
        detail: action,
      });
    });
  });

  const groups: OperatorActionGroup[] = GROUP_ORDER.map((id) => {
    const actions = actionsByGroup.get(id)!;
    return {
      id,
      label: GROUP_LABELS[id],
      state: actions.length > 0 ? 'action-required' : 'clear',
      actions,
    };
  });

  const totalOpenActions = groups.reduce((sum, g) => sum + g.actions.length, 0);

  return {
    title: 'Admin Operator Action Queue',
    posture:
      'Read-only go-live blocker clearing: every remaining readiness blocker is grouped into an operator task by category. Clearing an item means completing its certification, not flipping a source default. This queue performs no live write and triggers no action.',
    totalOpenActions,
    groups,
    certifications: [
      'No live write, gate flip, or action is executed by this queue.',
      'Each task is projected from an existing readiness blocker or required action.',
      'No external Salesforce or nCino sync, borrower send, or booking action is triggered.',
      'No route or permission is widened by the operator action queue.',
    ],
  };
}
