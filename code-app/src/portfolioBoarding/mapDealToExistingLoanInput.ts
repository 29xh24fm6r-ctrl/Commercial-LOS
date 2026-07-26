/**
 * Auto-boarding — maps a completed origination deal to the SAME governed
 * "Add Existing Loan" input `existingLoanEntryAdapter.ts` (Phase 259) already
 * accepts from `ExistingPortfolioLoansPanel.tsx`. Reuses that ALREADY-LIVE
 * write path (`boardExistingLoan` / `buildLiveExistingLoanDeps`) rather than
 * a new one, so a deal reaching BOARDED boards for real immediately — no
 * feature flag to flip.
 *
 * Honest data-availability limit: `DealDetail` (the origination-side record)
 * never captured collateral, guarantor, covenant, insurance, or document
 * detail — those only exist once entered on the portfolio-boarding side. This
 * mapper populates ONLY fields genuinely present on the deal; it never
 * fabricates a value to fill in what origination never recorded. The
 * resulting boarded-loan record is a truthful DRAFT — an operator completes
 * it via the Existing Portfolio Loans detail view afterward.
 *
 * `loanNumber` is REQUIRED by `ExistingLoanInput` but deals carry no core
 * banking loan number yet at boarding time — this uses `deal.id` (the deal's
 * own real, stable LOS identifier), not a fabricated value, as the
 * placeholder until a core system assigns a real loan number.
 */

import type { DealDetail } from '../deals/dealQueries';
import type { ExistingLoanInput } from './existingLoanEntryAdapter';
import { deriveRiskRatingRecordFromDeal } from '../workflow/underwritingDeepFacts';

export interface MapDealToExistingLoanInputArgs {
  readonly deal: DealDetail;
  readonly authorized: boolean;
  readonly actorEmail: string | undefined;
  readonly actorSystemUserId: string | undefined;
}

/**
 * Returns `null` when the deal lacks the one field `ExistingLoanInput`
 * requires beyond a loan number (`borrowerLegalName`) — never fabricated,
 * the caller treats `null` as "skip auto-boarding for this deal."
 */
export function mapDealToExistingLoanInput(args: MapDealToExistingLoanInputArgs): ExistingLoanInput | null {
  const { deal } = args;
  const borrowerLegalName = (deal.clientName ?? '').trim();
  if (borrowerLegalName.length === 0) return null;

  return {
    loanNumber: deal.id,
    borrowerLegalName,
    loanStatus: 'active',
    originalCommitmentAmount: deal.amount,
    currentOutstandingPrincipal: deal.amount,
    index: deal.spreadIndex,
    spread: deal.spreadMargin,
    product: deal.productType,
    originatedDealId: deal.id,
    // N-25 remediation (Production Remediation Factory Arc Phase 8) — already persistable via
    // Deal Profile editing (Factory Arc Phase 3); ExistingLoanInput already has both target
    // fields (existingLoanEntryAdapter.ts), they were simply never wired from the deal side.
    // Ownership structure has no equivalent target field on this boarded-loan schema today, so
    // it is not mapped here (see the PR doc's remaining limitations).
    termMonths: deal.loanTermMonths,
    purpose: deal.loanPurpose,
    // Production Remediation Factory Arc PR A — the deal side already computes a durable risk
    // rating (deriveRiskRatingRecordFromDeal, the same fact that gates UNDERWRITING:risk_rating)
    // and ExistingLoanInput already has a matching currentRiskRating target field
    // (existingLoanEntryAdapter.ts); this was simply never wired, the same shape as N-25.
    currentRiskRating: deriveRiskRatingRecordFromDeal(deal)?.ratingValue,
    authorized: args.authorized,
    actorEmail: args.actorEmail,
    actorSystemUserId: args.actorSystemUserId,
  };
}
