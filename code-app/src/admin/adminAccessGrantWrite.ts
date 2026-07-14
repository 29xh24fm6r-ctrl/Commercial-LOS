/**
 * Governed Admin → Grant / Revoke Admin Access.
 *
 * Of the five workspaces, Admin is the ONLY one whose "additional access
 * beyond your primary workspace" is actually read from
 * `cr664_workspaceentitlements` anywhere in the app (see
 * bootstrap/workspaceEntitlements.ts `useEntitledRoutes()` — Manager/Team
 * come from a completely different mechanism, the banker's team FK; Banker
 * and Executive have no additional-entitlement path at all). So this module
 * is deliberately scoped to Admin only — a generic "grant workspace X" write
 * would create a row nothing in the app ever reads for any workspace but
 * Admin, which would be a write with no effect masquerading as a grant.
 *
 * Because the entitlement table carries no reliable PlatformUser FK and its
 * Workspace lookup isn't reliably selectable live (see
 * adminWorkspaceEntitlementQuery.ts), a grant is encoded the same way the
 * live admin-entitlement probe already reads it: the entitlement's NAME
 * carries both the target's identity (a "{upn} - Admin ..." prefix,
 * `classifyCurrentUserIdentityMatch`) and its admin-shape (the literal word
 * "admin", `strictAdminEntitlementName`); `cr664_accesslevel` carries the
 * tier (Admin/Full).
 *
 * Only an ADMIN-tier actor (their OWN entitlement's access level, not just
 * Full) may grant or revoke — enforced by the caller supplying
 * `actorAccessTier` from `loadCurrentAdminAccessTier`. A Full-tier admin can
 * use every other admin tool but not change who else has access. An actor
 * can never revoke their OWN entitlement through this panel (self-lockout
 * guard) — a second Admin-tier admin must do it.
 *
 * Same discipline as every other governed write in this app: fail-closed
 * authorization → resolve auditable actor BEFORE mutating → validate →
 * duplicate / self-lockout guards → mutate → readback verification →
 * Succeeded audit (best-effort Failed audit on a write/readback failure) →
 * discriminated outcome. Pure over injected deps so the fail-closed
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
  classifyCurrentUserIdentityMatch,
  entitlementMeetsAdminGates,
  type AdminCurrentUser,
  type AdminEntitlementCandidate,
} from './adminWorkspaceEntitlementQuery';

// Schema-verified cr664_auditevents option-set values (see Cr664_auditeventsModel.ts):
//   eventcategory Authorization    = 788190001
//   eventtype     PermissionChange = 788190009
//   entitytype    User             = 788190003
const AUDIT_EVENT_CATEGORY_AUTHORIZATION = 788190001;
const AUDIT_EVENT_TYPE_PERMISSION_CHANGE = 788190009;
const AUDIT_ENTITY_TYPE_USER = 788190003;

// cr664_workspaceentitlementses.cr664_accesslevel option-set values.
const ACCESS_LEVEL_VALUE: Record<GrantableAccessLevel, number> = { Admin: 788190002, Full: 788190000 };

const SOURCE_PROCESS = 'AdminWorkspace/UserAccess/grant-admin-access';

/** Only Admin/Full actually grant admin-workspace access; ReadOnly does not. */
export type GrantableAccessLevel = 'Admin' | 'Full';

export interface GrantAdminAccessAction {
  readonly kind: 'grant';
  readonly targetPlatformUserId: string;
  readonly targetUpn: string;
  readonly targetFullName: string;
  readonly accessLevel: GrantableAccessLevel;
}

export interface RevokeAdminAccessAction {
  readonly kind: 'revoke';
  readonly entitlementId: string;
  readonly entitlementName: string;
}

export type AdminAccessGrantAction = GrantAdminAccessAction | RevokeAdminAccessAction;

