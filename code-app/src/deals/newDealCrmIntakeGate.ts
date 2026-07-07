/**
 * CRM-first New Deal intake gate (pure).
 *
 * A governed loan deal must originate from a CRM client relationship: Step 1 of
 * the New Deal flow is "CRM Client". This module owns the single decision of
 * whether deal creation may proceed given the banker's Step-1 selection — and
 * produces the HONEST blocker copy shown BEFORE any create is attempted, never
 * after.
 *
 * The rule (fail-closed):
 *   - A selected existing client relationship id → proceed.
 *   - No client selected, but an admin/gate explicitly allows it → proceed
 *     without a client (audited upstream as a deliberate exception).
 *   - No client selected, no allowance, and NO client relationships exist yet →
 *     blocked with the "create/import the CRM client first" message.
 *   - No client selected, no allowance, but client relationships DO exist →
 *     blocked asking the banker to pick one in Step 1.
 *
 * Pure: no IO, no Dataverse import, no env read. The admin allowance and the
 * "do any client relationships exist" signal are injected by the caller.
 */

/**
 * Governed default: a New Deal REQUIRES a CRM client relationship. Only an
 * explicit admin/gate allowance (injected `allowCreateWithoutClient`) lets a
 * deal be created without one. This constant documents the posture; it is not a
 * bypass — the allowance is always an injected, auditable decision.
 */
export const NEW_DEAL_REQUIRE_CRM_CLIENT = true as const;

/**
 * Admin/gate allowance to create a deal with NO CRM client relationship. Hard
 * `false` by default: the CRM-first requirement is in force. Flipping this is a
 * deliberate, auditable admin decision (a client-less deal is the exception).
 */
export const NEW_DEAL_ALLOW_CREATE_WITHOUT_CRM_CLIENT: boolean = false;

/** Shown when the CRM has no client relationship to link yet. */
export const NO_CRM_CLIENT_EXISTS_MESSAGE =
  'No CRM client relationship exists yet. Create/import the CRM client before creating this deal.';

/** Shown when clients exist but the banker has not selected one in Step 1. */
export const CRM_CLIENT_REQUIRED_MESSAGE =
  'Select the CRM client relationship for this deal in Step 1 before continuing. No deal has been created.';

export interface CrmIntakeGateInput {
  /** The existing cr664_clientrelationship id chosen in Step 1, if any. */
  readonly selectedClientId?: string;
  /**
   * Whether ANY existing cr664_clientrelationships row exists to pick from.
   * `false` distinguishes the "create/import a client first" blocker from the
   * "pick one" blocker. Omit/undefined when unknown (treated as "pick one").
   */
  readonly clientRelationshipsExist?: boolean;
  /**
   * Admin/gate allowance to create a deal with no CRM client. Default (absent /
   * false) keeps the governed client requirement in force.
   */
  readonly allowCreateWithoutClient?: boolean;
}

export type CrmIntakeGateOutcome =
  | { readonly kind: 'ready'; readonly clientId: string }
  | { readonly kind: 'ready_without_client' }
  | { readonly kind: 'blocked_no_client_exists'; readonly message: string }
  | { readonly kind: 'blocked_client_required'; readonly message: string };

/** Evaluate the CRM-first intake gate. */
export function evaluateCrmIntakeGate(input: CrmIntakeGateInput): CrmIntakeGateOutcome {
  const clientId = (input.selectedClientId ?? '').trim();
  if (clientId.length > 0) {
    return { kind: 'ready', clientId };
  }
  if (input.allowCreateWithoutClient === true) {
    return { kind: 'ready_without_client' };
  }
  if (input.clientRelationshipsExist === false) {
    return { kind: 'blocked_no_client_exists', message: NO_CRM_CLIENT_EXISTS_MESSAGE };
  }
  return { kind: 'blocked_client_required', message: CRM_CLIENT_REQUIRED_MESSAGE };
}

/** True when the gate permits deal creation to proceed. */
export function crmIntakeGatePasses(outcome: CrmIntakeGateOutcome): boolean {
  return outcome.kind === 'ready' || outcome.kind === 'ready_without_client';
}

/** Blocker copy for a non-passing outcome (empty string when it passes). */
export function crmIntakeBlockerMessage(outcome: CrmIntakeGateOutcome): string {
  return outcome.kind === 'blocked_no_client_exists' || outcome.kind === 'blocked_client_required'
    ? outcome.message
    : '';
}
