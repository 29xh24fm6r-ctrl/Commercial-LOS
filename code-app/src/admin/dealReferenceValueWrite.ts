/**
 * Phase 4A — governed Deal Reference value management (admin write).
 *
 * Admins manage the Product Type / Loan Structure / Pricing Type dropdown values
 * that back the Deal Profile. All three are rows in the ONE reference table
 * `cr664_producttypereference`, separated by the `cr664_category` CHOICE
 * discriminator (Phase 4A). This module is the first admin write over that table
 * and follows the SAME discipline as workspaceEntitlementWrite / the other
 * governed writes:
 *
 *   fail-closed authorization → resolve the auditable actor BEFORE mutating →
 *   validate (name/code/category required; code unique in category; no duplicate
 *   ACTIVE display name in category) → create / update / deactivate / reactivate →
 *   readback verification → Succeeded audit (best-effort Failed audit on a
 *   write/readback failure) → discriminated outcome.
 *
 * Prefer deactivate over delete: there is NO delete path here. Every write is
 * audited to cr664_auditevents as a Configuration / AdminConfigurationChange
 * event. The core function is pure over injected deps so the fail-closed
 * behaviour is fully unit-testable without the live data client.
 */

import { AUDIT_OUTCOME_SUCCEEDED, AUDIT_OUTCOME_FAILED } from '../shared/governance/auditEnums';
import { assertChangedByCoreUserBind } from '../shared/governance/auditActorBind';
import { newCorrelationId } from '../shared/governance/correlationId';
import {
  createActorChangedByResolver,
  type ResolveActorChangedBy,
} from '../deals/newDealAuditActorResolver';
import {
  DEAL_REFERENCE_CATEGORY_COLUMN,
  DEAL_REFERENCE_CATEGORY_LABEL,
  DEAL_REFERENCE_ENTITY_SET,
  categoryForOptionValue,
  isDealReferenceCategory,
  optionValueForCategory,
  type DealReferenceCategory,
} from '../shared/governance/dealReferenceCategories';

// Schema-verified cr664_auditevents option-set values (kept inline so the
// action does not depend on the generated runtime enum maps):
//   eventcategory Configuration          = 788190005
//   eventtype     AdminConfigurationChange = 788190007
//   entitytype    Configuration          = 788190005
const AUDIT_EVENT_CATEGORY_CONFIGURATION = 788190005;
const AUDIT_EVENT_TYPE_ADMIN_CONFIGURATION_CHANGE = 788190007;
const AUDIT_ENTITY_TYPE_CONFIGURATION = 788190005;

const ID_ATTR = 'cr664_producttypereferenceid';
const SOURCE_PROCESS = 'AdminWorkspace/DealReferenceValues/manage';
const NAME_MAX = 200;
const CODE_MAX = 100;

/** A reference row as the admin surface sees it (active + inactive). */
export interface DealReferenceAdminRow {
  readonly id: string;
  readonly name: string;
  readonly code: string;
  /** Resolved category, or undefined for an un-categorized legacy row. */
  readonly category: DealReferenceCategory | undefined;
  /** Raw cr664_category option value (undefined = un-categorized). */
  readonly categoryValue: number | undefined;
  readonly active: boolean;
  readonly sortOrder?: number;
}

export type DealReferenceWriteActionKind = 'create' | 'update' | 'deactivate' | 'reactivate';

export type DealReferenceWriteAction =
  | { readonly kind: 'create'; readonly category: string; readonly name: string; readonly code: string; readonly sortOrder?: number }
  | { readonly kind: 'update'; readonly id: string; readonly name?: string; readonly code?: string; readonly sortOrder?: number }
  | { readonly kind: 'deactivate'; readonly id: string }
  | { readonly kind: 'reactivate'; readonly id: string };

