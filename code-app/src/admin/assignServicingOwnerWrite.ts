/**
 * Final LOS Completion arc (Workstream 146-E) — governed Admin -> Assign Servicing Owner.
 *
 * Closes the total write-side gap this workstream found: `boardingHandoffReadiness.ts` already
 * reads `_cr664_assignedservicingowner_value` (feeding BOARDED:servicing_owner in
 * loanWorkflowRequirementEngine.ts), but a full-repo grep found ZERO write sites anywhere for
 * `cr664_AssignedServicingOwner` -- nothing has ever set it. This is that write.
 *
 * `cr664_AssignedServicingOwner` is a real Dataverse `systemuser` lookup on
 * `cr664_portfolioboardedloan` (same target type as the pre-existing `cr664_PortfolioManager`
 * field; confirmed via portfolioLoanBoardingDataverseSchemaPlan.ts). The picker reuses
 * portfolioManagerOptions.ts's existing systemuser resolver (loadPortfolioManagerOptions) rather
 * than adminAccessGrantLookup.ts's listGrantablePlatformUsers(), whose `id` is a
 * cr664_platformuserid -- a different identity space that does NOT bind through
 * `@odata.bind: /systemusers(...)`.
 *
 * Same discipline as portfolioLoanRemovalWrite.ts (this workstream's closest sibling: a governed
 * admin write against a `cr664_portfolioboardedloan` row):
 *   fail-closed authorization -> resolve auditable actor BEFORE mutating -> validate -> fresh read
 *   -> reject a no-op reassignment to the same owner -> update -> readback verification (the exact
 *   record readback the mission requires, not an assumed success) -> Succeeded audit (best-effort
 *   Failed audit on a write/readback failure) -> discriminated outcome. Pure over injected deps so
 *   the fail-closed behaviour is fully unit-testable without the live data client.
 *
 * Only an assignment (never a clear-to-unassigned) is supported here -- reassignment to a
 * DIFFERENT owner is fully supported (the common real case: a book handoff between portfolio
 * managers); clearing the field entirely was not asked for by the workflow requirement (which only
 * checks presence) and is left out rather than guessed at.
 */

import { AUDIT_OUTCOME_SUCCEEDED, AUDIT_OUTCOME_FAILED } from '../shared/governance/auditEnums';
import { assertChangedByCoreUserBind } from '../shared/governance/auditActorBind';
import { newCorrelationId } from '../shared/governance/correlationId';
import {
  createActorChangedByResolver,
  type ResolveActorChangedBy,
} from '../deals/newDealAuditActorResolver';
import type { LookupResult } from './adminLoanLookup';

// Schema-verified cr664_auditevents option-set values (see Cr664_auditeventsModel.ts) -- same
// values portfolioLoanRemovalWrite.ts already verified for this same entity type.
const AUDIT_EVENT_CATEGORY_LIFECYCLE = 788190002;
const AUDIT_EVENT_TYPE_STATUS_CHANGE = 788190001;
const AUDIT_ENTITY_TYPE_PORTFOLIO_LOAN = 788190001;

const SOURCE_PROCESS = 'AdminWorkspace/ServicingOwnerAssignment';

export interface ServicingOwnerLoanRow {
  readonly id: string;
  readonly name: string;
  readonly loanNumber: string | undefined;
  readonly borrowerName: string | undefined;
  readonly active: boolean;
  /** systemuserid currently bound through cr664_AssignedServicingOwner, or undefined if unset. */
  readonly currentServicingOwnerId: string | undefined;
  readonly currentServicingOwnerName: string | undefined;
}

export interface AssignServicingOwnerInput {
  readonly loanId: string;
  /** systemuserid to bind through cr664_AssignedServicingOwner@odata.bind. */
  readonly servicingOwnerId: string;
  /** Display name for audit/outcome text -- the caller's picker already resolved this from the
   *  SAME systemuser read that produced servicingOwnerId, never free text. */
  readonly servicingOwnerName: string;
  /** Acting admin's email -- resolves the REQUIRED audit cr664_ChangedBy. */
  readonly actorEmail: string | undefined;
  /** Acting admin's Dataverse systemuserid -- required for a governed write. */
  readonly actorSystemUserId: string | undefined;
  /** Caller's fail-closed admin authorization. */
  readonly authorized: boolean;
}

