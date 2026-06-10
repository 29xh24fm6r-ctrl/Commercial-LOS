/**
 * Phase 146F — Banker CRM daily action queue.
 * Read-only review tasks derived from CRM intelligence.
 * No CRM write. No Dataverse write. No mutation.
 */

export type BankerCrmActionCategory =
  | 'review_crm_match'
  | 'resolve_source_of_truth_conflict'
  | 'review_sync_preview_blocked'
  | 'review_missing_contact_readiness'
  | 'review_relationship_activity_gap'
  | 'review_ncino_loan_workflow_readiness'
  | 'review_salesforce_opportunity_readiness';

export interface BankerCrmDailyAction {
  actionId: string;
  category: BankerCrmActionCategory;
  label: string;
  description: string;
  severity: 'high' | 'medium' | 'low';
  dealName: string | undefined;
  dealRouteHref: string | undefined;
  readOnly: true;
}

export interface BankerCrmDailyActionQueueViewModel {
  title: string;
  subtitle: string;
  safetyCopy: string;
  readOnly: true;
  liveWritePerformed: false;
  actions: readonly BankerCrmDailyAction[];
  totalActions: number;
  highSeverityCount: number;
  mediumSeverityCount: number;
  lowSeverityCount: number;
}

export interface BankerCrmDailyActionInput {
  matchConflicts: readonly { dealName?: string; dealRouteHref?: string; description: string }[];
  sourceOfTruthConflicts: readonly { dealName?: string; dealRouteHref?: string; description: string }[];
  syncPreviewBlocked: readonly { dealName?: string; dealRouteHref?: string; description: string }[];
  missingContactReadiness: readonly { dealName?: string; dealRouteHref?: string; description: string }[];
  activityGaps: readonly { dealName?: string; dealRouteHref?: string; description: string }[];
  ncinoWorkflowGaps: readonly { dealName?: string; dealRouteHref?: string; description: string }[];
  salesforceOpportunityGaps: readonly { dealName?: string; dealRouteHref?: string; description: string }[];
}

export function deriveBankerCrmDailyActionQueue(
  input: BankerCrmDailyActionInput,
): BankerCrmDailyActionQueueViewModel {
  const actions: BankerCrmDailyAction[] = [];
  let id = 0;

  function addActions(
    items: readonly { dealName?: string; dealRouteHref?: string; description: string }[],
    category: BankerCrmActionCategory,
    label: string,
    severity: 'high' | 'medium' | 'low',
  ) {
    for (const item of items) {
      actions.push({
        actionId: `crm-action-${++id}`,
        category,
        label,
        description: item.description,
        severity,
        dealName: item.dealName,
        dealRouteHref: item.dealRouteHref,
        readOnly: true,
      });
    }
  }

  addActions(input.matchConflicts, 'review_crm_match', 'Review CRM match', 'high');
  addActions(input.sourceOfTruthConflicts, 'resolve_source_of_truth_conflict', 'Resolve source-of-truth conflict', 'high');
  addActions(input.syncPreviewBlocked, 'review_sync_preview_blocked', 'Review sync preview blocked item', 'medium');
  addActions(input.missingContactReadiness, 'review_missing_contact_readiness', 'Review missing contact readiness', 'medium');
  addActions(input.activityGaps, 'review_relationship_activity_gap', 'Review relationship activity gap', 'low');
  addActions(input.ncinoWorkflowGaps, 'review_ncino_loan_workflow_readiness', 'Review nCino loan workflow readiness', 'medium');
  addActions(input.salesforceOpportunityGaps, 'review_salesforce_opportunity_readiness', 'Review Salesforce opportunity readiness', 'medium');

  return {
    title: 'CRM Daily Action Queue',
    subtitle: 'Review tasks from CRM intelligence — read-only',
    safetyCopy: 'These are review tasks only, not write tasks. No CRM or Dataverse writes.',
    readOnly: true,
    liveWritePerformed: false,
    actions,
    totalActions: actions.length,
    highSeverityCount: actions.filter((a) => a.severity === 'high').length,
    mediumSeverityCount: actions.filter((a) => a.severity === 'medium').length,
    lowSeverityCount: actions.filter((a) => a.severity === 'low').length,
  };
}
