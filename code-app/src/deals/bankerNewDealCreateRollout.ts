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
import {
  capabilityAvailable,
  capabilityUnavailable,
  type CapabilityAvailability,
  type CapabilityBlockingReasonKind,
} from '../shared/governance/capabilityAvailability';

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
   * Explicit gate values supplied by the approved pilot config
   * (bankerCreatePilotConfig) or by tests. When omitted, the gate falls back to
   * the global governance constants (all false -> disabled). These are the
   * BANKER-create gate values only; they never enable public create or any
   * downstream automation.
   */
  readonly gateValues?: {
    readonly banker?: boolean;
    readonly adapter?: boolean;
    readonly intake?: boolean;
  };
}

export function evaluateBankerCreateRollout(
  input: BankerCreateRolloutInput = {},
): BankerCreateRolloutState {
  const banker = input.gateValues?.banker ?? (BANKER_NEW_DEAL_CREATE_ENABLED as boolean);
  const adapter = input.gateValues?.adapter ?? (NEW_DEAL_CREATE_ADAPTER_ENABLED as boolean);
  const intake = input.gateValues?.intake ?? (NEW_DEAL_INTAKE_LIVE_CREATE_ENABLED as boolean);

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

/**
 * Plain-language line the "+ New Deal" surface shows a banker for a
 * non-live rollout state. Moved here (from BankerNewDealCreate.tsx) so both
 * the banner text and deriveNewDealCreateAvailability() below read from one
 * source — no risk of the two drifting apart.
 */
export function describeBankerCreateRolloutState(state: BankerCreateRolloutState): string {
  switch (state) {
    case 'unauthorized':
      return 'You are not authorized to create deals (no Dataverse systemuser / banker rights). No record has been created.';
    case 'references_not_approved':
      return 'Production Stage/Status references are not approved. No record has been created.';
    case 'resolver_not_ready':
      return 'Stage/Status references are not ready. No record has been created.';
    case 'environment_not_allowed':
      return 'New Deal create is not approved for this environment. No record has been created.';
    case 'disabled':
    default:
      return 'New Deal creation is not enabled in this environment. No record has been created.';
  }
}

/**
 * Factory Arc Phase 6 — the "new-deal-create" CapabilityAvailability, derived
 * from the same rollout state the button already computes. Each non-live
 * state maps to the blocking-reason kind that best matches its underlying
 * fact: 'unauthorized' is fundamentally an identity-resolution fact
 * (Boolean(actorSystemUserId) && bankerAuthorized), so it's 'audit-identity';
 * 'references_not_approved'/'resolver_not_ready' are live-dependency-readiness
 * facts, so 'connection'; 'environment_not_allowed'/'disabled' are
 * deployment-environment authorization facts, so 'permission'.
 */
export function deriveNewDealCreateAvailability(
  state: BankerCreateRolloutState,
  checkedAt: string,
): CapabilityAvailability {
  if (state === 'live_controlled') return capabilityAvailable('new-deal-create', checkedAt);
  const kind: CapabilityBlockingReasonKind =
    state === 'unauthorized'
      ? 'audit-identity'
      : state === 'references_not_approved' || state === 'resolver_not_ready'
        ? 'connection'
        : 'permission';
  return capabilityUnavailable(
    'new-deal-create',
    [{ kind, detail: describeBankerCreateRolloutState(state) }],
    checkedAt,
  );
}
