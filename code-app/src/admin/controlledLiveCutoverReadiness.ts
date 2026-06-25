import {
  deriveProductionEnvironmentVerification,
  DOMAIN_LABELS,
} from './productionEnvironmentVerification';
import {
  hydrateVerifiedCrmSchemaState,
  hydrateVerifiedBoardingSchemaState,
  CURRENT_CRM_VERIFICATION_EVIDENCE,
  CURRENT_PORTFOLIO_VERIFICATION_EVIDENCE,
} from './runtimeVerifiedSchemaBridge';

/**
 * Phase 245 — Controlled live gate cutover readiness ledger (READ-ONLY).
 *
 * For the three domains whose technical prerequisites read PASS (CRM writeback,
 * portfolio boarding, stage advancement), this records the controlled-cutover
 * checklist and ties the live decision to the fail-closed Phase 241 verification.
 *
 * A cutover is COMPLETE (and the gate may be flipped) only when ALL hold:
 *   1. technical prerequisites PASS (generated services + data sources registered),
 *   2. the governed adapter is proven on the success/guardrail/rollback paths
 *      (Phase 245 cutover smoke tests),
 *   3. an operator-injected verified live-schema state meets the plan (not faked),
 *   4. a controlled operator production smoke is recorded, and
 *   5. the governed gate flag is flipped.
 *
 * Items 3–4 are operator-owned environment evidence. The recorded verification shows
 * the live Dataverse schema is NOT yet verified (verify-full-schema reports live=0/0)
 * and no production smoke is recorded, so liveSchemaVerified + operatorSmokeRecorded
 * default false. They MUST be set true only by transcribing real recorded evidence,
 * never to make the dashboard green. Until then every gate stays controlled and
 * cutover stays incomplete — no fake activation.
 */

export const CUTOVER_DOMAIN_KEYS = ['crmWriteback', 'portfolioBoarding', 'stageAdvancement'] as const;
export type CutoverDomainKey = (typeof CUTOVER_DOMAIN_KEYS)[number];

/**
 * Technical prerequisites PASS (verify-crm-schema / verify-portfolio-boarding-schema /
 * verify-stage-advancement-sinks at commit 0d5f303) and the governed adapter is proven
 * by the Phase 245 cutover smoke tests. Both are repo-verifiable and true.
 */
export const CUTOVER_TECHNICAL_PREREQUISITES_PASS: Record<CutoverDomainKey, boolean> = Object.freeze({
  crmWriteback: true,
  portfolioBoarding: true,
  stageAdvancement: true,
});
export const CUTOVER_GOVERNED_ADAPTER_PROVEN: Record<CutoverDomainKey, boolean> = Object.freeze({
  crmWriteback: true,
  portfolioBoarding: true,
  stageAdvancement: true,
});

/**
 * Live-schema verification is DERIVED from the Phase 246 runtime verified-state bridge
 * applied to the actual recorded verifier evidence — never hardcoded. The current
 * evidence reports live=0/0 (the live check did not run), so the bridge fails closed and
 * every value resolves false. Stage advancement is not schema-gated (its readiness is the
 * sink/ordering contract), so it is tracked separately and stays false here.
 */
export function deriveLiveSchemaVerified(): Record<CutoverDomainKey, boolean> {
  return {
    crmWriteback: hydrateVerifiedCrmSchemaState(CURRENT_CRM_VERIFICATION_EVIDENCE).hydrated,
    portfolioBoarding: hydrateVerifiedBoardingSchemaState(CURRENT_PORTFOLIO_VERIFICATION_EVIDENCE).hydrated,
    stageAdvancement: false,
  };
}
export const CUTOVER_OPERATOR_SMOKE_RECORDED: Record<CutoverDomainKey, boolean> = Object.freeze({
  crmWriteback: false,
  portfolioBoarding: false,
  stageAdvancement: false,
});

const ROLLBACK_CONTROL: Record<CutoverDomainKey, string> = {
  crmWriteback: 'Set CRM_LIVE_PERSISTENCE_ENABLED to false.',
  portfolioBoarding: 'Set PORTFOLIO_BOARDING_LIVE_PERSISTENCE_ENABLED + PORTFOLIO_BOARDING_ROUTE_ENABLED to false.',
  stageAdvancement: 'Set the governed stage-advancement gate (ADVANCE_STAGE_WRITE_ENABLED / AUTO_STAGE_ADVANCE_ENABLED) to false.',
};

