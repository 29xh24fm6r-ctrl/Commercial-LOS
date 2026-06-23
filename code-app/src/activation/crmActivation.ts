import {
  deriveCapabilitySmokeReadiness,
  type SmokeEvidenceRegistryInput,
} from '../access/operatorSmokeEvidenceRegistry';
import { evaluateLaunchGates, type CapabilityReadiness } from './launchReadiness';

/**
 * Phase 217 — CRM schema verification + persistence activation gate, and
 * Phase 218 — CRM writeback / onboarding adapter seam.
 *
 * PURE and fail-closed. CRM live persistence cannot be claimed ready until the
 * required generated services, columns, and relationships are verified present
 * (caller-supplied facts — code inspects what it can, never fabricates). The
 * writeback adapter is a SEAM over an injected transport + audit + timeline sink;
 * it returns schema_not_verified / disabled / unauthorized rather than a fake
 * success, and performs no real CRM write (no test writes CRM). This implies NO
 * external Salesforce / nCino sync.
 */

export const CRM_LIVE_PERSISTENCE_ENABLED = false;
export const CRM_CONTACT_EDITING_ENABLED = false;
export const CRM_VENDOR_EDITING_ENABLED = false;
export const CRM_TIMELINE_ENABLED = false;

export interface SchemaCheck {
  readonly label: string;
  readonly present: boolean;
}

export interface CrmSchemaFacts {
  /** Required generated services present (organizations, people, contact points, relationships, …). */
  readonly services: ReadonlyArray<SchemaCheck>;
  /** Required columns present. */
  readonly columns: ReadonlyArray<SchemaCheck>;
  /** Required relationships present. */
  readonly relationships: ReadonlyArray<SchemaCheck>;
}

export interface CrmSchemaGate {
  readonly readiness: CapabilityReadiness;
  readonly verified: boolean;
  readonly missing: string[];
}

export function deriveCrmSchemaGate(facts: CrmSchemaFacts): CrmSchemaGate {
  const all = [
    ...facts.services.map((c) => ({ ...c, kind: 'service' })),
    ...facts.columns.map((c) => ({ ...c, kind: 'column' })),
    ...facts.relationships.map((c) => ({ ...c, kind: 'relationship' })),
  ];
  const missing = all.filter((c) => !c.present).map((c) => `${c.kind}: ${c.label}`);
  const readiness = evaluateLaunchGates(
    'crm-schema',
    all.map((c) => ({ name: `${c.kind} ${c.label}`, satisfied: c.present })),
  );
  // Require at least one declared check so an empty facts set never reads "verified".
  const verified = all.length > 0 && missing.length === 0;
  return { readiness, verified, missing };
}

export interface CrmPersistenceActivationInput {
  readonly schema: CrmSchemaFacts;
  readonly livePersistenceEnabled?: boolean;
  readonly actorAuthorized: boolean;
  readonly transportInjected: boolean;
  readonly auditWired: boolean;
  readonly singleRecordSmokeEnabled: boolean;
  readonly evidence: SmokeEvidenceRegistryInput;
}

export function deriveCrmPersistenceActivation(input: CrmPersistenceActivationInput): { readiness: CapabilityReadiness; schema: CrmSchemaGate } {
  const schema = deriveCrmSchemaGate(input.schema);
  const smoke = deriveCapabilitySmokeReadiness(input.evidence).find((r) => r.capability === 'crm-writeback')!;
  const readiness = evaluateLaunchGates('crm-writeback', [
    { name: 'CRM schema verified', satisfied: schema.verified, detail: schema.missing.join('; ') || undefined },
    { name: 'CRM_LIVE_PERSISTENCE_ENABLED', satisfied: (input.livePersistenceEnabled ?? CRM_LIVE_PERSISTENCE_ENABLED) === true },
    { name: 'actor authorized', satisfied: input.actorAuthorized === true },
    { name: 'transport injected', satisfied: input.transportInjected === true },
    { name: 'audit sink present', satisfied: input.auditWired === true },
    { name: 'singleRecordSmokeEnabled', satisfied: input.singleRecordSmokeEnabled === true },
    { name: 'CRM smoke passed + rollback verified', satisfied: !smoke.blocksGo, detail: smoke.blockReason ?? undefined },
  ]);
  return { readiness, schema };
}

