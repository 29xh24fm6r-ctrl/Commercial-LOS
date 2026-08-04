import { describe, expect, it } from 'vitest';
import { deriveCoreUnderwritingRequirements, deriveDocumentIntakeRequirements, hasCompleteCoreRequirementDerivation } from './documentIntakeRequirements';

describe('canonical underwriting intake requirements', () => {
  it('creates eleven stable rows with 2026 display years', () => {
    const rows = deriveCoreUnderwritingRequirements(2026);
    expect(rows).toHaveLength(11);
    expect(rows.slice(0, 3).map((row) => row.documentName)).toEqual(['Business Tax Return — 2023', 'Business Tax Return — 2024', 'Business Tax Return — 2025']);
    expect(rows.map((row) => row.key)).toContain('business-tax-return-year-minus-1');
  });
  it('keeps stable keys while shifting 2027 display years', () => {
    const a = deriveCoreUnderwritingRequirements(2026), b = deriveCoreUnderwritingRequirements(2027);
    expect(b.slice(0, 3).map((row) => row.displayYear)).toEqual([2024, 2025, 2026]);
    expect(b.map((row) => row.key)).toEqual(a.map((row) => row.key));
  });
  it('preserves applicable collateral and SBA requirements without broad duplicates', () => {
    const rows = deriveDocumentIntakeRequirements({ documentPackageDate: '2026-02-01', productType: 'SBA 7(a)', loanStructure: 'Term', customerType: 'Commercial', guarantorStructure: 'Personal', collateralSummary: 'Real estate and equipment', industry: 'Manufacturing', stage: 'Underwriting' });
    expect(rows.map((row) => row.key)).toEqual(expect.arrayContaining(['appraisal-report', 'title-report', 'equipment-list-and-invoices', 'sba-borrower-information-form']));
    expect(rows.map((row) => row.key)).not.toContain('business-tax-returns');
  });
  it('fails closed when the package date or guarantor facts are missing', () => {
    expect(hasCompleteCoreRequirementDerivation({ documentPackageDate: '2026-01-01' })).toBe(false);
    expect(hasCompleteCoreRequirementDerivation({ documentPackageDate: '2026-01-01', guarantorStructure: 'None' })).toBe(true);
  });
});
