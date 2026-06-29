import {
  FINAL_LAUNCH_CAPABILITIES,
  FINAL_LAUNCH_TO_REGISTRY_CAPABILITY,
  isFinalLaunchSmokeGo,
  toOperatorSmokeEvidence,
  deriveEvidenceIntegrity,
  type FinalLaunchCapability,
  type FinalLaunchSmokeEvidence,
  type EvidenceIntegrityReport,
} from '../access/finalLaunchSmokeEvidence';
import { deriveCapabilitySmokeReadiness } from '../access/operatorSmokeEvidenceRegistry';
import {
  hydrateVerifiedCrmSchemaState,
  hydrateVerifiedBoardingSchemaState,
  CURRENT_CRM_VERIFICATION_EVIDENCE,
  CURRENT_PORTFOLIO_VERIFICATION_EVIDENCE,
} from '../admin/runtimeVerifiedSchemaBridge';
import {
  deriveProductionEnvironmentVerification,
  PRODUCTION_ENVIRONMENT_CERTIFICATION,
} from '../admin/productionEnvironmentVerification';

/**
 * Phase 256A — Final-launch readiness PROJECTION (PURE, read-only).
 *
 * Given the operator-recorded final-launch smoke records, this projects whether deployment
 * would be allowed: every remaining capability has a GO smoke (validated via the
 * operatorSmokeEvidenceRegistry — the single GO source) AND the CRM + portfolio backends are
 * hydrated AND New Deal create is certified.
 *
 * IMPORTANT: this is a PROJECTION, not an activation. It NEVER reads or flips the live gate
 * constants. The CURRENT enabledCount / fullLaunchAchieved continue to come from the
 * fail-closed productionEnvironmentVerification (driven by the real gate constants, all still
 * false except New Deal create), and are reported here unchanged. A gate is flipped only in a
 * later, separate phase once a real artifact exists — never by this module.
 */

export interface FinalLaunchCapabilityReadiness {
  readonly capability: FinalLaunchCapability;
  readonly registryCapability: string;
  readonly present: boolean;
  readonly smokeGo: boolean;
  readonly blockReason: string | null;
  /** Phase 1 — full integrity assessment (identity, machine proof, confidence, issues). */
  readonly integrity: EvidenceIntegrityReport | null;
  /** True when present but not accepted — surfaced as EVIDENCE_INSUFFICIENT in the panel. */
  readonly evidenceInsufficient: boolean;
}

export interface FinalLaunchReadiness {
  readonly capabilities: readonly FinalLaunchCapabilityReadiness[];
  readonly crmHydrated: boolean;
  readonly portfolioHydrated: boolean;
  readonly backendReady: boolean;
  readonly newDealCertified: boolean;
  readonly allCapabilitiesGo: boolean;
  /** Projection: deployment would be allowed once these gates are flipped on this evidence. */
  readonly deploymentAllowed: boolean;
  /** Projected live count if every GO capability's gate were flipped (New Deal + GO capabilities). */
  readonly projectedEnabledCount: number;
  readonly projectedFullLaunchAchieved: boolean;
  /** The REAL, current state from the fail-closed verification (gates not flipped here). */
  readonly currentEnabledCount: number;
  readonly currentFullLaunchAchieved: boolean;
  readonly summary: string;
}

export interface FinalLaunchReadinessInput {
  readonly records: readonly FinalLaunchSmokeEvidence[];
}

export function deriveFinalLaunchReadiness(input: FinalLaunchReadinessInput): FinalLaunchReadiness {
  // Latest valid record per capability (greatest completedAtIso wins; ties → later in array).
  const latestByCapability = new Map<FinalLaunchCapability, FinalLaunchSmokeEvidence>();
  for (const rec of input.records) {
    const existing = latestByCapability.get(rec.capability);
    if (!existing || rec.completedAtIso >= existing.completedAtIso) latestByCapability.set(rec.capability, rec);
  }

  // GO is decided by the registry (the single source of truth), fed the adapted records.
  const mapped = [...latestByCapability.values()].map(toOperatorSmokeEvidence);
  const registryReadiness = deriveCapabilitySmokeReadiness({ source: 'out-of-band', records: mapped });
  const registryByCap = new Map(registryReadiness.map((s) => [s.capability, s]));

  const capabilities: FinalLaunchCapabilityReadiness[] = FINAL_LAUNCH_CAPABILITIES.map((capability) => {
    const registryCapability = FINAL_LAUNCH_TO_REGISTRY_CAPABILITY[capability];
    const record = latestByCapability.get(capability);
    const present = record !== undefined;
    const reg = registryByCap.get(registryCapability);
    const integrity = record ? deriveEvidenceIntegrity(record) : null;
    // Belt-and-braces: require BOTH the registry GO and the strict (integrity-backed) predicate.
    const smokeGo = present && reg !== undefined && !reg.blocksGo && isFinalLaunchSmokeGo(record);
    const evidenceInsufficient = present && !smokeGo;
    let blockReason: string | null = null;
    if (!present) blockReason = 'No final-launch smoke artifact recorded.';
    else if (!smokeGo) {
      // Prefer the specific integrity issue (identity / machine proof) over the generic registry reason.
      blockReason = integrity?.issues[0] ?? reg?.blockReason ?? 'Smoke did not pass with verified readback/closure.';
    }
    return { capability, registryCapability, present, smokeGo, blockReason, integrity, evidenceInsufficient };
  });

  const crmHydrated = hydrateVerifiedCrmSchemaState(CURRENT_CRM_VERIFICATION_EVIDENCE).hydrated;
  const portfolioHydrated = hydrateVerifiedBoardingSchemaState(CURRENT_PORTFOLIO_VERIFICATION_EVIDENCE).hydrated;
  const backendReady = crmHydrated && portfolioHydrated;
  const newDealCertified = PRODUCTION_ENVIRONMENT_CERTIFICATION.newDealCreate === true;

  const allCapabilitiesGo = capabilities.every((c) => c.smokeGo);
  const deploymentAllowed = allCapabilitiesGo && backendReady && newDealCertified;

  // Current, real state — gates are not flipped by this module.
  const verification = deriveProductionEnvironmentVerification();
  const newDealEnabled = verification.domains.find((d) => d.key === 'newDealCreate')?.enabled === true;
  const goCount = capabilities.filter((c) => c.smokeGo).length;
  const projectedEnabledCount = (newDealEnabled ? 1 : 0) + goCount;
  const projectedFullLaunchAchieved = projectedEnabledCount === 6;

  const blocked = capabilities.filter((c) => !c.smokeGo).map((c) => c.capability);
  const summary = deploymentAllowed
    ? 'All five final-launch smokes validate GO and the backends are hydrated — deployment is permitted once the gates are flipped (separate governed step).'
    : `Final-launch deployment withheld: ${blocked.length} capability(ies) lack a GO smoke artifact (${blocked.join(', ') || 'none'})${backendReady ? '' : '; backend not fully hydrated'}. No gate flipped; current enabledCount=${verification.enabledCount}/6.`;

  return {
    capabilities,
    crmHydrated,
    portfolioHydrated,
    backendReady,
    newDealCertified,
    allCapabilitiesGo,
    deploymentAllowed,
    projectedEnabledCount,
    projectedFullLaunchAchieved,
    currentEnabledCount: verification.enabledCount,
    currentFullLaunchAchieved: verification.fullLaunchReady,
    summary,
  };
}
