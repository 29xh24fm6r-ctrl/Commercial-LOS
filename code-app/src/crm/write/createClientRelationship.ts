/**
 * Governed "create a CRM client relationship" workflow (DISABLED by default).
 *
 * The New Deal CRM-first flow (Step 1) is search-and-select-existing only. When
 * no cr664_clientrelationships record exists to pick, the banker is routed to
 * THIS controlled workflow to create one — its own governed path, never an
 * inline fabrication buried in deal creation.
 *
 * It follows the same discipline as the rest of the app's governed writes:
 *
 *   feature gate (off by default) → fail-closed authorization → required-field
 *   validation (client name + a valid borrower type) → create the
 *   cr664_clientrelationship → readback verification (the row must exist and
 *   carry the name we wrote) → CRM audit entry (actor + action + correlation id)
 *   → discriminated outcome.
 *
 * It fabricates nothing else: no contacts, organizations, roles, activities, or
 * Salesforce-style spine records. Pure over injected deps (SDK-free static
 * graph); a live factory wires the generated service via dynamic import.
 */

import { newCorrelationId } from '../../shared/governance/correlationId';
import { mapBusinessSafeError } from '../../shared/errors/businessSafeErrorMapping';
import { authGate, buildAuditPayload, type CrmActor, type WriteResult } from './crmWriteAdapter';

/**
 * The controlled client-relationship create workflow is OFF by default. Like
 * the New Deal create adapter, this phase ships the governed path + tests only;
 * enabling it live is a separate, certified change. The `enabled` dep is wired
 * to this constant by the live factory, so the workflow refuses before any IO.
 */
export const CREATE_CLIENT_RELATIONSHIP_ENABLED = false as const;

/**
 * Allowed borrower-type labels for a new client relationship, mapped to the
 * cr664_borrowertype option-set values (see Cr664_clientrelationshipsModel).
 * cr664_borrowertype is a REQUIRED column, so a valid type must be supplied.
 */
export const CLIENT_BORROWER_TYPES = Object.freeze({
  Individual: 788190000,
  LLC: 788190001,
  Corporation: 788190002,
  Partnership: 788190003,
  Trust: 788190004,
  Non_Profit: 788190005,
} as const);

export type ClientBorrowerType = keyof typeof CLIENT_BORROWER_TYPES;

export function isClientBorrowerType(v: string): v is ClientBorrowerType {
  return Object.prototype.hasOwnProperty.call(CLIENT_BORROWER_TYPES, v);
}

export interface CreateClientRelationshipInput extends CrmActor {
  /** cr664_clientname — required, non-blank. */
  readonly clientName: string;
  /** Borrower type label (required; validated against CLIENT_BORROWER_TYPES). */
  readonly borrowerType: string;
  readonly industry?: string;
  readonly headquartersAddress?: string;
  readonly generalNotes?: string;
  /** Optional cr664_bankers id for the primary banker lookup. */
  readonly primaryBankerId?: string;
}

/** Readback of the created client relationship (proves the row persisted). */
export interface ClientRelationshipReadback {
  readonly success: boolean;
  readonly clientName?: string;
  readonly error?: { readonly message?: string };
}

export interface CreateClientRelationshipDeps {
  /** The disabled-by-default gate (live: CREATE_CLIENT_RELATIONSHIP_ENABLED). */
  readonly enabled: boolean;
  readonly createClientRelationship: (payload: Record<string, unknown>) => Promise<WriteResult>;
  readonly readClientRelationship: (id: string) => Promise<ClientRelationshipReadback>;
  readonly emitAudit: (payload: Record<string, unknown>) => Promise<WriteResult>;
}

export type CreateClientRelationshipOutcome =
  | { kind: 'success'; id: string; clientName: string; correlationId: string; auditId: string | undefined }
  | { kind: 'disabled'; reason: string }
  | { kind: 'unauthorized'; reason: string }
  | { kind: 'identity-unresolved'; reason: string }
  | { kind: 'invalid-input'; reason: string }
  | { kind: 'write-failed'; error: string; correlationId: string }
  | { kind: 'readback-mismatch'; correlationId: string }
  | { kind: 'audit-failed'; auditError: string | undefined; correlationId: string; id: string };

function trimmed(v: string | undefined): string {
  return (v ?? '').trim();
}

function compact(obj: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined && v !== '') out[k] = v;
  }
  return out;
}

/**
 * Create a governed CRM client relationship. Pure given its injected deps — the
 * only IO is create / readback / audit, all gated behind `enabled`, fail-closed
 * authorization, and required-field validation.
 */
