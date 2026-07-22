/**
 * Phase 208 / Lane A2 — Governed app-level entitlement GRANT write adapter.
 *
 * SUPERSEDED NOTICE (2026-07-21 E2E certification pass, D12): this adapter has
 * zero call sites outside its own tests and remains permanently disabled by
 * design. The capability it targets — a real, live, server-verified admin
 * entitlement grant — is DELIVERED today via a different, later module:
 * `src/admin/adminAccessGrantWrite.ts` (`writeAdminAccessGrant`), consumed by
 * `src/admin/AdminAccessGrantPanel.tsx`. That path has no disabled-by-default
 * flag, enforces actor-tier gating, duplicate/self-lockout guards, readback
 * verification, and audit — it is the real one. This file is kept only as
 * historical design work; do not re-wire it believing entitlement grants are
 * unimplemented, and do not treat it as the live gate for this capability.
 *
 * Pure orchestration over an INJECTED entitlement-write transport and audit sink
 * — it performs no `fetch`, imports no SDK, and is DISABLED BY DEFAULT. It grants
 * exactly ONE app-level workspace entitlement (a `cr664_workspaceentitlements`
 * row) only when every hard gate passes, writes an audit row capturing who
 * granted what to whom, and returns a typed outcome.
 *
 * It grants LOS app-level access only. It does NOT grant Microsoft tenant access,
 * Dataverse security roles, or Entra role assignments — and the copy must never
 * imply it does.
 *
 * Gates (all required for a live grant):
 *   ADMIN_ENTITLEMENT_WRITE_ENABLED (config) === true
 *   actor is Super Admin
 *   target platform user exists
 *   workspace + access level valid (from the safe enumeration)
 *   transport present (Dataverse create available)
 *   audit sink present (audit service available)
 *   single-record smoke mode enabled
 *   deterministic correlation id provided
 *
 * No fabricated data: access-level option values are supplied by the caller from
 * the live read enumeration — none are invented here. A duplicate active
 * entitlement is never re-created.
 */

/** Build-time default — OFF. A live grant requires config.writeEnabled === true. */
export const ADMIN_ENTITLEMENT_WRITE_ENABLED = false as const;

/** The only access-level names this adapter will grant (safe enumeration). */
export const VALID_ACCESS_LEVEL_NAMES = ['Admin', 'Full', 'ReadOnly'] as const;
export type AdminAccessLevelName = (typeof VALID_ACCESS_LEVEL_NAMES)[number];

export type AdminEntitlementGrantMode = 'dry-run' | 'live';

export type AdminEntitlementGrantOutcome =
  | 'created'
  | 'dry_run_only'
  | 'blocked_gate_not_satisfied'
  | 'skipped_missing_required_data'
  | 'duplicate_exists'
  | 'failed_dataverse'
  | 'audit_failed_partial_success';

export interface AdminEntitlementActor {
  platformUserId: string;
  upn: string;
  isSuperAdmin: boolean;
}

export interface ExistingEntitlement {
  platformUserId: string;
  workspaceId: string;
  active: boolean;
}

export interface EntitlementWritePayload {
  /** Target platform user id (lookup). */
  platformUserId: string;
  workspaceId: string;
  /** Access-level option value from the live enumeration. */
  accessLevelValue: number;
  accessLevelName: AdminAccessLevelName;
}

export interface EntitlementWriteTransport {
  createEntitlement(payload: EntitlementWritePayload): Promise<{ ok: boolean; id?: string; error?: string }>;
}

export interface AdminEntitlementAuditPayload {
  correlationId: string;
  actorPlatformUserId: string;
  actorUpn: string;
  action: 'grant-entitlement';
  targetPlatformUserId: string;
  workspaceId: string;
  accessLevelName: string;
  reason: string | null;
  previousValue: null;
  newValue: { workspaceId: string; accessLevelName: string };
  outcome: AdminEntitlementGrantOutcome;
  error: string | null;
}

export interface EntitlementAuditSink {
  write(audit: AdminEntitlementAuditPayload): Promise<{ ok: boolean; error?: string }>;
}

export interface AdminEntitlementGrantConfig {
  writeEnabled?: boolean;
  singleRecordSmokeEnabled?: boolean;
}

export interface AdminEntitlementGrantInput {
  mode: AdminEntitlementGrantMode;
  actor: AdminEntitlementActor;
  targetPlatformUserId: string;
  targetPlatformUserExists: boolean;
  workspaceId: string;
  accessLevelName: string;
  accessLevelValue: number;
  reason?: string;
  correlationId: string;
  config?: AdminEntitlementGrantConfig;
  transport?: EntitlementWriteTransport;
  auditSink?: EntitlementAuditSink;
  existingEntitlements?: ExistingEntitlement[];
}

export interface AdminEntitlementGrantResult {
  outcome: AdminEntitlementGrantOutcome;
  recordId: string | null;
  correlationId: string;
  gateSatisfied: boolean;
  blockers: string[];
  audit: AdminEntitlementAuditPayload;
  blockedReason: string | null;
}

function isValidAccessLevelName(name: string): name is AdminAccessLevelName {
  return (VALID_ACCESS_LEVEL_NAMES as readonly string[]).includes(name);
}