export interface DealReferenceWriteInput {
  readonly action: DealReferenceWriteAction;
  /** Acting admin's email — resolves the REQUIRED audit cr664_ChangedBy. */
  readonly actorEmail: string | undefined;
  /** Acting admin's Dataverse systemuserid — required for a governed write. */
  readonly actorSystemUserId: string | undefined;
  /** Caller's fail-closed admin authorization. */
  readonly authorized: boolean;
}

export type DealReferenceWriteOutcome =
  | { kind: 'success'; action: DealReferenceWriteActionKind; id: string; label: string; correlationId: string; auditId: string | undefined }
  | { kind: 'unauthorized'; reason: string }
  | { kind: 'identity-unresolved'; reason: string }
  | { kind: 'invalid-input'; reason: string }
  | { kind: 'not-found'; reason: string; correlationId: string }
  | { kind: 'duplicate'; reason: string }
  | { kind: 'write-failed'; error: string; correlationId: string }
  | { kind: 'readback-mismatch'; reason: string; correlationId: string }
  | { kind: 'audit-failed'; auditError: string | undefined; correlationId: string; id: string };

export interface DealReferenceWriteResult {
  readonly success: boolean;
  readonly id?: string;
  readonly error?: { readonly message?: string };
}
export interface DealReferenceReadResult {
  readonly success: boolean;
  readonly row?: DealReferenceAdminRow;
  readonly error?: { readonly message?: string };
}
export interface DealReferenceListResult {
  readonly success: boolean;
  readonly rows?: readonly DealReferenceAdminRow[];
  readonly error?: { readonly message?: string };
}
export interface DealReferenceAuditResult {
  readonly success: boolean;
  readonly id?: string;
  readonly error?: { readonly message?: string };
}

/** Injected dependencies — SDK-free so the adapter is unit-testable. */
export interface DealReferenceWriteDeps {
  /** List every row (active + inactive) in a category, for uniqueness checks. */
  readonly listCategoryRows: (categoryValue: number) => Promise<DealReferenceListResult>;
  /** Read a single row by id (readback + resolve current category on edit). */
  readonly getRow: (id: string) => Promise<DealReferenceReadResult>;
  readonly createRow: (payload: Record<string, unknown>) => Promise<DealReferenceWriteResult>;
  readonly updateRow: (id: string, patch: Record<string, unknown>) => Promise<DealReferenceWriteResult>;
  readonly emitAudit: (payload: Record<string, unknown>) => Promise<DealReferenceAuditResult>;
  /** Resolve the actor's cr664_ChangedBy bind, fail-closed. */
  readonly resolveActorChangedBy: ResolveActorChangedBy;
}

function trimmed(v: string | undefined): string {
  return (v ?? '').trim();
}

function ci(v: string): string {
  return v.trim().toLowerCase();
}

interface AuditContext {
  readonly action: DealReferenceWriteActionKind;
  readonly id: string;
  readonly categoryLabel: string;
  readonly beforeState: string;
  readonly afterState: string;
  readonly fieldSummary: string;
}

/**
 * Governed Deal Reference value write. Pure over `deps` — no SDK, no globals.
 */
export async function writeDealReferenceValue(
  input: DealReferenceWriteInput,
  deps: DealReferenceWriteDeps,
): Promise<DealReferenceWriteOutcome> {
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

  // 3. Shape-validate the action + prepare its fields BEFORE resolving the actor
  //    so obviously bad input fails fast without any IO.
  const prep = prepareAction(action);
  if (!prep.ok) return prep.outcome;

  const correlationId = newCorrelationId('dr');

  // 4. Resolve the auditable actor BEFORE mutating. No attributable actor → no write.
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

  switch (action.kind) {
    case 'create':
      return handleCreate(action, deps, correlationId, actorBind);
    case 'update':
      return handleUpdate(action, deps, correlationId, actorBind);
    case 'deactivate':
    case 'reactivate':
      return handleToggle(action, deps, correlationId, actorBind);
  }
}

// ---------------------------------------------------------------------------
// Shape validation (pure, no IO)
// ---------------------------------------------------------------------------

