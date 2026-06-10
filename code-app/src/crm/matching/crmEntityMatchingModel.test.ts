import { describe, it, expect } from 'vitest';
import { deriveCrmEntityMatch, type CrmEntityMatchInput } from './crmEntityMatchingModel';

const LOS = { dealId: 'D1', dealName: 'Acme Term Loan', clientName: 'Acme Holdings LLC', borrowerLabel: 'Acme Holdings', bankerName: 'Banker B', productType: 'commercial', amount: 250000 };

describe('Phase 143C — CRM entity matching model', () => {
  it('returns no_candidates when no CRM candidate is provided', () => {
    const r = deriveCrmEntityMatch({ los: LOS });
    expect(r.matchStatus).toBe('no_candidates');
    expect(r.confidenceBand).toBe('low');
  });

  it('returns strong_match (high) for an exact name match with no conflict', () => {
    const r = deriveCrmEntityMatch({ los: LOS, salesforce: { accountName: 'Acme Holdings LLC', ownerName: 'AE' } });
    expect(r.matchStatus).toBe('strong_match');
    expect(r.confidenceBand).toBe('high');
    expect(r.matchedProviderLabels).toContain('salesforce');
  });

  it('returns possible_match (medium) for a partial name overlap', () => {
    const r = deriveCrmEntityMatch({ los: LOS, ncino: { borrowerName: 'Acme Holdings' } });
    expect(r.matchStatus).toBe('possible_match');
    expect(r.confidenceBand).toBe('medium');
  });

  it('returns conflict when a candidate name does not match the LOS entity', () => {
    const r = deriveCrmEntityMatch({ los: LOS, salesforce: { accountName: 'Totally Different Co' } });
    expect(r.matchStatus).toBe('conflict');
    expect(r.conflicts.length).toBeGreaterThan(0);
  });

  it('never auto-links and stays read-only with no external change', () => {
    const r = deriveCrmEntityMatch({ los: LOS, salesforce: { accountName: 'Acme Holdings LLC' } });
    expect(r.readOnly).toBe(true);
    expect(r.crmRecordLinked).toBe(false);
    expect(r.externalSystemChanged).toBe(false);
    expect(r.recommendedReviewStep.toLowerCase()).toMatch(/human review|no record is auto-linked/);
  });

  it('rejects sensitive identifiers in any candidate', () => {
    const r = deriveCrmEntityMatch({ los: { ...LOS, ssn: '000-00-0000' } as unknown as CrmEntityMatchInput['los'] });
    expect(r.matchStatus).toBe('unknown');
    expect(r.warnings.join(' ').toLowerCase()).toMatch(/sensitive identifiers/);
  });
});
