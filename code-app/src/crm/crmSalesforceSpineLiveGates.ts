/**
 * Phase 193A — Salesforce CRM spine LIVE GATES.
 *
 * Pure, fail-closed gate evaluation for the live schema-apply and live
 * record-persistence paths. No capability is granted unless EVERY hard gate
 * proves true. Gate values are INJECTED (string config + booleans from the
 * existing identity/environment chain) — this module reads no env/secrets and
 * probes no Dataverse. String flags are checked against the literal "true" so an
 * unset/partial/typo'd value fails closed. The build-time
 * `CRM_LIVE_PERSISTENCE_ENABLED` boolean is never flipped here.
 */

export const CRM_SPINE_SCHEMA_APPLY_ACK = 'APPLY_CRM_SPINE_SCHEMA';
export const CRM_SPINE_PERSISTENCE_ACK = 'PERSIST_CRM_SPINE_RECORDS';

export type CrmSpineGateKind = 'schema-apply' | 'live-persistence';

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
  /** A deterministic correlation id must be provided for any live action. */
  correlationId?: string;
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

function hasCorrelationId(v: string | undefined): boolean {
  return typeof v === 'string' && v.trim().length > 0;
}

function evaluate(kind: CrmSpineGateKind, checks: CrmSpineGateCheck[]): CrmSpineGateEvaluation {
  const blockers = checks.filter((c) => !c.passed).map((c) => c.label);
  return { kind, satisfied: blockers.length === 0, checks, blockers };
}

/** The schema-apply gate. Requires both master switches, the exact ack, a present
 *  target environment, an authorized operator, AND a deterministic correlation id. */
export function evaluateCrmSpineSchemaApplyGate(
  config: CrmSpineLiveGateConfig = {},
): CrmSpineGateEvaluation {
  return evaluate('schema-apply', [
    { label: 'CRM_LIVE_SCHEMA_APPLY_ENABLED must equal "true"', passed: isTrueString(config.schemaApplyEnabled) },
    { label: 'CRM_LIVE_PERSISTENCE_ENABLED must equal "true"', passed: isTrueString(config.livePersistenceEnabled) },
    { label: `acknowledgement must equal "${CRM_SPINE_SCHEMA_APPLY_ACK}"`, passed: config.acknowledgement === CRM_SPINE_SCHEMA_APPLY_ACK },
    { label: 'target environment must be present', passed: config.targetEnvironmentPresent === true },
    { label: 'operator must be authorized', passed: config.operatorAuthorized === true },
    { label: 'deterministic correlation id must be provided', passed: hasCorrelationId(config.correlationId) },
  ]);
}

/** The live-persistence gate. Requires the persistence master switch, the exact
 *  persistence ack, a present target environment, an authorized operator, and a
 *  correlation id. (Schema readiness is verified separately.) */
export function evaluateCrmSpinePersistenceGate(
  config: CrmSpineLiveGateConfig = {},
): CrmSpineGateEvaluation {
  return evaluate('live-persistence', [
    { label: 'CRM_LIVE_PERSISTENCE_ENABLED must equal "true"', passed: isTrueString(config.livePersistenceEnabled) },
    { label: `acknowledgement must equal "${CRM_SPINE_PERSISTENCE_ACK}"`, passed: config.acknowledgement === CRM_SPINE_PERSISTENCE_ACK },
    { label: 'target environment must be present', passed: config.targetEnvironmentPresent === true },
    { label: 'operator must be authorized', passed: config.operatorAuthorized === true },
    { label: 'deterministic correlation id must be provided', passed: hasCorrelationId(config.correlationId) },
  ]);
}
