import { describe, it, expect } from 'vitest';
import { reconcileDocumentRequirements, type LiveDocumentChecklistRow } from './documentRequirementReconciliation';
import type { RequiredDocumentDefinition } from './documentRequirementDerivation';

function def(overrides: Partial<RequiredDocumentDefinition> = {}): RequiredDocumentDefinition {
  return {
    key: 'loan-application',
    documentName: 'Loan Application',
    reason: 'Required on every deal.',
    reviewLevel: 'received',
    ...overrides,
  };
}

function liveRow(overrides: Partial<LiveDocumentChecklistRow> = {}): LiveDocumentChecklistRow {
  return {
    id: 'row-1',
    documentName: 'Loan Application',
    requirementStatus: undefined,
    required: undefined,
    acknowledged: undefined,
    acknowledgedBy: undefined,
    acknowledgedDate: undefined,
    requestedDate: undefined,
    receivedDate: undefined,
    reviewedDate: undefined,
    reviewer: undefined,
    waived: undefined,
    waiverReason: undefined,
    dueDate: undefined,
    ...overrides,
  };
}

describe('reconcileDocumentRequirements', () => {
  it('a derived requirement with no matching live row is a virtual not_assessed row', () => {
    const [row] = reconcileDocumentRequirements([def()], []);
    expect(row).toEqual(
      expect.objectContaining({ id: undefined, status: 'not_assessed', required: true, acknowledged: false }),
    );
  });

  it('a derived requirement matched to a live row (persisted requirementStatus) uses the live row verbatim', () => {
    const [row] = reconcileDocumentRequirements(
      [def()],
      [liveRow({ requirementStatus: 'outstanding', required: true, acknowledged: true, acknowledgedBy: 'Banker' })],
    );
    expect(row).toEqual(
      expect.objectContaining({ id: 'row-1', status: 'outstanding', acknowledged: true, acknowledgedBy: 'Banker' }),
    );
  });

  it('name matching is case/whitespace/punctuation insensitive (legacy normalization)', () => {
    const [row] = reconcileDocumentRequirements(
      [def({ documentName: 'Business Financial Statements' })],
      [liveRow({ documentName: '  business_financial-statements ', requirementStatus: 'reviewed' })],
    );
    expect(row.status).toBe('reviewed');
    expect(row.id).toBe('row-1');
  });

  it('a legacy row with no persisted requirementStatus infers reviewed from the reviewer field', () => {
    const [row] = reconcileDocumentRequirements([def()], [liveRow({ reviewer: 'Jane Banker' })]);
    expect(row.status).toBe('reviewed');
  });

  it('a legacy row with a receivedDate but no reviewer infers under_review (incomplete)', () => {
    const [row] = reconcileDocumentRequirements([def()], [liveRow({ receivedDate: '2026-01-01' })]);
    expect(row.status).toBe('under_review');
  });

  it('a legacy row with only a requestedDate infers requested', () => {
    const [row] = reconcileDocumentRequirements([def()], [liveRow({ requestedDate: '2026-01-01' })]);
    expect(row.status).toBe('requested');
  });

  it('a bare legacy row (no dates, no reviewer) infers outstanding, not not_assessed — the row already exists', () => {
    const [row] = reconcileDocumentRequirements([def()], [liveRow()]);
    expect(row.status).toBe('outstanding');
  });

  it('a live row that matches no currently-derived requirement is still surfaced, never dropped', () => {
    const rows = reconcileDocumentRequirements([], [liveRow({ documentName: 'Extra Manually-Added Document' })]);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.documentName).toBe('Extra Manually-Added Document');
  });

  it('every derived requirement produces exactly one row, matched rows are not duplicated in the unmatched pass', () => {
    const rows = reconcileDocumentRequirements(
      [def({ documentName: 'A' }), def({ documentName: 'B' })],
      [liveRow({ id: 'a', documentName: 'A', requirementStatus: 'reviewed' })],
    );
    expect(rows).toHaveLength(2);
    expect(rows.filter((r) => r.documentName === 'A')).toHaveLength(1);
  });
});
