import { describe, it, expect } from 'vitest';
import { executeExternalReadOnlyPull, type ReadOnlyAdapterInput, type ReadOnlyAdapterResult } from './externalPlatformReadOnlyAdapter';

const BASE_INPUT: ReadOnlyAdapterInput = {
  platformDomain: 'external_crm', mode: 'read_only_pilot',
  requestedEntityKinds: ['relationship'], lookupKeyLabel: 'Acme',
  requestedByDisplayName: 'Banker', requestedAt: '2026-06-12T00:00:00Z',
};

describe('Phase 151 — externalPlatformReadOnlyAdapter', () => {
  it('disabled mode performs no read', () => {
    const r = executeExternalReadOnlyPull({ ...BASE_INPUT, mode: 'disabled_by_default' });
    expect(r.status).toBe('disabled');
    expect(r.liveReadAttempted).toBe(false);
    expect(r.liveReadPerformed).toBe(false);
    expect(r.liveWritePerformed).toBe(false);
    expect(r.records).toEqual([]);
  });

  it('missing transport returns unavailable', () => {
    const r = executeExternalReadOnlyPull(BASE_INPUT);
    expect(r.status).toBe('unavailable');
    expect(r.liveReadAttempted).toBe(false);
    expect(r.records).toEqual([]);
  });

  it('injected transport can return records', () => {
    const transport = (): ReadOnlyAdapterResult => ({
      status: 'read_only_result_available',
      liveReadAttempted: true, liveReadPerformed: true,
      liveWritePerformed: false, externalSystemChanged: false, credentialsExposed: false,
      records: [{ externalRecordLabel: 'Acme-CRM', entityKind: 'relationship', sourcePlatformDomain: 'external_crm', displayName: 'Acme Corp', normalizedName: 'acme corp', ownerLabel: 'RM1', statusLabel: 'Active', lastUpdatedLabel: '2026-01-01', sourceConfidence: 'high', rawRecordUnavailable: true, sensitiveDataIncluded: false }],
      warnings: [], blockers: [], auditSummary: 'Read completed.',
    });
    const r = executeExternalReadOnlyPull(BASE_INPUT, transport);
    expect(r.status).toBe('read_only_result_available');
    expect(r.records.length).toBe(1);
    expect(r.liveWritePerformed).toBe(false);
  });

  it('no write in any outcome', () => {
    const disabled = executeExternalReadOnlyPull({ ...BASE_INPUT, mode: 'disabled_by_default' });
    const unavailable = executeExternalReadOnlyPull(BASE_INPUT);
    expect(disabled.liveWritePerformed).toBe(false);
    expect(unavailable.liveWritePerformed).toBe(false);
  });
});
