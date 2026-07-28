import { describe, it, expect } from 'vitest';
import { detectCrmOrganizationDuplicates, findDuplicateOrganizationClusters } from './crmDuplicateDetection';

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

  it('flags an exact duplicate when dashes are replaced with spaces', () => {
    const outcome = detectCrmOrganizationDuplicates({
      candidateName: 'Old Glory Bank',
      existing: [{ organizationId: 'org-1', name: 'Old-Glory Bank' }],
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

describe('findDuplicateOrganizationClusters (N-33)', () => {
  it('returns no clusters when detection is disabled', () => {
    const clusters = findDuplicateOrganizationClusters(
      [
        { organizationId: 'org-1', name: 'OmniCare 365' },
        { organizationId: 'org-2', name: 'OmniCare 365' },
      ],
      { detectionEnabledOverride: false },
    );
    expect(clusters).toEqual([]);
  });

  it('the exact reported production scenario: "OmniCare 365" x2 + "Omnicare 365" x1 group into one cluster', () => {
    const clusters = findDuplicateOrganizationClusters(
      [
        { organizationId: 'org-omnicare-1', name: 'OmniCare 365' },
        { organizationId: 'org-omnicare-2', name: 'OmniCare 365' },
        { organizationId: 'org-omnicare-3', name: 'Omnicare 365' },
        { organizationId: 'org-other', name: 'Totally Unrelated Co' },
      ],
      { detectionEnabledOverride: true },
    );
    expect(clusters).toHaveLength(1);
    expect(clusters[0]!.matchType).toBe('name');
    expect(new Set(clusters[0]!.organizationIds)).toEqual(
      new Set(['org-omnicare-1', 'org-omnicare-2', 'org-omnicare-3']),
    );
  });

  it('groups by legal name when names differ but legal names match', () => {
    const clusters = findDuplicateOrganizationClusters(
      [
        { organizationId: 'org-1', name: 'Acme Retail', legalName: 'Acme Holdings LLC' },
        { organizationId: 'org-2', name: 'Acme Storefront', legalName: 'Acme Holdings, L.L.C.' },
      ],
      { detectionEnabledOverride: true },
    );
    expect(clusters).toHaveLength(1);
    expect(clusters[0]!.matchType).toBe('legalName');
  });

  it('groups by matching website domain when name/legal name do not match', () => {
    const clusters = findDuplicateOrganizationClusters(
      [
        { organizationId: 'org-1', name: 'Acme East', website: 'https://www.acme.com/' },
        { organizationId: 'org-2', name: 'Acme West Division', website: 'http://acme.com' },
      ],
      { detectionEnabledOverride: true },
    );
    expect(clusters).toHaveLength(1);
    expect(clusters[0]!.matchType).toBe('website');
  });

  it('never reports a group of fewer than 2 — a single unique organization is never a "duplicate"', () => {
    const clusters = findDuplicateOrganizationClusters(
      [{ organizationId: 'org-1', name: 'Unique Co' }],
      { detectionEnabledOverride: true },
    );
    expect(clusters).toEqual([]);
  });

  it('does not double-report the same organization under a weaker match after a stronger one already claimed it', () => {
    const clusters = findDuplicateOrganizationClusters(
      [
        { organizationId: 'org-1', name: 'Acme LLC', website: 'https://acme.com' },
        { organizationId: 'org-2', name: 'Acme LLC', website: 'https://acme-west.com' },
        { organizationId: 'org-3', name: 'Different Name Co', website: 'https://acme-west.com' },
      ],
      { detectionEnabledOverride: true },
    );
    // org-1/org-2 cluster by name; org-2 is already claimed so the website match with org-3 does
    // not re-report org-2 in a second cluster.
    const allReportedIds = clusters.flatMap((c) => c.organizationIds);
    expect(allReportedIds.filter((id) => id === 'org-2')).toHaveLength(1);
  });

  it('never deletes, merges, or mutates -- returns read-only clusters of ids only', () => {
    const clusters = findDuplicateOrganizationClusters(
      [
        { organizationId: 'org-1', name: 'Dup Co' },
        { organizationId: 'org-2', name: 'Dup Co' },
      ],
      { detectionEnabledOverride: true },
    );
    expect(clusters[0]).not.toHaveProperty('merged');
    expect(clusters[0]).not.toHaveProperty('deleted');
    expect(Array.isArray(clusters[0]!.organizationIds)).toBe(true);
  });
});
