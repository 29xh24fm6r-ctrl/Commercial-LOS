import { describe, it, expect } from 'vitest';
import { evaluateAdverseActionReadiness, type AdverseActionRecord } from './adverseActionRecordTypes';

function record(overrides: Partial<AdverseActionRecord> = {}): AdverseActionRecord {
  return {
    recordId: 'aa-1',
    dealId: 'deal-1',
    status: 'SENT',
    notes: 'Adverse action notice mailed to applicant on file.',
    recordedByActorEmail: 'creditofficer@bank.test',
    recordedAtIso: '2026-07-26T10:00:00.000Z',
    correlationId: 'aa-corr-1',
    supersedesRecordId: undefined,
    ...overrides,
  };
}

describe('evaluateAdverseActionReadiness', () => {
  it('fails closed (not met) when there are no records at all', () => {
    const r = evaluateAdverseActionReadiness(undefined, 'deal-1');
    expect(r.adverseActionDocumented.met).toBe(false);
    expect(r.currentRecord).toBeUndefined();
  });

  it('fails closed when the only record is for a DIFFERENT deal', () => {
    const r = evaluateAdverseActionReadiness([record({ dealId: 'other-deal' })], 'deal-1');
    expect(r.adverseActionDocumented.met).toBe(false);
  });

  it('is met when SENT', () => {
    const r = evaluateAdverseActionReadiness([record()], 'deal-1');
    expect(r.adverseActionDocumented.met).toBe(true);
    expect(r.currentRecord?.recordId).toBe('aa-1');
  });

  it('is met when WAIVED', () => {
    const r = evaluateAdverseActionReadiness([record({ status: 'WAIVED', notes: 'Waived per compliance review.' })], 'deal-1');
    expect(r.adverseActionDocumented.met).toBe(true);
  });

  it('resolves the head of the chain via supersedesRecordId, not timestamp, when a correction supersedes a prior record', () => {
    const original = record({ recordId: 'aa-1', notes: 'Initial entry, later found incomplete.' });
    const corrected = record({
      recordId: 'aa-2',
      notes: 'Corrected entry with full mailing detail.',
      supersedesRecordId: 'aa-1',
      recordedAtIso: original.recordedAtIso,
    });
    const r = evaluateAdverseActionReadiness([original, corrected], 'deal-1');
    expect(r.adverseActionDocumented.met).toBe(true);
    expect(r.currentRecord?.recordId).toBe('aa-2');
  });

  it('never fabricates a met result from a record belonging to a different deal mixed into the same list', () => {
    const wrongDeal = record({ dealId: 'deal-2' });
    const r = evaluateAdverseActionReadiness([wrongDeal], 'deal-1');
    expect(r.adverseActionDocumented.met).toBe(false);
  });

  it('Workstream V — tie-breaks by most-recent timestamp when two records are BOTH unsuperseded (genuinely ambiguous multiple heads)', () => {
    const older = record({ recordId: 'aa-1', recordedAtIso: '2026-07-20T00:00:00.000Z' });
    const newer = record({ recordId: 'aa-2', recordedAtIso: '2026-07-24T00:00:00.000Z' });
    const r = evaluateAdverseActionReadiness([older, newer], 'deal-1');
    expect(r.currentRecord?.recordId).toBe('aa-2');
  });

  it('Workstream V — a supersedes CYCLE zeroes out the head entirely and fails closed, never fabricating a survivor', () => {
    const a = record({ recordId: 'aa-1', supersedesRecordId: 'aa-2' });
    const b = record({ recordId: 'aa-2', supersedesRecordId: 'aa-1' });
    const r = evaluateAdverseActionReadiness([a, b], 'deal-1');
    expect(r.currentRecord).toBeUndefined();
    expect(r.adverseActionDocumented.met).toBe(false);
  });

  it('Workstream V — a dangling supersedesRecordId (pointing at a record not in the list) does not suppress the record itself', () => {
    const r = evaluateAdverseActionReadiness(
      [record({ recordId: 'aa-1', supersedesRecordId: 'aa-ghost' })],
      'deal-1',
    );
    expect(r.currentRecord?.recordId).toBe('aa-1');
    expect(r.adverseActionDocumented.met).toBe(true);
  });
});
