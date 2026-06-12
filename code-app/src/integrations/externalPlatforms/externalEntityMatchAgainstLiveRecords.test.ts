import { describe, it, expect } from 'vitest';
import { matchEntitiesAgainstLiveRecords } from './externalEntityMatchAgainstLiveRecords';
import type { ExternalRecord } from './externalPlatformReadOnlyAdapter';

const makeRecord = (displayName: string): ExternalRecord => ({
  externalRecordLabel: 'R1', entityKind: 'relationship', sourcePlatformDomain: 'external_crm',
  displayName, normalizedName: displayName.toLowerCase(), ownerLabel: 'RM1', statusLabel: 'Active',
  lastUpdatedLabel: '2026-01-01', sourceConfidence: 'unknown', rawRecordUnavailable: true, sensitiveDataIncluded: false,
});

describe('Phase 152 — externalEntityMatchAgainstLiveRecords', () => {
  it('no records returns no_external_records', () => {
    const r = matchEntitiesAgainstLiveRecords({ losEntity: { dealName: 'D1', clientName: 'Acme', borrowerLabel: undefined, bankerName: undefined }, externalRecords: [] });
    expect(r.matchStatus).toBe('no_external_records');
    expect(r.autoLinked).toBe(false);
    expect(r.liveWritePerformed).toBe(false);
  });

  it('exact name produces strong_candidate', () => {
    const r = matchEntitiesAgainstLiveRecords({ losEntity: { dealName: 'D1', clientName: 'Acme Corp', borrowerLabel: undefined, bankerName: undefined }, externalRecords: [makeRecord('Acme Corp')] });
    expect(r.matchStatus).toBe('strong_candidate');
    expect(r.confidenceBand).toBe('high');
    expect(r.autoLinked).toBe(false);
  });

  it('name mismatch produces conflict', () => {
    const r = matchEntitiesAgainstLiveRecords({ losEntity: { dealName: 'D1', clientName: 'Acme Corp', borrowerLabel: undefined, bankerName: undefined }, externalRecords: [makeRecord('Beta LLC')] });
    expect(r.matchStatus).toBe('conflict');
    expect(r.conflicts.length).toBeGreaterThan(0);
  });

  it('no auto-linking, no writes', () => {
    const r = matchEntitiesAgainstLiveRecords({ losEntity: { dealName: 'D1', clientName: 'Acme', borrowerLabel: undefined, bankerName: undefined }, externalRecords: [makeRecord('Acme')] });
    expect(r.autoLinked).toBe(false);
    expect(r.liveWritePerformed).toBe(false);
    expect(r.externalSystemChanged).toBe(false);
  });
});