export type AssignServicingOwnerOutcome =
  | { kind: 'success'; loanId: string; servicingOwnerId: string; servicingOwnerName: string; correlationId: string; auditId: string | undefined }
  | { kind: 'unauthorized'; reason: string }
  | { kind: 'identity-unresolved'; reason: string }
  | { kind: 'invalid-input'; reason: string }
  | { kind: 'not-found'; reason: string }
  | { kind: 'already-assigned'; reason: string }
  | { kind: 'write-failed'; error: string; correlationId: string }
  | { kind: 'readback-mismatch'; reason: string; correlationId: string }
  | { kind: 'audit-failed'; auditError: string | undefined; correlationId: string; loanId: string };

export interface ServicingOwnerWriteResult {
  readonly success: boolean;
  readonly error?: { readonly message?: string };
}
export interface ServicingOwnerReadResult {
  readonly success: boolean;
  readonly row?: ServicingOwnerLoanRow;
  readonly error?: { readonly message?: string };
}
export interface ServicingOwnerAuditResult {
  readonly success: boolean;
  readonly id?: string;
  readonly error?: { readonly message?: string };
}

/** Injected dependencies -- SDK-free so the adapter is unit-testable. */
export interface AssignServicingOwnerWriteDeps {
  readonly getLoan: (loanId: string) => Promise<ServicingOwnerReadResult>;
  readonly updateLoan: (loanId: string, patch: Record<string, unknown>) => Promise<ServicingOwnerWriteResult>;
  readonly emitAudit: (payload: Record<string, unknown>) => Promise<ServicingOwnerAuditResult>;
  readonly resolveActorChangedBy: ResolveActorChangedBy;
}

function trimmed(v: string | undefined): string {
  return (v ?? '').trim();
}

/**
 * Governed servicing-owner assignment write. Pure over `deps` -- no SDK, no globals.
 */
export async function writeAssignServicingOwner(
  input: AssignServicingOwnerInput,
  deps: AssignServicingOwnerWriteDeps,
): Promise<AssignServicingOwnerOutcome> {
  if (!input.authorized) {
    return { kind: 'unauthorized', reason: 'Caller is not an authorized administrator.' };
  }
  if (trimmed(input.actorSystemUserId).length === 0) {
    return {
      kind: 'identity-unresolved',
      reason: 'No Dataverse identity is available for the signed-in administrator; nothing was changed.',
    };
  }

  const loanId = trimmed(input.loanId);
  if (loanId.length === 0) {
    return { kind: 'invalid-input', reason: 'No portfolio loan was selected.' };
  }
  const ownerId = trimmed(input.servicingOwnerId);
  if (ownerId.length === 0) {
    return { kind: 'invalid-input', reason: 'No servicing owner was selected.' };
  }
  const ownerName = trimmed(input.servicingOwnerName) || ownerId;

  const actor = await deps.resolveActorChangedBy(input.actorEmail);
  if (!actor.ok || !actor.changedByBind) {
    return {
      kind: 'identity-unresolved',
      reason:
        actor.reason ??
        'The signed-in administrator could not be resolved to an auditable identity; nothing was changed.',
    };
  }
  const actorBind = actor.changedByBind;

  const current = await safeGet(deps, loanId);
  if (!current.ok) return { kind: 'not-found', reason: current.reason };
  const row = current.row;

  if (row.currentServicingOwnerId === ownerId) {
    return {
      kind: 'already-assigned',
      reason: `"${row.name}" is already assigned to ${ownerName}; nothing to change.`,
    };
  }

  const correlationId = newCorrelationId('so');
  const beforeName = row.currentServicingOwnerName ?? row.currentServicingOwnerId ?? '(unassigned)';

  let updated: ServicingOwnerWriteResult;
  try {
    updated = await deps.updateLoan(loanId, {
      'cr664_AssignedServicingOwner@odata.bind': `/systemusers(${ownerId})`,
    });
  } catch (err: unknown) {
    return { kind: 'write-failed', error: err instanceof Error ? err.message : String(err), correlationId };
  }
  if (!updated.success) {
    return { kind: 'write-failed', error: updated.error?.message ?? 'Servicing owner assignment returned non-success.', correlationId };
  }

  const auditCtx: AuditCtx = { loanId, loanName: row.name, beforeName, afterName: ownerName };

  const readback = await safeGet(deps, loanId);
  if (!readback.ok) {
    await emitFailedAudit(deps, actorBind, correlationId, auditCtx, readback.reason);
    return { kind: 'readback-mismatch', reason: readback.reason, correlationId };
  }
  if (readback.row.currentServicingOwnerId !== ownerId) {
    const reasonMsg = 'The servicing owner assignment did not read back as saved.';
    await emitFailedAudit(deps, actorBind, correlationId, auditCtx, reasonMsg);
    return { kind: 'readback-mismatch', reason: reasonMsg, correlationId };
  }

  let audit: ServicingOwnerAuditResult;
  try {
    assertChangedByCoreUserBind(actorBind);
    audit = await deps.emitAudit(buildAuditPayload(auditCtx, actorBind, correlationId, AUDIT_OUTCOME_SUCCEEDED, undefined));
  } catch (err: unknown) {
    return { kind: 'audit-failed', auditError: err instanceof Error ? err.message : String(err), correlationId, loanId };
  }
  if (!audit.success) {
    return { kind: 'audit-failed', auditError: audit.error?.message ?? 'Audit create returned non-success.', correlationId, loanId };
  }

  return { kind: 'success', loanId, servicingOwnerId: ownerId, servicingOwnerName: ownerName, correlationId, auditId: audit.id };
}

