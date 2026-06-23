import {
  deriveCapabilitySmokeReadiness,
  SMOKE_CAPABILITIES,
  type SmokeCapability,
  type SmokeEvidenceRegistryInput,
  type CapabilitySmokeReadiness,
} from '../access/operatorSmokeEvidenceRegistry';
import { isLaunchReady, type CapabilityReadiness } from './launchReadiness';

/**
 * Phase 224 — Full-system activation evidence + final GO decision.
 *
 * PURE and fail-closed. Aggregates every write capability's readiness (each already
 * encodes its schema / audit / reference / flag blockers) with the Phase 211 smoke
 * evidence and the infrastructure gates (build, full suite, deployed-from-master,
 * operator signoff). GO requires EVERYTHING; NO_GO is the safe default. A capability
 * may be CONDITIONAL only when it is an explicitly documented, non-critical
 * deferral. Nothing is inferred from optimism.
 */

export type LaunchDecision = 'GO' | 'CONDITIONAL_GO' | 'NO_GO';

export interface CapabilityActivationSummary {
  readonly capability: SmokeCapability;
  readonly readiness: CapabilityReadiness;
  /** Critical capabilities can never be deferred. */
  readonly critical: boolean;
}

export interface FullSystemActivationInput {
  readonly capabilities: ReadonlyArray<CapabilityActivationSummary>;
  readonly evidence: SmokeEvidenceRegistryInput;
  readonly buildVerified: boolean;
  readonly fullSuiteGreen: boolean;
  readonly deployedFromMaster: boolean;
  readonly operatorSignoffCaptured: boolean;
  /** Capabilities intentionally gated, each with a documented reason. Non-critical only. */
  readonly documentedDeferrals: ReadonlyArray<{ capability: SmokeCapability; reason: string }>;
}

export interface FullSystemActivationResult {
  readonly decision: LaunchDecision;
  readonly reasons: string[];
  readonly enabledMatrix: ReadonlyArray<{ capability: SmokeCapability; level: 'launch-ready' | 'blocked' }>;
  readonly gatedMatrix: ReadonlyArray<{ capability: SmokeCapability; blockers: string[] }>;
  readonly deferredMatrix: ReadonlyArray<{ capability: SmokeCapability; reason: string }>;
  readonly smokeReadiness: ReadonlyArray<CapabilitySmokeReadiness>;
}

export function deriveFullSystemActivation(input: FullSystemActivationInput): FullSystemActivationResult {
  const reasons: string[] = [];
  const smokeReadiness = deriveCapabilitySmokeReadiness(input.evidence);
  const smokeByCap = new Map(smokeReadiness.map((s) => [s.capability, s]));
  const deferred = new Set(input.documentedDeferrals.map((d) => d.capability));

  // Infrastructure gates — any failure forces NO_GO.
  if (!input.buildVerified) reasons.push('build not verified');
  if (!input.fullSuiteGreen) reasons.push('full test suite not green');
  if (!input.deployedFromMaster) reasons.push('not deployed from master');
  if (!input.operatorSignoffCaptured) reasons.push('operator signoff not captured');

  const enabledMatrix: { capability: SmokeCapability; level: 'launch-ready' | 'blocked' }[] = [];
  const gatedMatrix: { capability: SmokeCapability; blockers: string[] }[] = [];

  // Every certified capability must be accounted for (present in the summaries).
  const summarized = new Set(input.capabilities.map((c) => c.capability));
  for (const cap of SMOKE_CAPABILITIES) {
    if (!summarized.has(cap) && !deferred.has(cap)) {
      reasons.push(`capability "${cap}" has no readiness summary`);
    }
  }

  for (const c of input.capabilities) {
    const ready = isLaunchReady(c.readiness);
    const smoke = smokeByCap.get(c.capability);
    const smokeOk = smoke ? !smoke.blocksGo : false;
    enabledMatrix.push({ capability: c.capability, level: c.readiness.level });

    const isDeferred = deferred.has(c.capability);
    if (isDeferred && c.critical) {
      reasons.push(`critical capability "${c.capability}" cannot be deferred`);
    }
    if (!isDeferred) {
      if (!ready) {
        gatedMatrix.push({ capability: c.capability, blockers: c.readiness.blockers });
        reasons.push(`capability "${c.capability}" is blocked: ${c.readiness.blockers.join('; ')}`);
      }
      if (!smokeOk) {
        reasons.push(`capability "${c.capability}" smoke: ${smoke?.blockReason ?? 'no evidence'}`);
      }
    }
  }

  const deferredMatrix = input.documentedDeferrals.map((d) => ({ capability: d.capability, reason: d.reason }));

  let decision: LaunchDecision;
  if (reasons.length > 0) {
    decision = 'NO_GO';
  } else if (deferredMatrix.length > 0) {
    decision = 'CONDITIONAL_GO';
  } else {
    decision = 'GO';
  }

  return { decision, reasons, enabledMatrix, gatedMatrix, deferredMatrix, smokeReadiness };
}
