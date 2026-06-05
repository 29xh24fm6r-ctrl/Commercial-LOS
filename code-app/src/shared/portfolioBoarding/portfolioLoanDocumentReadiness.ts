/**
 * Phase 140B-H — Document readiness evaluator.
 * Pure function. No IO.
 */
import type { PortfolioLoanDocumentRecord } from './portfolioLoanBoardingTypes';

export interface DocumentReadinessResult {
  totalDocuments: number;
  missingDocuments: readonly PortfolioLoanDocumentRecord[];
  staleDocuments: readonly PortfolioLoanDocumentRecord[];
  exceptionDocuments: readonly PortfolioLoanDocumentRecord[];
  unreviewedDocuments: readonly PortfolioLoanDocumentRecord[];
  documentsMissingPeriodEndDate: readonly PortfolioLoanDocumentRecord[];
  documentsMissingReviewer: readonly PortfolioLoanDocumentRecord[];
}

export function evaluateDocumentReadiness(
  documents: readonly PortfolioLoanDocumentRecord[],
): DocumentReadinessResult {
  return {
    totalDocuments: documents.length,
    missingDocuments: documents.filter((d) => d.missing === true || d.missingFlag === true),
    staleDocuments: documents.filter((d) => d.stale === true || d.staleFlag === true),
    exceptionDocuments: documents.filter((d) => d.exception === true || d.exceptionFlag === true),
    unreviewedDocuments: documents.filter(
      (d) => d.status === 'received' && !d.reviewedDate,
    ),
    documentsMissingPeriodEndDate: documents.filter(
      (d) =>
        d.status === 'received' &&
        !d.periodEndDate &&
        isPeriodicDocument(d),
    ),
    documentsMissingReviewer: documents.filter(
      (d) => d.status === 'received' && d.reviewedDate && !d.reviewer,
    ),
  };
}

function isPeriodicDocument(d: PortfolioLoanDocumentRecord): boolean {
  const periodicTypes = [
    'financial_statements',
    'interim_financials',
    'tax_returns',
    'covenant_compliance_certificate',
    'borrowing_base_certificate',
    'ar_aging',
    'ap_aging',
    'inventory_report',
    'rent_roll',
    'insurance_evidence',
  ];
  return d.documentType !== undefined && periodicTypes.includes(d.documentType);
}
