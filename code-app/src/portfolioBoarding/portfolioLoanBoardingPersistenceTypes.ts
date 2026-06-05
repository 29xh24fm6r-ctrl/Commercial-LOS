/**
 * Phase 140B-H — Persistence types for Dataverse portfolio boarding.
 * Defines logical target entities as constants. Does NOT assume actual
 * Dataverse schema names unless already present in the repo.
 */

export const PORTFOLIO_BOARDING_ENTITIES = Object.freeze({
  boardedLoan: 'cr664_portfolioboardedloan',
  boardedLoanBorrower: 'cr664_portfolioboardedloanborrower',
  boardedLoanCollateral: 'cr664_portfolioboardedloancollateral',
  boardedLoanGuarantor: 'cr664_portfolioboardedloanguarantor',
  boardedLoanCovenant: 'cr664_portfolioboardedloancovenant',
  boardedLoanTickler: 'cr664_portfolioboardedloantickler',
  boardedLoanInsurance: 'cr664_portfolioboardedloaninsurance',
  boardedLoanDocument: 'cr664_portfolioboardedloandocument',
  boardedLoanException: 'cr664_portfolioboardedloanexception',
  boardedLoanReview: 'cr664_portfolioboardedloanreview',
  boardedLoanEvidence: 'cr664_portfolioboardedloanevidence',
  boardedLoanAuditEntry: 'cr664_portfolioboardedloanauditentry',
});

export interface PersistenceWriteResult {
  ok: boolean;
  operation: string;
  recordId: string | undefined;
  errorCode: string | undefined;
  message: string | undefined;
  validationErrors: string[];
}