export async function createClientRelationship(
  input: CreateClientRelationshipInput,
  deps: CreateClientRelationshipDeps,
): Promise<CreateClientRelationshipOutcome> {
  // 1. Disabled by default — refuse before any work or IO.
  if (!deps.enabled) {
    return {
      kind: 'disabled',
      reason:
        'The governed Create CRM Client Relationship workflow is disabled ' +
        '(CREATE_CLIENT_RELATIONSHIP_ENABLED=false). No record has been created.',
    };
  }

  // 2. Required-field validation.
  const clientName = trimmed(input.clientName);
  if (clientName.length === 0) {
    return { kind: 'invalid-input', reason: 'A client name is required.' };
  }
  const borrowerType = trimmed(input.borrowerType);
  if (!isClientBorrowerType(borrowerType)) {
    return {
      kind: 'invalid-input',
      reason: `"${borrowerType || '(blank)'}" is not an allowed borrower type.`,
    };
  }

  // 3. Fail-closed authorization (authorized + Dataverse identity).
  const gate = authGate(input);
  if (!gate.ok) {
    return gate.outcome as Extract<
      CreateClientRelationshipOutcome,
      { kind: 'unauthorized' | 'identity-unresolved' }
    >;
  }

  const correlationId = newCorrelationId('crm');
  const payload = compact({
    cr664_clientname: clientName,
    cr664_borrowertype: CLIENT_BORROWER_TYPES[borrowerType],
    cr664_industry: trimmed(input.industry),
    cr664_headquartersaddress: trimmed(input.headquartersAddress),
    cr664_generalnotes: trimmed(input.generalNotes),
    ...(trimmed(input.primaryBankerId).length > 0
      ? { 'cr664_PrimaryBanker@odata.bind': `/cr664_bankers(${trimmed(input.primaryBankerId)})` }
      : {}),
  });

  // 4. Create.
  let created: WriteResult;
  try {
    created = await deps.createClientRelationship(payload);
  } catch (err: unknown) {
    // Final LOS completion (Workstream P) — this workflow is disabled by default today
    // (CREATE_CLIENT_RELATIONSHIP_ENABLED=false, no live caller yet), but it mirrors
    // bridgeOrgToClientRelationship.ts's write-failed shape exactly, so it is mapped the same
    // way now rather than leaving a raw-error trap for whichever UI wires it up next.
    const raw = err instanceof Error ? err.message : String(err);
    return { kind: 'write-failed', error: mapBusinessSafeError(raw, correlationId).safeMessage, correlationId };
  }
  if (!created.success || !created.id) {
    const raw = created.error?.message ?? 'Client relationship create returned non-success.';
    return {
      kind: 'write-failed',
      error: mapBusinessSafeError(raw, correlationId).safeMessage,
      correlationId,
    };
  }
  const id = created.id;

  // 5. Readback — the row must exist and carry the name we wrote.
  let readback: ClientRelationshipReadback;
  try {
    readback = await deps.readClientRelationship(id);
  } catch {
    return { kind: 'readback-mismatch', correlationId };
  }
  if (!readback.success || trimmed(readback.clientName) !== clientName) {
    return { kind: 'readback-mismatch', correlationId };
  }

  // 6. Audit.
  const nowIso = new Date().toISOString();
  let audit: WriteResult;
  try {
    audit = await deps.emitAudit(
      buildAuditPayload({
        entityKind: 'relationship',
        entityId: id,
        action: 'crm-create-client-relationship',
        name: clientName,
        actorEmail: trimmed(input.actorEmail),
        correlationId,
        nowIso,
      }),
    );
  } catch (err: unknown) {
    return { kind: 'audit-failed', auditError: err instanceof Error ? err.message : String(err), correlationId, id };
  }
  if (!audit.success) {
    return {
      kind: 'audit-failed',
      auditError: audit.error?.message ?? 'Audit returned non-success.',
      correlationId,
      id,
    };
  }

  return { kind: 'success', id, clientName, correlationId, auditId: audit.id };
}

// ---------------------------------------------------------------------------
// Live dependencies (dynamic imports keep the SDK out of the static graph).
// Wired but DISABLED by default via CREATE_CLIENT_RELATIONSHIP_ENABLED.
// ---------------------------------------------------------------------------

export function buildLiveCreateClientRelationshipDeps(): CreateClientRelationshipDeps {
  return {
    enabled: CREATE_CLIENT_RELATIONSHIP_ENABLED,
    createClientRelationship: async (payload) => {
      const { Cr664_clientrelationshipsService: s } = await import(
        '../../generated/services/Cr664_clientrelationshipsService'
      );
      const r = await s.create(payload as never);
      return { success: r.success, id: r.data?.cr664_clientrelationshipid, error: r.error ?? undefined };
    },
    readClientRelationship: async (id) => {
      const { Cr664_clientrelationshipsService: s } = await import(
        '../../generated/services/Cr664_clientrelationshipsService'
      );
      const r = await s.get(id, { select: ['cr664_clientname'] });
      return { success: r.success, clientName: r.data?.cr664_clientname, error: r.error ?? undefined };
    },
    emitAudit: async (payload) => {
      const { Cr664_crmauditentriesService: s } = await import(
        '../../generated/services/Cr664_crmauditentriesService'
      );
      const r = await s.create(payload as never);
      return { success: r.success, id: r.data?.cr664_crmauditentryid, error: r.error ?? undefined };
    },
  };
}
