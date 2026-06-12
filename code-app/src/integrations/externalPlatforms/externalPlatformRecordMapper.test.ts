import { describe, it, expect } from 'vitest';
import { mapExternalRecord, rejectSensitiveKeys } from './externalPlatformRecordMapper';

describe('Phase 151 — externalPlatformRecordMapper', () => {
  it('maps record with normalized name', () => {
    const r = mapExternalRecord({ label: 'R1', entityKind: 'relationship', platformDomain: 'external_crm', displayName: '  Acme Corp  ' });
    expect(r.normalizedName).toBe('acme corp');
    expect(r.sensitiveDataIncluded).toBe(false);
    expect(r.rawRecordUnavailable).toBe(true);
  });

  it('rejects sensitive keys', () => {
    const rejected = rejectSensitiveKeys(['name', 'ssn', 'tax_id', 'email', 'account_number']);
    expect(rejected).toEqual(['ssn', 'tax_id', 'account_number']);
  });
});
