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
});