function missingRequired(input: AdminEntitlementGrantInput): string[] {
  const missing: string[] = [];
  if (!input.targetPlatformUserId || input.targetPlatformUserId.trim() === '') missing.push('targetPlatformUserId');
  if (!input.workspaceId || input.workspaceId.trim() === '') missing.push('workspaceId');
  if (!isValidAccessLevelName(input.accessLevelName)) missing.push('accessLevelName');
  if (!Number.isInteger(input.accessLevelValue) || input.accessLevelValue <= 0) missing.push('accessLevelValue');
  if (!input.correlationId || input.correlationId.trim() === '') missing.push('correlationId');
  return missing;
}

function liveGateBlockers(input: AdminEntitlementGrantInput): string[] {
  const blockers: string[] = [];
  const writeEnabled = input.config?.writeEnabled ?? (ADMIN_ENTITLEMENT_WRITE_ENABLED as boolean);
  if (writeEnabled !== true) blockers.push('ADMIN_ENTITLEMENT_WRITE_ENABLED must be true');
  if (input.actor?.isSuperAdmin !== true) blockers.push('actor must be Super Admin');
  if (input.targetPlatformUserExists !== true) blockers.push('target platform user must exist');
  if (!input.transport) blockers.push('entitlement write transport must be available');
  if (!input.auditSink) blockers.push('audit sink must be available');
  if (input.config?.singleRecordSmokeEnabled !== true) blockers.push('single-record smoke mode must be enabled');
  return blockers;
}

function audit(
  input: AdminEntitlementGrantInput,
  outcome: AdminEntitlementGrantOutcome,
  error: string | null,
): AdminEntitlementAuditPayload {
  return {
    correlationId: input.correlationId,
    actorPlatformUserId: input.actor?.platformUserId ?? '',
    actorUpn: input.actor?.upn ?? '',
    action: 'grant-entitlement',
    targetPlatformUserId: input.targetPlatformUserId,
    workspaceId: input.workspaceId,
    accessLevelName: input.accessLevelName,
    reason: input.reason ?? null,
    previousValue: null,
    newValue: { workspaceId: input.workspaceId, accessLevelName: input.accessLevelName },
    outcome,
    error,
  };
}

function result(
  input: AdminEntitlementGrantInput,
  outcome: AdminEntitlementGrantOutcome,
  opts: { recordId?: string | null; gateSatisfied?: boolean; blockers?: string[]; error?: string | null; blockedReason?: string | null } = {},
): AdminEntitlementGrantResult {
  return {
    outcome,
    recordId: opts.recordId ?? null,
    correlationId: input.correlationId,
    gateSatisfied: opts.gateSatisfied ?? false,
    blockers: opts.blockers ?? [],
    audit: audit(input, outcome, opts.error ?? null),
    blockedReason: opts.blockedReason ?? null,
  };
}

export async function grantAppEntitlement(input: AdminEntitlementGrantInput): Promise<AdminEntitlementGrantResult> {
  // 1) Required data — never invent or default.
  const missing = missingRequired(input);
  if (missing.length > 0) {
    return result(input, 'skipped_missing_required_data', { error: `Missing required data: ${missing.join(', ')}.`, blockedReason: `Missing required data: ${missing.join(', ')}.` });
  }

  // 2) Dry-run previews without writing.
  if (input.mode === 'dry-run') {
    return result(input, 'dry_run_only');
  }

  // 3) Live gates — fail closed.
  const blockers = liveGateBlockers(input);
  if (blockers.length > 0) {
    return result(input, 'blocked_gate_not_satisfied', { blockers, blockedReason: blockers.join('; ') });
  }

  // 4) Duplicate guard — never create a second active entitlement.
  const dup = (input.existingEntitlements ?? []).some(
    (e) => e.active && e.platformUserId === input.targetPlatformUserId && e.workspaceId === input.workspaceId,
  );
  if (dup) {
    return result(input, 'duplicate_exists', { gateSatisfied: true, blockedReason: 'An active entitlement already exists for this user + workspace.' });
  }

  // 5) Single-record create.
  const transport = input.transport!;
  const writeRes = await transport.createEntitlement({
    platformUserId: input.targetPlatformUserId,
    workspaceId: input.workspaceId,
    accessLevelValue: input.accessLevelValue,
    accessLevelName: input.accessLevelName as AdminAccessLevelName,
  });
  if (!writeRes.ok) {
    return result(input, 'failed_dataverse', { gateSatisfied: true, error: writeRes.error ?? 'dataverse_error', blockedReason: writeRes.error ?? 'dataverse_error' });
  }

  // 6) Audit — a business write that succeeds but whose audit fails is an
  //    honest partial success, never a clean success.
  const auditRes = await input.auditSink!.write(audit(input, 'created', null));
  if (!auditRes.ok) {
    return result(input, 'audit_failed_partial_success', { recordId: writeRes.id ?? null, gateSatisfied: true, error: auditRes.error ?? 'audit_write_failed', blockedReason: 'Entitlement was created but the audit write failed.' });
  }

  return result(input, 'created', { recordId: writeRes.id ?? null, gateSatisfied: true });
}
