/**
 * Phase 193 — Salesforce CRM spine LIVE GATES.
 *
 * Pure, fail-closed gate evaluation for the live schema-apply and live
 * record-persistence paths. No capability is granted unless EVERY hard gate
 * proves true. The gate values are INJECTED (string config + booleans from the
 * existing identity/environment chain) — this module never reads env/secrets and
 * never probes Dataverse.
 *
 * The string flags are checked against the literal "true" so an unset / partial
 * / typo'd value fails closed. The build-time `CRM_LIVE_PERSISTENCE_ENABLED`
 * boolean stays false and is NOT flipped here.
 */

/** Operator acknowledgement strings — exact-match required. */
export const CRM_SPINE_SCHEMA_APPLY_ACK = 'APPLY_CRM_SPINE_SCHEMA';
export const CRM_SPINE_PERSISTENCE_ACK = 'PERSIST_CRM_SPINE_RECORDS';

export type CrmSpineGateKind = 'schema-apply' | 'live-persistence';

/**
 * Injected gate configuration. String flags must equal "true"; the boolean
 * confirmations come from the environment/identity chain the caller already
 * resolved. Everything is optional and defaults to fail-closed.
 */
export interface CrmSpineLiveGateConfig {
  /** Live schema apply master switch — must be the string "true". */
  schemaApplyEnabled?: string;
  /** Live persistence master switch — must be the string "true". */
  livePersistenceEnabled?: string;
  /** Operator acknowledgement phrase (exact match to the action's ack). */
  acknowledgement?: string;
  /** Confirmation the target org/environment is resolved and present. */
  targetEnvironmentPresent?: boolean;
  /** Operator is authorized per the existing identity/entitlement chain. */
  operatorAuthorized?: boolean;
}

export interface CrmSpineGateCheck {
  label: string;
  passed: boolean;
}

export interface CrmSpineGateEvaluation {
  kind: CrmSpineGateKind;
  satisfied: boolean;
  checks: CrmSpineGateCheck[];
  blockers: string[];
}

function isTrueString(v: string | undefined): boolean {
  return v === 'true';
}

function evaluate(
  kind: CrmSpineGateKind,
  checks: CrmSpineGateCheck[],
): CrmSpineGateEvaluation {
  const blockers = checks.filter((c) => !c.passed).map((c) => c.label);
  return { kind, satisfied: blockers.length === 0, checks, blockers };
}

/**
 * The schema-apply gate. Requires BOTH master switches, the exact schema-apply
 * acknowledgement, a present target environment, and an authorized operator.
 */
export function evaluateCrmSpineSchemaApplyGate(
  config: CrmSpineLiveGateConfig = {},
): CrmSpineGateEvaluation {
  return evaluate('schema-apply', [
    { label: 'CRM_LIVE_SCHEMA_APPLY_ENABLED must equal "true"', passed: isTrueString(config.schemaApplyEnabled) },
    { label: 'CRM_LIVE_PERSISTENCE_ENABLED must equal "true"', passed: isTrueString(config.livePersistenceEnabled) },
    { label: `acknowledgement must equal "${CRM_SPINE_SCHEMA_APPLY_ACK}"`, passed: config.acknowledgement === CRM_SPINE_SCHEMA_APPLY_ACK },
    { label: 'target environment must be present', passed: config.targetEnvironmentPresent === true },
    { label: 'operator must be authorized', passed: config.operatorAuthorized === true },
  ]);
}

/**
 * The live-persistence gate. Requires the persistence master switch, the exact
 * persistence acknowledgement, a present target environment, and an authorized
 * operator. (Schema readiness is verified separately by the runtime schema gate.)
 */
export function evaluateCrmSpinePersistenceGate(
  config: CrmSpineLiveGateConfig = {},
): CrmSpineGateEvaluation {
  return evaluate('live-persistence', [
    { label: 'CRM_LIVE_PERSISTENCE_ENABLED must equal "true"', passed: isTrueString(config.livePersistenceEnabled) },
    { label: `acknowledgement must equal "${CRM_SPINE_PERSISTENCE_ACK}"`, passed: config.acknowledgement === CRM_SPINE_PERSISTENCE_ACK },
    { label: 'target environment must be present', passed: config.targetEnvironmentPresent === true },
    { label: 'operator must be authorized', passed: config.operatorAuthorized === true },
  ]);
}
