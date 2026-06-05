/**
 * Phase 140B-H — Portfolio loan document classifier.
 * Pure function. No OCR, no external API, no file upload side effects.
 */
import type { PortfolioLoanDocumentType } from './portfolioLoanBoardingTypes';
import { PORTFOLIO_LOAN_DOCUMENTS, type PortfolioDocumentCategory } from './portfolioLoanDocumentCatalog';

export interface DocumentClassification {
  documentType: PortfolioLoanDocumentType;
  label: string;
  category: PortfolioDocumentCategory;
  requiredForFDICReview: boolean;
  requiredForBoardReview: boolean;
  requiredForCollateralReview: boolean;
  requiredForGuarantorReview: boolean;
  staleAfterDays: number | undefined;
}

export function classifyDocument(documentType: PortfolioLoanDocumentType): DocumentClassification | undefined {
  const def = PORTFOLIO_LOAN_DOCUMENTS.find((d) => d.documentType === documentType);
  if (!def) return undefined;
  return {
    documentType: def.documentType,
    label: def.label,
    category: def.category,
    requiredForFDICReview: def.requiredForFDICReview,
    requiredForBoardReview: def.requiredForBoardReview,
    requiredForCollateralReview: def.requiredForCollateralReview,
    requiredForGuarantorReview: def.requiredForGuarantorReview,
    staleAfterDays: def.staleAfterDays,
  };
}

export function classifyAllDocuments(): readonly DocumentClassification[] {
  return PORTFOLIO_LOAN_DOCUMENTS.map((def) => ({
    documentType: def.documentType,
    label: def.label,
    category: def.category,
    requiredForFDICReview: def.requiredForFDICReview,
    requiredForBoardReview: def.requiredForBoardReview,
    requiredForCollateralReview: def.requiredForCollateralReview,
    requiredForGuarantorReview: def.requiredForGuarantorReview,
    staleAfterDays: def.staleAfterDays,
  }));
}
