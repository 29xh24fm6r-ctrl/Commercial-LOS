/**
 * Phase 153 — Sync preview using live external records.
 * Preview-only. No writes. No fake success.
 */

import type { ExternalRecord } from './externalPlatformReadOnlyAdapter';

export type SyncPreviewOp = 'no_op' | 'would_create' | 'would_update' | 'would_link' | 'would_skip' | 'blocked_conflict' | 'blocked_policy' | 'unavailable';

export interface LiveSyncPreviewRow {
  entityLabel: string;
  entityKind: string;
  operation: SyncPreviewOp;
  reason: string;
  blockerReason: string | undefined;
}

export interface LiveSyncPreviewInput {
  losRecords: readonly { dealName: string; clientName: string | undefined }[];
  externalRecords: readonly ExternalRecord[];
  policyReady: boolean;
}

export interface LiveSyncPreviewResult {
  previewOnly: true;
  liveReadUsed: boolean;
  liveWritePerformed: false;
  externalSystemChanged: false;
  crmRecordCreated: false;
  crmRecordUpdated: false;
  crmRecordLinked: false;
  operationRows: readonly LiveSyncPreviewRow[];
  blockedRows: readonly LiveSyncPreviewRow[];
  warnings: readonly string[];
  nextReviewStep: string;
}

function normalize(s: string | undefined): string {
  return (s ?? '').trim().toLowerCase();
}

export function deriveLiveExternalSyncPreview(input: LiveSyncPreviewInput): LiveSyncPreviewResult {
  const rows: LiveSyncPreviewRow[] = [];
  const blocked: LiveSyncPreviewRow[] = [];
  const extNames = new Set(input.externalRecords.map((r) => normalize(r.displayName)));

  for (const los of input.losRecords) {
    const losName = normalize(los.clientName ?? los.dealName);
    if (extNames.has(losName)) {
      if (!input.policyReady) {
        const row: LiveSyncPreviewRow = { entityLabel: los.dealName, entityKind: 'deal', operation: 'blocked_policy', reason: 'Policy gate not ready', blockerReason: 'Writeback policy not ready' };
        blocked.push(row);
        rows.push(row);
      } else {
        rows.push({ entityLabel: los.dealName, entityKind: 'deal', operation: 'would_update', reason: 'Matching external record found', blockerReason: undefined });
      }
    } else if (input.externalRecords.length > 0) {
      rows.push({ entityLabel: los.dealName, entityKind: 'deal', operation: 'would_create', reason: 'No matching external record', blockerReason: undefined });
    } else {
      rows.push({ entityLabel: los.dealName, entityKind: 'deal', operation: 'unavailable', reason: 'No external records available', blockerReason: undefined });
    }
  }

  return {
    previewOnly: true,
    liveReadUsed: input.externalRecords.length > 0,
    liveWritePerformed: false,
    externalSystemChanged: false,
    crmRecordCreated: false,
    crmRecordUpdated: false,
    crmRecordLinked: false,
    operationRows: rows,
    blockedRows: blocked,
    warnings: [],
    nextReviewStep: blocked.length > 0
      ? 'Resolve policy blockers before proceeding.'
      : 'Review sync preview and confirm operations.',
  };
}
