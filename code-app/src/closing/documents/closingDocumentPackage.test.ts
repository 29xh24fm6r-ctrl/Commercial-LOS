import { describe, it, expect } from 'vitest';
import { latestManifestsByTemplate, summarizeClosingDocumentPackage } from './closingDocumentPackage';
import { evaluateAllTemplates } from './closingDocumentEligibility';
import type { ClosingDocumentFactModel, GeneratedClosingDocumentManifest } from './closingDocumentTypes';

function manifest(over: Partial<GeneratedClosingDocumentManifest> = {}): GeneratedClosingDocumentManifest {
  return {
    manifestId: 'm-1',
    templateKey: 'closing_checklist',
    templateVersion: '1.0.0',
    dealId: 'deal-1',
    generatedAtIso: '2026-07-01T00:00:00.000Z',
    generatedByActorEmail: 'banker@bank.test',
    contentHash: 'abcd1234',
    correlationId: 'corr-1',
    status: 'final',
    ...over,
  };
}

describe('latestManifestsByTemplate', () => {
  it('picks the most recent non-superseded manifest per template', () => {
    const older = manifest({ manifestId: 'm-1', generatedAtIso: '2026-07-01T00:00:00.000Z' });
    const newer = manifest({ manifestId: 'm-2', generatedAtIso: '2026-07-02T00:00:00.000Z', supersedesManifestId: 'm-1' });
    const other = manifest({ manifestId: 'm-3', templateKey: 'internal_funding_checklist' });
    const result = latestManifestsByTemplate([older, newer, other]);
    expect(result.get('closing_checklist')).toEqual(newer);
    expect(result.get('internal_funding_checklist')).toEqual(other);
    expect(result.size).toBe(2);
  });

  it('excludes a manifest that has been superseded, even without a newer timestamp comparison winning it', () => {
    const superseded = manifest({ manifestId: 'm-1' });
    const current = manifest({ manifestId: 'm-2', supersedesManifestId: 'm-1' });
    const result = latestManifestsByTemplate([superseded, current]);
    expect(result.get('closing_checklist')?.manifestId).toBe('m-2');
  });
});

describe('summarizeClosingDocumentPackage', () => {
  const FULL_FACTS: ClosingDocumentFactModel = {
    dealId: 'deal-1',
    dealName: 'Acme Expansion',
    borrowerLegalName: 'Acme Holdings LLC',
    product: 'Term Loan',
    loanAmount: 500_000,
    closingDate: '2026-08-01',
    conditionsPrecedentResolved: true,
    fundingInstructions: 'Wire to operating account',
  };

  it('is "none" when nothing is eligible yet', () => {
    const eligibility = evaluateAllTemplates({});
    const summary = summarizeClosingDocumentPackage('deal-1', eligibility, []);
    expect(summary.completeness).toBe('none');
    expect(summary.documents).toEqual([]);
    expect(summary.missingTemplates).toEqual([]); // nothing eligible => nothing counted as "missing" either
  });

  it('is "complete" when every eligible template has a current manifest', () => {
    const eligibility = evaluateAllTemplates(FULL_FACTS);
    const eligibleKeys = eligibility.filter((e) => e.kind === 'eligible').map((e) => e.template.key);
    const manifests = eligibleKeys.map((key, i) => manifest({ manifestId: `m-${i}`, templateKey: key }));
    const summary = summarizeClosingDocumentPackage('deal-1', eligibility, manifests);
    expect(summary.completeness).toBe('complete');
    expect(summary.missingTemplates).toEqual([]);
    expect(summary.documents).toHaveLength(eligibleKeys.length);
  });

  it('is "partial" when some but not all eligible templates have a manifest', () => {
    const eligibility = evaluateAllTemplates(FULL_FACTS);
    const manifests = [manifest({ manifestId: 'm-1', templateKey: 'closing_checklist' })];
    const summary = summarizeClosingDocumentPackage('deal-1', eligibility, manifests);
    expect(summary.completeness).toBe('partial');
    expect(summary.documents).toHaveLength(1);
    expect(summary.missingTemplates).not.toHaveLength(0);
    expect(summary.missingTemplates).not.toContain('closing_checklist');
  });

  it('never counts manifests from a DIFFERENT deal', () => {
    const eligibility = evaluateAllTemplates(FULL_FACTS);
    const manifests = [manifest({ manifestId: 'm-1', dealId: 'deal-OTHER' })];
    const summary = summarizeClosingDocumentPackage('deal-1', eligibility, manifests);
    expect(summary.documents).toEqual([]);
  });
});
