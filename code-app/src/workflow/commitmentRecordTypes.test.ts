import { describe, it, expect } from 'vitest';
import { evaluateCommitmentReadiness, type CommitmentRecord } from './commitmentRecordTypes';

function record(overrides: Partial<CommitmentRecord> = {}): CommitmentRecord {
  return {
    commitmentId: 'cmt-1',
    dealId: 'deal-1',
    status: 'ISSUED',
    approvedAmount: 500_000,
    approvedProduct: 'SBA 7(a)',
    approvedTermMonths: 84,
    approvedPricing: 'Prime + 2.00%',
    keyTermsSummary: 'Term loan, monthly P&I, standard covenants.',
    expirationDateIso: '2026-08-24T00:00:00.000Z',
    issuedByActorEmail: 'banker@bank.test',
    issuedAtIso: '2026-07-24T10:00:00.000Z',
    respondedByActorEmail: undefined,
    respondedAtIso: undefined,
    declineReason: undefined,
    correlationId: 'cmt-corr-1',
    supersedesCommitmentId: undefined,
    ...overrides,
  };
}

describe('evaluateCommitmentReadiness', () => {
  it('fails closed (not met) when there are no commitments at all', () => {
    const r = evaluateCommitmentReadiness(undefined, 'deal-1');
    expect(r.commitmentIssued.met).toBe(false);
    expect(r.borrowerAcceptance.met).toBe(false);
    expect(r.currentCommitment).toBeUndefined();
    expect(r.acceptedCommitment).toBeUndefined();
  });

  it('fails closed when the only commitment is for a DIFFERENT deal', () => {
    const r = evaluateCommitmentReadiness([record({ dealId: 'other-deal' })], 'deal-1');
    expect(r.commitmentIssued.met).toBe(false);
  });

  it('is met (issued) once an ISSUED commitment exists, but acceptance stays unmet', () => {
    const r = evaluateCommitmentReadiness([record()], 'deal-1');
    expect(r.commitmentIssued.met).toBe(true);
    expect(r.currentCommitment?.commitmentId).toBe('cmt-1');
    expect(r.borrowerAcceptance.met).toBe(false);
    expect(r.acceptedCommitment).toBeUndefined();
  });

  it('is met (both) once the borrower accepts', () => {
    const r = evaluateCommitmentReadiness(
      [record({ status: 'ACCEPTED', respondedByActorEmail: 'borrower@acme.test', respondedAtIso: '2026-07-25T00:00:00.000Z' })],
      'deal-1',
    );
    expect(r.commitmentIssued.met).toBe(true);
    expect(r.borrowerAcceptance.met).toBe(true);
    expect(r.acceptedCommitment?.commitmentId).toBe('cmt-1');
  });

  it('fails closed on a DECLINED response — issued stays met, acceptance stays unmet', () => {
    const r = evaluateCommitmentReadiness(
      [record({ status: 'DECLINED', respondedAtIso: '2026-07-25T00:00:00.000Z', declineReason: 'Rate shopping elsewhere.' })],
      'deal-1',
    );
    expect(r.commitmentIssued.met).toBe(true);
    expect(r.borrowerAcceptance.met).toBe(false);
  });

  it('fails closed on a DRAFT commitment (never issued)', () => {
    const r = evaluateCommitmentReadiness([record({ status: 'DRAFT' })], 'deal-1');
    expect(r.commitmentIssued.met).toBe(false);
  });

  it('picks the MOST RECENTLY ISSUED commitment when several exist (append-only history)', () => {
    const older = record({ commitmentId: 'cmt-1', issuedAtIso: '2026-07-20T00:00:00.000Z' });
    const newer = record({ commitmentId: 'cmt-2', issuedAtIso: '2026-07-24T00:00:00.000Z' });
    const r = evaluateCommitmentReadiness([older, newer], 'deal-1');
    expect(r.currentCommitment?.commitmentId).toBe('cmt-2');
  });

  it('never fabricates a met result from a commitment belonging to a different deal mixed into the same list', () => {
    const wrongDeal = record({ dealId: 'deal-2', issuedAtIso: '2026-07-25T00:00:00.000Z' });
    const rightDeal = record({ dealId: 'deal-1', issuedAtIso: '2026-07-20T00:00:00.000Z' });
    const r = evaluateCommitmentReadiness([wrongDeal, rightDeal], 'deal-1');
    expect(r.currentCommitment?.dealId).toBe('deal-1');
  });

  it('EXPIRED and WITHDRAWN responses count as issued but not accepted', () => {
    const expired = evaluateCommitmentReadiness([record({ status: 'EXPIRED', respondedAtIso: '2026-08-25T00:00:00.000Z' })], 'deal-1');
    expect(expired.commitmentIssued.met).toBe(true);
    expect(expired.borrowerAcceptance.met).toBe(false);
    const withdrawn = evaluateCommitmentReadiness([record({ status: 'WITHDRAWN', respondedAtIso: '2026-08-25T00:00:00.000Z' })], 'deal-1');
    expect(withdrawn.commitmentIssued.met).toBe(true);
    expect(withdrawn.borrowerAcceptance.met).toBe(false);
  });
});
