import { describe, it, expect } from 'vitest';
import { deriveLiveExternalSyncPreview } from './liveExternalSyncPreview';
import type { ExternalRecord } from './externalPlatformReadOnlyAdapter';

const makeRecord = (name: string): ExternalRecord => ({
  externalRecordLabel: 'R1', entityKind: 'relationship', sourcePlatformDomain: 'external_crm',
  displayName: name, normalizedName: name.toLowerCase(), ownerLabel: undefined, statusLabel: undefined,
  lastUpdatedLabel: undefined, sourceConfidence: 'unknown', rawRecordUnavailable: true, sensitiveDataIncluded: false,
});

describe('Phase 153 — liveExternalSyncPreview', () => {
  it('matching record produces would_update', () => {
    const r = deriveLiveExternalSyncPreview({ losRecords: [{ dealName: 'D1', clientName: 'Acme' }], externalRecords: [makeRecord('Acme')], policyReady: true });
    expect(r.operationRows[0].operation).toBe('would_update');
    expect(r.liveWritePerformed).toBe(false);
    expect(r.crmRecordUpdated).toBe(false);
  });

  it('no matching record produces would_create preview', () => {
    const r = deriveLiveExternalSyncPreview({ losRecords: [{ dealName: 'D1', clientName: 'Acme' }], externalRecords: [makeRecord('Beta')], policyReady: true });
    expect(r.operationRows[0].operation).toBe('would_create');
    expect(r.crmRecordCreated).toBe(false);
  });

  it('policy not ready blocks', () => {
    const r = deriveLiveExternalSyncPreview({ losRecords: [{ dealName: 'D1', clientName: 'Acme' }], externalRecords: [makeRecord('Acme')], policyReady: false });
    expect(r.blockedRows.length).toBe(1);
    expect(r.blockedRows[0].operation).toBe('blocked_policy');
  });

  it('all write flags false', () => {
    const r = deriveLiveExternalSyncPreview({ losRecords: [], externalRecords: [], policyReady: true });
    expect(r.previewOnly).toBe(true);
    expect(r.liveWritePerformed).toBe(false);
    expect(r.externalSystemChanged).toBe(false);
    expect(r.crmRecordCreated).toBe(false);
    expect(r.crmRecordUpdated).toBe(false);
    expect(r.crmRecordLinked).toBe(false);
  });
});