const REMAINING_EVIDENCE: Record<CutoverDomainKey, readonly string[]> = {
  crmWriteback: [
    'Inject a VerifiedCrmSchemaState meeting the plan table/column counts with zero conflicts (live Dataverse schema is currently unverified — verify-full-schema reports live=0/0).',
    'Record a controlled CRM single-record writeback smoke with rollback evidence, then flip CRM_LIVE_PERSISTENCE_ENABLED under the governed cutover.',
  ],
  portfolioBoarding: [
    'Inject a VerifiedBoardingSchemaState meeting the 13-table / required-relationship plan with zero conflicts (live=0/0).',
    'Enable the route for an authorized operator, record a controlled single-record boarding + failure smoke, then flip PORTFOLIO_BOARDING_LIVE_PERSISTENCE_ENABLED.',
  ],
  stageAdvancement: [
    'Inject the live stage transport + audit + timeline sinks and prove the ordering contract against live stage rows.',
    'Record controlled advancement + blocked-transition + update-failed smokes, then flip the governed explicit-advancement gate. Production use is governed explicit advancement, never uncontrolled automatic movement.',
  ],
};

export interface CutoverDomainReadiness {
  readonly key: CutoverDomainKey;
  readonly label: string;
  readonly technicalPrerequisitesPass: boolean;
  readonly governedAdapterProven: boolean;
  readonly liveSchemaVerified: boolean;
  readonly operatorSmokeRecorded: boolean;
  /** From the fail-closed Phase 241 verification. */
  readonly gateFlagOn: boolean;
  readonly enabled: boolean;
  /** True only when every prerequisite holds AND the gate is on AND the domain is live. */
  readonly cutoverComplete: boolean;
  readonly remainingEvidence: readonly string[];
  readonly rollbackControl: string;
}

export interface ControlledLiveCutoverReadiness {
  readonly domains: readonly CutoverDomainReadiness[];
  /** Domains whose cutover is fully complete (gate may be / is flipped). */
  readonly cutoverCompleteCount: number;
  /** Live domains across all six (from the verification). */
  readonly enabledCount: number;
  /** True only when every cutover domain is complete AND full launch is ready. Never faked. */
  readonly deploymentAllowed: boolean;
  /** Tied to the single source of truth — never set independently. */
  readonly fullLaunchAchieved: boolean;
  readonly summary: string;
}

export function deriveControlledLiveCutoverReadiness(): ControlledLiveCutoverReadiness {
  const verification = deriveProductionEnvironmentVerification();
  const verByKey = new Map(verification.domains.map((d) => [d.key, d]));
  const liveSchemaVerifiedByKey = deriveLiveSchemaVerified();

  const domains: CutoverDomainReadiness[] = CUTOVER_DOMAIN_KEYS.map((key) => {
    const ver = verByKey.get(key)!;
    const technicalPrerequisitesPass = CUTOVER_TECHNICAL_PREREQUISITES_PASS[key];
    const governedAdapterProven = CUTOVER_GOVERNED_ADAPTER_PROVEN[key];
    const liveSchemaVerified = liveSchemaVerifiedByKey[key];
    const operatorSmokeRecorded = CUTOVER_OPERATOR_SMOKE_RECORDED[key];
    const cutoverComplete =
      technicalPrerequisitesPass &&
      governedAdapterProven &&
      liveSchemaVerified &&
      operatorSmokeRecorded &&
      ver.gateFlagOn &&
      ver.enabled;
    return {
      key,
      label: DOMAIN_LABELS[key],
      technicalPrerequisitesPass,
      governedAdapterProven,
      liveSchemaVerified,
      operatorSmokeRecorded,
      gateFlagOn: ver.gateFlagOn,
      enabled: ver.enabled,
      cutoverComplete,
      remainingEvidence: cutoverComplete ? [] : REMAINING_EVIDENCE[key],
      rollbackControl: ROLLBACK_CONTROL[key],
    };
  });

  const cutoverCompleteCount = domains.filter((d) => d.cutoverComplete).length;
  const deploymentAllowed = cutoverCompleteCount === CUTOVER_DOMAIN_KEYS.length && verification.fullLaunchReady;

  const summary = deploymentAllowed
    ? 'All controlled-cutover domains are complete and full launch is ready.'
    : `Controlled cutover PREPARED, not complete: technical prerequisites PASS and the governed adapters are proven (Phase 245 smokes), but ${domains.filter((d) => !d.cutoverComplete).length} domain(s) still need an operator-injected verified live-schema state + a recorded production smoke before the gate flip. No gate flipped; deployment withheld.`;

  return {
    domains,
    cutoverCompleteCount,
    enabledCount: verification.enabledCount,
    deploymentAllowed,
    fullLaunchAchieved: verification.fullLaunchReady,
    summary,
  };
}