async function safeGet(
  deps: AssignServicingOwnerWriteDeps,
  loanId: string,
): Promise<{ ok: true; row: ServicingOwnerLoanRow } | { ok: false; reason: string }> {
  let res: ServicingOwnerReadResult;
  try {
    res = await deps.getLoan(loanId);
  } catch (err: unknown) {
    return { ok: false, reason: err instanceof Error ? err.message : String(err) };
  }
  if (!res.success || !res.row) {
    return { ok: false, reason: res.error?.message ?? 'The portfolio loan could not be read.' };
  }
  return { ok: true, row: res.row };
}

interface AuditCtx {
  readonly loanId: string;
  readonly loanName: string;
  readonly beforeName: string;
  readonly afterName: string;
}

function buildAuditPayload(
  ctx: AuditCtx,
  actorBind: string,
  correlationId: string,
  outcome: number,
  failureReason: string | undefined,
): Record<string, unknown> {
  const nowIso = new Date().toISOString();
  return {
    cr664_auditeventname: 'Servicing owner assigned by admin',
    cr664_eventcategory: AUDIT_EVENT_CATEGORY_LIFECYCLE,
    cr664_eventtype: AUDIT_EVENT_TYPE_STATUS_CHANGE,
    cr664_entitytype: AUDIT_ENTITY_TYPE_PORTFOLIO_LOAN,
    cr664_entityid: ctx.loanId,
    'cr664_PortfolioLoan@odata.bind': `/cr664_portfolioboardedloans(${ctx.loanId})`,
    cr664_outcomestatus: outcome,
    cr664_failurereason: failureReason,
    cr664_changeddate: nowIso,
    'cr664_ChangedBy@odata.bind': actorBind,
    cr664_fieldname: 'cr664_AssignedServicingOwner',
    cr664_oldvalue: ctx.beforeName,
    cr664_newvalue: ctx.afterName,
    cr664_beforestate: ctx.beforeName,
    cr664_afterstate: ctx.afterName,
    cr664_notes: `Portfolio loan "${ctx.loanName}" servicing owner set to ${ctx.afterName} from Admin -> Assign Servicing Owner.`,
    cr664_sourcescreensourceprocess: SOURCE_PROCESS,
    cr664_correlationid: correlationId,
  };
}

/** Best-effort Failed audit for a write/readback failure. Never throws. */
async function emitFailedAudit(
  deps: AssignServicingOwnerWriteDeps,
  actorBind: string,
  correlationId: string,
  ctx: AuditCtx,
  failureReason: string,
): Promise<void> {
  try {
    assertChangedByCoreUserBind(actorBind);
    await deps.emitAudit(buildAuditPayload(ctx, actorBind, correlationId, AUDIT_OUTCOME_FAILED, failureReason));
  } catch {
    // Surfaced honestly through the returned outcome; never throw out of audit.
  }
}

// ---------------------------------------------------------------------------
// Live dependencies (dynamic imports keep the SDK out of the static graph).
// ---------------------------------------------------------------------------

const LOAN_SELECT = [
  'cr664_portfolioboardedloanid',
  'cr664_name',
  'cr664_loannumber',
  'cr664_borrowerlegalname',
  'statecode',
  '_cr664_assignedservicingowner_value',
];

interface RawServicingOwnerLoanRow {
  cr664_portfolioboardedloanid?: string;
  cr664_name?: string;
  cr664_loannumber?: string;
  cr664_borrowerlegalname?: string;
  statecode?: number;
  _cr664_assignedservicingowner_value?: string;
  [key: string]: unknown;
}

