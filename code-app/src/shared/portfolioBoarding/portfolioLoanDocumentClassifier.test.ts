import { describe, it, expect } from 'vitest';
import { classifyDocument, classifyAllDocuments } from './portfolioLoanDocumentClassifier';

describe('Phase 140B-H — portfolioLoanDocumentClassifier', () => {
  it('classifies a known document type', () => {
    const result = classifyDocument('note');
    expect(result).toBeDefined();
    expect(result!.label).toBe('Promissory note');
    expect(result!.requiredForFDICReview).toBe(true);
  });

  it('returns undefined for unknown type', () => {
    expect(classifyDocument('nonexistent_type' as any)).toBeUndefined();
  });

  it('classifyAllDocuments returns all catalog entries', () => {
    const all = classifyAllDocuments();
    expect(all.length).toBeGreaterThan(10);
    expect(all.every((c) => c.documentType && c.label && c.category)).toBe(true);
  });

  it('appraisal is classified as collateral review required', () => {
    const result = classifyDocument('appraisal');
    expect(result!.requiredForCollateralReview).toBe(true);
  });

  it('guaranty is classified as guarantor review required', () => {
    const result = classifyDocument('guaranty');
    expect(result!.requiredForGuarantorReview).toBe(true);
  });
});
