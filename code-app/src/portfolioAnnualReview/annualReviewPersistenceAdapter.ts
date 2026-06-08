/**
 * Phase 141A — Annual Review persistence adapter.
 *
 * Disabled by default. Every operation fails closed with `not_configured`.
 * 141A ships NO live annual-review writes; a live adapter arrives in a later
 * phase once an annual-review schema/persistence plan is approved.
 */

import type {
  AnnualReviewPersistenceAdapter,
  AnnualReviewPersistenceResult,
  AnnualReviewReadResult,
} from './annualReviewPersistenceTypes';

function notConfigured(operation: string): Promise<AnnualReviewPersistenceResult> {
  return Promise.resolve({
    ok: false,
    operation,
    errorCode: 'not_configured',
    message: 'Annual review persistence is not enabled.',
  });
}

function notConfiguredRead<T>(): Promise<AnnualReviewReadResult<T>> {
  return Promise.resolve({ ok: false, errorCode: 'not_configured' });
}

export function createDisabledAnnualReviewPersistenceAdapter(): AnnualReviewPersistenceAdapter {
  return {
    enabled: false,
    readAnnualReviewCycle: () => notConfiguredRead(),
    searchAnnualReviewPackages: () => notConfiguredRead(),
    saveAnnualReviewPackage: () => notConfigured('saveAnnualReviewPackage'),
    updateRequirementStatus: () => notConfigured('updateRequirementStatus'),
    addReviewNote: () => notConfigured('addReviewNote'),
    addEscalation: () => notConfigured('addEscalation'),
    completeReview: () => notConfigured('completeReview'),
  };
}