// ---------------------------------------------------------------------------
// Phase 218 — CRM writeback adapter seam
// ---------------------------------------------------------------------------

export type CrmEntity = 'organization' | 'person' | 'contact-point' | 'relationship';

export type CrmWritebackOutcome =
  | 'written'
  | 'disabled'
  | 'unauthorized'
  | 'schema_not_verified'
  | 'validation_error'
  | 'write_failed'
  | 'audit_failed_partial_success'
  | 'timeline_failed_partial_success';

export interface CrmWriteTransport {
  create(entity: CrmEntity, record: Record<string, unknown>): Promise<{ ok: boolean; id?: string; error?: string }>;
}
export interface CrmAuditSink {
  write(a: { correlationId: string; actorPlatformUserId: string; entity: CrmEntity; recordId: string | null; outcome: CrmWritebackOutcome }): Promise<{ ok: boolean; error?: string }>;
}
export interface CrmTimelineSink {
  write(a: { correlationId: string; entity: CrmEntity; recordId: string }): Promise<{ ok: boolean; error?: string }>;
}

export interface CrmWritebackInput {
  readonly entity: CrmEntity;
  readonly record: Record<string, unknown>;
  readonly enabled?: boolean;
  readonly actorAuthorized: boolean;
  readonly schemaVerified: boolean;
  readonly correlationId: string;
  readonly requiredFields: ReadonlyArray<string>;
  readonly transport?: CrmWriteTransport;
  readonly auditSink?: CrmAuditSink;
  readonly timelineSink?: CrmTimelineSink;
  /** Timeline is optional; only written when enabled AND a sink is present. */
  readonly timelineEnabled?: boolean;
}

export interface CrmWritebackResult {
  readonly outcome: CrmWritebackOutcome;
  readonly recordId: string | null;
  readonly correlationId: string;
  readonly blockedReason: string | null;
}

export async function crmWriteback(input: CrmWritebackInput): Promise<CrmWritebackResult> {
  const r = (outcome: CrmWritebackOutcome, blockedReason: string | null, recordId: string | null = null): CrmWritebackResult => ({
    outcome, recordId, correlationId: input.correlationId, blockedReason,
  });
  if ((input.enabled ?? CRM_LIVE_PERSISTENCE_ENABLED) !== true) return r('disabled', 'CRM live persistence is disabled.');
  if (input.actorAuthorized !== true) return r('unauthorized', 'Actor is not authorized for CRM writeback.');
  if (input.schemaVerified !== true || !input.transport || !input.auditSink) return r('schema_not_verified', 'CRM schema not verified or transport/audit unavailable.');
  if (!input.correlationId) return r('validation_error', 'Missing correlationId.');
  const missing = input.requiredFields.filter((f) => input.record[f] === undefined || input.record[f] === null || input.record[f] === '');
  if (missing.length > 0) return r('validation_error', `Missing required field(s): ${missing.join(', ')}.`);

  const w = await input.transport.create(input.entity, input.record);
  if (!w.ok) return r('write_failed', w.error ?? 'crm_write_failed');
  const recordId = w.id ?? null;

  const a = await input.auditSink.write({ correlationId: input.correlationId, actorPlatformUserId: '', entity: input.entity, recordId, outcome: 'written' });
  if (!a.ok) return r('audit_failed_partial_success', 'CRM record written but audit failed.', recordId);

  if ((input.timelineEnabled ?? CRM_TIMELINE_ENABLED) === true && input.timelineSink && recordId) {
    const t = await input.timelineSink.write({ correlationId: input.correlationId, entity: input.entity, recordId });
    if (!t.ok) return r('timeline_failed_partial_success', 'CRM record written + audited but timeline failed.', recordId);
  }
  return r('written', null, recordId);
}
