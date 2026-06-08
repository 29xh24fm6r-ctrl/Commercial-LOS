/**
 * Phase 141A — Annual Review persistence types (adapter seam).
 *
 * Declares the operations a future annual-review persistence adapter would
 * support. No schema is created in 141A; no live writes happen. These types
 * exist so the disabled adapter and any later live adapter share one contract.
 */

import type {
  AnnualReviewCycle,
  AnnualReviewPackage,
  AnnualReviewRequirementStatus,
  AnnualReviewEscalation,
} from '../shared/annualReview/annualReviewTypes';

export interface AnnualReviewPersistenceResult {
  ok: boolean;
  operation: string;
  recordId?: string;
  errorCode?: string;
  message?: string;
}

export interface AnnualReviewReadResult<T> {
  ok: boolean;
  data?: T;
  errorCode?: string;
}

export interface AnnualReviewPersistenceAdapter {
  readonly enabled: boolean;
  readAnnualReviewCycle(cycleId: string): Promise<AnnualReviewReadResult<AnnualReviewCycle>>;
  searchAnnualReviewPackages(
    cycleId: string,
  ): Promise<AnnualReviewReadResult<readonly AnnualReviewPackage[]>>;
  saveAnnualReviewPackage(pkg: AnnualReviewPackage): Promise<AnnualReviewPersistenceResult>;
  updateRequirementStatus(
    requirementId: string,
    status: AnnualReviewRequirementStatus,
  ): Promise<AnnualReviewPersistenceResult>;
  addReviewNote(loanId: string, note: string): Promise<AnnualReviewPersistenceResult>;
  addEscalation(
    loanId: string,
    escalation: AnnualReviewEscalation,
  ): Promise<AnnualReviewPersistenceResult>;
  completeReview(loanId: string): Promise<AnnualReviewPersistenceResult>;
}
