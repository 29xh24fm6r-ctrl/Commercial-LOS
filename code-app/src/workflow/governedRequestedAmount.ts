/**
 * 2026-07-14 Dataverse credit-authority integration.
 *
 * The governed loan amount used for credit-approval authority checks can come from two places:
 * `cr664_loandeal.cr664_amount` (the field the rest of this app already relies on everywhere —
 * deal cards, routing, readiness) and `cr664_loanrequestprofile.cr664_requestedamount` (a separate
 * intake-time record). This module is the single, testable contract for reconciling the two —
 * NEVER silently pick one over the other when they disagree.
 *
 * Precedence: cr664_loandeal.cr664_amount is PRIMARY (see above — it's the value already relied on
 * throughout the app). cr664_loanrequestprofile.cr664_requestedamount is a CROSS-CHECK: when
 * supplied and it disagrees with the deal amount, that is a hard-block conflict, not something to
 * resolve by picking a winner.
 *
 * KNOWN GAP (disclosed, not papered over): there is no generated Dataverse service for
 * cr664_loanrequestprofile anywhere in this app yet (no src/generated/models|services file exists
 * for it) — nothing reads it today. Until a real query adapter + `pac code add-data-source -t
 * cr664_loanrequestprofile` are added (see docs/DATAVERSE_SECURITY_ROLE_RUNBOOK.md), every live
 * caller in this app passes `requestProfileAmount: undefined`, so this conflict check has no
 * second input to compare against in the TS app yet — the PreOperation plugin
 * (dataverse-plugins/CommercialLendingLOS.Plugins) is NOT subject to this gap, since it queries
 * Dataverse directly server-side.
 */

export type GovernedRequestedAmountResult =
  | { readonly kind: 'resolved'; readonly amount: number }
  | {
      readonly kind: 'conflict';
      readonly dealAmount: number;
      readonly requestProfileAmount: number;
    }
  | { readonly kind: 'missing' };

/** Money-field equality tolerance (cents) — avoids false conflicts from floating-point drift. */
const AMOUNT_EQUALITY_TOLERANCE = 0.01;

export function resolveGovernedRequestedAmount(
  dealAmount: number | undefined,
  requestProfileAmount: number | undefined,
): GovernedRequestedAmountResult {
  if (requestProfileAmount !== undefined && dealAmount !== undefined) {
    const agree = Math.abs(dealAmount - requestProfileAmount) <= AMOUNT_EQUALITY_TOLERANCE;
    if (!agree) {
      return { kind: 'conflict', dealAmount, requestProfileAmount };
    }
  }
  if (dealAmount !== undefined) {
    return { kind: 'resolved', amount: dealAmount };
  }
  if (requestProfileAmount !== undefined) {
    return { kind: 'resolved', amount: requestProfileAmount };
  }
  return { kind: 'missing' };
}
