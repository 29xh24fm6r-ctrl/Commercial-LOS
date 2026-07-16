import { describe, it, expect } from 'vitest';
import { deriveRequiredDocuments, type DocumentRequirementDerivationInput } from './documentRequirementDerivation';

function input(overrides: Partial<DocumentRequirementDerivationInput> = {}): DocumentRequirementDerivationInput {
  return {
    productType: undefined,
    loanStructure: undefined,
    customerType: undefined,
    guarantorStructure: undefined,
    collateralSummary: undefined,
    industry: undefined,
    stage: undefined,
    ...overrides,
  };
}

function names(input_: DocumentRequirementDerivationInput): string[] {
  return deriveRequiredDocuments(input_).map((d) => d.documentName);
}

describe('deriveRequiredDocuments', () => {
  it('always requires the Loan Application, regardless of stage', () => {
    expect(names(input())).toContain('Loan Application');
  });

  it('stage-gated documents are excluded before Underwriting', () => {
    const list = names(input({ stage: 'INTAKE' }));
    expect(list).not.toContain('Business Financial Statements');
    expect(list).not.toContain('Signed Term Sheet');
  });

  it('stage-gated documents appear once the deal reaches Underwriting', () => {
    const list = names(input({ stage: 'UNDERWRITING' }));
    expect(list).toContain('Signed Term Sheet');
    expect(list).toContain('Business Financial Statements');
    expect(list).toContain('Business Tax Returns');
  });

  it('an unrecognized / non-canonical stage fails closed (no stage-gated document guessed active)', () => {
    const list = names(input({ stage: 'Some Custom Stage' }));
    expect(list).not.toContain('Business Financial Statements');
  });

  it('personal guarantor structure requires Personal Financial Statement + Personal Tax Returns once underwriting begins', () => {
    const list = names(input({ stage: 'UNDERWRITING', guarantorStructure: 'Personal guarantee' }));
    expect(list).toContain('Personal Financial Statement');
    expect(list).toContain('Personal Tax Returns');
  });

  it('a corporate-only guarantor structure does not require personal documents', () => {
    const list = names(input({ stage: 'UNDERWRITING', guarantorStructure: 'Corporate guarantee' }));
    expect(list).not.toContain('Personal Financial Statement');
    expect(list).not.toContain('Personal Tax Returns');
  });

  it('a term-structured product requires a Debt Schedule', () => {
    const list = names(input({ stage: 'UNDERWRITING', productType: 'Term Loan' }));
    expect(list).toContain('Debt Schedule');
    expect(list).not.toContain('Borrowing Base Certificate');
  });

  it('a revolving product requires a Borrowing Base Certificate', () => {
    const list = names(input({ stage: 'UNDERWRITING', productType: 'Revolving Line of Credit' }));
    expect(list).toContain('Borrowing Base Certificate');
    expect(list).not.toContain('Debt Schedule');
  });

  it('real-estate collateral requires an Appraisal Report + Title Report', () => {
    const list = names(input({ stage: 'UNDERWRITING', collateralSummary: 'Commercial real estate' }));
    expect(list).toContain('Appraisal Report');
    expect(list).toContain('Title Report');
  });

  it('equipment collateral requires an Equipment List and Invoices', () => {
    const list = names(input({ stage: 'UNDERWRITING', collateralSummary: 'Manufacturing equipment' }));
    expect(list).toContain('Equipment List and Invoices');
  });

  it('mixed collateral (real estate + equipment) requires both document sets, no duplicates', () => {
    const list = names(input({ stage: 'UNDERWRITING', collateralSummary: 'Real estate and equipment' }));
    expect(list.filter((n) => n === 'Appraisal Report')).toHaveLength(1);
    expect(list).toContain('Equipment List and Invoices');
  });

  it('is deterministic: identical input yields identical output', () => {
    const i = input({ stage: 'UNDERWRITING', productType: 'Term Loan', collateralSummary: 'Equipment' });
    expect(deriveRequiredDocuments(i)).toEqual(deriveRequiredDocuments(i));
  });

  it('every returned definition carries a non-empty reason naming why it applies', () => {
    for (const def of deriveRequiredDocuments(input({ stage: 'UNDERWRITING', productType: 'Term Loan' }))) {
      expect(def.reason.length).toBeGreaterThan(0);
    }
  });

  // Factory Arc Phase 1 gap: no prior test constructed an input with customerType set,
  // leaving the 'ownership-information' rule (keyed on customerType) untested.
  it('a C&I / commercial / industrial customer type requires Ownership Information', () => {
    const list = names(input({ stage: 'UNDERWRITING', customerType: 'Commercial & Industrial' }));
    expect(list).toContain('Ownership Information');
  });

  it('a non-C&I customer type does not require Ownership Information', () => {
    const list = names(input({ stage: 'UNDERWRITING', customerType: 'Consumer' }));
    expect(list).not.toContain('Ownership Information');
  });

  // Factory Arc Phase 7 — SBA vs conventional, using the real admin-managed
  // productType reference field (no invented data source).
  describe('SBA vs conventional (Factory Arc Phase 7)', () => {
    it('an SBA 7(a) product requires SBA Form 1919 and SBA Form 912 once underwriting begins', () => {
      const list = names(input({ stage: 'UNDERWRITING', productType: 'SBA 7(a)' }));
      expect(list).toContain('SBA Form 1919 (Borrower Information Form)');
      expect(list).toContain('SBA Form 912 (Statement of Personal History)');
    });

    it('an SBA 504 product also requires the SBA forms (substring match, not an exact-name list)', () => {
      const list = names(input({ stage: 'UNDERWRITING', productType: 'SBA504' }));
      expect(list).toContain('SBA Form 1919 (Borrower Information Form)');
    });

    it('a conventional product does not require the SBA forms', () => {
      const list = names(input({ stage: 'UNDERWRITING', productType: 'Conventional Term Loan' }));
      expect(list).not.toContain('SBA Form 1919 (Borrower Information Form)');
      expect(list).not.toContain('SBA Form 912 (Statement of Personal History)');
    });

    it('the SBA forms are stage-gated like every other underwriting document', () => {
      const list = names(input({ stage: 'INTAKE', productType: 'SBA 7(a)' }));
      expect(list).not.toContain('SBA Form 1919 (Borrower Information Form)');
    });
  });

  // Factory Arc Phase 7 — exception mechanism.
  describe('exceptions (Factory Arc Phase 7)', () => {
    it('a rule key listed in exceptions is excluded even though it would otherwise apply', () => {
      const list = names(
        input({ stage: 'UNDERWRITING', productType: 'SBA 7(a)', exceptions: ['sba-borrower-information-form'] }),
      );
      expect(list).not.toContain('SBA Form 1919 (Borrower Information Form)');
      // The sibling SBA rule (a different key) is unaffected.
      expect(list).toContain('SBA Form 912 (Statement of Personal History)');
    });

    it('exempting one rule never affects unrelated rules', () => {
      const list = names(
        input({ stage: 'UNDERWRITING', collateralSummary: 'Real estate', exceptions: ['appraisal-report'] }),
      );
      expect(list).not.toContain('Appraisal Report');
      expect(list).toContain('Title Report');
      expect(list).toContain('Loan Application');
    });

    it('an unknown exception key is a harmless no-op (never throws, never excludes an unrelated rule)', () => {
      const withException = names(input({ stage: 'UNDERWRITING', exceptions: ['not-a-real-rule-key'] }));
      const withoutException = names(input({ stage: 'UNDERWRITING' }));
      expect(withException).toEqual(withoutException);
    });

    it('an empty exceptions array behaves identically to omitting exceptions', () => {
      const withEmpty = names(input({ stage: 'UNDERWRITING', productType: 'SBA 7(a)', exceptions: [] }));
      const withUndefined = names(input({ stage: 'UNDERWRITING', productType: 'SBA 7(a)' }));
      expect(withEmpty).toEqual(withUndefined);
    });

    it('remains deterministic with exceptions present', () => {
      const i = input({ stage: 'UNDERWRITING', productType: 'SBA 7(a)', exceptions: ['sba-borrower-information-form'] });
      expect(deriveRequiredDocuments(i)).toEqual(deriveRequiredDocuments(i));
    });
  });

  // Factory Arc Phase 7 — forward-compatible fields (loanPurpose, borrowerLegalStructure,
  // guarantorCount, maxGuarantorOwnershipPercent) are declared but read by no rule yet;
  // supplying them must never change the derived output.
  it('forward-compatible Phase 7 fields (no rule reads them yet) never change the derived output', () => {
    const base = input({ stage: 'UNDERWRITING', productType: 'Term Loan', guarantorStructure: 'Personal guarantee' });
    const withExtras = input({
      ...base,
      loanPurpose: 'Working capital',
      borrowerLegalStructure: 'LLC',
      guarantorCount: 2,
      maxGuarantorOwnershipPercent: 45,
    });
    expect(deriveRequiredDocuments(withExtras)).toEqual(deriveRequiredDocuments(base));
  });
});
