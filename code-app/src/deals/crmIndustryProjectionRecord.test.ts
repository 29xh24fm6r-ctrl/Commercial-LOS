import { describe, it, expect } from 'vitest';
import {
  buildCrmIndustryProjectionRecord,
  serializeCrmIndustryProjectionRecord,
  parseCrmIndustryProjectionRecord,
  EMPTY_CRM_INDUSTRY_PROJECTION_RECORD,
  type CrmIndustryProjectionRecord,
} from './crmIndustryProjectionRecord';
import type { DealIndustryProjection } from '../crm/dealIndustryProjection';

/**
 * N-22/N-23 remediation (Production Remediation Factory Arc Phase 7) — the durable NAICS/industry
 * projection record, persisted independently of the deal's coarse six-value industry choice.
 */

describe('buildCrmIndustryProjectionRecord', () => {
  it('N-23: builds a full record for a no-mapping projection (the audit\'s 722511 restaurant example) — the exact facts persist even with no coarse mapping', () => {
    const projection: DealIndustryProjection = {
      kind: 'no-mapping',
      organizationId: 'org-9',
      naicsCode: '722511',
      naicsTitle: 'Full-Service Restaurants',
      sectorCode: '72',
      sectorTitle: 'Accommodation and Food Services',
    };
    const record = buildCrmIndustryProjectionRecord(projection, 'none', '2026-07-25T00:00:00Z');
    expect(record).toEqual<CrmIndustryProjectionRecord>({
      organizationId: 'org-9',
      naicsCode: '722511',
      naicsTitle: 'Full-Service Restaurants',
      sectorCode: '72',
      sectorTitle: 'Accommodation and Food Services',
      dealIndustryApplied: '',
      source: 'none',
      lastVerifiedAtIso: '2026-07-25T00:00:00Z',
    });
  });

  it('builds a full record for a derived (mapped) projection, including the applied coarse label', () => {
    const projection: DealIndustryProjection = {
      kind: 'derived',
      organizationId: 'org-1',
      naicsCode: '333111',
      naicsTitle: 'Farm Machinery and Equipment Manufacturing',
      sectorCode: '31-33',
      sectorTitle: 'Manufacturing',
      dealIndustry: 'Manufacturing',
    };
    const record = buildCrmIndustryProjectionRecord(projection, 'crm-derived', '2026-07-25T00:00:00Z');
    expect(record?.dealIndustryApplied).toBe('Manufacturing');
    expect(record?.naicsTitle).toBe('Farm Machinery and Equipment Manufacturing');
    expect(record?.source).toBe('crm-derived');
  });

  it('builds a record for no-sector, with blank sector/title fields (an invalid code has no sector)', () => {
    const projection: DealIndustryProjection = { kind: 'no-sector', organizationId: 'org-2', naicsCode: '999999' };
    const record = buildCrmIndustryProjectionRecord(projection, 'none', '2026-07-25T00:00:00Z');
    expect(record).toMatchObject({ naicsCode: '999999', sectorCode: '', sectorTitle: '', dealIndustryApplied: '' });
  });

  it('a missing naicsTitle (lookup unavailable) degrades to an empty string, never fabricated', () => {
    const projection: DealIndustryProjection = {
      kind: 'no-mapping', organizationId: 'org-9', naicsCode: '722511', sectorCode: '72', sectorTitle: 'Accommodation and Food Services',
    };
    const record = buildCrmIndustryProjectionRecord(projection, 'none', '2026-07-25T00:00:00Z');
    expect(record?.naicsTitle).toBe('');
  });

  it('returns undefined (no fact to persist) for no-naics / no-org-link / no-crm-link / unavailable', () => {
    expect(buildCrmIndustryProjectionRecord({ kind: 'no-naics', organizationId: 'org-1' }, 'none', 'now')).toBeUndefined();
    expect(buildCrmIndustryProjectionRecord({ kind: 'no-org-link' }, 'none', 'now')).toBeUndefined();
    expect(buildCrmIndustryProjectionRecord({ kind: 'no-crm-link' }, 'none', 'now')).toBeUndefined();
    expect(buildCrmIndustryProjectionRecord({ kind: 'unavailable', reason: 'x' }, 'none', 'now')).toBeUndefined();
  });
});

describe('serializeCrmIndustryProjectionRecord / parseCrmIndustryProjectionRecord', () => {
  const filled: CrmIndustryProjectionRecord = {
    organizationId: 'org-9',
    naicsCode: '722511',
    naicsTitle: 'Full-Service Restaurants',
    sectorCode: '72',
    sectorTitle: 'Accommodation and Food Services',
    dealIndustryApplied: '',
    source: 'none',
    lastVerifiedAtIso: '2026-07-25T00:00:00Z',
  };

  it('round-trips a fully populated record exactly', () => {
    expect(parseCrmIndustryProjectionRecord(serializeCrmIndustryProjectionRecord(filled))).toEqual(filled);
  });

  it('round-trips the empty record', () => {
    expect(parseCrmIndustryProjectionRecord(serializeCrmIndustryProjectionRecord(EMPTY_CRM_INDUSTRY_PROJECTION_RECORD))).toEqual(
      EMPTY_CRM_INDUSTRY_PROJECTION_RECORD,
    );
  });

  it('parses undefined / empty-string input as the empty record', () => {
    expect(parseCrmIndustryProjectionRecord(undefined)).toEqual(EMPTY_CRM_INDUSTRY_PROJECTION_RECORD);
    expect(parseCrmIndustryProjectionRecord('')).toEqual(EMPTY_CRM_INDUSTRY_PROJECTION_RECORD);
  });

  it('fails closed on corrupt or wrong-shaped JSON — never throws', () => {
    expect(() => parseCrmIndustryProjectionRecord('{not valid json')).not.toThrow();
    expect(parseCrmIndustryProjectionRecord('{not valid json')).toEqual(EMPTY_CRM_INDUSTRY_PROJECTION_RECORD);
    expect(parseCrmIndustryProjectionRecord('[1,2,3]')).toEqual(EMPTY_CRM_INDUSTRY_PROJECTION_RECORD);
    expect(parseCrmIndustryProjectionRecord('null')).toEqual(EMPTY_CRM_INDUSTRY_PROJECTION_RECORD);
  });

  it('rejects an unrecognized source value rather than fabricating one — falls back to none', () => {
    const json = JSON.stringify({ naicsCode: '722511', source: 'not-a-real-source' });
    expect(parseCrmIndustryProjectionRecord(json).source).toBe('none');
  });
});
