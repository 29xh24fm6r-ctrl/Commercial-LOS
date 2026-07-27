import { describe, it, expect } from 'vitest';
import { evaluateConditionVerificationReadiness, type ConditionVerificationRecord } from './conditionVerificationTypes';

function record(overrides: Partial<ConditionVerificationRecord> = {}): ConditionVerificationRecord {
  return {
    recordId: 'cv-1',
    dealId: 'deal-1',
    conditionType: 'CONDITIONS_PRECEDENT',
    status: 'CLEARED',
    notes: 'Executed loan agreement and UCC-1 filed.',
    verifiedByActorEmail: 'closer@bank.test',
    verifiedAtIso: '2026-07-24T10:00:00.000Z',
    correlationId: 'cv-corr-1',
    supersedesRecordId: undefined,
    ...overrides,
  };
}

describe('evaluateConditionVerificationReadiness', () => {
  it('fails closed (not met) across all three types when there are no records at all', () => {
    const r = evaluateConditionVerificationReadiness(undefined, 'deal-1');
    expect(r.conditionsPrecedent.met).toBe(false);
    expect(r.collateralVerified.met).toBe(false);
    expect(r.insuranceVerified.met).toBe(false);
  });

  it('fails closed when the only record is for a DIFFERENT deal', () => {
    const r = evaluateConditionVerificationReadiness([record({ dealId: 'other-deal' })], 'deal-1');
    expect(r.conditionsPrecedent.met).toBe(false);
  });

  it('is met when CLEARED, and only affects its own condition type', () => {
    const r = evaluateConditionVerificationReadiness([record()], 'deal-1');
    expect(r.conditionsPrecedent.met).toBe(true);
    expect(r.collateralVerified.met).toBe(false);
    expect(r.insuranceVerified.met).toBe(false);
  });

  it('is met when WAIVED', () => {
    const r = evaluateConditionVerificationReadiness(
      [record({ conditionType: 'COLLATERAL', status: 'WAIVED', notes: 'Waived per credit committee.' })],
      'deal-1',
    );
    expect(r.collateralVerified.met).toBe(true);
  });

  it('is NOT met when FAILED', () => {
    const r = evaluateConditionVerificationReadiness(
      [record({ conditionType: 'INSURANCE', status: 'FAILED', notes: 'Coverage insufficient.' })],
      'deal-1',
    );
    expect(r.insuranceVerified.met).toBe(false);
  });

  it('resolves the head of the chain via supersedesRecordId, not timestamp, when a re-verification supersedes a FAILED record', () => {
    const failed = record({ recordId: 'cv-1', conditionType: 'INSURANCE', status: 'FAILED', notes: 'Coverage insufficient.' });
    const cleared = record({
      recordId: 'cv-2',
      conditionType: 'INSURANCE',
      status: 'CLEARED',
      notes: 'New certificate of insurance on file.',
      supersedesRecordId: 'cv-1',
      // Deliberately identical timestamp to the record it supersedes -- proves resolution is via
      // the chain link, not timestamp comparison.
      verifiedAtIso: failed.verifiedAtIso,
    });
    const r = evaluateConditionVerificationReadiness([failed, cleared], 'deal-1');
    expect(r.insuranceVerified.met).toBe(true);
    expect(r.currentRecords.INSURANCE?.recordId).toBe('cv-2');
  });

  it('never fabricates a met result from a record belonging to a different deal mixed into the same list', () => {
    const wrongDeal = record({ dealId: 'deal-2' });
    const rightDeal = record({ dealId: 'deal-1', status: 'FAILED' });
    const r = evaluateConditionVerificationReadiness([wrongDeal, rightDeal], 'deal-1');
    expect(r.conditionsPrecedent.met).toBe(false);
  });

  it('Workstream V — tie-breaks by most-recent timestamp when two records are BOTH unsuperseded (genuinely ambiguous multiple heads)', () => {
    const older = record({ recordId: 'cv-1', status: 'FAILED', verifiedAtIso: '2026-07-20T00:00:00.000Z' });
    const newer = record({ recordId: 'cv-2', status: 'CLEARED', verifiedAtIso: '2026-07-24T00:00:00.000Z' });
    const r = evaluateConditionVerificationReadiness([older, newer], 'deal-1');
    expect(r.currentRecords.CONDITIONS_PRECEDENT?.recordId).toBe('cv-2');
    expect(r.conditionsPrecedent.met).toBe(true);
  });

  it('Workstream V — a supersedes CYCLE zeroes out the head entirely and fails closed, never fabricating a survivor', () => {
    const a = record({ recordId: 'cv-1', status: 'CLEARED', supersedesRecordId: 'cv-2' });
    const b = record({ recordId: 'cv-2', status: 'CLEARED', supersedesRecordId: 'cv-1' });
    const r = evaluateConditionVerificationReadiness([a, b], 'deal-1');
    expect(r.currentRecords.CONDITIONS_PRECEDENT).toBeUndefined();
    expect(r.conditionsPrecedent.met).toBe(false);
  });

  it('Workstream V — a dangling supersedesRecordId (pointing at a record not in the list) does not suppress the record itself', () => {
    const r = evaluateConditionVerificationReadiness(
      [record({ recordId: 'cv-1', status: 'CLEARED', supersedesRecordId: 'cv-ghost' })],
      'deal-1',
    );
    expect(r.currentRecords.CONDITIONS_PRECEDENT?.recordId).toBe('cv-1');
    expect(r.conditionsPrecedent.met).toBe(true);
  });

  it('tracks all three condition types independently when all are recorded', () => {
    const r = evaluateConditionVerificationReadiness(
      [
        record({ conditionType: 'CONDITIONS_PRECEDENT', status: 'CLEARED' }),
        record({ recordId: 'cv-2', conditionType: 'COLLATERAL', status: 'CLEARED' }),
        record({ recordId: 'cv-3', conditionType: 'INSURANCE', status: 'CLEARED' }),
      ],
      'deal-1',
    );
    expect(r.conditionsPrecedent.met).toBe(true);
    expect(r.collateralVerified.met).toBe(true);
    expect(r.insuranceVerified.met).toBe(true);
  });
});
