import { describe, it, expect } from 'vitest';
import { detectCrmOrganizationDuplicates } from './crmDuplicateDetection';

describe('detectCrmOrganizationDuplicates', () => {
  it('returns not_checked when detection is disabled', () => {
    const outcome = detectCrmOrganizationDuplicates({
      candidateName: 'Acme LLC',
      existing: [{ organizationId: 'org-1', name: 'Acme LLC' }],
      detectionEnabledOverride: false,
    });
    expect(outcome.kind).toBe('not_checked');
  });

  it('returns no_duplicate_found when nothing matches', () => {
    const outcome = detectCrmOrganizationDuplicates({
      candidateName: 'Brand New Co',
      existing: [{ organizationId: 'org-1', name: 'Acme LLC' }],
    });
    expect(outcome.kind).toBe('no_duplicate_found');
  });

  it('flags an exact duplicate by normalized name (legal-suffix/case/punctuation variants)', () => {
    const outcome = detectCrmOrganizationDuplicates({
      candidateName: 'ACME, L.L.C.',
      existing: [{ organizationId: 'org-1', name: 'Acme LLC' }],
    });
    expect(outcome.kind).toBe('exact_duplicate_found');
    expect(outcome.kind === 'exact_duplicate_found' && outcome.candidates).toEqual(['org-1']);
  });

  it('flags an exact duplicate by normalized legal name even when the display name differs', () => {
    const outcome = detectCrmOrganizationDuplicates({
      candidateName: 'Acme Foods',
      candidateLegalName: 'Acme Corporation',
      existing: [{ organizationId: 'org-1', name: 'Acme LLC', legalName: 'Acme Corp' }],
    });
    expect(outcome.kind).toBe('exact_duplicate_found');
  });

  it('flags a possible duplicate when only the website domain matches', () => {
    const outcome = detectCrmOrganizationDuplicates({
      candidateName: 'Totally Different Name Inc',
      candidateWebsite: 'https://www.acme.com/',
      existing: [{ organizationId: 'org-1', name: 'Acme LLC', website: 'http://acme.com' }],
    });
    expect(outcome.kind).toBe('possible_duplicate_found');
    expect(outcome.kind === 'possible_duplicate_found' && outcome.candidates).toEqual(['org-1']);
  });

  it('never blocks -- callers only get a warning-shaped outcome, no blocking flag', () => {
    const outcome = detectCrmOrganizationDuplicates({
      candidateName: 'Acme LLC',
      existing: [{ organizationId: 'org-1', name: 'Acme LLC' }],
    });
    expect(outcome.kind).toBe('exact_duplicate_found');
    expect('blocked' in outcome).toBe(false);
  });
});
