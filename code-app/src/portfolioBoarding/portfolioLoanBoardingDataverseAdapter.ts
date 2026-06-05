/**
 * Phase 140B-H — Dataverse adapter for portfolio boarding.
 * Disabled by default. No live writes unless adapter is explicitly injected.
 */
import type { PersistenceWriteResult } from './portfolioLoanBoardingPersistenceTypes';

export interface PortfolioLoanBoardingDataverseAdapter {
  readonly enabled: boolean;
  createBoardedLoan(payload: unknown): PersistenceWriteResult;
  updateBoardedLoan(recordId: string, payload: unknown): PersistenceWriteResult;
  attachDocumentRecord(loanId: string, payload: unknown): PersistenceWriteResult;
  updateDocumentRecord(documentId: string, payload: unknown): PersistenceWriteResult;
  addException(loanId: string, payload: unknown): PersistenceWriteResult;
  resolveException(exceptionId: string): PersistenceWriteResult;
  addReview(loanId: string, payload: unknown): PersistenceWriteResult;
  addEvidenceLink(loanId: string, payload: unknown): PersistenceWriteResult;
  readBoardedLoan(loanId: string): { ok: boolean; data: unknown };
  searchBoardedLoans(query: unknown): { ok: boolean; data: unknown[] };
}

function disabledResult(operation: string): PersistenceWriteResult {
  return {
    ok: false,
    operation,
    recordId: undefined,
    errorCode: 'adapter_not_configured',
    message: 'Portfolio boarding Dataverse adapter is not configured.',
    validationErrors: [],
  };
}

export function createDisabledPortfolioLoanBoardingDataverseAdapter(): PortfolioLoanBoardingDataverseAdapter {
  return {
    enabled: false,
    createBoardedLoan() { return disabledResult('createBoardedLoan'); },
    updateBoardedLoan() { return disabledResult('updateBoardedLoan'); },
    attachDocumentRecord() { return disabledResult('attachDocumentRecord'); },
    updateDocumentRecord() { return disabledResult('updateDocumentRecord'); },
    addException() { return disabledResult('addException'); },
    resolveException() { return disabledResult('resolveException'); },
    addReview() { return disabledResult('addReview'); },
    addEvidenceLink() { return disabledResult('addEvidenceLink'); },
    readBoardedLoan() { return { ok: false, data: null }; },
    searchBoardedLoans() { return { ok: false, data: [] }; },
  };
}
