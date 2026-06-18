/**
 * Phase 193 — Salesforce CRM spine AUDIT.
 *
 * Deterministic audit-payload builder for every live (and dry-run) CRM mutation
 * path. Pure: no IO, no clock read, no id generation — the correlation id, actor,
 * and timestamp are all PROVIDED by the caller so the payload is reproducible and
 * never fabricated. Same input → same payload.
 */

export type CrmSpineAuditAction =
  | 'schema-inspect'
  | 'schema-plan'
  | 'schema-dry-run-apply'
  | 'schema-live-apply'
  | 'record-create'
  | 'record-update'
  | 'record-skip'
  | 'new-deal-link';

export interface CrmSpineSourceFactRef {
  statement: string;
  sourceLogicalName: string | null;
  sourceRecordId: string | null;
}

export interface CrmSpineAuditPayload {
  correlationId: string;
  /** Operator/system actor — provided by the caller, never invented. */
  actor: string;
  targetEntity: string;
  targetRecordId: string | null;
  action: CrmSpineAuditAction;
  /** The structured outcome string from the mutation path. */
  outcome: string;
  /** Whether this was a dry-run (no live mutation). */
  dryRun: boolean;
  /** Provenance the mutation was grounded in. */
  sourceFacts: CrmSpineSourceFactRef[];
  /** Caller-supplied timestamp (ISO string), or null when not provided. */
  occurredAt: string | null;
  error: string | null;
}

export interface CrmSpineAuditInput {
  correlationId: string;
  actor: string;
  targetEntity: string;
  targetRecordId?: string | null;
  action: CrmSpineAuditAction;
  outcome: string;
  dryRun: boolean;
  sourceFacts?: CrmSpineSourceFactRef[];
  occurredAt?: string | null;
  error?: string | null;
}

/**
 * Build a deterministic audit payload. The actor and correlation id are
 * required; a blank actor is itself an audit defect, so it is preserved as-is
 * (callers must supply a real actor) rather than substituted with a default.
 */
export function buildCrmSpineAuditPayload(input: CrmSpineAuditInput): CrmSpineAuditPayload {
  return {
    correlationId: input.correlationId,
    actor: input.actor,
    targetEntity: input.targetEntity,
    targetRecordId: input.targetRecordId ?? null,
    action: input.action,
    outcome: input.outcome,
    dryRun: input.dryRun,
    sourceFacts: (input.sourceFacts ?? []).map((f) => ({ ...f })),
    occurredAt: input.occurredAt ?? null,
    error: input.error ?? null,
  };
}

/** True when a payload carries enough to be a valid audit record. */
export function isCompleteCrmSpineAudit(payload: CrmSpineAuditPayload): boolean {
  return (
    payload.correlationId.trim().length > 0 &&
    payload.actor.trim().length > 0 &&
    payload.targetEntity.trim().length > 0
  );
}