type PrepResult = { ok: true } | { ok: false; outcome: DealReferenceWriteOutcome };

function prepareAction(action: DealReferenceWriteAction): PrepResult {
  switch (action.kind) {
    case 'create': {
      if (!isDealReferenceCategory(action.category)) {
        return { ok: false, outcome: { kind: 'invalid-input', reason: `"${action.category || '(blank)'}" is not a valid deal reference category.` } };
      }
      const nameErr = validateName(action.name);
      if (nameErr) return { ok: false, outcome: { kind: 'invalid-input', reason: nameErr } };
      const codeErr = validateCode(action.code);
      if (codeErr) return { ok: false, outcome: { kind: 'invalid-input', reason: codeErr } };
      return { ok: true };
    }
    case 'update': {
      if (trimmed(action.id).length === 0) {
        return { ok: false, outcome: { kind: 'invalid-input', reason: 'No reference value was selected to update.' } };
      }
      const providesName = action.name !== undefined;
      const providesCode = action.code !== undefined;
      const providesSort = action.sortOrder !== undefined;
      if (!providesName && !providesCode && !providesSort) {
        return { ok: false, outcome: { kind: 'invalid-input', reason: 'No changes were provided.' } };
      }
      if (providesName) {
        const nameErr = validateName(action.name as string);
        if (nameErr) return { ok: false, outcome: { kind: 'invalid-input', reason: nameErr } };
      }
      if (providesCode) {
        const codeErr = validateCode(action.code as string);
        if (codeErr) return { ok: false, outcome: { kind: 'invalid-input', reason: codeErr } };
      }
      return { ok: true };
    }
    case 'deactivate':
    case 'reactivate': {
      if (trimmed(action.id).length === 0) {
        return { ok: false, outcome: { kind: 'invalid-input', reason: 'No reference value was selected.' } };
      }
      return { ok: true };
    }
  }
}

function validateName(name: string): string | null {
  const v = trimmed(name);
  if (v.length === 0) return 'A display name is required.';
  if (v.length > NAME_MAX) return `The display name must be ${NAME_MAX} characters or fewer.`;
  return null;
}

function validateCode(code: string): string | null {
  const v = trimmed(code);
  if (v.length === 0) return 'A code is required.';
  if (v.length > CODE_MAX) return `The code must be ${CODE_MAX} characters or fewer.`;
  return null;
}

// ---------------------------------------------------------------------------
// Create
// ---------------------------------------------------------------------------

