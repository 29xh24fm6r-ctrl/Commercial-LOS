/**
 * Phase 193I — CRM admin control model.
 *
 * Pure. Summarizes the live CRM control posture for an operator: schema-apply
 * gate status, persistence gate status, environment target, last operation, last
 * failure, partial-success records, recent correlation ids, and the
 * enabled/disabled state. It reads injected config only — no env/secret reads,
 * no Dataverse probe. It never enables anything; it only reports.
 */

import {
  evaluateCrmSpineSchemaApplyGate,
  evaluateCrmSpinePersistenceGate,
  type CrmSpineLiveGateConfig,
  type CrmSpineGateEvaluation,
} from './crmSalesforceSpineLiveGates';

export interface CrmAdminEnvironmentTarget {
  present: boolean;
  label: string | null;
}

export interface CrmAdminOperationRecord {
  label: string;
  outcome: string;
  correlationId: string | null;
}

export interface CrmAdminControlInput {
  schemaGateConfig?: CrmSpineLiveGateConfig;
  persistenceGateConfig?: CrmSpineLiveGateConfig;
  environmentTarget?: CrmAdminEnvironmentTarget;
  lastOperation?: CrmAdminOperationRecord | null;
  lastFailure?: CrmAdminOperationRecord | null;
  partialSuccesses?: CrmAdminOperationRecord[];
}

export type CrmAdminControlSummary = 'all-gates-open' | 'gates-closed' | 'partial-gates-open';

export interface CrmAdminControlState {
  schemaApplyGate: CrmSpineGateEvaluation;
  persistenceGate: CrmSpineGateEvaluation;
  liveSchemaApplyEnabled: boolean;
  livePersistenceEnabled: boolean;
  environment: CrmAdminEnvironmentTarget;
  lastOperation: CrmAdminOperationRecord | null;
  lastFailure: CrmAdminOperationRecord | null;
  partialSuccesses: CrmAdminOperationRecord[];
  recentCorrelationIds: string[];
  controlSummary: CrmAdminControlSummary;
  blockers: string[];
}

export function deriveCrmAdminControlState(input: CrmAdminControlInput): CrmAdminControlState {
  const schemaApplyGate = evaluateCrmSpineSchemaApplyGate(input.schemaGateConfig);
  const persistenceGate = evaluateCrmSpinePersistenceGate(input.persistenceGateConfig);
  const liveSchemaApplyEnabled = schemaApplyGate.satisfied;
  const livePersistenceEnabled = persistenceGate.satisfied;

  const lastOperation = input.lastOperation ?? null;
  const lastFailure = input.lastFailure ?? null;
  const partialSuccesses = input.partialSuccesses ?? [];

  const recentCorrelationIds = Array.from(
    new Set(
      [lastOperation, lastFailure, ...partialSuccesses]
        .map((o) => o?.correlationId)
        .filter((id): id is string => typeof id === 'string' && id.length > 0),
    ),
  );

  let controlSummary: CrmAdminControlSummary;
  if (liveSchemaApplyEnabled && livePersistenceEnabled) controlSummary = 'all-gates-open';
  else if (!liveSchemaApplyEnabled && !livePersistenceEnabled) controlSummary = 'gates-closed';
  else controlSummary = 'partial-gates-open';

  return {
    schemaApplyGate,
    persistenceGate,
    liveSchemaApplyEnabled,
    livePersistenceEnabled,
    environment: input.environmentTarget ?? { present: false, label: null },
    lastOperation,
    lastFailure,
    partialSuccesses,
    recentCorrelationIds,
    controlSummary,
    blockers: Array.from(new Set([...schemaApplyGate.blockers, ...persistenceGate.blockers])),
  };
}
