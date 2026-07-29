import { describe, expect, it } from 'vitest';
import {
  detectDuplicateBoardingLinkFlags,
  detectIncompleteBoardedLoanFlags,
} from './dataQualityFlagCandidates';

describe('Production GO — boarded-loan governance', () => {
  it('flags multiple active boarded rows linked to one originated deal', () => {
    const flags = detectDuplicateBoardingLinkFlags([
      { portfolioBoardedLoanId: 'b1', originatedLoanDealId: 'd1', assignedServicingOwnerId: 'u1', active: true },
      { portfolioBoardedLoanId: 'b2', originatedLoanDealId: 'd1', assignedServicingOwnerId: 'u2', active: true },
      { portfolioBoardedLoanId: 'b3', originatedLoanDealId: 'd1', assignedServicingOwnerId: 'u3', active: false },
    ]);
    expect(flags).toHaveLength(1);
    expect(flags[0]).toMatchObject({
      category: 'duplicate-boarding-link',
      sourceRecordId: 'b1',
    });
    expect(flags[0]!.flagDescription).toContain('b2');
  });

  it('lists missing required boarded-loan facts without inventing replacements', () => {
    const flags = detectIncompleteBoardedLoanFlags([
      {
        portfolioBoardedLoanId: 'b1',
        originatedLoanDealId: 'd1',
        assignedServicingOwnerId: 'u1',
        active: true,
        loanNumber: 'LN-1',
        borrowerLegalName: 'Acme LLC',
        loanStatus: 'Active',
        currentOutstandingPrincipal: 0,
        currentRiskRating: undefined,
        maturityDate: '2031-01-01',
        originalCommitmentAmount: 500000,
        bookingDate: '2026-07-29',
      },
    ]);
    expect(flags).toHaveLength(1);
    expect(flags[0]!.category).toBe('incomplete-boarded-loan');
    expect(flags[0]!.flagDescription).toContain('risk rating');
    expect(flags[0]!.flagDescription).not.toMatch(/risk rating:\s*(Unknown|Unmapped)/i);
  });

  it('accepts zero outstanding principal as a recorded fact', () => {
    expect(
      detectIncompleteBoardedLoanFlags([
        {
          portfolioBoardedLoanId: 'b1',
          originatedLoanDealId: 'd1',
          assignedServicingOwnerId: 'u1',
          active: true,
          loanNumber: 'LN-1',
          borrowerLegalName: 'Acme LLC',
          loanStatus: 'Paid',
          currentOutstandingPrincipal: 0,
          currentRiskRating: 'Pass',
          maturityDate: '2031-01-01',
          originalCommitmentAmount: 500000,
          bookingDate: '2026-07-29',
        },
      ]),
    ).toHaveLength(0);
  });

  it('does not require an originated deal for a manually boarded existing loan', () => {
    const flags = detectIncompleteBoardedLoanFlags([
      {
        portfolioBoardedLoanId: 'b-existing',
        originatedLoanDealId: undefined,
        assignedServicingOwnerId: 'u1',
        active: true,
        boardingSource: 'Manual Existing Loan Entry',
        loanNumber: 'LN-2',
        borrowerLegalName: 'Legacy Borrower LLC',
        loanStatus: 'Active',
        currentOutstandingPrincipal: 100,
        currentRiskRating: 'Pass',
        maturityDate: '2031-01-01',
        originalCommitmentAmount: 500000,
        bookingDate: '2024-01-01',
      },
    ]);
    expect(flags).toHaveLength(0);
  });
});
