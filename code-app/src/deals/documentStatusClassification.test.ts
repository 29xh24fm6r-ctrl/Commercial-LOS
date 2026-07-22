import { describe, expect, it } from 'vitest';
import { classifyLegacyDocumentStatus, isGovernedExcusedDocument } from './documentStatusClassification';

describe('classifyLegacyDocumentStatus', () => {
  it('is outstanding with no reviewer, no receivedDate, not uploaded', () => {
    expect(classifyLegacyDocumentStatus({ reviewer: undefined, receivedDate: undefined, uploaded: false })).toBe(
      'outstanding',
    );
  });

  it('is received when receivedDate is set but no reviewer', () => {
    expect(
      classifyLegacyDocumentStatus({ reviewer: undefined, receivedDate: '2026-01-01', uploaded: false }),
    ).toBe('received');
  });

  it('is received when uploaded is true even without a receivedDate', () => {
    expect(classifyLegacyDocumentStatus({ reviewer: undefined, receivedDate: undefined, uploaded: true })).toBe(
      'received',
    );
  });

  it('is reviewed when a non-blank reviewer is present, regardless of receivedDate/uploaded', () => {
    expect(
      classifyLegacyDocumentStatus({ reviewer: 'Jane Banker', receivedDate: undefined, uploaded: false }),
    ).toBe('reviewed');
  });

  it('treats a blank/whitespace-only reviewer as absent', () => {
    expect(classifyLegacyDocumentStatus({ reviewer: '   ', receivedDate: '2026-01-01', uploaded: false })).toBe(
      'received',
    );
  });
});

describe('isGovernedExcusedDocument', () => {
  it('is false when nothing is set', () => {
    expect(isGovernedExcusedDocument({})).toBe(false);
  });

  it('is true when the waived boolean is set', () => {
    expect(isGovernedExcusedDocument({ waived: true })).toBe(true);
  });

  it('is true when requirementStatus is "waived"', () => {
    expect(isGovernedExcusedDocument({ requirementStatus: 'waived' })).toBe(true);
  });

  it('is true when requirementStatus is "not_applicable"', () => {
    expect(isGovernedExcusedDocument({ requirementStatus: 'not_applicable' })).toBe(true);
  });

  it('is false for every other requirement status', () => {
    expect(isGovernedExcusedDocument({ requirementStatus: 'outstanding' })).toBe(false);
    expect(isGovernedExcusedDocument({ requirementStatus: 'requested' })).toBe(false);
    expect(isGovernedExcusedDocument({ requirementStatus: 'under_review' })).toBe(false);
    expect(isGovernedExcusedDocument({ requirementStatus: 'reviewed' })).toBe(false);
    expect(isGovernedExcusedDocument({ requirementStatus: 'not_assessed' })).toBe(false);
  });
});
