import { FUNDING_TERMINAL_STATUSES, type FundingAuthorizationRecord } from './fundingAuthorizationTypes';

/**
 * final-seven-workstreams Workstream 7 — the pure funding-authorization policy engine: request
 * validation, approval evaluation (dual control + self-approval prohibition + facility-amount cap),
 * rejection, and revocation. This module decides WHETHER a transition is legal; the adapter
 * modules (fundingRequestAdapter.ts / fundingApprovalAdapter.ts / fundingDisbursementConfirmation.ts)
 * perform the actual governed write once a transition is confirmed legal.
 */

function normalizeEmail(email: string | undefined): string {
  return (email ?? '').trim().toLowerCase();
}

export interface FundingAuthorizationPolicyConfig {
  /** A requested/approved amount at or above this threshold requires two DISTINCT approvers. */
  readonly dualControlThreshold: number;
}

export const DEFAULT_DUAL_CONTROL_THRESHOLD_USD = 250_000;

export function evaluateRequestedAmount(requestedAmount: number): { valid: true } | { valid: false; reason: string } {
  if (!Number.isFinite(requestedAmount) || requestedAmount <= 0) {
    return { valid: false, reason: 'Requested amount must be a positive number.' };
  }
  return { valid: true };
}

export type FundingApprovalDenialReason =
  | 'record_terminal'
  | 'record_not_pending'
  | 'self_approval_not_permitted'
  | 'amount_exceeds_authorized_facility';

export type FundingApprovalEvaluation =
  | { readonly kind: 'denied'; readonly reason: FundingApprovalDenialReason }
  | { readonly kind: 'first_approval_recorded' }
  | { readonly kind: 'fully_approved' };

export interface EvaluateFundingApprovalInput {
  readonly record: FundingAuthorizationRecord;
  readonly approverEmail: string;
  readonly approvedAmount: number;
  readonly authorizedFacilityAmount: number;
  readonly config?: FundingAuthorizationPolicyConfig;
}

/**
 * Evaluate one approval action against the record's current state. Dual control: when the
 * approved amount is at or above the threshold, a FIRST approval only records `authorizedBy` and
 * leaves the record PENDING (not yet fully approved); a SECOND, genuinely distinct approver's
 * approval is required to reach `fully_approved`. Below the threshold, a single approval suffices.
 * The requester may never approve their own request; once a first approver is recorded, that SAME
 * person may not also be the second approver.
 */
export function evaluateFundingApproval(input: EvaluateFundingApprovalInput): FundingApprovalEvaluation {
  const { record } = input;
  if (FUNDING_TERMINAL_STATUSES.has(record.authorizationStatus)) {
    return { kind: 'denied', reason: 'record_terminal' };
  }
  if (record.authorizationStatus !== 'PENDING' && record.authorizationStatus !== 'BLOCKED') {
    return { kind: 'denied', reason: 'record_not_pending' };
  }
  if (normalizeEmail(input.approverEmail) === normalizeEmail(record.requestedBy)) {
    return { kind: 'denied', reason: 'self_approval_not_permitted' };
  }
  if (input.approvedAmount > input.authorizedFacilityAmount) {
    return { kind: 'denied', reason: 'amount_exceeds_authorized_facility' };
  }

  const threshold = input.config?.dualControlThreshold ?? DEFAULT_DUAL_CONTROL_THRESHOLD_USD;
  const dualControlRequired = input.approvedAmount >= threshold;

  if (!record.authorizedBy) {
    // First approval on this record.
    return dualControlRequired ? { kind: 'first_approval_recorded' } : { kind: 'fully_approved' };
  }

  // A first approver is already recorded — this is (or should be) the second approval.
  if (!dualControlRequired) {
    // A record that no longer requires dual control (e.g. approvedAmount lowered on retry) but
    // already has a first approver recorded should not silently re-approve — treat as already
    // handled, fail closed rather than guess intent.
    return { kind: 'denied', reason: 'record_not_pending' };
  }
  if (normalizeEmail(input.approverEmail) === normalizeEmail(record.authorizedBy)) {
    return { kind: 'denied', reason: 'self_approval_not_permitted' };
  }
  return { kind: 'fully_approved' };
}

export type FundingRejectionEvaluation =
  | { readonly kind: 'denied'; readonly reason: 'record_terminal' }
  | { readonly kind: 'rejected' };

export function evaluateFundingRejection(record: FundingAuthorizationRecord): FundingRejectionEvaluation {
  if (FUNDING_TERMINAL_STATUSES.has(record.authorizationStatus)) return { kind: 'denied', reason: 'record_terminal' };
  return { kind: 'rejected' };
}

export type FundingRevocationEvaluation =
  | { readonly kind: 'denied'; readonly reason: 'not_yet_approved' | 'already_funded' | 'record_terminal' }
  | { readonly kind: 'revoked' };

/** Revocation is legal ONLY from APPROVED, and only before disbursement (FUNDED is terminal and
 *  immutable — a completed disbursement is never "revoked" after the fact). */
export function evaluateFundingRevocation(record: FundingAuthorizationRecord): FundingRevocationEvaluation {
  if (record.authorizationStatus === 'FUNDED') return { kind: 'denied', reason: 'already_funded' };
  if (FUNDING_TERMINAL_STATUSES.has(record.authorizationStatus)) return { kind: 'denied', reason: 'record_terminal' };
  if (record.authorizationStatus !== 'APPROVED') return { kind: 'denied', reason: 'not_yet_approved' };
  return { kind: 'revoked' };
}
