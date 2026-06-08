/**
 * Phase 140M-P — Portfolio Loan Boarding audit trail.
 *
 * Pure helpers that build audit-entry payloads for save/approve operations.
 * The actual write happens only through the Phase 140L adapter; this module
 * just shapes the payload honestly.
 *
 * Discipline (HARD rules — pinned by tests):
 *   - Pure. No IO, no clock (the caller injects the timestamp).
 *   - NEVER fabricates an actor. A missing actor stays undefined and is
 *     reported as unresolved.
 *   - Sensitive fields (tax id / SSN / EIN) are REDACTED in value summaries —
 *     no sensitive full value is ever placed in an audit summary.
 *   - Approval is BLOCKED when policy requires an actor and none is present.
 */

export interface AuditEntryInput {
  actor?: string;
  action: string;
  section?: string;
  fieldKey?: string;
  previousValue?: unknown;
  newValue?: unknown;
  reason?: string;
  evidenceLinkIds?: readonly string[];
  /** ISO timestamp injected by the caller (keeps this module pure). */
  timestamp: string;
}

export interface AuditEntryPayload {
  /** The actor, or undefined — never fabricated. */
  actor: string | undefined;
  actorResolved: boolean;
  action: string;
  section: string | undefined;
  fieldKey: string | undefined;
  timestamp: string;
  previousValueSummary: string | undefined;
  newValueSummary: string | undefined;
  reason: string | undefined;
  evidenceLinkIds: readonly string[];
  /** True when a sensitive value summary was redacted. */
  redacted: boolean;
}

export const REDACTED_PLACEHOLDER = 'REDACTED';

/** Field-key fragments that mark a value as sensitive and never summarized. */
export const SENSITIVE_FIELD_FRAGMENTS: readonly string[] = Object.freeze([
  'taxidentifier',
  'taxid',
  'ssn',
  'ein',
  'tin',
]);

export function isSensitiveFieldKey(fieldKey: string | undefined): boolean {
  if (!fieldKey) return false;
  const normalized = fieldKey.toLowerCase().replace(/[^a-z0-9]/g, '');
  return SENSITIVE_FIELD_FRAGMENTS.some((frag) => normalized.includes(frag));
}

function summarizeValue(value: unknown, redact: boolean): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (redact) return REDACTED_PLACEHOLDER;
  let text: string;
  if (typeof value === 'string') text = value;
  else if (typeof value === 'number' || typeof value === 'boolean') text = String(value);
  else if (Array.isArray(value)) text = `[${value.length} item(s)]`;
  else text = '[object]';
  // Keep summaries short; never dump large blobs.
  return text.length > 120 ? `${text.slice(0, 117)}…` : text;
}

function cleanActor(actor: string | undefined): string | undefined {
  if (typeof actor !== 'string') return undefined;
  const trimmed = actor.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export function buildAuditEntry(input: AuditEntryInput): AuditEntryPayload {
  const actor = cleanActor(input.actor);
  const redact = isSensitiveFieldKey(input.fieldKey);
  return {
    actor,
    actorResolved: actor !== undefined,
    action: input.action,
    section: input.section,
    fieldKey: input.fieldKey,
    timestamp: input.timestamp,
    previousValueSummary: summarizeValue(input.previousValue, redact),
    newValueSummary: summarizeValue(input.newValue, redact),
    reason: input.reason,
    evidenceLinkIds: input.evidenceLinkIds ?? [],
    redacted: redact,
  };
}

export interface ApprovalGateInput {
  actor?: string;
  /** When true, an actor is mandatory to approve. Defaults to true. */
  requireActor?: boolean;
}

export interface ApprovalGateResult {
  allowed: boolean;
  reason: string | undefined;
}

/**
 * Decide whether boarding approval may proceed. Fails closed: when an actor is
 * required and none is resolved, approval is blocked with an honest reason.
 */
export function canApproveBoarding(input: ApprovalGateInput): ApprovalGateResult {
  const requireActor = input.requireActor !== false;
  const actor = cleanActor(input.actor);
  if (requireActor && actor === undefined) {
    return {
      allowed: false,
      reason: 'Approval blocked: an authenticated actor is required and none is resolved.',
    };
  }
  return { allowed: true, reason: undefined };
}
