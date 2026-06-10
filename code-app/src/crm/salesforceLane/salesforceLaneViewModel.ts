/**
 * Phase 147B — Salesforce lane view model.
 * Read-only. Preview-only. No live writes. No fake Salesforce IDs.
 */

export interface SalesforceLaneReadinessRow {
  key: string;
  label: string;
  status: 'ready' | 'not_ready' | 'not_evaluated';
  detail: string;
}

export interface SalesforceLaneSyncBucket {
  operation: string;
  count: number;
  label: string;
}

export interface SalesforceLaneViewModel {
  title: string;
  subtitle: string;
  safetyCopy: string;
  readOnly: true;
  previewOnly: true;
  liveWritePerformed: false;
  salesforceWritePerformed: false;

  readinessRows: readonly SalesforceLaneReadinessRow[];
  syncBuckets: readonly SalesforceLaneSyncBucket[];
  matchConflictCount: number;
  nextSafeStep: string;
}

export interface SalesforceLaneInput {
  accountReady: boolean;
  contactReady: boolean;
  opportunityReady: boolean;
  activityReferenceReady: boolean;
  matchConflicts: number;
  wouldCreate: number;
  wouldUpdate: number;
  wouldLink: number;
  blocked: number;
  noOp: number;
}

export function deriveSalesforceLaneViewModel(input: SalesforceLaneInput): SalesforceLaneViewModel {
  const readinessRows: SalesforceLaneReadinessRow[] = [
    { key: 'account', label: 'Account Readiness', status: input.accountReady ? 'ready' : 'not_ready', detail: input.accountReady ? 'Salesforce account mapping available' : 'Salesforce account mapping not available' },
    { key: 'contact', label: 'Contact Readiness', status: input.contactReady ? 'ready' : 'not_ready', detail: input.contactReady ? 'Contact references available' : 'Contact references not available' },
    { key: 'opportunity', label: 'Opportunity Readiness', status: input.opportunityReady ? 'ready' : 'not_ready', detail: input.opportunityReady ? 'Opportunity mapping available' : 'Opportunity mapping not available' },
    { key: 'activity', label: 'Activity/Reference Readiness', status: input.activityReferenceReady ? 'ready' : 'not_ready', detail: input.activityReferenceReady ? 'Activity references available' : 'Activity references not available' },
  ];

  const syncBuckets: SalesforceLaneSyncBucket[] = [
    { operation: 'would_create', count: input.wouldCreate, label: 'Would create' },
    { operation: 'would_update', count: input.wouldUpdate, label: 'Would update' },
    { operation: 'would_link', count: input.wouldLink, label: 'Would link' },
    { operation: 'blocked', count: input.blocked, label: 'Blocked' },
    { operation: 'no_op', count: input.noOp, label: 'No operation' },
  ];

  return {
    title: 'Salesforce',
    subtitle: 'Account, contact, and opportunity intelligence — preview only',
    safetyCopy: 'Salesforce preview. Live writes disabled. No records created, updated, or linked.',
    readOnly: true,
    previewOnly: true,
    liveWritePerformed: false,
    salesforceWritePerformed: false,
    readinessRows,
    syncBuckets,
    matchConflictCount: input.matchConflicts,
    nextSafeStep: input.matchConflicts > 0
      ? 'Resolve match conflicts before proceeding'
      : 'Review readiness gaps and sync preview',
  };
}