async function handleCreate(
  action: Extract<DealReferenceWriteAction, { kind: 'create' }>,
  deps: DealReferenceWriteDeps,
  correlationId: string,
  actorBind: string,
): Promise<DealReferenceWriteOutcome> {
  const category = action.category as DealReferenceCategory;
  const categoryValue = optionValueForCategory(category);
  const name = trimmed(action.name);
  const code = trimmed(action.code);

  // Uniqueness — read the category's rows fresh.
  const list = await deps.listCategoryRows(categoryValue);
  if (!list.success) {
    return { kind: 'write-failed', error: list.error?.message ?? 'Could not read existing values to check for duplicates.', correlationId };
  }
  const dup = findDuplicate(list.rows ?? [], { code, name, excludeId: undefined });
  if (dup) return { kind: 'duplicate', reason: dup };

  const payload: Record<string, unknown> = {
    cr664_name: name,
    cr664_code: code,
    cr664_activeflag: true,
    [DEAL_REFERENCE_CATEGORY_COLUMN]: categoryValue,
  };
  if (typeof action.sortOrder === 'number') payload.cr664_sortorder = action.sortOrder;

  let created: DealReferenceWriteResult;
  try {
    created = await deps.createRow(payload);
  } catch (err: unknown) {
    return { kind: 'write-failed', error: err instanceof Error ? err.message : String(err), correlationId };
  }
  if (!created.success || !created.id) {
    return { kind: 'write-failed', error: created.error?.message ?? 'Reference value create returned non-success.', correlationId };
  }
  const id = created.id;

  // Readback — the new row must exist and carry exactly what we wrote.
  const readback = await safeGet(deps, id);
  if (!readback.ok) {
    await emitFailedAudit(deps, actorBind, correlationId, {
      action: 'create', id, categoryLabel: DEAL_REFERENCE_CATEGORY_LABEL[category],
      beforeState: '(none)', afterState: `${DEAL_REFERENCE_CATEGORY_LABEL[category]}: ${name} [${code}]`,
      fieldSummary: 'name/code/category',
    }, readback.reason);
    return { kind: 'readback-mismatch', reason: readback.reason, correlationId };
  }
  const row = readback.row;
  if (ci(row.name) !== ci(name) || ci(row.code) !== ci(code) || row.categoryValue !== categoryValue || !row.active) {
    const reason = 'The created reference value did not read back as written.';
    await emitFailedAudit(deps, actorBind, correlationId, {
      action: 'create', id, categoryLabel: DEAL_REFERENCE_CATEGORY_LABEL[category],
      beforeState: '(none)', afterState: `${DEAL_REFERENCE_CATEGORY_LABEL[category]}: ${name} [${code}]`,
      fieldSummary: 'name/code/category',
    }, reason);
    return { kind: 'readback-mismatch', reason, correlationId };
  }

  return finishSuccess(deps, correlationId, actorBind, {
    action: 'create', id, categoryLabel: DEAL_REFERENCE_CATEGORY_LABEL[category],
    beforeState: '(none)', afterState: `${DEAL_REFERENCE_CATEGORY_LABEL[category]}: ${name} [${code}]`,
    fieldSummary: 'name/code/category',
  }, `${DEAL_REFERENCE_CATEGORY_LABEL[category]}: ${name}`);
}

// ---------------------------------------------------------------------------
// Update (name / code / sort order)
// ---------------------------------------------------------------------------

async function handleUpdate(
  action: Extract<DealReferenceWriteAction, { kind: 'update' }>,
  deps: DealReferenceWriteDeps,
  correlationId: string,
  actorBind: string,
): Promise<DealReferenceWriteOutcome> {
  const id = trimmed(action.id);
  const current = await safeGet(deps, id);
  if (!current.ok) return { kind: 'not-found', reason: current.reason, correlationId };
  const row = current.row;
  const category = row.category;
  const categoryLabel = category ? DEAL_REFERENCE_CATEGORY_LABEL[category] : 'Uncategorized';

  const nextName = action.name !== undefined ? trimmed(action.name) : undefined;
  const nextCode = action.code !== undefined ? trimmed(action.code) : undefined;

  // Uniqueness (only when we can scope to a category and something identity-ish changes).
  if ((nextName !== undefined || nextCode !== undefined) && row.categoryValue !== undefined) {
    const list = await deps.listCategoryRows(row.categoryValue);
    if (!list.success) {
      return { kind: 'write-failed', error: list.error?.message ?? 'Could not read existing values to check for duplicates.', correlationId };
    }
    const dup = findDuplicate(list.rows ?? [], {
      code: nextCode ?? row.code,
      name: nextName ?? row.name,
      excludeId: id,
    });
    if (dup) return { kind: 'duplicate', reason: dup };
  }

  const patch: Record<string, unknown> = {};
  if (nextName !== undefined) patch.cr664_name = nextName;
  if (nextCode !== undefined) patch.cr664_code = nextCode;
  if (action.sortOrder !== undefined) patch.cr664_sortorder = action.sortOrder;

  let updated: DealReferenceWriteResult;
  try {
    updated = await deps.updateRow(id, patch);
  } catch (err: unknown) {
    return { kind: 'write-failed', error: err instanceof Error ? err.message : String(err), correlationId };
  }
  if (!updated.success) {
    return { kind: 'write-failed', error: updated.error?.message ?? 'Reference value update returned non-success.', correlationId };
  }

  const readback = await safeGet(deps, id);
  const changed: string[] = [];
  if (nextName !== undefined) changed.push('name');
  if (nextCode !== undefined) changed.push('code');
  if (action.sortOrder !== undefined) changed.push('sort order');
  const auditCtx: AuditContext = {
    action: 'update', id, categoryLabel,
    beforeState: `${row.name} [${row.code}]`,
    afterState: `${nextName ?? row.name} [${nextCode ?? row.code}]`,
    fieldSummary: changed.join(', '),
  };
  if (!readback.ok) {
    await emitFailedAudit(deps, actorBind, correlationId, auditCtx, readback.reason);
    return { kind: 'readback-mismatch', reason: readback.reason, correlationId };
  }
  const after = readback.row;
  const nameOk = nextName === undefined || ci(after.name) === ci(nextName);
  const codeOk = nextCode === undefined || ci(after.code) === ci(nextCode);
  const sortOk = action.sortOrder === undefined || after.sortOrder === action.sortOrder;
  if (!nameOk || !codeOk || !sortOk) {
    const reason = 'The update did not read back as saved.';
    await emitFailedAudit(deps, actorBind, correlationId, auditCtx, reason);
    return { kind: 'readback-mismatch', reason, correlationId };
  }

  return finishSuccess(deps, correlationId, actorBind, auditCtx, `${categoryLabel}: ${nextName ?? row.name}`);
}