export interface AdminAccessGrantInput {
  readonly action: AdminAccessGrantAction;
  /** Acting admin's email — resolves the REQUIRED audit cr664_ChangedBy. */
  readonly actorEmail: string | undefined;
  readonly actorFullName: string | undefined;
  /** Acting admin's Dataverse systemuserid — required for a governed write. */
  readonly actorSystemUserId: string | undefined;
  /** The ACTING admin's own resolved tier — only 'admin' may grant/revoke. */
  readonly actorAccessTier: 'admin' | 'full' | 'none' | 'failed';
  /** Caller's fail-closed admin authorization (the route/identity gate). */
  readonly authorized: boolean;
}

export type AdminAccessGrantOutcome =
  | { kind: 'success'; action: 'grant' | 'revoke'; label: string; correlationId: string; auditId: string | undefined }
  | { kind: 'unauthorized'; reason: string }
  | { kind: 'insufficient-tier'; reason: string }
  | { kind: 'identity-unresolved'; reason: string }
  | { kind: 'invalid-input'; reason: string }
  | { kind: 'duplicate'; reason: string }
  | { kind: 'self-lockout-blocked'; reason: string }
  | { kind: 'not-found'; reason: string }
  | { kind: 'write-failed'; error: string; correlationId: string }
  | { kind: 'readback-mismatch'; reason: string; correlationId: string }
  | { kind: 'audit-failed'; auditError: string | undefined; correlationId: string };

export interface EntitlementWriteResult {
  readonly success: boolean;
  readonly id?: string;
  readonly error?: { readonly message?: string };
}
export interface EntitlementReadResult {
  readonly success: boolean;
  readonly row?: { readonly entitlementName: string; readonly accessLevel: number | undefined; readonly active: boolean };
  readonly error?: { readonly message?: string };
}
export interface EntitlementListResult {
  readonly success: boolean;
  readonly rows?: readonly AdminEntitlementCandidate[];
  readonly error?: { readonly message?: string };
}
export interface AdminAccessAuditResult {
  readonly success: boolean;
  readonly id?: string;
  readonly error?: { readonly message?: string };
}

/** Injected dependencies — SDK-free so the adapter is unit-testable. */
export interface AdminAccessGrantDeps {
  /** List every ACTIVE admin-shaped entitlement (for duplicate / self-lockout checks). */
  readonly listAdminShapedEntitlements: () => Promise<EntitlementListResult>;
  readonly createEntitlement: (payload: Record<string, unknown>) => Promise<EntitlementWriteResult>;
  readonly getEntitlement: (id: string) => Promise<EntitlementReadResult>;
  readonly updateEntitlement: (id: string, patch: Record<string, unknown>) => Promise<EntitlementWriteResult>;
  readonly emitAudit: (payload: Record<string, unknown>) => Promise<AdminAccessAuditResult>;
  readonly resolveActorChangedBy: ResolveActorChangedBy;
}

function trimmed(v: string | undefined): string {
  return (v ?? '').trim();
}

function buildEntitlementName(upn: string, level: GrantableAccessLevel): string {
  return `${upn} - Admin ${level} Access`;
}

/**
 * Governed grant/revoke of Admin workspace access. Pure over `deps`.
 */
