/**
 * Phase 174A -- Auto-stage advancement adapter (DISABLED by default).
 *
 * Controlled advance from the approved create stage to an approved next stage,
 * only when explicitly enabled and every readiness/policy/stage-match check
 * passes. Disabled by default. Resolves source/target stages by approved
 * code/name (never a hardcoded GUID); refuses if the current stage changed
 * unexpectedly or required readiness is unmet. This does NOT reuse the separate
 * Advance Stage progression feature; it is its own gated step.
 */

import type { AutoStageAdvanceOutcome } from './dealOriginationOutcomes';
import {
  isAutoStageAdvanceEnabled,
  type DealOriginationFeatureFlagConfig,
} from './dealOriginationFeatureFlags';

const MODULE = 'auto-stage-advance';

export interface AutoStageAdvanceInput {
  readonly dealId: string | undefined;
  readonly actorSystemUserId: string | undefined;
  readonly authorized: boolean;
  readonly correlationId: string;
  readonly config?: DealOriginationFeatureFlagConfig;
  /** The deal's current stage code, captured at create time. */
  readonly currentStageCode?: string;
  /** The approved source stage code this step is allowed to advance FROM. */
  readonly approvedSourceStageCode?: string;
  /** Resolved target stage bind (from the fail-closed resolver), or undefined. */
  readonly targetStageBind?: string;
  /** Whether required readiness (docs/tasks) for advancement is met. */
  readonly readinessMet?: boolean;
  /** Policy allows advancement. */
  readonly policyAllows?: boolean;
  /** Test-only gate override. Production never sets it (uses config). */
  readonly enabledOverride?: boolean;
}

/** Injected stage-write IO; only called after every gate passes. */
export type RunStageAdvance = (args: {
  dealId: string;
  targetStageBind: string;
  correlationId: string;
}) => Promise<{ ok: boolean; error?: string }>;

export async function runAutoStageAdvance(
  input: AutoStageAdvanceInput,
  runStageAdvance?: RunStageAdvance,
): Promise<AutoStageAdvanceOutcome> {
  const enabled = input.enabledOverride ?? isAutoStageAdvanceEnabled(input.config);
  if (!enabled) {
    return { module: MODULE, kind: 'disabled', detail: 'Auto-stage advance gate is off.' };
  }
  if (!input.dealId) {
    return { module: MODULE, kind: 'resolver_not_ready', detail: 'No created deal id.' };
  }
  if (!input.authorized || !input.actorSystemUserId) {
    return { module: MODULE, kind: 'unauthorized', detail: 'Actor not authorized.' };
  }
  if (input.policyAllows === false) {
    return { module: MODULE, kind: 'skipped_policy_blocked', detail: 'Policy blocks advancement.' };
  }
  if (input.readinessMet !== true) {
    return { module: MODULE, kind: 'skipped_not_ready', detail: 'Required readiness not met.' };
  }
  if (
    !input.currentStageCode ||
    !input.approvedSourceStageCode ||
    input.currentStageCode !== input.approvedSourceStageCode
  ) {
    return { module: MODULE, kind: 'skipped_stage_mismatch', detail: 'Current stage is not the approved source stage.' };
  }
  if (!input.targetStageBind || !runStageAdvance) {
    return { module: MODULE, kind: 'resolver_not_ready', detail: 'No approved target stage resolved.' };
  }
  try {
    const res = await runStageAdvance({
      dealId: input.dealId,
      targetStageBind: input.targetStageBind,
      correlationId: input.correlationId,
    });
    if (!res.ok) return { module: MODULE, kind: 'failed', detail: res.error ?? 'Stage advance failed.' };
    return { module: MODULE, kind: 'success', correlationId: input.correlationId };
  } catch (err) {
    return { module: MODULE, kind: 'failed', detail: err instanceof Error ? err.message : String(err) };
  }
}
