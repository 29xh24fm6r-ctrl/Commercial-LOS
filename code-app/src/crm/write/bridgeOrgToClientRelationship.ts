/**
 * Governed bridge: mirror an EXISTING CRM Hub company (cr664_crmorganization)
 * into the deal-linkable canonical client (cr664_clientrelationship).
 *
 * Why this exists: CRM Hub companies live in cr664_crmorganizations, but the
 * deal lookup cr664_loandeal.cr664_Client targets cr664_clientrelationship. So a
 * company a banker creates in CRM Hub cannot be linked to a deal until a
 * canonical client mirror exists. This bridge creates (or finds) that mirror —
 * and ONLY that. It is the single sanctioned path that may create a
 * cr664_clientrelationship on the banker's behalf.
 *
 * No fabrication: it mirrors ONE explicitly-created company into ONE client
 * relationship. It creates no contacts, org hierarchy, roles, activities, or
 * Salesforce-style spine records, and it never invents a company. Find-by-name
 * is exact (case-insensitive) so re-running is idempotent — it will not create
 * a duplicate client for the same company.
 *
 * Discipline (mirrors the rest of the governed writes):
 *   eligibility (Borrower/Client only) → required-field validation → fail-closed
 *   authorization → find-existing-by-name → create if none → readback → audit →
 *   discriminated outcome.
 *
 * Pure over injected deps (SDK-free static graph); a live factory wires the
 * generated cr664_clientrelationships + audit services via dynamic import.
 */

import { newCorrelationId } from '../../shared/governance/correlationId';
import { authGate, buildAuditPayload, type CrmActor, type WriteResult } from './crmWriteAdapter';
import { isDealLinkableOrgType } from '../orgClientBridgeEligibility';
import {
  CLIENT_BORROWER_TYPES,
  isClientBorrowerType,
  type ClientBorrowerType,
} from './createClientRelationship';

/**
 * Borrower type recorded on a mirror when the banker did not specify one. A CRM
 * company is an entity (not an individual); `Corporation` is a neutral,
 * bank-correctable default for the required cr664_borrowertype column. The
 * banker can refine the legal form on the client record later.
 */
export const BRIDGE_DEFAULT_BORROWER_TYPE: ClientBorrowerType = 'Corporation';

/**
 * Phase 4B — persisting the reverse cr664_Organization link (client relationship
 * → CRM organization). ARMED: the cr664_Organization lookup is deployed in the
 * environment (create-deal-industry-crm-naics.ps1 present=5) and the app data
 * source is registered, so a newly-mirrored client now carries the org link and
 * the Deal Industry projection can reach the org's NAICS. Already-bridged clients
 * were backfilled one-time from their crm-bridge-org-to-client audit events.
 * Additive + reversible (flip back to false to stop persisting the bind).
 */
export const BRIDGE_ORG_LINK_ENABLED = true as const;

/** Entity set the org lookup binds to. */
const CRM_ORGANIZATIONS_ENTITY_SET = 'cr664_crmorganizations';

export interface BridgeOrgToClientInput extends CrmActor {
  /** The explicitly-created cr664_crmorganization id being mirrored. */
  readonly organizationId: string;
  /** The company name (becomes cr664_clientname; also the find-by-name key). */
  readonly organizationName: string;
  /** Free-text cr664_organizationtype; must be Borrower/Client to be eligible. */
  readonly organizationType: string;
  /** Optional borrower legal type label; validated, else BRIDGE_DEFAULT is used. */
  readonly borrowerType?: string;
  readonly website?: string;
  readonly taxIdPresent?: boolean;
}

/** Readback of the mirrored client relationship (proves the row persisted). */
export interface ClientRelationshipReadback {
  readonly success: boolean;
  readonly clientName?: string;
  readonly error?: { readonly message?: string };
}

/** One existing client relationship row found by exact name. */
export interface FoundClientRelationship {
  readonly id: string;
  readonly clientName?: string;
}

