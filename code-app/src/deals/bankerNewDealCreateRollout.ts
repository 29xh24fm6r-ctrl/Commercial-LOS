/**
 * Phase 181C -- Controlled banker New Deal create rollout gate.
 *
 * ONE explicit decision path for whether authorized banker create is live.
 * Pure and fail-closed: it returns `live_controlled` ONLY when every gate is
 * satisfied -- the three hard constants, an approved-production resolver that is
 * Ready, approved production references, a resolved actor systemuser, and banker
 * authorization (in production, an explicit production rollout approval too).
 *
 * Because the three hard constants are `false` this phase, the default is
 * `disabled`. Tests pass `gatesOverride` to exercise the enabled path; the
 * committed constants never change here. Public create is NOT part of this gate
 * and stays disabled; downstream automation flags are untouched.
 */

import { BANKER_NEW_DEAL_CREATE_ENABLED } from './dealOriginationFeatureFlags';
import { NEW_DEAL_CREATE_ADAPTER_ENABLED } from './newDealCreateFeatureFlags';
import { NEW_DEAL_INTAKE_LIVE_CREATE_ENABLED } from '../admin/adminNewDealIntakeModel';

export type BankerCreateRolloutState =
  | 'live_controlled'
  | 'disabled'
  | 'unauthorized'
  | 'resolver_not_ready'
  | 'references_not_approved'
  | 'environment_not_allowed';

export interface BankerCreateRolloutInput {
  /** Resolved Dataverse systemuser of the actor (write identity). */
  readonly actorSystemUserId?: string | null;
  /** Actor is authorized as a banker (banker/admin/dev with banker rights). */
  readonly bankerAuthorized?: boolean;
  /** The approved-production Stage/Status resolver returned Ready. */
  readonly resolverReady?: boolean;
  /** Approved production reference rows are present + approved. */
  readonly productionReferencesApproved?: boolean;
  /** Target is the production environment. */
  readonly environmentIsProduction?: boolean;
  /** Explicit production rollout approval (a separate, higher bar). */
  readonly productionRolloutApproved?: boolean;
  /**
   * Test-only hard-constant overrides. Production never sets them; the
   * committed constants (all false) are used otherwise.
   */
  readonly gatesOverride?: {
    readonly banker?: boolean;
    readonly adapter?: boolean;
    readonly intake?: boolean;
  };
}

export function evaluateBankerCreateRollout(
  input: BankerCreateRolloutInput = {},
): BankerCreateRolloutState {
  const banker = input.gatesOverride?.banker ?? (BANKER_NEW_DEAL_CREATE_ENABLED as boolean);
  const adapter = input.gatesOverride?.adapter ?? (NEW_DEAL_CREATE_ADAPTER_ENABLED as boolean);
  const intake = input.gatesOverride?.intake ?? (NEW_DEAL_INTAKE_LIVE_CREATE_ENABLED as boolean);

  // 1. All three hard gates must be on (default: all false -> disabled).
  if (banker !== true || adapter !== true || intake !== true) return 'disabled';
  // 2. A resolved actor + banker authorization are required.
  if (!input.actorSystemUserId) return 'unauthorized';
  if (input.bankerAuthorized !== true) return 'unauthorized';
  // 3. Production needs an explicit, separate rollout approval.
  if (input.environmentIsProduction === true && input.productionRolloutApproved !== true) {
    return 'environment_not_allowed';
  }
  // 4. Approved production references must be present.
  if (input.productionReferencesApproved !== true) return 'references_not_approved';
  // 5. The approved-production resolver must be Ready.
  if (input.resolverReady !== true) return 'resolver_not_ready';
  return 'live_controlled';
}

/** True only when banker create is fully live-controlled. */
export function isBankerNewDealCreateLive(input: BankerCreateRolloutInput = {}): boolean {
  return evaluateBankerCreateRollout(input) === 'live_controlled';
}
