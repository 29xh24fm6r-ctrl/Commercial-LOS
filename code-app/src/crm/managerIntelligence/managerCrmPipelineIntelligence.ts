/**
 * Phase 146G — Manager CRM pipeline intelligence.
 * Read-only. No assignment mutation. No CRM write.
 */

export interface ManagerCrmKpi {
  key: string;
  label: string;
  value: number;
  description: string;
}

export interface ManagerCrmPipelineIntelligenceViewModel {
  title: string;
  subtitle: string;
  safetyCopy: string;
  readOnly: true;
  liveWritePerformed: false;
  externalSystemChanged: false;

  kpis: readonly ManagerCrmKpi[];
  nextSafeManagerReviewStep: string;
}

export interface ManagerCrmPipelineInput {
  dealsWithMatchConflicts: number;
  dealsMissingSalesforceReadiness: number;
  dealsMissingNcinoReadiness: number;
  syncPreviewBlockedCount: number;
  bankerCrmFollowUpCount: number;
  relationshipActivityGapCount: number;
}

export function deriveManagerCrmPipelineIntelligence(
  input: ManagerCrmPipelineInput,
): ManagerCrmPipelineIntelligenceViewModel {
  const kpis: ManagerCrmKpi[] = [
    { key: 'match_conflicts', label: 'Match Conflicts', value: input.dealsWithMatchConflicts, description: 'Deals with CRM entity match conflicts' },
    { key: 'sf_readiness', label: 'Missing SF Readiness', value: input.dealsMissingSalesforceReadiness, description: 'Deals missing Salesforce account/opportunity readiness' },
    { key: 'nc_readiness', label: 'Missing nCino Readiness', value: input.dealsMissingNcinoReadiness, description: 'Deals missing nCino relationship/loan readiness' },
    { key: 'sync_blocked', label: 'Sync Blocked', value: input.syncPreviewBlockedCount, description: 'Sync preview blocked items' },
    { key: 'banker_followup', label: 'Banker CRM Follow-Up', value: input.bankerCrmFollowUpCount, description: 'Banker workload by CRM follow-up' },
    { key: 'activity_gaps', label: 'Activity Gaps', value: input.relationshipActivityGapCount, description: 'Relationship activity gaps' },
  ];

  return {
    title: 'Manager CRM Pipeline Intelligence',
    subtitle: 'Team CRM readiness and gap analysis — read-only',
    safetyCopy: 'Read-only view. No assignment mutation. No CRM write.',
    readOnly: true,
    liveWritePerformed: false,
    externalSystemChanged: false,
    kpis,
    nextSafeManagerReviewStep: 'Review match conflicts and Salesforce/nCino readiness gaps with team.',
  };
}
