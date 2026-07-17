import {
  availableCapability,
  temporarilyUnavailable,
  type OperationalCapabilityState,
} from './operationalCapabilityState';

/**
 * Factory Arc Phase 6 — Normalize Capability Availability.
 *
 * Before this phase, each banker-facing action button derived its own
 * enabled/disabled boolean and its own copy independently — `BankerNewDealCreate.tsx`,
 * `CrmWriteActions.tsx`, `DealDocuments.tsx`, `RequestDocumentModal.tsx`, and
 * `DealStageProgressionCard.tsx` each had a slightly different shape (some a
 * plain boolean, some a boolean + tooltip-only reason, one — the mounted
 * `PortfolioLoanBoardingForm.tsx` — didn't check its own availability fact in
 * the `disabled` expression at all). `CapabilityAvailability` is the one
 * normalized result shape every one of them now derives from.
 *
 * A `CapabilityAvailability` is a snapshot, not a subscription: `checkedAt` is
 * the caller-injected time the underlying facts (identity resolution, schema
 * gate, feature flag) were read, so a stale check is visible in the record
 * itself rather than silently assumed current.
 *
 * `blockingReasons` uses a small closed taxonomy — never "gated" / "pilot
 * disabled" / "pending certification" (bankerFacingLaunchLanguageGuard.test.ts
 * and this file's own test enforce that):
 *   - 'permission'    the actor is identified but not authorized for this action
 *   - 'connection'    a live backend/transport call is required and unavailable
 *                      (e.g. a write adapter's runtime schema/connector gate)
 *   - 'audit-identity' no resolved actor identity exists to attribute the write to
 *   - 'connector'     a specific external integration (e.g. an email transport)
 *                      is not registered/configured
 *
 * Deliberately OUT of scope: per-deal workflow policy (has this deal cleared
 * exit criteria; does the credit-approval authority matrix allow this specific
 * transition). That answers "can THIS deal do X right now," a deal-state
 * question `dealBlockerModel.ts` / `stageTransitionPolicy.ts` /
 * `creditApprovalAuthority.ts` already own. `CapabilityAvailability` answers
 * only "is the X action itself live for ANY deal right now" — see
 * `deriveStageAdvancementAvailability` for where that line is drawn.
 */

export type CapabilityId =
  | 'document-requirement-writes'
  | 'borrower-request-sends'
  | 'new-deal-create'
  | 'stage-advancement'
  | 'portfolio-boarding'
  | 'crm-writes';

export type CapabilityBlockingReasonKind = 'permission' | 'connection' | 'audit-identity' | 'connector';

export interface CapabilityBlockingReason {
  readonly kind: CapabilityBlockingReasonKind;
  /** Plain operational language — never "gated" / "pilot disabled" / "pending certification". */
  readonly detail: string;
}

export interface CapabilityAvailability {
  readonly id: CapabilityId;
  readonly available: boolean;
  readonly blockingReasons: readonly CapabilityBlockingReason[];
  /** ISO-8601 UTC timestamp the underlying facts were read — injected, never Date.now() internally. */
  readonly checkedAt: string;
}

/** No blockers — the capability is live right now. */
export function capabilityAvailable(id: CapabilityId, checkedAt: string): CapabilityAvailability {
  return { id, available: true, blockingReasons: [], checkedAt };
}

/** One or more real blockers. `reasons` must be non-empty — an unavailable capability always says why. */
export function capabilityUnavailable(
  id: CapabilityId,
  reasons: readonly CapabilityBlockingReason[],
  checkedAt: string,
): CapabilityAvailability {
  return { id, available: false, blockingReasons: reasons, checkedAt };
}

/**
 * Project a `CapabilityAvailability` down to the `OperationalCapabilityState`
 * a button actually renders (available / one plain-language line). When
 * multiple reasons are present, the first is treated as the primary render
 * reason — the full list remains on the `CapabilityAvailability` record for
 * anything that wants all of them (e.g. a future admin diagnostic view).
 */
export function toOperationalCapabilityState(
  availability: CapabilityAvailability,
  affectedAction?: string,
): OperationalCapabilityState {
  if (availability.available) return availableCapability();
  const primary = availability.blockingReasons[0];
  return temporarilyUnavailable(
    primary?.detail ?? 'This is temporarily unavailable.',
    affectedAction,
  );
}
