/**
 * Phase 141B-H — CRM integration seams (optional, pure).
 *
 * Thin, OPTIONAL bridges from the CRM master to the Annual Review (141A) and
 * Portfolio Boarding (140x) domains. They read only; they enable nothing and
 * widen no scope. The downstream domains stay decoupled — these helpers are
 * called by a caller that already holds authorized data from both sides.
 */

import type { CrmMaster } from './crmTypes';
import {
  resolveBorrowerRequestRecipient,
  type BorrowerRequestRecipient,
} from './resolveBorrowerRequestRecipient';

// ---------------------------------------------------------------------------
// Annual Review integration
// ---------------------------------------------------------------------------

export interface AnnualReviewContactReadiness {
  loanId?: string;
  recipient: BorrowerRequestRecipient;
  /** Fail-closed: true only when outreach is ready AND upload-link is ready. */
  annualReviewContactReady: boolean;
}

/**
 * Resolve the CRM recipient + fail-closed contact readiness for an annual
 * review borrower request, keyed to a loan id. The annual review request
 * package (141A) stays preview-only; this only annotates who would receive it.
 */
export function resolveAnnualReviewContactReadiness(
  master: CrmMaster,
  loanId: string | undefined,
  asOfDate?: string | Date,
): AnnualReviewContactReadiness {
  const recipient = resolveBorrowerRequestRecipient({ master, loanId, asOfDate });
  return {
    loanId,
    recipient,
    annualReviewContactReady: recipient.outreachReady && recipient.uploadLinkReady,
  };
}

// ---------------------------------------------------------------------------
// Portfolio Boarding integration
// ---------------------------------------------------------------------------

export interface BoardedLoanCrmLink {
  loanId: string;
  borrowerOrgId?: string;
  borrowerOrgName?: string;
  linked: boolean;
}

/**
 * Resolve the CRM organization linked to a boarded loan via a `borrower`
 * relationship carrying the loan id. Returns `linked: false` honestly when no
 * link exists — it never fabricates a borrower.
 */
export function resolveBoardedLoanCrmLink(
  master: CrmMaster,
  loanId: string,
): BoardedLoanCrmLink {
  const rel = master.relationships.find(
    (r) => r.loanId === loanId && r.relationshipType === 'borrower',
  );
  if (!rel) return { loanId, linked: false };
  const orgId = rel.fromEntityType === 'organization' ? rel.fromEntityId : rel.toEntityId;
  const org = master.organizations.find((o) => o.orgId === orgId);
  return {
    loanId,
    borrowerOrgId: orgId,
    borrowerOrgName: org?.legalName,
    linked: true,
  };
}
