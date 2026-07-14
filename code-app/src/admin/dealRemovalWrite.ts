/**
 * Governed Admin → Deal Removal (withdraw / reinstate).
 *
 * This system has no hard-delete path for a loan deal, by deliberate design —
 * see portfolioLoanBoardingLivePersistence.ts ("there is NO delete path") and
 * dealOriginationGovernance.test.ts (a governance test fails the build if a
 * delete verb appears in deal-write code). A commercial lending record also
 * has to survive its own audit trail for bank examinations, so a hard delete
 * would destroy the very evidence a "why was this loan removed" review needs.
 *
 * Instead, an admin "removes" a deal from the system the same way every other
 * governed write in this app removes something from active use: it sets the
 * deal's governed status to the existing WITHDRAWN terminal status (seeded by
 * scripts/seed-stage-references.mjs; already the canonical vocabulary used by
 * the (unmounted) banker-facing withdraw control in workflow/canonicalStageTransition.ts).
 * Every pipeline list in the app (banker/manager/executive/team — see
 * banker/dealQueries.ts, manager/managerQueries.ts, executive/operationalFallbackQueries.ts,
 * team/teamQueries.ts) filters on `statecode eq 0 and (cr664_isterminalstatus eq
 * false or null)`, and cr664_isterminalstatus is a Dataverse-calculated column
 * driven off the status reference, so setting status to WITHDRAWN makes the
 * deal disappear from every one of those views without touching statecode,
 * deleting anything, or breaking any child record (documents, tasks, credit
 * memo, timeline, audit history all stay intact and linked).
 *
 * A deal already boarded to the portfolio (status BOARDED / cr664_closedflag)
 * has a live cr664_portfolioboardedloans record — removing THAT loan is the
 * portfolioLoanRemovalWrite.ts action, not this one, so this module refuses
 * (kind: 'already-boarded') rather than silently leaving the boarded loan
 * behind pointing at a withdrawn deal.
 *
 * Reversible: `reinstate` sets the status back to OPEN.
 *
 * Follows the same discipline as every other governed admin write:
 *   fail-closed authorization → resolve auditable actor BEFORE mutating →
 *   validate → block on an already-terminal/boarded deal → resolve the status
 *   reference → update → readback verification → Succeeded audit (best-effort
 *   Failed audit on a write/readback failure) → discriminated outcome. Pure
 *   over injected deps so the fail-closed behaviour is fully unit-testable
 *   without the live data client.
 */

import { AUDIT_OUTCOME_SUCCEEDED, AUDIT_OUTCOME_FAILED } from '../shared/governance/auditEnums';
import { assertChangedByCoreUserBind } from '../shared/governance/auditActorBind';
import { newCorrelationId } from '../shared/governance/correlationId';
import {
  createActorChangedByResolver,
  type ResolveActorChangedBy,
} from '../deals/newDealAuditActorResolver';
import { resolveStatusReferenceBind } from '../deals/dealReferenceResolvers';

// Schema-verified cr664_auditevents option-set values (see Cr664_auditeventsModel.ts):
//   eventcategory Lifecycle    = 788190002
//   eventtype     StatusChange = 788190001
//   entitytype    LoanDeal     = 788190000
const AUDIT_EVENT_CATEGORY_LIFECYCLE = 788190002;
const AUDIT_EVENT_TYPE_STATUS_CHANGE = 788190001;
const AUDIT_ENTITY_TYPE_LOAN_DEAL = 788190000;

const SOURCE_PROCESS = 'AdminWorkspace/LoanRemoval/deal';
const REASON_MAX = 500;

const WITHDRAWN_STATUS_CODE = 'WITHDRAWN';
const OPEN_STATUS_CODE = 'OPEN';
/** Statuses a deal cannot be withdrawn from because they are already terminal. */
const ALREADY_TERMINAL_STATUS_NAMES = new Set(['withdrawn', 'declined']);
const BOARDED_STATUS_NAME = 'boarded';

export interface DealRemovalRow {
  readonly id: string;
  readonly name: string;
  readonly statusName: string | undefined;
  readonly closed: boolean;
  readonly active: boolean;
}

export type DealRemovalActionKind = 'withdraw' | 'reinstate';

