/**
 * Governed Admin → Portfolio Loan Removal (remove / reinstate).
 *
 * Same discipline and the same "no hard delete" design decision as
 * dealRemovalWrite.ts, applied to a loan already boarded into the portfolio
 * (cr664_portfolioboardedloans). A boarded loan carries roughly a dozen
 * dependent child records (collateral, covenants, guarantors, documents,
 * exceptions, examiner notes, insurance, reviews, ticklers, audit entries) —
 * a hard delete would either orphan those or require a cascading delete that
 * destroys the very audit trail bank examinations expect to survive. Instead
 * this sets the Dataverse-standard `statecode`/`statuscode` pair to Inactive
 * (the platform's own soft-delete mechanism, already present on this entity)
 * and stamps `cr664_loanstatus` with a clear removal marker.
 *
 * The main portfolio board query (portfolioBoarding/boardedLoansList.ts) is
 * patched alongside this module to filter `statecode eq 0`, so a removed loan
 * disappears from the live portfolio list — without this, flipping statecode
 * alone would NOT hide the loan from the app (confirmed: that query had no
 * state filter at all before this change).
 *
 * Reversible: `reinstate` sets statecode/statuscode back to Active.
 *
 * Follows the same discipline as every other governed admin write:
 *   fail-closed authorization → resolve auditable actor BEFORE mutating →
 *   validate → block on an already-removed/already-active loan → update →
 *   readback verification → Succeeded audit (best-effort Failed audit on a
 *   write/readback failure) → discriminated outcome. Pure over injected deps
 *   so the fail-closed behaviour is fully unit-testable without the live data
 *   client.
 */

import { AUDIT_OUTCOME_SUCCEEDED, AUDIT_OUTCOME_FAILED } from '../shared/governance/auditEnums';
import { assertChangedByCoreUserBind } from '../shared/governance/auditActorBind';
import { newCorrelationId } from '../shared/governance/correlationId';
import {
  createActorChangedByResolver,
  type ResolveActorChangedBy,
} from '../deals/newDealAuditActorResolver';

// Schema-verified cr664_auditevents option-set values (see Cr664_auditeventsModel.ts):
//   eventcategory Lifecycle     = 788190002
//   eventtype     StatusChange  = 788190001
//   entitytype    PortfolioLoan = 788190001
const AUDIT_EVENT_CATEGORY_LIFECYCLE = 788190002;
const AUDIT_EVENT_TYPE_STATUS_CHANGE = 788190001;
const AUDIT_ENTITY_TYPE_PORTFOLIO_LOAN = 788190001;

const SOURCE_PROCESS = 'AdminWorkspace/LoanRemoval/portfolio';
const REASON_MAX = 500;
const REMOVED_STATUS_LABEL = 'Removed by Admin';
const REINSTATED_STATUS_LABEL = 'Active';

export interface PortfolioLoanRemovalRow {
  readonly id: string;
  readonly name: string;
  readonly loanNumber: string | undefined;
  readonly borrowerName: string | undefined;
  readonly loanStatus: string | undefined;
  readonly active: boolean;
}

export type PortfolioLoanRemovalActionKind = 'remove' | 'reinstate';

export type PortfolioLoanRemovalAction =
  | { readonly kind: 'remove'; readonly loanId: string; readonly reason: string }
  | { readonly kind: 'reinstate'; readonly loanId: string };

export interface PortfolioLoanRemovalInput {
  readonly action: PortfolioLoanRemovalAction;
  /** Acting admin's email — resolves the REQUIRED audit cr664_ChangedBy. */
  readonly actorEmail: string | undefined;
  /** Acting admin's Dataverse systemuserid — required for a governed write. */
  readonly actorSystemUserId: string | undefined;
  /** Caller's fail-closed admin authorization. */
  readonly authorized: boolean;
}

export type PortfolioLoanRemovalOutcome =
  | { kind: 'success'; action: PortfolioLoanRemovalActionKind; loanId: string; label: string; correlationId: string; auditId: string | undefined }
  | { kind: 'unauthorized'; reason: string }
  | { kind: 'identity-unresolved'; reason: string }
  | { kind: 'invalid-input'; reason: string }
  | { kind: 'not-found'; reason: string }
  | { kind: 'already-removed'; reason: string }
  | { kind: 'not-removed'; reason: string }
  | { kind: 'write-failed'; error: string; correlationId: string }
  | { kind: 'readback-mismatch'; reason: string; correlationId: string }
  | { kind: 'audit-failed'; auditError: string | undefined; correlationId: string; loanId: string };

