import { describe, it, expect } from 'vitest';
import { mapPackageToPersistence, mapPersistenceToPackage } from './portfolioLoanBoardingDataverseMapper';
import { createEmptyPortfolioLoanBoardingPackage } from '../shared/portfolioBoarding/portfolioLoanBoardingTypes';

describe('Phase 140B-H — portfolioLoanBoardingDataverseMapper', () => {
  it('maps identity fields to persistence', () => {
    const pkg = createEmptyPortfolioLoanBoardingPackage();
    pkg.identity.loanNumber = 'LN-001';
    pkg.identity.dealName = 'Test';
    const payload = mapPackageToPersistence(pkg);
    expect(payload.fields['cr664_loannumber']).toBe('LN-001');
    expect(payload.fields['cr664_dealname']).toBe('Test');
  });

  it('preserves source marker', () => {
    const pkg = createEmptyPortfolioLoanBoardingPackage();
    pkg.source = 'manual_boarding';
    const payload = mapPackageToPersistence(pkg);
    expect(payload.source).toBe('manual_boarding');
    expect(payload.fields['cr664_boardingsource']).toBe('manual_boarding');
  });

  it('preserves nulls (undefined fields are not in payload)', () => {
    const pkg = createEmptyPortfolioLoanBoardingPackage();
    const payload = mapPackageToPersistence(pkg);
    expect(payload.fields['cr664_loannumber']).toBeUndefined();
  });

  it('round-trips identity through persistence', () => {
    const pkg = createEmptyPortfolioLoanBoardingPackage();
    pkg.identity.loanNumber = 'LN-002';
    pkg.source = 'originated_closed_deal';
    const payload = mapPackageToPersistence(pkg);
    const result = mapPersistenceToPackage(payload);
    expect(result.identity?.loanNumber).toBe('LN-002');
    expect(result.source).toBe('originated_closed_deal');
  });

  it('maps collateral children', () => {
    const pkg = createEmptyPortfolioLoanBoardingPackage();
    pkg.collateral.items.push({ collateralType: 'real_estate', description: 'Office' });
    const payload = mapPackageToPersistence(pkg);
    expect(payload.childPayloads.length).toBe(1);
    expect(payload.childPayloads[0].fields['cr664_collateraltype']).toBe('real_estate');
  });

  it('maps every required-for-boarding scalar section (identity/borrower/terms/creditApproval/servicing)', () => {
    const pkg = createEmptyPortfolioLoanBoardingPackage();
    pkg.identity.loanNumber = 'LN-100';
    pkg.borrower.legalEntityType = 'LLC';
    pkg.terms.originalCommitmentAmount = 500000;
    pkg.creditApproval.approvalAuthority = 'Senior Credit Officer';
    pkg.servicing.currentRiskRating = 'Pass';
    const payload = mapPackageToPersistence(pkg);
    expect(payload.fields['cr664_loannumber']).toBe('LN-100');
    expect(payload.fields['cr664_originalcommitmentamount']).toBe(500000);
    expect(payload.fields['cr664_approvalauthority']).toBe('Senior Credit Officer');
    expect(payload.fields['cr664_currentriskrating']).toBe('Pass');
    // Borrower fields route to the dedicated borrower CHILD, not the root record.
    expect(payload.fields['cr664_legalentitytype']).toBeUndefined();
  });

  it('emits a borrower child only when at least one borrower field is populated', () => {
    const empty = createEmptyPortfolioLoanBoardingPackage();
    expect(mapPackageToPersistence(empty).childPayloads).toHaveLength(0);

    const populated = createEmptyPortfolioLoanBoardingPackage();
    populated.borrower.legalEntityType = 'LLC';
    const payload = mapPackageToPersistence(populated);
    expect(payload.childPayloads).toHaveLength(1);
    expect(payload.childPayloads[0].entityName).toBe('cr664_portfolioboardedloanborrower');
    expect(payload.childPayloads[0].fields['cr664_legalentitytype']).toBe('LLC');
  });

  it('maps every child collection to its own entity', () => {
    const pkg = createEmptyPortfolioLoanBoardingPackage();
    pkg.collateral.items.push({ collateralType: 'equipment' });
    pkg.guarantors.guarantors.push({ guarantorName: 'Jane Doe' });
    pkg.covenants.covenants.push({ covenantName: 'DSCR >= 1.25x' });
    pkg.ticklers.ticklers.push({ ticklerName: 'Annual review' });
    pkg.insurance.policies.push({ carrier: 'Acme Insurance' });
    pkg.documents.documents.push({ documentType: 'note' });
    pkg.exceptions.push({ exceptionType: 'missing_document' });
    pkg.reviewHistory.push({ reviewType: 'annual' });
    pkg.evidenceLinks.push({ evidenceId: 'ev-1' });

    const payload = mapPackageToPersistence(pkg);
    const byEntity = new Map(payload.childPayloads.map((c) => [c.entityName, c]));
    expect(byEntity.get('cr664_portfolioboardedloancollateral')?.fields['cr664_collateraltype']).toBe('equipment');
    expect(byEntity.get('cr664_portfolioboardedloanguarantor')?.fields['cr664_guarantorname']).toBe('Jane Doe');
    expect(byEntity.get('cr664_portfolioboardedloancovenant')?.fields['cr664_covenantname']).toBe('DSCR >= 1.25x');
    expect(byEntity.get('cr664_portfolioboardedloantickler')?.fields['cr664_ticklername']).toBe('Annual review');
    expect(byEntity.get('cr664_portfolioboardedloaninsurance')?.fields['cr664_carrier']).toBe('Acme Insurance');
    expect(byEntity.get('cr664_portfolioboardedloandocument')?.fields['cr664_documenttype']).toBe('note');
    expect(byEntity.get('cr664_portfolioboardedloanexception')?.fields['cr664_exceptiontype']).toBe('missing_document');
    expect(payload.childPayloads.filter((c) => c.entityName === 'cr664_portfolioboardedloanreview')).toHaveLength(1);
    expect(byEntity.get('cr664_portfolioboardedloanevidence')?.fields['cr664_evidenceid']).toBe('ev-1');
  });
});