export type DealRemovalAction =
  | { readonly kind: 'withdraw'; readonly dealId: string; readonly reason: string }
  | { readonly kind: 'reinstate'; readonly dealId: string };

export interface DealRemovalInput {
  readonly action: DealRemovalAction;
  /** Acting admin's email — resolves the REQUIRED audit cr664_ChangedBy. */
  readonly actorEmail: string | undefined;
  /** Acting admin's Dataverse systemuserid — required for a governed write. */
  readonly actorSystemUserId: string | undefined;
  /** Caller's fail-closed admin authorization. */
  readonly authorized: boolean;
}

export type DealRemovalOutcome =
  | { kind: 'success'; action: DealRemovalActionKind; dealId: string; label: string; correlationId: string; auditId: string | undefined }
  | { kind: 'unauthorized'; reason: string }
  | { kind: 'identity-unresolved'; reason: string }
  | { kind: 'invalid-input'; reason: string }
  | { kind: 'not-found'; reason: string }
  | { kind: 'already-boarded'; reason: string }
  | { kind: 'already-terminal'; reason: string }
  | { kind: 'not-withdrawn'; reason: string }
  | { kind: 'status-not-seeded'; reason: string; correlationId: string }
  | { kind: 'write-failed'; error: string; correlationId: string }
  | { kind: 'readback-mismatch'; reason: string; correlationId: string }
  | { kind: 'audit-failed'; auditError: string | undefined; correlationId: string; dealId: string };

export interface DealRemovalWriteResult {
  readonly success: boolean;
  readonly error?: { readonly message?: string };
}
export interface DealRemovalReadResult {
  readonly success: boolean;
  readonly row?: DealRemovalRow;
  readonly error?: { readonly message?: string };
}
export interface DealRemovalAuditResult {
  readonly success: boolean;
  readonly id?: string;
  readonly error?: { readonly message?: string };
}

/** Injected dependencies — SDK-free so the adapter is unit-testable. */
export interface DealRemovalWriteDeps {
  readonly getDeal: (dealId: string) => Promise<DealRemovalReadResult>;
  readonly updateDeal: (dealId: string, patch: Record<string, unknown>) => Promise<DealRemovalWriteResult>;
  /** Resolve the `/cr664_dealstatusreferences(<id>)` bind for a status code, or null if unseeded. */
  readonly resolveStatusBind: (statusCode: string) => Promise<string | null>;
  readonly emitAudit: (payload: Record<string, unknown>) => Promise<DealRemovalAuditResult>;
  readonly resolveActorChangedBy: ResolveActorChangedBy;
}

function trimmed(v: string | undefined): string {
  return (v ?? '').trim();
}

function normalizedStatus(name: string | undefined): string {
  return (name ?? '').trim().toLowerCase();
}

/**
 * Governed deal removal write. Pure over `deps` — no SDK, no globals.
 */
export async function writeDealRemoval(
  input: DealRemovalInput,
  deps: DealRemovalWriteDeps,
): Promise<DealRemovalOutcome> {
  // 1. Fail-closed authorization.
  if (!input.authorized) {
    return { kind: 'unauthorized', reason: 'Caller is not an authorized administrator.' };
  }
  // 2. A governed write requires a resolved systemuser identity.
  if (trimmed(input.actorSystemUserId).length === 0) {
    return {
      kind: 'identity-unresolved',
      reason: 'No Dataverse identity is available for the signed-in administrator; nothing was changed.',
    };
  }

  const action = input.action;
  const dealId = trimmed('dealId' in action ? action.dealId : '');
  if (dealId.length === 0) {
    return { kind: 'invalid-input', reason: 'No deal was selected.' };
  }
  if (action.kind === 'withdraw') {
    const reason = trimmed(action.reason);
    if (reason.length === 0) {
      return { kind: 'invalid-input', reason: 'A reason is required to remove a deal.' };
    }
    if (reason.length > REASON_MAX) {
      return { kind: 'invalid-input', reason: `The reason must be ${REASON_MAX} characters or fewer.` };
    }
  }

  // 3. Resolve the auditable actor BEFORE mutating. No attributable actor → no write.
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

  // 4. Read the deal fresh — the removal decision depends on its live status.
  const current = await safeGet(deps, dealId);
  if (!current.ok) return { kind: 'not-found', reason: current.reason };
  const row = current.row;
  const status = normalizedStatus(row.statusName);

  if (action.kind === 'withdraw') {
    if (row.closed || status === BOARDED_STATUS_NAME) {
      return {
        kind: 'already-boarded',
        reason: `"${row.name}" has already been boarded to the portfolio. Remove the boarded loan instead of the deal.`,
      };
    }
    if (ALREADY_TERMINAL_STATUS_NAMES.has(status)) {
      return { kind: 'already-terminal', reason: `"${row.name}" is already ${row.statusName}; nothing to remove.` };
    }
    return handleTransition(deps, dealId, row, WITHDRAWN_STATUS_CODE, 'withdraw', action.reason, actorBind);
  }

  // reinstate
  if (status !== 'withdrawn') {
    return { kind: 'not-withdrawn', reason: `"${row.name}" is not withdrawn (current status: ${row.statusName ?? 'unknown'}); nothing to reinstate.` };
  }
  return handleTransition(deps, dealId, row, OPEN_STATUS_CODE, 'reinstate', undefined, actorBind);
}