export interface PortfolioLoanRemovalWriteResult {
  readonly success: boolean;
  readonly error?: { readonly message?: string };
}
export interface PortfolioLoanRemovalReadResult {
  readonly success: boolean;
  readonly row?: PortfolioLoanRemovalRow;
  readonly error?: { readonly message?: string };
}
export interface PortfolioLoanRemovalAuditResult {
  readonly success: boolean;
  readonly id?: string;
  readonly error?: { readonly message?: string };
}

/** Injected dependencies — SDK-free so the adapter is unit-testable. */
export interface PortfolioLoanRemovalWriteDeps {
  readonly getLoan: (loanId: string) => Promise<PortfolioLoanRemovalReadResult>;
  readonly updateLoan: (loanId: string, patch: Record<string, unknown>) => Promise<PortfolioLoanRemovalWriteResult>;
  readonly emitAudit: (payload: Record<string, unknown>) => Promise<PortfolioLoanRemovalAuditResult>;
  readonly resolveActorChangedBy: ResolveActorChangedBy;
}

function trimmed(v: string | undefined): string {
  return (v ?? '').trim();
}

/**
 * Governed portfolio loan removal write. Pure over `deps` — no SDK, no globals.
 */
export async function writePortfolioLoanRemoval(
  input: PortfolioLoanRemovalInput,
  deps: PortfolioLoanRemovalWriteDeps,
): Promise<PortfolioLoanRemovalOutcome> {
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
  const loanId = trimmed(action.loanId);
  if (loanId.length === 0) {
    return { kind: 'invalid-input', reason: 'No portfolio loan was selected.' };
  }
  if (action.kind === 'remove') {
    const reason = trimmed(action.reason);
    if (reason.length === 0) {
      return { kind: 'invalid-input', reason: 'A reason is required to remove a portfolio loan.' };
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

  // 4. Read the loan fresh — the removal decision depends on its live state.
  const current = await safeGet(deps, loanId);
  if (!current.ok) return { kind: 'not-found', reason: current.reason };
  const row = current.row;

  if (action.kind === 'remove') {
    if (!row.active) {
      return { kind: 'already-removed', reason: `"${row.name}" has already been removed; nothing to do.` };
    }
    return handleTransition(deps, loanId, row, false, 'remove', action.reason, actorBind);
  }

  // reinstate
  if (row.active) {
    return { kind: 'not-removed', reason: `"${row.name}" is already active; nothing to reinstate.` };
  }
  return handleTransition(deps, loanId, row, true, 'reinstate', undefined, actorBind);
}

async function handleTransition(
  deps: PortfolioLoanRemovalWriteDeps,
  loanId: string,
  row: PortfolioLoanRemovalRow,
  makeActive: boolean,
  actionKind: PortfolioLoanRemovalActionKind,
  reason: string | undefined,
  actorBind: string,
): Promise<PortfolioLoanRemovalOutcome> {
  const correlationId = newCorrelationId('pr');
  const afterLabel = makeActive ? REINSTATED_STATUS_LABEL : REMOVED_STATUS_LABEL;

  const patch: Record<string, unknown> = {
    statecode: makeActive ? 0 : 1,
    statuscode: makeActive ? 1 : 2,
    cr664_loanstatus: afterLabel,
  };

  let updated: PortfolioLoanRemovalWriteResult;
  try {
    updated = await deps.updateLoan(loanId, patch);
  } catch (err: unknown) {
    return { kind: 'write-failed', error: err instanceof Error ? err.message : String(err), correlationId };
  }
  if (!updated.success) {
    return { kind: 'write-failed', error: updated.error?.message ?? 'Portfolio loan update returned non-success.', correlationId };
  }

  const auditCtx: AuditCtx = {
    action: actionKind,
    loanId,
    loanName: row.name,
    beforeState: row.active ? 'Active' : (row.loanStatus ?? 'Inactive'),
    afterState: afterLabel,
    reason,
  };

  const readback = await safeGet(deps, loanId);
  if (!readback.ok) {
    await emitFailedAudit(deps, actorBind, correlationId, auditCtx, readback.reason);
    return { kind: 'readback-mismatch', reason: readback.reason, correlationId };
  }
  if (readback.row.active !== makeActive) {
    const reasonMsg = `The ${actionKind} did not read back as saved.`;
    await emitFailedAudit(deps, actorBind, correlationId, auditCtx, reasonMsg);
    return { kind: 'readback-mismatch', reason: reasonMsg, correlationId };
  }

  return finishSuccess(deps, correlationId, actorBind, auditCtx, loanId, actionKind, `"${row.name}" ${actionKind === 'remove' ? 'removed' : 'reinstated'}.`);
}

async function safeGet(
  deps: PortfolioLoanRemovalWriteDeps,
  loanId: string,
): Promise<{ ok: true; row: PortfolioLoanRemovalRow } | { ok: false; reason: string }> {
  let res: PortfolioLoanRemovalReadResult;
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
  readonly action: PortfolioLoanRemovalActionKind;
  readonly loanId: string;
  readonly loanName: string;
  readonly beforeState: string;
  readonly afterState: string;
  readonly reason: string | undefined;
}

async function finishSuccess(
  deps: PortfolioLoanRemovalWriteDeps,
  correlationId: string,
  actorBind: string,
  ctx: AuditCtx,
  loanId: string,
  actionKind: PortfolioLoanRemovalActionKind,
  label: string,
): Promise<PortfolioLoanRemovalOutcome> {
  assertChangedByCoreUserBind(actorBind);
  let audit: PortfolioLoanRemovalAuditResult;
  try {
    audit = await deps.emitAudit(buildAuditPayload(ctx, actorBind, correlationId, AUDIT_OUTCOME_SUCCEEDED, undefined));
  } catch (err: unknown) {
    return { kind: 'audit-failed', auditError: err instanceof Error ? err.message : String(err), correlationId, loanId };
  }
  if (!audit.success) {
    return { kind: 'audit-failed', auditError: audit.error?.message ?? 'Audit create returned non-success.', correlationId, loanId };
  }
  return { kind: 'success', action: actionKind, loanId, label, correlationId, auditId: audit.id };
}

function buildAuditPayload(
  ctx: AuditCtx,
  actorBind: string,
  correlationId: string,
  outcome: number,
  failureReason: string | undefined,
): Record<string, unknown> {
  const nowIso = new Date().toISOString();
  const verb = ctx.action === 'remove' ? 'removed' : 'reinstated';
  return {
    cr664_auditeventname: `Portfolio loan ${verb} by admin`,
    cr664_eventcategory: AUDIT_EVENT_CATEGORY_LIFECYCLE,
    cr664_eventtype: AUDIT_EVENT_TYPE_STATUS_CHANGE,
    cr664_entitytype: AUDIT_ENTITY_TYPE_PORTFOLIO_LOAN,
    cr664_entityid: ctx.loanId,
    'cr664_PortfolioLoan@odata.bind': `/cr664_portfolioboardedloans(${ctx.loanId})`,
    cr664_outcomestatus: outcome,
    cr664_failurereason: failureReason,
    cr664_changeddate: nowIso,
    'cr664_ChangedBy@odata.bind': actorBind,
    cr664_fieldname: 'statecode/cr664_loanstatus',
    cr664_oldvalue: ctx.beforeState,
    cr664_newvalue: ctx.afterState,
    cr664_beforestate: ctx.beforeState,
    cr664_afterstate: ctx.afterState,
    cr664_notes: `Portfolio loan "${ctx.loanName}" ${verb} from Admin → Loan Removal.${ctx.reason ? ` Reason: ${ctx.reason}.` : ''}`,
    cr664_sourcescreensourceprocess: SOURCE_PROCESS,
    cr664_correlationid: correlationId,
  };
}

/** Best-effort Failed audit for a write/readback failure. Never throws. */
async function emitFailedAudit(
  deps: PortfolioLoanRemovalWriteDeps,
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
  'cr664_loanstatus',
  'statecode',
];

interface RawPortfolioLoanRow {
  cr664_portfolioboardedloanid?: string;
  cr664_name?: string;
  cr664_loannumber?: string;
  cr664_borrowerlegalname?: string;
  cr664_loanstatus?: string;
  statecode?: number;
  [key: string]: unknown;
}

function mapRow(raw: RawPortfolioLoanRow): PortfolioLoanRemovalRow {
  return {
    id: raw.cr664_portfolioboardedloanid ?? '',
    name: typeof raw.cr664_name === 'string' ? raw.cr664_name : '(unnamed loan)',
    loanNumber: typeof raw.cr664_loannumber === 'string' ? raw.cr664_loannumber : undefined,
    borrowerName: typeof raw.cr664_borrowerlegalname === 'string' ? raw.cr664_borrowerlegalname : undefined,
    loanStatus: typeof raw.cr664_loanstatus === 'string' ? raw.cr664_loanstatus : undefined,
    active: raw.statecode !== 1,
  };
}

export function buildLivePortfolioLoanRemovalWriteDeps(): PortfolioLoanRemovalWriteDeps {
  return {
    getLoan: async (loanId) => {
      const { Cr664_portfolioboardedloansService } = await import('../generated/services/Cr664_portfolioboardedloansService');
      const r = await Cr664_portfolioboardedloansService.get(loanId, { select: LOAN_SELECT });
      return {
        success: r.success,
        row: r.success && r.data ? mapRow(r.data as unknown as RawPortfolioLoanRow) : undefined,
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
