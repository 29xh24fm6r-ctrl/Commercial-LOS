import type { FundingReadinessFacts } from './fundingAuthorizationTypes';

export type FundingReadinessBlocker =
  | 'required_documents_incomplete'
  | 'conditions_precedent_unresolved'
  | 'exceptions_unresolved'
  | 'destination_not_verified'
  | 'approval_expired'
  | 'deal_declined'
  | 'deal_withdrawn'
  | 'deal_already_boarded';

export interface FundingReadinessResult {
  readonly ready: boolean;
  readonly blockers: readonly FundingReadinessBlocker[];
}

/**
 * Pure derivation of whether a disbursement may proceed to FUNDED. Every blocker is independently
 * evaluated and ALL are reported (never short-circuits on the first one) so an operator sees the
 * complete picture in one pass, not a whack-a-mole of one-blocker-at-a-time messages.
 */
export function deriveFundingReadiness(facts: FundingReadinessFacts): FundingReadinessResult {
  const blockers: FundingReadinessBlocker[] = [];
  if (!facts.requiredDocumentsComplete) blockers.push('required_documents_incomplete');
  if (!facts.conditionsPrecedentResolved) blockers.push('conditions_precedent_unresolved');
  if (!facts.exceptionsAllResolved) blockers.push('exceptions_unresolved');
  if (!facts.destinationVerified) blockers.push('destination_not_verified');
  if (facts.approvalExpired) blockers.push('approval_expired');
  if (facts.dealTerminalStatus === 'DECLINED') blockers.push('deal_declined');
  if (facts.dealTerminalStatus === 'WITHDRAWN') blockers.push('deal_withdrawn');
  if (facts.dealTerminalStatus === 'BOARDED') blockers.push('deal_already_boarded');
  return { ready: blockers.length === 0, blockers };
}