async function handleTransition(
  deps: DealRemovalWriteDeps,
  dealId: string,
  row: DealRemovalRow,
  targetStatusCode: string,
  actionKind: DealRemovalActionKind,
  reason: string | undefined,
  actorBind: string,
): Promise<DealRemovalOutcome> {
  const correlationId = newCorrelationId('dr');

  const statusBind = await deps.resolveStatusBind(targetStatusCode);
  if (!statusBind) {
    return {
      kind: 'status-not-seeded',
      reason: `No active "${targetStatusCode}" status reference row is seeded; the status reference table must be seeded before this action can run.`,
      correlationId,
    };
  }

  let updated: DealRemovalWriteResult;
  try {
    updated = await deps.updateDeal(dealId, { 'cr664_StatusReference@odata.bind': statusBind });
  } catch (err: unknown) {
    return { kind: 'write-failed', error: err instanceof Error ? err.message : String(err), correlationId };
  }
  if (!updated.success) {
    return { kind: 'write-failed', error: updated.error?.message ?? 'Deal status update returned non-success.', correlationId };
  }

  const afterLabel = actionKind === 'withdraw' ? 'Withdrawn' : 'Open';
  const auditCtx = {
    action: actionKind,
    dealId,
    dealName: row.name,
    beforeState: row.statusName ?? 'Unknown',
    afterState: afterLabel,
    reason,
  };

  const readback = await safeGet(deps, dealId);
  if (!readback.ok) {
    await emitFailedAudit(deps, actorBind, correlationId, auditCtx, readback.reason);
    return { kind: 'readback-mismatch', reason: readback.reason, correlationId };
  }
  if (normalizedStatus(readback.row.statusName) !== afterLabel.toLowerCase()) {
    const reasonMsg = `The ${actionKind} did not read back as saved.`;
    await emitFailedAudit(deps, actorBind, correlationId, auditCtx, reasonMsg);
    return { kind: 'readback-mismatch', reason: reasonMsg, correlationId };
  }

  return finishSuccess(deps, correlationId, actorBind, auditCtx, dealId, actionKind, `"${row.name}" ${actionKind === 'withdraw' ? 'removed' : 'reinstated'}.`);
}

async function safeGet(
  deps: DealRemovalWriteDeps,
  dealId: string,
): Promise<{ ok: true; row: DealRemovalRow } | { ok: false; reason: string }> {
  let res: DealRemovalReadResult;
  try {
    res = await deps.getDeal(dealId);
  } catch (err: unknown) {
    return { ok: false, reason: err instanceof Error ? err.message : String(err) };
  }
  if (!res.success || !res.row) {
    return { ok: false, reason: res.error?.message ?? 'The deal could not be read.' };
  }
  return { ok: true, row: res.row };
}

interface AuditCtx {
  readonly action: DealRemovalActionKind;
  readonly dealId: string;
  readonly dealName: string;
  readonly beforeState: string;
  readonly afterState: string;
  readonly reason: string | undefined;
}

