import {
  deriveCapabilitySmokeReadiness,
  type SmokeEvidenceRegistryInput,
} from '../access/operatorSmokeEvidenceRegistry';
import { evaluateLaunchGates, type CapabilityReadiness } from './launchReadiness';

/**
 * Phase 213 — Production Stage/Status reference approval, and
 * Phase 214 — Controlled New Deal create live enablement.
 *
 * PURE and fail-closed. Production references are resolved from CALLER-SUPPLIED
 * reference rows (no GUID is ever hardcoded here). A production-approved create is
 * authorized ONLY when exactly one active production-approved Stage and exactly one
 * active production-approved Status resolve; duplicate, missing, inactive, or
 * ambiguous rows fail closed. TEST rows can never authorize a production create.
 * Phase 214 then composes that with the governed create gates + Phase 211 smoke
 * evidence. No test creates a real deal; this module never writes.
 */

// Build-time launch gates — all OFF until intentionally enabled per environment.
export const NEW_DEAL_CREATE_ADAPTER_ENABLED = false;
export const NEW_DEAL_INTAKE_LIVE_CREATE_ENABLED = false;
export const BANKER_NEW_DEAL_CREATE_ENABLED = false;

export interface ReferenceRow {
  /** Record id (GUID) supplied by the caller — never hardcoded in this module. */
  readonly id: string;
  readonly name: string;
  readonly active: boolean;
  /** True only for rows an operator has approved for PRODUCTION (vs TEST). */
  readonly productionApproved: boolean;
}

export type ReferenceReadinessKind = 'ready-production' | 'ready-test' | 'blocked';

export interface ReferenceReadiness {
  readonly label: string;
  readonly kind: ReferenceReadinessKind;
  readonly blockers: string[];
  /** The single resolved active production id, or null. */
  readonly resolvedProductionId: string | null;
}

export function resolveReferenceReadiness(
  label: string,
  rows: ReadonlyArray<ReferenceRow>,
  opts: { serviceError?: boolean } = {},
): ReferenceReadiness {
  if (opts.serviceError === true) {
    return { label, kind: 'blocked', blockers: [`${label}: reference service error`], resolvedProductionId: null };
  }
  const activeProduction = rows.filter((r) => r.active && r.productionApproved);
  if (activeProduction.length === 1) {
    return { label, kind: 'ready-production', blockers: [], resolvedProductionId: activeProduction[0]!.id };
  }
  if (activeProduction.length > 1) {
    return { label, kind: 'blocked', blockers: [`${label}: duplicate active production references (${activeProduction.length})`], resolvedProductionId: null };
  }
  // Zero active production rows — explain why, fail closed for production.
  const inactiveProduction = rows.filter((r) => !r.active && r.productionApproved);
  if (inactiveProduction.length > 0) {
    return { label, kind: 'blocked', blockers: [`${label}: production reference exists but is inactive`], resolvedProductionId: null };
  }
  const activeTest = rows.filter((r) => r.active && !r.productionApproved);
  if (activeTest.length > 0) {
    return { label, kind: 'ready-test', blockers: [`${label}: only TEST references are active; production not approved`], resolvedProductionId: null };
  }
  return { label, kind: 'blocked', blockers: [`${label}: no active production reference`], resolvedProductionId: null };
}

export interface NewDealReferenceInput {
  readonly stageRows: ReadonlyArray<ReferenceRow>;
  readonly statusRows: ReadonlyArray<ReferenceRow>;
  readonly stageServiceError?: boolean;
  readonly statusServiceError?: boolean;
}

export interface NewDealReferenceReadiness {
  readonly stage: ReferenceReadiness;
  readonly status: ReferenceReadiness;
  /** True only when BOTH stage and status resolve to a single active production row. */
  readonly productionReferencesApproved: boolean;
  readonly resolvedStageId: string | null;
  readonly resolvedStatusId: string | null;
}

export function deriveNewDealReferenceReadiness(input: NewDealReferenceInput): NewDealReferenceReadiness {
  const stage = resolveReferenceReadiness('Stage', input.stageRows, { serviceError: input.stageServiceError });
  const status = resolveReferenceReadiness('Status', input.statusRows, { serviceError: input.statusServiceError });
  const productionReferencesApproved = stage.kind === 'ready-production' && status.kind === 'ready-production';
  return {
    stage,
    status,
    productionReferencesApproved,
    resolvedStageId: stage.resolvedProductionId,
    resolvedStatusId: status.resolvedProductionId,
  };
}

export interface NewDealCreateActivationInput {
  readonly createAdapterEnabled?: boolean;
  readonly liveCreateEnabled?: boolean;
  readonly bankerCreateEnabled?: boolean;
  readonly singleRecordSmokeEnabled: boolean;
  readonly actorSystemUserResolved: boolean;
  readonly actorAuthorized: boolean;
  readonly auditWired: boolean;
  readonly payloadValid: boolean;
  readonly references: NewDealReferenceInput;
  readonly evidence: SmokeEvidenceRegistryInput;
}

export interface NewDealCreateActivationReadiness {
  readonly readiness: CapabilityReadiness;
  readonly references: NewDealReferenceReadiness;
}

export function deriveNewDealCreateActivation(
  input: NewDealCreateActivationInput,
): NewDealCreateActivationReadiness {
  const references = deriveNewDealReferenceReadiness(input.references);
  const smoke = deriveCapabilitySmokeReadiness(input.evidence).find((r) => r.capability === 'new-deal-create')!;
  const readiness = evaluateLaunchGates('new-deal-create', [
    { name: 'NEW_DEAL_CREATE_ADAPTER_ENABLED', satisfied: (input.createAdapterEnabled ?? NEW_DEAL_CREATE_ADAPTER_ENABLED) === true },
    { name: 'NEW_DEAL_INTAKE_LIVE_CREATE_ENABLED', satisfied: (input.liveCreateEnabled ?? NEW_DEAL_INTAKE_LIVE_CREATE_ENABLED) === true },
    { name: 'BANKER_NEW_DEAL_CREATE_ENABLED', satisfied: (input.bankerCreateEnabled ?? BANKER_NEW_DEAL_CREATE_ENABLED) === true },
    { name: 'production references approved (Stage + Status)', satisfied: references.productionReferencesApproved, detail: [...references.stage.blockers, ...references.status.blockers].join('; ') || undefined },
    { name: 'audit wired', satisfied: input.auditWired === true },
    { name: 'actor systemuser resolved', satisfied: input.actorSystemUserResolved === true },
    { name: 'actor authorized', satisfied: input.actorAuthorized === true },
    { name: 'payload valid', satisfied: input.payloadValid === true },
    { name: 'singleRecordSmokeEnabled', satisfied: input.singleRecordSmokeEnabled === true },
    { name: 'create smoke passed + rollback verified', satisfied: !smoke.blocksGo, detail: smoke.blockReason ?? undefined },
  ]);
  return { readiness, references };
}
