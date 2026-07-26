/**
 * Governed "link a canonical CRM entity to a deal" write.
 *
 * The Deal Workspace CRM Relationship panel blocks when a deal has no
 * canonical client (cr664_loandeal.cr664_Client is unset) — and shows a
 * degraded team edge when cr664_Team is unset. Both are Dataverse lookups
 * from the deal onto a searchable custom table:
 *
 *   client → cr664_clientrelationships   (readback: _cr664_client_value)
 *   team   → cr664_teams                 (readback: _cr664_team_value)
 *
 * This action lets an authorized banker set that lookup. It follows the same
 * governed discipline as the rest of the app (see `crmWriteAdapter.ts`):
 *
 *   fail-closed authorization → required-input validation → update the deal
 *   lookup → readback verification (the deal must now point at exactly the
 *   selected entity) → CRM audit entry (actor + action + correlation id +
 *   deal ref) → discriminated outcome.
 *
 * It fabricates nothing: it only points an existing deal at an existing CRM
 * record the banker selected. No contacts, roles, activities, or relationship
 * edges are synthesized. Pure over injected deps (SDK-free static graph); a
 * live factory wires the generated services via dynamic import.
 */

import { newCorrelationId } from '../../shared/governance/correlationId';
import { mapBusinessSafeError } from '../../shared/errors/businessSafeErrorMapping';
import {
  authGate,
  buildAuditPayload,
  type CrmActor,
  type WriteResult,
} from './crmWriteAdapter';

export type DealCrmLinkTarget = 'client' | 'team';

interface DealCrmLinkTargetConfig {
  /** OData bind property set on the deal update. */
  readonly bindProperty: string;
  /** Target table the lookup binds to (the `/table(id)` reference). */
  readonly targetTable: string;
  /** `_<lookup>_value` field read back off the deal to prove the link. */
  readonly readbackValueField: string;
  /** Governance audit action verb. */
  readonly auditAction: string;
  /** Human label for validation copy + the audit summary. */
  readonly label: string;
}

export const DEAL_CRM_LINK_TARGETS: Readonly<
  Record<DealCrmLinkTarget, DealCrmLinkTargetConfig>
> = {
  client: {
    bindProperty: 'cr664_Client@odata.bind',
    targetTable: 'cr664_clientrelationships',
    readbackValueField: '_cr664_client_value',
    auditAction: 'crm-link-deal-client',
    label: 'canonical client',
  },
  team: {
    bindProperty: 'cr664_Team@odata.bind',
    targetTable: 'cr664_teams',
    readbackValueField: '_cr664_team_value',
    auditAction: 'crm-link-deal-team',
    label: 'owning team',
  },
};

export interface LinkDealCrmEntityInput extends CrmActor {
  readonly dealId: string;
  readonly target: DealCrmLinkTarget;
  /** The GUID of the cr664_clientrelationship / cr664_team to link. */
  readonly entityId: string;
  /** Display name of the selected entity (audit summary + UI only). */
  readonly entityName?: string;
}

export interface DealLinkReadback {
  readonly success: boolean;
  /** The `_<lookup>_value` the deal now carries, or undefined if unset. */
  readonly linkedId?: string;
  readonly error?: { readonly message?: string };
}

export interface LinkDealCrmEntityDeps {
  readonly updateDealLink: (args: {
    readonly dealId: string;
    readonly bindProperty: string;
    readonly targetTable: string;
    readonly entityId: string;
  }) => Promise<WriteResult>;
  readonly readDealLink: (args: {
    readonly dealId: string;
    readonly readbackValueField: string;
  }) => Promise<DealLinkReadback>;
  readonly emitAudit: (payload: Record<string, unknown>) => Promise<WriteResult>;
}

export type LinkDealCrmEntityOutcome =
  | {
      kind: 'success';
      dealId: string;
      target: DealCrmLinkTarget;
      entityId: string;
      entityName: string | undefined;
      correlationId: string;
      auditId: string | undefined;
    }
  | { kind: 'unauthorized'; reason: string }
  | { kind: 'identity-unresolved'; reason: string }
  | { kind: 'invalid-input'; reason: string }
  | { kind: 'write-failed'; error: string; correlationId: string }
  | { kind: 'readback-mismatch'; correlationId: string }
  | {
      kind: 'audit-failed';
      auditError: string | undefined;
      correlationId: string;
      dealId: string;
      entityId: string;
    };

function trimmed(v: string | undefined): string {
  return (v ?? '').trim();
}

/** Dataverse `_x_value` GUIDs come back lowercase, no braces. Normalize both
 *  sides so the readback comparison is robust to casing / brace decoration. */
function normalizeGuid(v: string | undefined): string {
  return (v ?? '').trim().replace(/[{}]/g, '').toLowerCase();
}

function errMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/**
 * Link the selected CRM entity to the deal, verifying the persisted result.
 *
 * The readback is strict: the deal must, after the update, point at EXACTLY the
 * entity the banker selected. A blank or mismatched readback returns
 * `readback-mismatch` and the caller must not claim the link succeeded.
 */
export async function linkDealCrmEntity(
  input: LinkDealCrmEntityInput,
  deps: LinkDealCrmEntityDeps,
): Promise<LinkDealCrmEntityOutcome> {
  const dealId = trimmed(input.dealId);
  if (dealId.length === 0) {
    return { kind: 'invalid-input', reason: 'No deal is in context; nothing was linked.' };
  }
  const cfg = DEAL_CRM_LINK_TARGETS[input.target];
  if (!cfg) {
    return { kind: 'invalid-input', reason: 'Unknown link target.' };
  }
  const entityId = trimmed(input.entityId);
  if (entityId.length === 0) {
    return { kind: 'invalid-input', reason: `Select a ${cfg.label} to link.` };
  }

  const gate = authGate(input);
  if (!gate.ok) {
    // authGate only ever returns 'unauthorized' | 'identity-unresolved'.
    return gate.outcome as Extract<
      LinkDealCrmEntityOutcome,
      { kind: 'unauthorized' | 'identity-unresolved' }
    >;
  }

  const correlationId = newCorrelationId('crm');

  let updated: WriteResult;
  try {
    updated = await deps.updateDealLink({
      dealId,
      bindProperty: cfg.bindProperty,
      targetTable: cfg.targetTable,
      entityId,
    });
  } catch (err: unknown) {
    // PR A remediation — a raw transport-failure string, never rendered verbatim.
    return { kind: 'write-failed', error: mapBusinessSafeError(errMessage(err), correlationId).safeMessage, correlationId };
  }
  if (!updated.success) {
    return {
      kind: 'write-failed',
      error: mapBusinessSafeError(updated.error?.message ?? 'Update returned non-success.', correlationId).safeMessage,
      correlationId,
    };
  }

  // Readback proves the link actually persisted onto the deal.
  let readback: DealLinkReadback;
  try {
    readback = await deps.readDealLink({ dealId, readbackValueField: cfg.readbackValueField });
  } catch {
    return { kind: 'readback-mismatch', correlationId };
  }
  if (!readback.success || normalizeGuid(readback.linkedId) !== normalizeGuid(entityId)) {
    return { kind: 'readback-mismatch', correlationId };
  }

  const displayName = trimmed(input.entityName) || entityId;
  const nowIso = new Date().toISOString();
  let audit: WriteResult;
  try {
    audit = await deps.emitAudit(
      buildAuditPayload({
        entityKind: 'relationship',
        entityId: dealId,
        action: cfg.auditAction,
        name: `${cfg.label}: ${displayName}`,
        actorEmail: trimmed(input.actorEmail),
        correlationId,
        nowIso,
      }),
    );
  } catch (err: unknown) {
    return {
      kind: 'audit-failed',
      auditError: mapBusinessSafeError(errMessage(err), correlationId).safeMessage,
      correlationId,
      dealId,
      entityId,
    };
  }
  if (!audit.success) {
    return {
      kind: 'audit-failed',
      auditError: mapBusinessSafeError(audit.error?.message ?? 'Audit returned non-success.', correlationId).safeMessage,
      correlationId,
      dealId,
      entityId,
    };
  }

  return {
    kind: 'success',
    dealId,
    target: input.target,
    entityId,
    entityName: trimmed(input.entityName) || undefined,
    correlationId,
    auditId: audit.id,
  };
}

// ---------------------------------------------------------------------------
// Live dependencies (dynamic imports keep the SDK out of the static graph)
// ---------------------------------------------------------------------------

export function buildLiveLinkDealCrmEntityDeps(): LinkDealCrmEntityDeps {
  return {
    updateDealLink: async ({ dealId, bindProperty, targetTable, entityId }) => {
      const { Cr664_loandealsService: s } = await import(
        '../../generated/services/Cr664_loandealsService'
      );
      const r = await s.update(dealId, {
        [bindProperty]: `/${targetTable}(${entityId})`,
      } as unknown as Parameters<typeof s.update>[1]);
      return { success: r.success, id: r.data?.cr664_loandealid, error: r.error ?? undefined };
    },
    readDealLink: async ({ dealId, readbackValueField }) => {
      const { Cr664_loandealsService: s } = await import(
        '../../generated/services/Cr664_loandealsService'
      );
      const r = await s.get(dealId);
      const raw = (r.data ?? undefined) as unknown as Record<string, unknown> | undefined;
      const linkedId = raw ? raw[readbackValueField] : undefined;
      return {
        success: r.success,
        linkedId: typeof linkedId === 'string' ? linkedId : undefined,
        error: r.error ?? undefined,
      };
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
