import { describe, it, expect } from 'vitest';
import { CRM_PARTY_TYPES, CRM_PARTY_TYPE_OPTIONS, isValidPartyType } from './crmPartyTypes';

describe('CRM party types', () => {
  it('includes the advisor classification and core party types', () => {
    expect(CRM_PARTY_TYPES).toContain('Professional/Advisor');
    expect(CRM_PARTY_TYPES).toContain('Borrower');
    expect(CRM_PARTY_TYPES).toContain('Referral Source');
  });

  it('validates on-list values and rejects off-list / empty', () => {
    expect(isValidPartyType('Borrower')).toBe(true);
    expect(isValidPartyType('Professional/Advisor')).toBe(true);
    expect(isValidPartyType('CRE')).toBe(false);
    expect(isValidPartyType('borrower')).toBe(false); // exact-match only
    expect(isValidPartyType('')).toBe(false);
  });

  it('exposes {value,label} options for a Select', () => {
    expect(CRM_PARTY_TYPE_OPTIONS).toHaveLength(CRM_PARTY_TYPES.length);
    expect(CRM_PARTY_TYPE_OPTIONS[0]).toEqual({ value: 'Borrower', label: 'Borrower' });
  });
});