export interface BridgeOrgToClientDeps {
  /** Find existing cr664_clientrelationships whose cr664_clientname === name. */
  readonly findClientRelationshipByName: (name: string) => Promise<readonly FoundClientRelationship[]>;
  readonly createClientRelationship: (payload: Record<string, unknown>) => Promise<WriteResult>;
  readonly readClientRelationship: (id: string) => Promise<ClientRelationshipReadback>;
  readonly emitAudit: (payload: Record<string, unknown>) => Promise<WriteResult>;
  /**
   * When true, the created mirror persists the cr664_Organization reverse link
   * back to the source CRM org (Phase 4B). Default-off / undefined preserves the
   * pre-4B behaviour (no org bind written).
   */
  readonly linkOrganization?: boolean;
}

export type BridgeOrgToClientOutcome =
  | { kind: 'linked-existing'; clientRelationshipId: string; clientName: string; correlationId: string }
  | {
      kind: 'created';
      clientRelationshipId: string;
      clientName: string;
      correlationId: string;
      auditId: string | undefined;
    }
  | { kind: 'not-eligible'; reason: string }
  | { kind: 'unauthorized'; reason: string }
  | { kind: 'identity-unresolved'; reason: string }
  | { kind: 'invalid-input'; reason: string }
  | { kind: 'write-failed'; error: string; correlationId: string }
  | { kind: 'readback-mismatch'; correlationId: string }
  | {
      kind: 'audit-failed';
      auditError: string | undefined;
      correlationId: string;
      clientRelationshipId: string;
    };

/** The client-relationship id a bridge outcome yields, or null on failure. */
export function bridgedClientRelationshipId(outcome: BridgeOrgToClientOutcome): string | null {
  switch (outcome.kind) {
    case 'linked-existing':
    case 'created':
    case 'audit-failed':
      return outcome.clientRelationshipId;
    default:
      return null;
  }
}

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

function normalizeName(v: string): string {
  return v.trim().toLowerCase();
}

/**
 * Create-or-find the canonical client relationship mirroring the given company.
 * Pure given its injected deps.
 */