const SERVICING_OWNER_VALUE_COLUMN = '_cr664_assignedservicingowner_value';

function str(v: unknown): string | undefined {
  return typeof v === 'string' && v.trim().length > 0 ? v.trim() : undefined;
}

/** Mirrors boardedLoansList.ts's portfolioManagerName -- the FormattedValue annotation is the
 *  only place a systemuser lookup's display name lives; the raw navigation property is not
 *  selectable. */
function servicingOwnerName(raw: RawServicingOwnerLoanRow): string | undefined {
  const formatted = raw[`${SERVICING_OWNER_VALUE_COLUMN}@OData.Community.Display.V1.FormattedValue`];
  return typeof formatted === 'string' && formatted.trim().length > 0 ? formatted.trim() : undefined;
}

function mapRow(raw: RawServicingOwnerLoanRow): ServicingOwnerLoanRow {
  return {
    id: raw.cr664_portfolioboardedloanid ?? '',
    name: str(raw.cr664_name) ?? '(unnamed loan)',
    loanNumber: str(raw.cr664_loannumber),
    borrowerName: str(raw.cr664_borrowerlegalname),
    active: raw.statecode !== 1,
    currentServicingOwnerId: str(raw._cr664_assignedservicingowner_value),
    currentServicingOwnerName: servicingOwnerName(raw),
  };
}

// ---------------------------------------------------------------------------
// Read-only search (parallels adminLoanLookup.ts's searchPortfolioLoans, but
// additionally selects the current servicing-owner lookup, which that shared
// search does not need for its own Remove/Reinstate use case).
// ---------------------------------------------------------------------------

const GUID_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
const SEARCH_TOP = 15;

function isGuid(v: string): boolean {
  return GUID_RE.test(v.trim().replace(/[{}]/g, ''));
}

function escapeODataString(v: string): string {
  return v.replace(/'/g, "''");
}

/** Active, servicable portfolio loans matching a text/id search -- the picker source for
 *  Admin -> Assign Servicing Owner. Read-only. */
export async function searchServicingOwnerLoans(query: string): Promise<LookupResult<ServicingOwnerLoanRow>> {
  const q = query.trim();
  if (q.length === 0) return { success: true, rows: [] };
  try {
    const { Cr664_portfolioboardedloansService } = await import('../generated/services/Cr664_portfolioboardedloansService');
    const filter = isGuid(q)
      ? `cr664_portfolioboardedloanid eq ${q.replace(/[{}]/g, '')}`
      : `contains(cr664_name,'${escapeODataString(q)}') or contains(cr664_loannumber,'${escapeODataString(q)}') or contains(cr664_borrowerlegalname,'${escapeODataString(q)}')`;
    const res = await Cr664_portfolioboardedloansService.getAll({
      select: LOAN_SELECT,
      filter: `statecode eq 0 and (${filter})`,
      top: SEARCH_TOP,
    });
    if (!res.success) return { success: false, error: res.error?.message ?? 'Portfolio loan search failed.' };
    return { success: true, rows: (res.data ?? []).map((r) => mapRow(r as unknown as RawServicingOwnerLoanRow)) };
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export function buildLiveAssignServicingOwnerWriteDeps(): AssignServicingOwnerWriteDeps {
  return {
    getLoan: async (loanId) => {
      const { Cr664_portfolioboardedloansService } = await import('../generated/services/Cr664_portfolioboardedloansService');
      const r = await Cr664_portfolioboardedloansService.get(loanId, { select: LOAN_SELECT });
      return {
        success: r.success,
        row: r.success && r.data ? mapRow(r.data as unknown as RawServicingOwnerLoanRow) : undefined,
        error: r.error ?? undefined,
      };
    },
    updateLoan: async (loanId, patch) => {
      const { Cr664_portfolioboardedloansService } = await import('../generated/services/Cr664_portfolioboardedloansService');
      const r = await Cr664_portfolioboardedloansService.update(loanId, patch as unknown as Parameters<typeof Cr664_portfolioboardedloansService.update>[1]);
      return { success: r.success, error: r.error ?? undefined };
    },
    emitAudit: async (payload) => {
      const { Cr664_auditeventsService } = await import('../generated/services/Cr664_auditeventsService');
      const r = await Cr664_auditeventsService.create(
        payload as unknown as Parameters<typeof Cr664_auditeventsService.create>[0],
      );
      return { success: r.success, id: r.data?.cr664_auditeventid, error: r.error ?? undefined };
    },
    resolveActorChangedBy: createActorChangedByResolver(),
  };
}