async function finishSuccess(
  deps: DealRemovalWriteDeps,
  correlationId: string,
  actorBind: string,
  ctx: AuditCtx,
  dealId: string,
  actionKind: DealRemovalActionKind,
  label: string,
): Promise<DealRemovalOutcome> {
  assertChangedByCoreUserBind(actorBind);
  let audit: DealRemovalAuditResult;
  try {
    audit = await deps.emitAudit(buildAuditPayload(ctx, actorBind, correlationId, AUDIT_OUTCOME_SUCCEEDED, undefined));
  } catch (err: unknown) {
    return { kind: 'audit-failed', auditError: err instanceof Error ? err.message : String(err), correlationId, dealId };
  }
  if (!audit.success) {
    return { kind: 'audit-failed', auditError: audit.error?.message ?? 'Audit create returned non-success.', correlationId, dealId };
  }
  return { kind: 'success', action: actionKind, dealId, label, correlationId, auditId: audit.id };
}

function buildAuditPayload(
  ctx: AuditCtx,
  actorBind: string,
  correlationId: string,
  outcome: number,
  failureReason: string | undefined,
): Record<string, unknown> {
  const nowIso = new Date().toISOString();
  const verb = ctx.action === 'withdraw' ? 'removed (withdrawn)' : 'reinstated';
  return {
    cr664_auditeventname: `Deal ${verb} by admin`,
    cr664_eventcategory: AUDIT_EVENT_CATEGORY_LIFECYCLE,
    cr664_eventtype: AUDIT_EVENT_TYPE_STATUS_CHANGE,
    cr664_entitytype: AUDIT_ENTITY_TYPE_LOAN_DEAL,
    cr664_entityid: ctx.dealId,
    'cr664_LoanDeal@odata.bind': `/cr664_loandeals(${ctx.dealId})`,
    cr664_outcomestatus: outcome,
    cr664_failurereason: failureReason,
    cr664_changeddate: nowIso,
    'cr664_ChangedBy@odata.bind': actorBind,
    cr664_fieldname: 'cr664_StatusReference',
    cr664_oldvalue: ctx.beforeState,
    cr664_newvalue: ctx.afterState,
    cr664_beforestate: ctx.beforeState,
    cr664_afterstate: ctx.afterState,
    cr664_notes: `Deal "${ctx.dealName}" ${verb} from Admin → Loan Removal.${ctx.reason ? ` Reason: ${ctx.reason}.` : ''}`,
    cr664_sourcescreensourceprocess: SOURCE_PROCESS,
    cr664_correlationid: correlationId,
  };
}

/** Best-effort Failed audit for a write/readback failure. Never throws. */
async function emitFailedAudit(
  deps: DealRemovalWriteDeps,
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

const DEAL_SELECT = [
  'cr664_loandealid',
  'cr664_dealname',
  'cr664_statusreferencename',
  'cr664_closedflag',
  'statecode',
];

interface RawDealRow {
  cr664_loandealid?: string;
  cr664_dealname?: string;
  cr664_statusreferencename?: string;
  cr664_closedflag?: boolean;
  statecode?: number;
  [key: string]: unknown;
}

function mapRow(raw: RawDealRow): DealRemovalRow {
  return {
    id: raw.cr664_loandealid ?? '',
    name: typeof raw.cr664_dealname === 'string' ? raw.cr664_dealname : '(unnamed deal)',
    statusName: typeof raw.cr664_statusreferencename === 'string' ? raw.cr664_statusreferencename : undefined,
    closed: raw.cr664_closedflag === true,
    active: raw.statecode !== 1,
  };
}

export function buildLiveDealRemovalWriteDeps(): DealRemovalWriteDeps {
  return {
    getDeal: async (dealId) => {
      const { Cr664_loandealsService } = await import('../generated/services/Cr664_loandealsService');
      const r = await Cr664_loandealsService.get(dealId, { select: DEAL_SELECT });
      return {
        success: r.success,
        row: r.success && r.data ? mapRow(r.data as unknown as RawDealRow) : undefined,
        error: r.error ?? undefined,
      };
    },
    updateDeal: async (dealId, patch) => {
      const { Cr664_loandealsService } = await import('../generated/services/Cr664_loandealsService');
      const r = await Cr664_loandealsService.update(dealId, patch as unknown as Parameters<typeof Cr664_loandealsService.update>[1]);
      return { success: r.success, error: r.error ?? undefined };
    },
    resolveStatusBind: (statusCode) => resolveStatusReferenceBind(statusCode),
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