// ---------------------------------------------------------------------------
// Deactivate / Reactivate
// ---------------------------------------------------------------------------

async function handleToggle(
  action: Extract<DealReferenceWriteAction, { kind: 'deactivate' | 'reactivate' }>,
  deps: DealReferenceWriteDeps,
  correlationId: string,
  actorBind: string,
): Promise<DealReferenceWriteOutcome> {
  const id = trimmed(action.id);
  const activate = action.kind === 'reactivate';
  const current = await safeGet(deps, id);
  if (!current.ok) return { kind: 'not-found', reason: current.reason, correlationId };
  const row = current.row;
  const category = row.category;
  const categoryLabel = category ? DEAL_REFERENCE_CATEGORY_LABEL[category] : 'Uncategorized';

  // Reactivating must not resurrect a value that now collides with a live one.
  if (activate && row.categoryValue !== undefined) {
    const list = await deps.listCategoryRows(row.categoryValue);
    if (!list.success) {
      return { kind: 'write-failed', error: list.error?.message ?? 'Could not read existing values to check for duplicates.', correlationId };
    }
    const dup = findDuplicate((list.rows ?? []).filter((r) => r.active), { code: row.code, name: row.name, excludeId: id });
    if (dup) return { kind: 'duplicate', reason: `Cannot reactivate — ${dup}` };
  }

  let updated: DealReferenceWriteResult;
  try {
    updated = await deps.updateRow(id, { cr664_activeflag: activate });
  } catch (err: unknown) {
    return { kind: 'write-failed', error: err instanceof Error ? err.message : String(err), correlationId };
  }
  if (!updated.success) {
    return { kind: 'write-failed', error: updated.error?.message ?? 'Reference value update returned non-success.', correlationId };
  }

  const auditCtx: AuditContext = {
    action: action.kind, id, categoryLabel,
    beforeState: row.active ? 'Active' : 'Inactive',
    afterState: activate ? 'Active' : 'Inactive',
    fieldSummary: 'active flag',
  };
  const readback = await safeGet(deps, id);
  if (!readback.ok) {
    await emitFailedAudit(deps, actorBind, correlationId, auditCtx, readback.reason);
    return { kind: 'readback-mismatch', reason: readback.reason, correlationId };
  }
  if (readback.row.active !== activate) {
    const reason = `The ${activate ? 'reactivation' : 'deactivation'} did not read back as saved.`;
    await emitFailedAudit(deps, actorBind, correlationId, auditCtx, reason);
    return { kind: 'readback-mismatch', reason, correlationId };
  }

  return finishSuccess(deps, correlationId, actorBind, auditCtx, `${categoryLabel}: ${row.name}`);
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

/** Find a blocking duplicate: code (any state) or ACTIVE name, excluding self. */
function findDuplicate(
  rows: readonly DealReferenceAdminRow[],
  target: { code: string; name: string; excludeId: string | undefined },
): string | null {
  const code = ci(target.code);
  const name = ci(target.name);
  for (const r of rows) {
    if (target.excludeId && r.id === target.excludeId) continue;
    if (ci(r.code) === code) return `A value with code "${target.code}" already exists in this category.`;
    if (r.active && ci(r.name) === name) return `An active value named "${target.name}" already exists in this category.`;
  }
  return null;
}

async function safeGet(
  deps: DealReferenceWriteDeps,
  id: string,
): Promise<{ ok: true; row: DealReferenceAdminRow } | { ok: false; reason: string }> {
  let res: DealReferenceReadResult;
  try {
    res = await deps.getRow(id);
  } catch (err: unknown) {
    return { ok: false, reason: err instanceof Error ? err.message : String(err) };
  }
  if (!res.success || !res.row) {
    return { ok: false, reason: res.error?.message ?? 'The reference value could not be read.' };
  }
  return { ok: true, row: res.row };
}

/** Emit the Succeeded audit; a failed audit on a verified write is a partial. */
async function finishSuccess(
  deps: DealReferenceWriteDeps,
  correlationId: string,
  actorBind: string,
  ctx: AuditContext,
  label: string,
): Promise<DealReferenceWriteOutcome> {
  assertChangedByCoreUserBind(actorBind);
  let audit: DealReferenceAuditResult;
  try {
    audit = await deps.emitAudit(buildAuditPayload(ctx, actorBind, correlationId, AUDIT_OUTCOME_SUCCEEDED, undefined));
  } catch (err: unknown) {
    return { kind: 'audit-failed', auditError: err instanceof Error ? err.message : String(err), correlationId, id: ctx.id };
  }
  if (!audit.success) {
    return { kind: 'audit-failed', auditError: audit.error?.message ?? 'Audit create returned non-success.', correlationId, id: ctx.id };
  }
  return { kind: 'success', action: ctx.action, id: ctx.id, label, correlationId, auditId: audit.id };
}

function buildAuditPayload(
  ctx: AuditContext,
  actorBind: string,
  correlationId: string,
  outcome: number,
  failureReason: string | undefined,
): Record<string, unknown> {
  const nowIso = new Date().toISOString();
  const verb =
    ctx.action === 'create' ? 'created' :
    ctx.action === 'update' ? 'updated' :
    ctx.action === 'deactivate' ? 'deactivated' : 'reactivated';
  return {
    cr664_auditeventname: `Deal reference value ${verb}`,
    cr664_eventcategory: AUDIT_EVENT_CATEGORY_CONFIGURATION,
    cr664_eventtype: AUDIT_EVENT_TYPE_ADMIN_CONFIGURATION_CHANGE,
    cr664_entitytype: AUDIT_ENTITY_TYPE_CONFIGURATION,
    cr664_entityid: ctx.id,
    cr664_relatedentitytype: 'cr664_producttypereference',
    cr664_relatedentityid: ctx.id,
    cr664_outcomestatus: outcome,
    cr664_failurereason: failureReason,
    cr664_changeddate: nowIso,
    'cr664_ChangedBy@odata.bind': actorBind,
    cr664_fieldname: `deal-reference-value/${ctx.action}`,
    cr664_oldvalue: ctx.beforeState,
    cr664_newvalue: ctx.afterState,
    cr664_beforestate: ctx.beforeState,
    cr664_afterstate: ctx.afterState,
    cr664_notes: `${ctx.categoryLabel} reference value ${verb} (${ctx.fieldSummary}) from Admin → Deal Reference Values.`,
    cr664_sourcescreensourceprocess: SOURCE_PROCESS,
    cr664_correlationid: correlationId,
  };
}

/** Best-effort Failed audit for a write/readback failure. Never throws. */
async function emitFailedAudit(
  deps: DealReferenceWriteDeps,
  actorBind: string,
  correlationId: string,
  ctx: AuditContext,
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

const ADMIN_SELECT = [
  ID_ATTR,
  'cr664_name',
  'cr664_code',
  'cr664_activeflag',
  'cr664_sortorder',
  DEAL_REFERENCE_CATEGORY_COLUMN,
];

interface RawRefRow {
  cr664_producttypereferenceid?: string;
  cr664_name?: string;
  cr664_code?: string;
  cr664_activeflag?: boolean;
  cr664_sortorder?: number;
  cr664_category?: number;
  [key: string]: unknown;
}

function mapRow(raw: RawRefRow): DealReferenceAdminRow {
  const categoryValue = typeof raw.cr664_category === 'number' ? raw.cr664_category : undefined;
  return {
    id: raw.cr664_producttypereferenceid ?? '',
    name: typeof raw.cr664_name === 'string' ? raw.cr664_name : '',
    code: typeof raw.cr664_code === 'string' ? raw.cr664_code : '',
    category: categoryForOptionValue(categoryValue),
    categoryValue,
    active: raw.cr664_activeflag !== false,
    sortOrder: typeof raw.cr664_sortorder === 'number' ? raw.cr664_sortorder : undefined,
  };
}

export function buildLiveDealReferenceWriteDeps(): DealReferenceWriteDeps {
  return {
    listCategoryRows: async (categoryValue) => {
      const { Cr664_producttypereferencesService: s } = await import(
        '../generated/services/Cr664_producttypereferencesService'
      );
      const r = await s.getAll({
        select: ADMIN_SELECT,
        filter: `${DEAL_REFERENCE_CATEGORY_COLUMN} eq ${categoryValue}`,
        top: 200,
      });
      return {
        success: r.success,
        rows: r.success ? (r.data ?? []).map((row) => mapRow(row as unknown as RawRefRow)) : undefined,
        error: r.error ?? undefined,
      };
    },
    getRow: async (id) => {
      const { Cr664_producttypereferencesService: s } = await import(
        '../generated/services/Cr664_producttypereferencesService'
      );
      const r = await s.get(id, { select: ADMIN_SELECT });
      return {
        success: r.success,
        row: r.success && r.data ? mapRow(r.data as unknown as RawRefRow) : undefined,
        error: r.error ?? undefined,
      };
    },
    createRow: async (payload) => {
      const { Cr664_producttypereferencesService: s } = await import(
        '../generated/services/Cr664_producttypereferencesService'
      );
      const r = await s.create(payload as unknown as Parameters<typeof s.create>[0]);
      return { success: r.success, id: r.data?.cr664_producttypereferenceid, error: r.error ?? undefined };
    },
    updateRow: async (id, patch) => {
      const { Cr664_producttypereferencesService: s } = await import(
        '../generated/services/Cr664_producttypereferencesService'
      );
      const r = await s.update(id, patch as unknown as Parameters<typeof s.update>[1]);
      return { success: r.success, error: r.error ?? undefined };
    },
    emitAudit: async (payload) => {
      const { Cr664_auditeventsService } = await import(
        '../generated/services/Cr664_auditeventsService'
      );
      const r = await Cr664_auditeventsService.create(
        payload as unknown as Parameters<typeof Cr664_auditeventsService.create>[0],
      );
      return { success: r.success, id: r.data?.cr664_auditeventid, error: r.error ?? undefined };
    },
    resolveActorChangedBy: createActorChangedByResolver(),
  };
}

/** Entity set constant re-exported for the live read loader / tests. */
export { DEAL_REFERENCE_ENTITY_SET };
