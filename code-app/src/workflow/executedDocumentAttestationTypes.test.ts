import { describe, it, expect } from 'vitest';
import {
  evaluateExecutedDocumentAttestationReadiness,
  type ExecutedDocumentAttestationRecord,
} from './executedDocumentAttestationTypes';

function record(overrides: Partial<ExecutedDocumentAttestationRecord> = {}): ExecutedDocumentAttestationRecord {
  return {
    attestationId: 'edc-1',
    dealId: 'deal-1',
    status: 'ATTESTED',
    executedDateIso: '2026-07-20T00:00:00.000Z',
    notes: 'All documents executed at closing table, originals retained.',
    attestedByActorEmail: 'closer@bank.test',
    attestedAtIso: '2026-07-24T10:00:00.000Z',
    correlationId: 'edc-corr-1',
    supersedesAttestationId: undefined,
    ...overrides,
  };
}

describe('evaluateExecutedDocumentAttestationReadiness', () => {
  it('fails closed (not met) when there are no records at all', () => {
    const r = evaluateExecutedDocumentAttestationReadiness(undefined, 'deal-1');
    expect(r.executedDocsAttested.met).toBe(false);
    expect(r.currentAttestation).toBeUndefined();
  });

  it('fails closed when the only record is for a DIFFERENT deal', () => {
    const r = evaluateExecutedDocumentAttestationReadiness([record({ dealId: 'other-deal' })], 'deal-1');
    expect(r.executedDocsAttested.met).toBe(false);
  });

  it('is met when ATTESTED', () => {
    const r = evaluateExecutedDocumentAttestationReadiness([record()], 'deal-1');
    expect(r.executedDocsAttested.met).toBe(true);
    expect(r.currentAttestation?.attestationId).toBe('edc-1');
  });

  it('is NOT met when REVOKED', () => {
    const r = evaluateExecutedDocumentAttestationReadiness(
      [record({ status: 'REVOKED', notes: 'Attestation recorded in error.' })],
      'deal-1',
    );
    expect(r.executedDocsAttested.met).toBe(false);
  });

  it('resolves the head of the chain via supersedesAttestationId, not timestamp, when a re-attestation supersedes a REVOKED record', () => {
    const revoked = record({ attestationId: 'edc-1', status: 'REVOKED', notes: 'Recorded in error.' });
    const attested = record({
      attestationId: 'edc-2',
      status: 'ATTESTED',
      notes: 'Corrected attestation -- documents confirmed executed.',
      supersedesAttestationId: 'edc-1',
      // Deliberately identical timestamp -- proves resolution is via the chain link.
      attestedAtIso: revoked.attestedAtIso,
    });
    const r = evaluateExecutedDocumentAttestationReadiness([revoked, attested], 'deal-1');
    expect(r.executedDocsAttested.met).toBe(true);
    expect(r.currentAttestation?.attestationId).toBe('edc-2');
  });

  it('never fabricates a met result from a record belonging to a different deal mixed into the same list', () => {
    const wrongDeal = record({ dealId: 'deal-2' });
    const rightDeal = record({ dealId: 'deal-1', status: 'REVOKED' });
    const r = evaluateExecutedDocumentAttestationReadiness([wrongDeal, rightDeal], 'deal-1');
    expect(r.executedDocsAttested.met).toBe(false);
  });

  it('Workstream V — tie-breaks by most-recent timestamp when two records are BOTH unsuperseded (genuinely ambiguous multiple heads)', () => {
    const older = record({ attestationId: 'edc-1', status: 'REVOKED', attestedAtIso: '2026-07-20T00:00:00.000Z' });
    const newer = record({ attestationId: 'edc-2', status: 'ATTESTED', attestedAtIso: '2026-07-24T00:00:00.000Z' });
    const r = evaluateExecutedDocumentAttestationReadiness([older, newer], 'deal-1');
    expect(r.currentAttestation?.attestationId).toBe('edc-2');
    expect(r.executedDocsAttested.met).toBe(true);
  });

  it('Workstream V — a supersedes CYCLE zeroes out the head entirely and fails closed, never fabricating a survivor', () => {
    const a = record({ attestationId: 'edc-1', status: 'ATTESTED', supersedesAttestationId: 'edc-2' });
    const b = record({ attestationId: 'edc-2', status: 'ATTESTED', supersedesAttestationId: 'edc-1' });
    const r = evaluateExecutedDocumentAttestationReadiness([a, b], 'deal-1');
    expect(r.currentAttestation).toBeUndefined();
    expect(r.executedDocsAttested.met).toBe(false);
  });

  it('Workstream V — a dangling supersedesAttestationId (pointing at a record not in the list) does not suppress the record itself', () => {
    const r = evaluateExecutedDocumentAttestationReadiness(
      [record({ attestationId: 'edc-1', status: 'ATTESTED', supersedesAttestationId: 'edc-ghost' })],
      'deal-1',
    );
    expect(r.currentAttestation?.attestationId).toBe('edc-1');
    expect(r.executedDocsAttested.met).toBe(true);
  });
});
