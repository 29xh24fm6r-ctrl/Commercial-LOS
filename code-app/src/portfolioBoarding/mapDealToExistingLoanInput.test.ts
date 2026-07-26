import { describe, it, expect } from 'vitest';
import type { DealDetail } from '../deals/dealQueries';
import { mapDealToExistingLoanInput } from './mapDealToExistingLoanInput';

function deal(overrides: Partial<DealDetail> = {}): DealDetail {
  return {
    id: 'deal-1',
    name: 'Acme Expansion',
    clientName: 'Acme Manufacturing LLC',
    stage: 'BOARDED',
    status: 'Active',
    amount: 2_000_000,
    bankerName: 'Banker',
    targetCloseDate: '2026-08-31',
    productType: 'Term Loan',
    loanStructure: 'Senior secured',
    customerType: 'C&I',
    industry: 'Manufacturing',
    guarantorStructure: 'Corporate',
    pricingType: 'Floating',
    spreadIndex: 'SOFR',
    spreadMargin: 250,
    collateralSummary: 'Equipment',
    createdOn: '2026-01-01',
    stageEntryDate: '2026-06-01',
    isClosed: true,
    ...overrides,
  };
}

describe('mapDealToExistingLoanInput', () => {
  it('maps only genuinely-present deal fields — never fabricates a value', () => {
    const input = mapDealToExistingLoanInput({
      deal: deal(),
      authorized: true,
      actorEmail: 'banker@oldglorybank.com',
      actorSystemUserId: 'sys-1',
    });
    expect(input).not.toBeNull();
    expect(input!.loanNumber).toBe('deal-1');
    expect(input!.borrowerLegalName).toBe('Acme Manufacturing LLC');
    expect(input!.originalCommitmentAmount).toBe(2_000_000);
    expect(input!.currentOutstandingPrincipal).toBe(2_000_000);
    expect(input!.originatedDealId).toBe('deal-1');
    expect(input!.index).toBe('SOFR');
    expect(input!.spread).toBe(250);
    expect(input!.product).toBe('Term Loan');
    expect(input!.loanStatus).toBe('active');
    expect(input!.authorized).toBe(true);
  });

  it('never invents fields the deal does not carry (e.g. no risk rating when none was recorded, no booking date)', () => {
    const input = mapDealToExistingLoanInput({
      deal: deal(),
      authorized: true,
      actorEmail: 'banker@oldglorybank.com',
      actorSystemUserId: 'sys-1',
    });
    expect(input!.currentRiskRating).toBeUndefined();
    expect(input!.bookingDate).toBeUndefined();
    expect(input!.maturityDate).toBeUndefined();
  });

  // PR A remediation — deriveRiskRatingRecordFromDeal already computes this fact (it's what gates
  // UNDERWRITING:risk_rating) and ExistingLoanInput already has a matching currentRiskRating field;
  // they were simply never wired together, the same shape as the N-25 term/purpose gap.
  it('PR A: maps the deal-side risk rating onto the boarded-loan input when one was recorded', () => {
    const input = mapDealToExistingLoanInput({
      deal: deal({ riskRatingInputsJson: JSON.stringify({ ratingValue: '4 - Watch' }) }),
      authorized: true,
      actorEmail: 'banker@oldglorybank.com',
      actorSystemUserId: 'sys-1',
    });
    expect(input!.currentRiskRating).toBe('4 - Watch');
  });

  it('PR A: leaves risk rating undefined rather than fabricated when the deal has malformed/blank rating JSON', () => {
    const input = mapDealToExistingLoanInput({
      deal: deal({ riskRatingInputsJson: 'not-json' }),
      authorized: true,
      actorEmail: 'banker@oldglorybank.com',
      actorSystemUserId: 'sys-1',
    });
    expect(input!.currentRiskRating).toBeUndefined();
  });

  it('returns null (skip auto-boarding) when the deal has no client/borrower name — never fabricates one', () => {
    const input = mapDealToExistingLoanInput({
      deal: deal({ clientName: undefined }),
      authorized: true,
      actorEmail: 'banker@oldglorybank.com',
      actorSystemUserId: 'sys-1',
    });
    expect(input).toBeNull();
  });

  it('returns null for a blank/whitespace-only client name', () => {
    const input = mapDealToExistingLoanInput({
      deal: deal({ clientName: '   ' }),
      authorized: true,
      actorEmail: 'banker@oldglorybank.com',
      actorSystemUserId: 'sys-1',
    });
    expect(input).toBeNull();
  });

  // N-25 remediation (Production Remediation Factory Arc Phase 8) — loanTermMonths/loanPurpose
  // already existed on the deal (Factory Arc Phase 3) and ExistingLoanInput already has matching
  // termMonths/purpose fields (existingLoanEntryAdapter.ts); they were simply never wired together.
  it('N-25: maps loan term months and loan purpose onto the boarded-loan input when the deal has them', () => {
    const input = mapDealToExistingLoanInput({
      deal: deal({ loanTermMonths: 60, loanPurpose: 'Acquisition of commercial property' }),
      authorized: true,
      actorEmail: 'banker@oldglorybank.com',
      actorSystemUserId: 'sys-1',
    });
    expect(input!.termMonths).toBe(60);
    expect(input!.purpose).toBe('Acquisition of commercial property');
  });

  it('N-25: leaves term/purpose undefined rather than fabricated when the deal never captured them', () => {
    const input = mapDealToExistingLoanInput({
      deal: deal(),
      authorized: true,
      actorEmail: 'banker@oldglorybank.com',
      actorSystemUserId: 'sys-1',
    });
    expect(input!.termMonths).toBeUndefined();
    expect(input!.purpose).toBeUndefined();
  });

  it('passes through the unauthorized/unresolved actor state honestly rather than defaulting to authorized', () => {
    const input = mapDealToExistingLoanInput({
      deal: deal(),
      authorized: false,
      actorEmail: undefined,
      actorSystemUserId: undefined,
    });
    expect(input!.authorized).toBe(false);
    expect(input!.actorSystemUserId).toBeUndefined();
  });
});
