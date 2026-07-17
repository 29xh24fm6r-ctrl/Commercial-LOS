import {
  capabilityAvailable,
  capabilityUnavailable,
  type CapabilityAvailability,
  type CapabilityId,
} from '../shared/governance/capabilityAvailability';

/**
 * Factory Arc Phase 6 — shared derivation for the two capabilities gated
 * purely by whether the current banker's Dataverse identity has resolved
 * (`document-requirement-writes`, `borrower-request-sends`). Both today are
 * blocked by exactly the same upstream fact — `BankerContext`'s
 * `systemUserId`/`writeDisabledReason` — so one function derives both rather
 * than duplicating the same audit-identity mapping twice.
 *
 * No feature flag or connector-readiness fact gates either capability's
 * pre-click availability today (borrower-request-sends' transport mode —
 * DRY_RUN / LIVE / HANDOFF — is a separate, already-honest post-send outcome
 * concern; see emailMode.ts and RequestDocumentModal.tsx's SendOutcomeBlock.
 * Deliberately left untouched this phase — see Phase 10, "Borrower
 * Communications Operationalization," which owns that surface).
 */
export function deriveBankerIdentityGatedAvailability(
  id: CapabilityId,
  banker: { systemUserId?: string; writeDisabledReason?: string },
  checkedAt: string,
): CapabilityAvailability {
  if (banker.systemUserId && !banker.writeDisabledReason) {
    return capabilityAvailable(id, checkedAt);
  }
  const detail = banker.writeDisabledReason ?? 'No Dataverse identity is available for the signed-in user.';
  return capabilityUnavailable(id, [{ kind: 'audit-identity', detail }], checkedAt);
}