export async function bridgeOrgToClientRelationship(
  input: BridgeOrgToClientInput,
  deps: BridgeOrgToClientDeps,
): Promise<BridgeOrgToClientOutcome> {
  // 1. Eligibility — only Borrower/Client companies get a client mirror.
  if (!isDealLinkableOrgType(input.organizationType)) {
    return {
      kind: 'not-eligible',
      reason:
        `Company type "${trimmed(input.organizationType) || '(none)'}" is not a borrower/client, ` +
        'so no deal-linkable client record is created.',
    };
  }

  // 2. Required-field validation.
  const clientName = trimmed(input.organizationName);
  if (clientName.length === 0) {
    return { kind: 'invalid-input', reason: 'The company has no name to mirror into a client record.' };
  }
  if (trimmed(input.organizationId).length === 0) {
    return { kind: 'invalid-input', reason: 'A source CRM company id is required to bridge.' };
  }

  // 3. Fail-closed authorization (authorized + Dataverse identity).
  const gate = authGate(input);
  if (!gate.ok) {
    return gate.outcome as Extract<
      BridgeOrgToClientOutcome,
      { kind: 'unauthorized' | 'identity-unresolved' }
    >;
  }

  const correlationId = newCorrelationId('crm');

  // 4. Find an existing client relationship by exact (case-insensitive) name —
  //    idempotent, so re-bridging the same company reuses its mirror.
  let existing: readonly FoundClientRelationship[];
  try {
    existing = await deps.findClientRelationshipByName(clientName);
  } catch (err: unknown) {
    return { kind: 'write-failed', error: err instanceof Error ? err.message : String(err), correlationId };
  }
  const match = existing.find((r) => normalizeName(r.clientName ?? '') === normalizeName(clientName));
  if (match) {
    return {
      kind: 'linked-existing',
      clientRelationshipId: match.id,
      clientName: match.clientName ?? clientName,
      correlationId,
    };
  }

  // 5. Create the canonical client mirror.
  const borrowerTypeLabel = isClientBorrowerType(trimmed(input.borrowerType))
    ? (trimmed(input.borrowerType) as ClientBorrowerType)
    : BRIDGE_DEFAULT_BORROWER_TYPE;
  const payload = compact({
    cr664_clientname: clientName,
    cr664_borrowertype: CLIENT_BORROWER_TYPES[borrowerTypeLabel],
    cr664_existingcustomerflag: input.taxIdPresent === true ? true : undefined,
    // Phase 4B (default-off): persist the reverse link to the source CRM org so
    // the Deal Industry projection can reach its NAICS. Only when armed.
    ...(deps.linkOrganization
      ? { 'cr664_Organization@odata.bind': `/${CRM_ORGANIZATIONS_ENTITY_SET}(${trimmed(input.organizationId)})` }
      : {}),
  });

  let created: WriteResult;
  try {
    created = await deps.createClientRelationship(payload);
  } catch (err: unknown) {
    return { kind: 'write-failed', error: err instanceof Error ? err.message : String(err), correlationId };
  }
  if (!created.success || !created.id) {
    return {
      kind: 'write-failed',
      error: created.error?.message ?? 'Client relationship create returned non-success.',
      correlationId,
    };
  }
  const id = created.id;

  // 6. Readback — the row must exist and carry the name we wrote.
  let readback: ClientRelationshipReadback;
  try {
    readback = await deps.readClientRelationship(id);
  } catch {
    return { kind: 'readback-mismatch', correlationId };
  }
  if (!readback.success || normalizeName(readback.clientName ?? '') !== normalizeName(clientName)) {
    return { kind: 'readback-mismatch', correlationId };
  }

  // 7. Audit — record the mirror, referencing the source company.
  const nowIso = new Date().toISOString();
  let audit: WriteResult;
  try {
    audit = await deps.emitAudit(
      buildAuditPayload({
        entityKind: 'relationship',
        entityId: id,
        action: 'crm-bridge-org-to-client',
        name: `${clientName} (from CRM company ${trimmed(input.organizationId)})`,
        actorEmail: trimmed(input.actorEmail),
        correlationId,
        nowIso,
      }),
    );
  } catch (err: unknown) {
    return { kind: 'audit-failed', auditError: err instanceof Error ? err.message : String(err), correlationId, clientRelationshipId: id };
  }
  if (!audit.success) {
    return {
      kind: 'audit-failed',
      auditError: audit.error?.message ?? 'Audit returned non-success.',
      correlationId,
      clientRelationshipId: id,
    };
  }

  return { kind: 'created', clientRelationshipId: id, clientName, correlationId, auditId: audit.id };
}

// ---------------------------------------------------------------------------
// Live dependencies (dynamic imports keep the SDK out of the static graph).
// ---------------------------------------------------------------------------

function odataEscape(v: string): string {
  return v.replace(/'/g, "''");
}

export function buildLiveBridgeOrgToClientDeps(): BridgeOrgToClientDeps {
  return {
    // Default-off until the maker applies the cr664_Organization lookup + arms it.
    linkOrganization: BRIDGE_ORG_LINK_ENABLED,
    findClientRelationshipByName: async (name) => {
      const { Cr664_clientrelationshipsService: s } = await import(
        '../../generated/services/Cr664_clientrelationshipsService'
      );
      const r = await s.getAll({
        filter: `cr664_clientname eq '${odataEscape(name)}'`,
        select: ['cr664_clientrelationshipid', 'cr664_clientname'],
        top: 5,
      });
      if (!r.success) return [];
      return (r.data ?? []).map((c) => ({
        id: c.cr664_clientrelationshipid,
        clientName: c.cr664_clientname,
      }));
    },
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
