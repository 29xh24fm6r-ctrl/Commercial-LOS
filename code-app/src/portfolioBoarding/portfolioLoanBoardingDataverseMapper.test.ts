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
});
