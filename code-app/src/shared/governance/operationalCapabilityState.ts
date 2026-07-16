/**
 * Factory Arc Phase 2 — the two explicit state domains a banker-facing
 * surface and an admin/platform-operations surface are allowed to consume.
 *
 * `OperationalCapabilityState` answers ONE question: can this banker do this
 * thing right now, and if not, why (in plain operational language)? It is
 * derived from the banker's own authorization, live connectivity, and
 * runtime dependency availability — never from a global "is this feature
 * flag on" label, and never from release/launch posture (certification,
 * evidence, rollout phase).
 *
 * `ReleaseGovernanceState` is the release-engineering counterpart —
 * certification status, evidence references, who enabled a capability and
 * when. It is Admin / Platform Operations only.
 *
 * Banker/manager-facing models may import and consume ONLY
 * `OperationalCapabilityState` (and the pure helpers below). Importing
 * `ReleaseGovernanceState`, or reading a release-governance model directly
 * (fullSystemLaunchReadinessModel, operatorSmokeEvidenceRegistry, any
 * "launchReadiness"/"finalLaunch"-named module), from src/banker/**,
 * src/manager/**, src/deals/**, or src/portfolio/** is what
 * bankerFacingLaunchLanguageGuard.test.ts and
 * releaseGovernanceRuntimeImportGuard.test.ts exist to catch.
 */

export type CapabilityAvailability = 'available' | 'temporarily_unavailable' | 'not_configured';

export interface OperationalCapabilityState {
  readonly availability: CapabilityAvailability;
  /** Plain operational language — never "gated" / "pilot disabled" / "pending certification". */
  readonly reason?: string;
  /** The banker action this state affects, e.g. "Send borrower email". */
  readonly affectedAction?: string;
}

export type ReleaseCertificationStatus = 'not_required' | 'pending' | 'passed' | 'failed';

export interface EvidenceReference {
  readonly kind: string;
  readonly recordedAt: string;
  readonly location: string;
}

/** Admin / Platform Operations only. Never imported by a banker- or manager-facing model. */
export interface ReleaseGovernanceState {
  readonly certification: ReleaseCertificationStatus;
  readonly evidence?: readonly EvidenceReference[];
  readonly enabledBy?: string;
  readonly enabledOn?: string;
}

/** A capability the banker's action is available. */
export function availableCapability(): OperationalCapabilityState {
  return { availability: 'available' };
}

/**
 * A capability that exists but is not usable right now (e.g. the connector
 * is down, the actor can't be resolved). `reason` must be plain operational
 * language, not release-program vocabulary — see FORBIDDEN_REASON_PATTERNS
 * in operationalCapabilityState.test.ts for what that guard checks.
 */
export function temporarilyUnavailable(reason: string, affectedAction?: string): OperationalCapabilityState {
  return { availability: 'temporarily_unavailable', reason, affectedAction };
}

/** A capability whose prerequisite (a connector, a role entitlement) has never been set up. */
export function notConfigured(reason: string, affectedAction?: string): OperationalCapabilityState {
  return { availability: 'not_configured', reason, affectedAction };
}

export function isCapabilityAvailable(state: OperationalCapabilityState): boolean {
  return state.availability === 'available';
}

/** The one line a disabled banker action button may show. Never release-program vocabulary. */
export function describeUnavailability(state: OperationalCapabilityState): string | undefined {
  if (state.availability === 'available') return undefined;
  return state.reason ?? (state.availability === 'not_configured' ? 'This is not configured for your workspace.' : 'This is temporarily unavailable.');
}