export async function writeAdminAccessGrant(
  input: AdminAccessGrantInput,
  deps: AdminAccessGrantDeps,
): Promise<AdminAccessGrantOutcome> {
  // 1. Fail-closed authorization (the route/identity gate every admin panel shares).
  if (!input.authorized) {
    return { kind: 'unauthorized', reason: 'Caller is not an authorized administrator.' };
  }
  if (trimmed(input.actorSystemUserId).length === 0) {
    return {
      kind: 'identity-unresolved',
      reason: 'No Dataverse identity is available for the signed-in administrator; nothing was changed.',
    };
  }
  // 2. Only an Admin-tier actor may grant/revoke — a Full-tier admin uses
  //    every other admin tool but not this one.
  if (input.actorAccessTier !== 'admin') {
    return {
      kind: 'insufficient-tier',
      reason:
        input.actorAccessTier === 'failed'
          ? 'Your own access tier could not be confirmed; granting/revoking access is blocked until it can be.'
          : 'Granting or revoking admin access requires the Admin access tier. You have Full or no admin-shaped entitlement.',
    };
  }

  const action = input.action;
  if (action.kind === 'grant') {
    const targetUpn = trimmed(action.targetUpn);
    if (trimmed(action.targetPlatformUserId).length === 0 || targetUpn.length === 0) {
      return { kind: 'invalid-input', reason: 'No user was selected to grant access to.' };
    }
    if (action.accessLevel !== 'Admin' && action.accessLevel !== 'Full') {
      return { kind: 'invalid-input', reason: 'Access level must be Admin or Full.' };
    }
  } else {
    if (trimmed(action.entitlementId).length === 0) {
      return { kind: 'invalid-input', reason: 'No entitlement was selected to revoke.' };
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

  if (action.kind === 'grant') {
    return handleGrant(action, deps, actorBind);
  }
  return handleRevoke(action, input, deps, actorBind);
}

async function handleGrant(
  action: GrantAdminAccessAction,
  deps: AdminAccessGrantDeps,
  actorBind: string,
): Promise<AdminAccessGrantOutcome> {
  const correlationId = newCorrelationId('ag');
  const targetUpn = trimmed(action.targetUpn);

  // Duplicate guard: never grant a second active admin-shaped entitlement to
  // the same user.
  const list = await deps.listAdminShapedEntitlements();
  if (!list.success) {
    return { kind: 'write-failed', error: list.error?.message ?? 'Could not read existing entitlements to check for duplicates.', correlationId };
  }
  const targetIdentity: AdminCurrentUser = { upn: targetUpn, fullName: action.targetFullName };
  const alreadyHasAdminAccess = (list.rows ?? []).some(
    (c) => entitlementMeetsAdminGates(c) && classifyCurrentUserIdentityMatch(targetIdentity, c) !== 'none',
  );
  if (alreadyHasAdminAccess) {
    return { kind: 'duplicate', reason: `"${action.targetFullName || targetUpn}" already has an active admin-shaped entitlement.` };
  }

  const entitlementName = buildEntitlementName(targetUpn, action.accessLevel);
  const accessLevelValue = ACCESS_LEVEL_VALUE[action.accessLevel];

  let created: EntitlementWriteResult;
  try {
    created = await deps.createEntitlement({
      cr664_entitlementname: entitlementName,
      cr664_accesslevel: accessLevelValue,
    });
  } catch (err: unknown) {
    return { kind: 'write-failed', error: err instanceof Error ? err.message : String(err), correlationId };
  }
  if (!created.success || !created.id) {
    return { kind: 'write-failed', error: created.error?.message ?? 'Entitlement create returned non-success.', correlationId };
  }
  const id = created.id;

  const auditCtx: AuditCtx = {
    action: 'grant',
    entityId: id,
    beforeState: '(none)',
    afterState: `${entitlementName} [${action.accessLevel}]`,
  };

  const readback = await safeGet(deps, id);
  if (!readback.ok) {
    await emitFailedAudit(deps, actorBind, correlationId, auditCtx, readback.reason);
    return { kind: 'readback-mismatch', reason: readback.reason, correlationId };
  }
  if (readback.row.entitlementName.trim() !== entitlementName || readback.row.accessLevel !== accessLevelValue || !readback.row.active) {
    const reason = 'The granted entitlement did not read back as written.';
    await emitFailedAudit(deps, actorBind, correlationId, auditCtx, reason);
    return { kind: 'readback-mismatch', reason, correlationId };
  }

  return finishSuccess(deps, correlationId, actorBind, auditCtx, 'grant', `Admin ${action.accessLevel} access granted to ${action.targetFullName || targetUpn}.`);
}

async function handleRevoke(
  action: RevokeAdminAccessAction,
  input: AdminAccessGrantInput,
  deps: AdminAccessGrantDeps,
  actorBind: string,
): Promise<AdminAccessGrantOutcome> {
  const correlationId = newCorrelationId('ag');
  const id = trimmed(action.entitlementId);

  // Self-lockout guard: an actor can never revoke their own entitlement here.
  const actorIdentity: AdminCurrentUser = { upn: trimmed(input.actorEmail), fullName: input.actorFullName };
  const nameMatch = classifyCurrentUserIdentityMatch(actorIdentity, { entitlementName: action.entitlementName });
  if (nameMatch !== 'none') {
    return {
      kind: 'self-lockout-blocked',
      reason: 'You cannot revoke your own admin access through this panel. Ask another Admin-tier admin to revoke it.',
    };
  }

  const current = await safeGet(deps, id);
  if (!current.ok) return { kind: 'not-found', reason: current.reason };
  if (!current.row.active) {
    return { kind: 'invalid-input', reason: `"${current.row.entitlementName}" is already revoked.` };
  }

  const auditCtx: AuditCtx = {
    action: 'revoke',
    entityId: id,
    beforeState: 'Active',
    afterState: 'Inactive',
  };

  let updated: EntitlementWriteResult;
  try {
    updated = await deps.updateEntitlement(id, { statecode: 1, statuscode: 2 });
  } catch (err: unknown) {
    return { kind: 'write-failed', error: err instanceof Error ? err.message : String(err), correlationId };
  }
  if (!updated.success) {
    return { kind: 'write-failed', error: updated.error?.message ?? 'Entitlement revoke returned non-success.', correlationId };
  }

  const readback = await safeGet(deps, id);
  if (!readback.ok) {
    await emitFailedAudit(deps, actorBind, correlationId, auditCtx, readback.reason);
    return { kind: 'readback-mismatch', reason: readback.reason, correlationId };
  }
  if (readback.row.active) {
    const reason = 'The revoke did not read back as saved.';
    await emitFailedAudit(deps, actorBind, correlationId, auditCtx, reason);
    return { kind: 'readback-mismatch', reason, correlationId };
  }

  return finishSuccess(deps, correlationId, actorBind, auditCtx, 'revoke', `"${current.row.entitlementName}" revoked.`);
}

async function safeGet(
  deps: AdminAccessGrantDeps,
  id: string,
): Promise<{ ok: true; row: { entitlementName: string; accessLevel: number | undefined; active: boolean } } | { ok: false; reason: string }> {
  let res: EntitlementReadResult;
  try {
    res = await deps.getEntitlement(id);
  } catch (err: unknown) {
    return { ok: false, reason: err instanceof Error ? err.message : String(err) };
  }
  if (!res.success || !res.row) {
    return { ok: false, reason: res.error?.message ?? 'The entitlement could not be read.' };
  }
  return { ok: true, row: res.row };
}

interface AuditCtx {
  readonly action: 'grant' | 'revoke';
  readonly entityId: string;
  readonly beforeState: string;
  readonly afterState: string;
}

async function finishSuccess(
  deps: AdminAccessGrantDeps,
  correlationId: string,
  actorBind: string,
  ctx: AuditCtx,
  action: 'grant' | 'revoke',
  label: string,
): Promise<AdminAccessGrantOutcome> {
  assertChangedByCoreUserBind(actorBind);
  let audit: AdminAccessAuditResult;
  try {
    audit = await deps.emitAudit(buildAuditPayload(ctx, actorBind, correlationId, AUDIT_OUTCOME_SUCCEEDED, undefined));
  } catch (err: unknown) {
    return { kind: 'audit-failed', auditError: err instanceof Error ? err.message : String(err), correlationId };
  }
  if (!audit.success) {
    return { kind: 'audit-failed', auditError: audit.error?.message ?? 'Audit create returned non-success.', correlationId };
  }
  return { kind: 'success', action, label, correlationId, auditId: audit.id };
}

function buildAuditPayload(
  ctx: AuditCtx,
  actorBind: string,
  correlationId: string,
  outcome: number,
  failureReason: string | undefined,
): Record<string, unknown> {
  const nowIso = new Date().toISOString();
  const verb = ctx.action === 'grant' ? 'granted' : 'revoked';
  return {
    cr664_auditeventname: `Admin access ${verb}`,
    cr664_eventcategory: AUDIT_EVENT_CATEGORY_AUTHORIZATION,
    cr664_eventtype: AUDIT_EVENT_TYPE_PERMISSION_CHANGE,
    cr664_entitytype: AUDIT_ENTITY_TYPE_USER,
    cr664_entityid: ctx.entityId,
    cr664_relatedentitytype: 'cr664_workspaceentitlementses',
    cr664_relatedentityid: ctx.entityId,
    cr664_outcomestatus: outcome,
    cr664_failurereason: failureReason,
    cr664_changeddate: nowIso,
    'cr664_ChangedBy@odata.bind': actorBind,
    cr664_fieldname: 'cr664_accesslevel/statecode',
    cr664_oldvalue: ctx.beforeState,
    cr664_newvalue: ctx.afterState,
    cr664_beforestate: ctx.beforeState,
    cr664_afterstate: ctx.afterState,
    cr664_notes: `Admin workspace access ${verb} from Admin → Grant/Revoke Admin Access.`,
    cr664_sourcescreensourceprocess: SOURCE_PROCESS,
    cr664_correlationid: correlationId,
  };
}

/** Best-effort Failed audit for a write/readback failure. Never throws. */
async function emitFailedAudit(
  deps: AdminAccessGrantDeps,
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

const ADMIN_SHAPED_FILTER =
  'statecode eq 0 and (cr664_accesslevel eq 788190002 or cr664_accesslevel eq 788190000)';

export function buildLiveAdminAccessGrantDeps(): AdminAccessGrantDeps {
  return {
    listAdminShapedEntitlements: async () => {
      const { Cr664_workspaceentitlementsesService } = await import(
        '../generated/services/Cr664_workspaceentitlementsesService'
      );
      const r = await Cr664_workspaceentitlementsesService.getAll({
        select: ['cr664_entitlementname', 'cr664_accesslevel', '_cr664_losuserprofile_value', 'statecode'],
        filter: ADMIN_SHAPED_FILTER,
        top: 200,
      });
      return {
        success: r.success,
        rows: r.success
          ? (r.data ?? []).map((row) => ({
              entitlementName: row.cr664_entitlementname,
              accessLevel: row.cr664_accesslevel,
              losUserProfileId: row._cr664_losuserprofile_value,
              active: row.statecode === 0,
            }))
          : undefined,
        error: r.error ?? undefined,
      };
    },
    createEntitlement: async (payload) => {
      const { Cr664_workspaceentitlementsesService } = await import(
        '../generated/services/Cr664_workspaceentitlementsesService'
      );
      const r = await Cr664_workspaceentitlementsesService.create(
        payload as unknown as Parameters<typeof Cr664_workspaceentitlementsesService.create>[0],
      );
      return { success: r.success, id: r.data?.cr664_workspaceentitlementsid, error: r.error ?? undefined };
    },
    getEntitlement: async (id) => {
      const { Cr664_workspaceentitlementsesService } = await import(
        '../generated/services/Cr664_workspaceentitlementsesService'
      );
      const r = await Cr664_workspaceentitlementsesService.get(id, {
        select: ['cr664_entitlementname', 'cr664_accesslevel', 'statecode'],
      });
      return {
        success: r.success,
        row:
          r.success && r.data
            ? { entitlementName: r.data.cr664_entitlementname, accessLevel: r.data.cr664_accesslevel, active: r.data.statecode === 0 }
            : undefined,
        error: r.error ?? undefined,
      };
    },
    updateEntitlement: async (id, patch) => {
      const { Cr664_workspaceentitlementsesService } = await import(
        '../generated/services/Cr664_workspaceentitlementsesService'
      );
      const r = await Cr664_workspaceentitlementsesService.update(
        id,
        patch as unknown as Parameters<typeof Cr664_workspaceentitlementsesService.update>[1],
      );
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
