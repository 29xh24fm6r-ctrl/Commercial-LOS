/**
 * Phase 182B -- Banker New Deal create PILOT enablement (THE single switch).
 *
 * This is the one narrowly-scoped config that turns banker create LIVE for the
 * approved production pilot. It supplies the rollout gate's explicit gate values
 * instead of flipping the global governance constants -- so:
 *   - Public create stays disabled (NEW_DEAL_INTAKE_LIVE_CREATE_ENABLED is
 *     untouched and there is no public create surface).
 *   - Every downstream automation stays disabled (their constants are untouched).
 *   - Rollback is ONE line: set BANKER_CREATE_PILOT_ENABLED = false.
 *
 * Banker create still requires, at runtime, a resolved actor systemuser, banker
 * authorization, and the approved-production resolver returning Ready (verified
 * by the governed adapter at submit, which fails closed). This switch only
 * authorizes the gate; it never bypasses authorization, references, or audit.
 */

import type { BankerCreateRolloutInput } from './bankerNewDealCreateRollout';

/** THE pilot switch. `false` fully disables banker create (one-line rollback). */
export const BANKER_CREATE_PILOT_ENABLED: boolean = true;

/** Approved production pilot context (Intake/Open references seeded + verified). */
export const BANKER_CREATE_PILOT = Object.freeze({
  environmentIsProduction: true,
  productionRolloutApproved: true,
  productionReferencesApproved: true,
});

/**
 * Explicit gate values the pilot supplies to `evaluateBankerCreateRollout` when
 * enabled (else undefined -> the gate falls back to the global constants, which
 * are all false -> disabled). Public/downstream gates are NOT included here.
 */
export function bankerCreatePilotGateValues():
  | NonNullable<BankerCreateRolloutInput['gateValues']>
  | undefined {
  return BANKER_CREATE_PILOT_ENABLED
    ? { banker: true, adapter: true, intake: true }
    : undefined;
}
