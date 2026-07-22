import { CRM_ENTITIES, type CrmDataversePayload } from './crmDataverseMapper';
import { CRM_FEATURE_FLAG_DEFAULTS } from './crmFeatureFlags';

/**
 * Phase 237G — governed INTERNAL OGB CRM writeback adapter.
 *
 * The certified live-safe CRM write path. It writes ONLY internal OGB CRM entities
 * (the cr664_crm* allow-list in CRM_ENTITIES) with allow-listed payloads produced by
 * the existing crmDataverseMapper. It is NOT a broad sync engine and has NO external
 * CRM-platform dependency — it persists internal relationship records only.
 *
 *   - DEFAULT-OFF (CRM_LIVE_PERSISTENCE_ENABLED) and fail-closed.
 *   - Allow-listed ENTITIES only (writes to any other table are rejected).
 *   - Rejects raw sensitive identifiers (tax id / SSN / TIN / EIN) — never persisted.
 *   - Explicit-action: the caller invokes a single write; there is no loop/sync.
 *   - Injected transport (no SDK in the static graph) + audit on every write. A
 *     transport failure surfaces as `failed`, never a fake success.
 */

export type CrmWritebackOutcome =
  | { kind: 'written'; entityName: string; id: string | null }
  | { kind: 'disabled'; detail: string }
  | { kind: 'unauthorized'; detail: string }
  | { kind: 'disallowed_entity'; detail: string }
  | { kind: 'disallowed_field'; detail: string }
  | { kind: 'validation_error'; detail: string }
  | { kind: 'dependency_not_ready'; detail: string }
  | { kind: 'failed'; detail: string };

export interface CrmWriteTransport {
  create(entityName: string, fields: Record<string, unknown>): Promise<{ ok: boolean; id?: string; error?: string }>;
}
export interface CrmWriteAuditSink {
  write(audit: { correlationId: string; actorUpn: string; entityName: string; recordId: string | null; outcome: CrmWritebackOutcome['kind'] }): Promise<{ ok: boolean; error?: string }>;
}

export interface CrmWritebackInput {
  /** Defaults to CRM_LIVE_PERSISTENCE_ENABLED (false). */
  readonly enabled?: boolean;
  readonly authorized: boolean;
  readonly actorUpn: string;
  readonly correlationId: string;
  /** A payload from crmDataverseMapper (entityName + allow-listed fields). */
  readonly payload: CrmDataversePayload;
  readonly transport?: CrmWriteTransport;
  readonly auditSink?: CrmWriteAuditSink;
}

const ALLOWED_ENTITIES: ReadonlySet<string> = new Set(Object.values(CRM_ENTITIES));
const FORBIDDEN_SENSITIVE_KEY = /^(tax.?id|taxidentifier|ssn|tin|ein|fulltaxid)$/i;

export async function crmWriteback(input: CrmWritebackInput): Promise<CrmWritebackOutcome> {
  const enabled = input.enabled ?? Boolean(CRM_FEATURE_FLAG_DEFAULTS.CRM_LIVE_PERSISTENCE_ENABLED);
  // Remediation 2026-07-22 (Workstream G) — banker-safe copy; never the raw internal flag name.
  if (!enabled) return { kind: 'disabled', detail: 'CRM writeback is not enabled yet; no change was made.' };
  if (input.authorized !== true) return { kind: 'unauthorized', detail: 'Actor is not authorized for CRM writeback.' };
  if (!input.actorUpn || !input.correlationId) return { kind: 'validation_error', detail: 'Missing actorUpn or correlationId.' };

  const { entityName, fields } = input.payload;
  // Allow-listed internal CRM entities ONLY — no external/broad targets.
  if (!ALLOWED_ENTITIES.has(entityName)) {
    return { kind: 'disallowed_entity', detail: `Entity "${entityName}" is not an internal OGB CRM writeback target.` };
  }
  if (!fields || Object.keys(fields).length === 0) {
    return { kind: 'validation_error', detail: 'No fields to write.' };
  }
  // Reject raw sensitive identifiers — tax identity is a presence flag, never a value.
  for (const [key, value] of Object.entries(fields)) {
    if (FORBIDDEN_SENSITIVE_KEY.test(key) && typeof value === 'string' && value.trim() !== '') {
      return { kind: 'disallowed_field', detail: `Field "${key}" is a raw sensitive identifier and must never be persisted.` };
    }
  }
  if (!input.transport || !input.auditSink) {
    return { kind: 'dependency_not_ready', detail: 'No live CRM transport/audit sink is injected.' };
  }

  const res = await input.transport.create(entityName, fields);
  if (!res.ok) {
    await input.auditSink.write({ correlationId: input.correlationId, actorUpn: input.actorUpn, entityName, recordId: null, outcome: 'failed' });
    return { kind: 'failed', detail: res.error ?? 'crm_write_failed' };
  }
  const recordId = res.id ?? null;
  await input.auditSink.write({ correlationId: input.correlationId, actorUpn: input.actorUpn, entityName, recordId, outcome: 'written' });
  return { kind: 'written', entityName, id: recordId };
}
