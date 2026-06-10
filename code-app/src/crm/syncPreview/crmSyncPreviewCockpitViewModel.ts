/**
 * Phase 146D — CRM sync preview cockpit view model.
 * Preview-only. No writes. No CRM record creation.
 */

export type SyncPreviewOperation =
  | 'would_create'
  | 'would_update'
  | 'would_link'
  | 'would_skip'
  | 'blocked'
  | 'no_op';

export interface SyncPreviewEntityRow {
  entityKind: string;
  provider: 'salesforce' | 'ncino';
  label: string;
  operation: SyncPreviewOperation;
  reason: string | undefined;
  blockerReason: string | undefined;
}

export interface CrmSyncPreviewCockpitViewModel {
  title: string;
  subtitle: string;
  safetyCopy: string;

  previewOnly: true;
  liveWritePerformed: false;
  crmRecordCreated: false;
  crmRecordUpdated: false;
  crmRecordLinked: false;
  externalSystemChanged: false;

  entities: readonly SyncPreviewEntityRow[];
  wouldCreateCount: number;
  wouldUpdateCount: number;
  wouldLinkCount: number;
  wouldSkipCount: number;
  blockedCount: number;
  noOpCount: number;
}

export interface CrmSyncPreviewCockpitInput {
  salesforceEntities: readonly SyncPreviewEntityInput[];
  ncinoEntities: readonly SyncPreviewEntityInput[];
}

export interface SyncPreviewEntityInput {
  entityKind: string;
  label: string;
  operation: SyncPreviewOperation;
  reason?: string;
  blockerReason?: string;
}

export function deriveCrmSyncPreviewCockpitViewModel(
  input: CrmSyncPreviewCockpitInput,
): CrmSyncPreviewCockpitViewModel {
  const entities: SyncPreviewEntityRow[] = [
    ...input.salesforceEntities.map((e) => ({
      ...e,
      provider: 'salesforce' as const,
      reason: e.reason ?? undefined,
      blockerReason: e.blockerReason ?? undefined,
    })),
    ...input.ncinoEntities.map((e) => ({
      ...e,
      provider: 'ncino' as const,
      reason: e.reason ?? undefined,
      blockerReason: e.blockerReason ?? undefined,
    })),
  ];

  return {
    title: 'CRM Sync Preview',
    subtitle: 'What would sync — preview only, no records changed',
    safetyCopy: 'This is a preview only. No CRM records have been created, updated, or linked.',

    previewOnly: true,
    liveWritePerformed: false,
    crmRecordCreated: false,
    crmRecordUpdated: false,
    crmRecordLinked: false,
    externalSystemChanged: false,

    entities,
    wouldCreateCount: entities.filter((e) => e.operation === 'would_create').length,
    wouldUpdateCount: entities.filter((e) => e.operation === 'would_update').length,
    wouldLinkCount: entities.filter((e) => e.operation === 'would_link').length,
    wouldSkipCount: entities.filter((e) => e.operation === 'would_skip').length,
    blockedCount: entities.filter((e) => e.operation === 'blocked').length,
    noOpCount: entities.filter((e) => e.operation === 'no_op').length,
  };
}
