import { resolveGovernedRequestedAmount } from './governedRequestedAmount';

/**
 * 2026-07-14 Dataverse credit-authority integration.
 *
 * Replaces the interim job-function role proxy (approvalAuthorityMatrix.ts,
 * isInterimAuthorizedApproverRole — now superseded, kept for history) with a real
 * authority projection driven by the three fields provisioned on cr664_banker:
 * cr664_approvallimit (Money), cr664_creditcommitteemember (Boolean),
 * cr664_approvaloverrideauthority (Boolean). See scripts/dataverse/create-banker-credit-authority-
 * fields.ps1 and docs/DATAVERSE_SECURITY_ROLE_RUNBOOK.md.
 *
 * POLICY (an explicit interpretation call — confirm or correct): every CREDIT_APPROVAL exit
 * requires the advancing banker to be a credit-committee member AND the resolved loan amount to be
 * within their personal approval limit. cr664_approvaloverrideauthority = true bypasses BOTH checks
 * — it is read as "can single-handedly clear the standard approval requirement," not merely "can
 * exceed their own limit." If that's wrong, this is the one function to change.
 *
 * FAIL-CLOSED: every branch below defaults to denial. There is no code path that returns
 * `{ allowed: true }` without every one of the checks explicitly passing.
 *
 * This mirrors, but does not share code with, the server-side enforcement in
 * dataverse-plugins/CommercialLendingLOS.Plugins/LoanDealStageAuthorityPlugin.cs — keep the two in
 * sync by hand; there is no shared module across the TypeScript/C# boundary.
 */

export type CreditApprovalAuthorityReasonCode =
  | 'actor_unresolved'
  | 'no_banker_record'
  | 'authority_fields_absent'
  | 'amount_missing'
  | 'amount_conflict'
  | 'amount_exceeds_individual_authority'
  | 'committee_authority_required'
  | 'self_approval_not_permitted';

export type CreditApprovalAuthorityResult =
  | { readonly allowed: true }
  | { readonly allowed: false; readonly reasonCode: CreditApprovalAuthorityReasonCode; readonly detail: string };

export interface BankerCreditAuthority {
  readonly approvalLimit: number | undefined;
  readonly creditCommitteeMember: boolean | undefined;
  readonly approvalOverrideAuthority: boolean | undefined;
}

export interface CreditApprovalAuthorityInput {
  /** Whether the acting user's identity was resolved at all (e.g. systemUserId present). */
  readonly actorResolved: boolean;
  /** The acting user's cr664_banker record, or undefined if none exists/was found. */
  readonly banker: BankerCreditAuthority | undefined;
  readonly dealAmount: number | undefined;
  readonly requestProfileAmount: number | undefined;
  /** The advancing actor's OWN cr664_banker record id (cr664_bankerid), for self-approval prevention. */
  readonly advancingActorBankerId?: string | undefined;
  /** The deal's assigned banker id (cr664_loandeal._cr664_assignedbanker_value), for self-approval prevention. */
  readonly originatingBankerId?: string | undefined;
}

function denied(reasonCode: CreditApprovalAuthorityReasonCode, detail: string): CreditApprovalAuthorityResult {
  return { allowed: false, reasonCode, detail };
}

export function evaluateCreditApprovalAuthority(input: CreditApprovalAuthorityInput): CreditApprovalAuthorityResult {
  if (!input.actorResolved) {
    return denied('actor_unresolved', 'The advancing actor could not be resolved to an authenticated identity.');
  }
  if (!input.banker) {
    return denied('no_banker_record', 'No cr664_banker record exists for the advancing actor.');
  }
  const { approvalLimit, creditCommitteeMember, approvalOverrideAuthority } = input.banker;
  if (approvalLimit === undefined || creditCommitteeMember === undefined || approvalOverrideAuthority === undefined) {
    return denied(
      'authority_fields_absent',
      'One or more credit-authority fields (approval limit, credit committee membership, override authority) are not populated for this banker.',
    );
  }

  // PR 106 -- self-approval prevention. Checked BEFORE the override-authority bypass so override
  // authority ("can single-handedly clear the standard approval requirement") can never be used to
  // approve one's own deal -- that would be exactly the abuse vector self-approval prevention exists
  // to close. Only actively enforced when BOTH ids are supplied by the caller (the live write path
  // wires both from already-resolved data -- see DealStageProgressionCard.tsx / BankerDealWorkspace.tsx
  // for advancingActorBankerId, DealDetail.assignedBankerId for originatingBankerId). When either is
  // absent this check has no opinion (neither denies nor fabricates a pass) -- same discipline as this
  // codebase's other "untracked fact" gates (see workflow/underwritingDeepFacts.ts): never enforce a
  // guarantee we cannot actually verify.
  if (input.advancingActorBankerId !== undefined && input.originatingBankerId !== undefined) {
    if (input.advancingActorBankerId === input.originatingBankerId) {
      return denied(
        'self_approval_not_permitted',
        'The advancing actor is this deal\'s assigned banker; a different credit-authority holder must approve it.',
      );
    }
  }

  if (approvalOverrideAuthority) {
    return { allowed: true };
  }

  const amountResult = resolveGovernedRequestedAmount(input.dealAmount, input.requestProfileAmount);
  if (amountResult.kind === 'conflict') {
    return denied(
      'amount_conflict',
      `The deal amount (${amountResult.dealAmount}) and the loan request profile amount (${amountResult.requestProfileAmount}) disagree.`,
    );
  }
  if (amountResult.kind === 'missing') {
    return denied('amount_missing', 'No governed loan amount is available to evaluate approval authority against.');
  }

  if (!creditCommitteeMember) {
    return denied('committee_authority_required', 'The advancing actor is not a credit committee member.');
  }
  if (amountResult.amount > approvalLimit) {
    return denied(
      'amount_exceeds_individual_authority',
      `The requested amount (${amountResult.amount}) exceeds the advancing actor's individual approval limit (${approvalLimit}).`,
    );
  }

  return { allowed: true };
}

/**
 * Safe, generic user-facing copy — deliberately omits dollar amounts, approval limits, and
 * internal field names so denial messages never leak sensitive authorization internals.
 */
export function describeCreditApprovalAuthorityReason(reasonCode: CreditApprovalAuthorityReasonCode): string {
  switch (reasonCode) {
    case 'actor_unresolved':
      return "We couldn't confirm your identity for this approval action.";
    case 'no_banker_record':
      return 'Your banker profile is not set up for approval actions. Contact your administrator.';
    case 'authority_fields_absent':
      return 'Approval authority is not yet configured for your account. Contact your credit administrator.';
    case 'amount_missing':
      return "This deal's loan amount must be recorded before it can be approved.";
    case 'amount_conflict':
      return "This deal's loan amount does not match across records and must be reconciled before approval.";
    case 'amount_exceeds_individual_authority':
      return 'This loan amount exceeds your individual approval authority.';
    case 'committee_authority_required':
      return 'This approval requires credit committee authority.';
    case 'self_approval_not_permitted':
      return 'You are the assigned banker on this deal and cannot approve your own request. A different credit-authority holder must approve it.';
  }
}
