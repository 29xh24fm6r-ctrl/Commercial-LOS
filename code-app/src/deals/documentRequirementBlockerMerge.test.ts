import { describe, it, expect } from 'vitest';
import { mergeDocumentRequirementBlockers } from './documentRequirementBlockerMerge';
import type { DealBlockerModel } from './dealBlockerModel';
import type { DocumentRequirementRow } from './documentRequirementLifecycle';
import type { RequiredDocumentDefinition } from './documentRequirementDerivation';

function baseModel(overrides: Partial<DealBlockerModel> = {}): DealBlockerModel {
  return {
    stageCode: 'UNDERWRITING',
    hardBlockers: [],
    recommended: [],
    pendingUpstream: [],
    missingRequiredDocuments: [],
    missingRequiredFields: [],
    hardBlockerCount: 0,
    canAdvance: true,
    ...overrides,
  };
}

function row(overrides: Partial<DocumentRequirementRow> = {}): DocumentRequirementRow {
  return {
    id: 'row-1',
    documentName: 'Personal Financial Statement',
    status: 'outstanding',
    required: true,
    acknowledged: true,
    acknowledgedBy: 'Jane Banker',
    acknowledgedDate: '2026-07-01T00:00:00Z',
    requestedDate: undefined,
    receivedDate: undefined,
    reviewedDate: undefined,
    reviewer: undefined,
    waived: false,
    waiverReason: undefined,
    dueDate: undefined,
    ...overrides,
  };
}

function def(overrides: Partial<RequiredDocumentDefinition> = {}): RequiredDocumentDefinition {
  return {
    key: 'personal-financial-statement',
    documentName: 'Personal Financial Statement',
    reason: 'Guarantor structure indicates a personal guarantor.',
    reviewLevel: 'reviewed',
    ...overrides,
  };
}

describe('mergeDocumentRequirementBlockers', () => {
  it('acknowledgment does not satisfy the blocker: an outstanding required row is unioned in as a hard blocker', () => {
    const merged = mergeDocumentRequirementBlockers(baseModel(), [row({ status: 'outstanding' })], [def()]);
    expect(merged.canAdvance).toBe(false);
    expect(merged.hardBlockerCount).toBe(1);
    expect(merged.missingRequiredDocuments).toContain('Personal Financial Statement');
    expect(merged.hardBlockers[0]).toEqual(
      expect.objectContaining({ category: 'document', label: 'Personal Financial Statement', severity: 'hard' }),
    );
  });

  it('reviewed clears the blocker: a reviewed row is not unioned in', () => {
    const merged = mergeDocumentRequirementBlockers(baseModel(), [row({ status: 'reviewed', reviewedDate: '2026-07-02T00:00:00Z' })], [def()]);
    expect(merged).toEqual(baseModel());
    expect(merged.canAdvance).toBe(true);
  });

  it('under_review (received) is still a blocker when reviewLevel is "reviewed"', () => {
    const merged = mergeDocumentRequirementBlockers(baseModel(), [row({ status: 'under_review', receivedDate: '2026-07-02T00:00:00Z' })], [def({ reviewLevel: 'reviewed' })]);
    expect(merged.canAdvance).toBe(false);
  });

  it('under_review satisfies a reviewLevel:"received" document — receive alone clears the blocker', () => {
    const merged = mergeDocumentRequirementBlockers(
      baseModel(),
      [row({ status: 'under_review', receivedDate: '2026-07-02T00:00:00Z' })],
      [def({ reviewLevel: 'received' })],
    );
    expect(merged.canAdvance).toBe(true);
  });

  it('a waived row is not a blocker', () => {
    const merged = mergeDocumentRequirementBlockers(baseModel(), [row({ status: 'waived', waived: true, waiverReason: 'Immaterial' })], [def()]);
    expect(merged.canAdvance).toBe(true);
  });

  it('a not_applicable row is not a blocker', () => {
    const merged = mergeDocumentRequirementBlockers(baseModel(), [row({ status: 'not_applicable', required: false })], [def()]);
    expect(merged.canAdvance).toBe(true);
  });

  it('a document already counted by the core engine (same normalized name) is never double-counted', () => {
    const base = baseModel({
      hardBlockers: [
        { id: 'x', severity: 'hard', category: 'document', label: 'Business Financial Statements', detail: 'd', resolverSurface: 'Documents', remediation: { kind: 'add-document', documentName: 'Business Financial Statements' } },
      ],
      missingRequiredDocuments: ['Business Financial Statements'],
      hardBlockerCount: 1,
      canAdvance: false,
    });
    const merged = mergeDocumentRequirementBlockers(
      base,
      [row({ documentName: '  business_financial-statements ', status: 'outstanding' })],
      [def({ documentName: 'Business Financial Statements' })],
    );
    expect(merged.hardBlockerCount).toBe(1);
    expect(merged.missingRequiredDocuments).toEqual(['Business Financial Statements']);
  });

  it('a non-required row never becomes a blocker', () => {
    const merged = mergeDocumentRequirementBlockers(baseModel(), [row({ required: false, status: 'not_assessed' })], [def()]);
    expect(merged.canAdvance).toBe(true);
  });

  it('preserves existing hard blockers from the core engine untouched', () => {
    const base = baseModel({
      hardBlockers: [{ id: 'existing', severity: 'hard', category: 'field', label: 'Deal amount', detail: 'd', resolverSurface: 'Deal Profile', remediation: { kind: 'edit-profile', field: 'amount' } }],
      hardBlockerCount: 1,
      canAdvance: false,
    });
    const merged = mergeDocumentRequirementBlockers(base, [row({ status: 'outstanding' })], [def()]);
    expect(merged.hardBlockers).toHaveLength(2);
    expect(merged.hardBlockers[0]).toEqual(base.hardBlockers[0]);
  });
});
