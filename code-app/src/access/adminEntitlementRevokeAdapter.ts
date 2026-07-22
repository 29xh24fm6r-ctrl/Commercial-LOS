/**
 * Phase 209 / Lane A3 — Governed app-level entitlement REVOKE/DEACTIVATE adapter.
 *
 * SUPERSEDED NOTICE (2026-07-21 E2E certification pass, D12): this adapter has
 * zero call sites outside its own tests and remains permanently disabled by
 * design. Live, server-verified grant/revoke is DELIVERED today via
 * `src/admin/adminAccessGrantWrite.ts` (`writeAdminAccessGrant`, revoke action)
 * consumed by `src/admin/AdminAccessGrantPanel.tsx` — no disabled-by-default
 * flag, self-lockout guard, readback, audit. This file is historical design
 * work only; do not re-wire it or treat it as the live gate for this
 * capability.
 *
 * Pure orchestration over an INJECTED entitlement-revoke transport and audit
 * sink — no `fetch`, no SDK import, DISABLED BY DEFAULT. It DEACTIVATES exactly
 * one app-level workspace entitlement (it never deletes — the row is preserved
 * for audit, so there is no orphaned access state) only when every hard gate
 * passes, requires a reason, audits the revocation, and returns a typed outcome.
 *
 * Safety specifics:
 *   - Fails closed if the target entitlement is ambiguous (the caller supplied
 *     more than one matching active row) or not found.
 *   - Prevents the actor from revoking their own LAST active Admin entitlement
 *     unless an explicit emergency override is enabled (audited when used).
 *   - Revokes LOS app-level access only; no tenant / security-role / Entra change.
 */

import type { AdminEntitlementActor } from './adminEntitlementGrantAdapter';

export const ADMIN_ENTITLEMENT_REVOKE_ENABLED = false as const;

export type AdminEntitlementRevokeMode = 'dry-run' | 'live';

export type AdminEntitlementRevokeOutcome =
  | 'deactivated'
  | 'dry_run_only'
  | 'blocked_gate_not_satisfied'
  | 'skipped_missing_required_data'
  | 'target_not_found'
  | 'ambiguous_target'
  | 'last_admin_protected'
  | 'failed_dataverse'
  | 'audit_failed_partial_success';

export interface RevokeTargetEntitlement {
  entitlementId: string;
  platformUserId: string;
  workspaceId: string;
  accessLevelName: string;
  active: boolean;
}

export interface EntitlementRevokeTransport {
  deactivateEntitlement(entitlementId: string): Promise<{ ok: boolean; error?: string }>;
}

export interface AdminEntitlementRevokeAuditPayload {
  correlationId: string;
  actorPlatformUserId: string;
  actorUpn: string;
  action: 'revoke-entitlement';
  targetEntitlementId: string;
  targetPlatformUserId: string;
  workspaceId: string;
  accessLevelName: string;
  reason: string;
  previousValue: { active: true };
  newValue: { active: false };
  emergencyOverrideUsed: boolean;
  outcome: AdminEntitlementRevokeOutcome;
  error: string | null;
}

export interface EntitlementRevokeAuditSink {
  write(audit: AdminEntitlementRevokeAuditPayload): Promise<{ ok: boolean; error?: string }>;
}

export interface AdminEntitlementRevokeConfig {
  revokeEnabled?: boolean;
  singleRecordSmokeEnabled?: boolean;
  emergencyOverrideEnabled?: boolean;
}

export interface AdminEntitlementRevokeInput {
  mode: AdminEntitlementRevokeMode;
  actor: AdminEntitlementActor;
  targetEntitlementId: string;
  reason: string;
  correlationId: string;
  config?: AdminEntitlementRevokeConfig;
  transport?: EntitlementRevokeTransport;
  auditSink?: EntitlementRevokeAuditSink;
  /** Active rows matching the target id — must resolve to exactly one. */
  matchingActiveEntitlements?: RevokeTargetEntitlement[];
  /** The actor's own active Admin entitlements (for the last-Admin guard). */
  actorActiveAdminEntitlements?: { entitlementId: string }[];
}

export interface AdminEntitlementRevokeResult {
  outcome: AdminEntitlementRevokeOutcome;
  correlationId: string;
  gateSatisfied: boolean;
  blockers: string[];
  emergencyOverrideUsed: boolean;
  audit: AdminEntitlementRevokeAuditPayload;
  blockedReason: string | null;
}

function missingRequired(input: AdminEntitlementRevokeInput): string[] {
  const missing: string[] = [];
  if (!input.targetEntitlementId || input.targetEntitlementId.trim() === '') missing.push('targetEntitlementId');
  if (!input.reason || input.reason.trim() === '') missing.push('reason');
  if (!input.correlationId || input.correlationId.trim() === '') missing.push('correlationId');
  return missing;
}

function liveGateBlockers(input: AdminEntitlementRevokeInput): string[] {
  const blockers: string[] = [];
  const enabled = input.config?.revokeEnabled ?? (ADMIN_ENTITLEMENT_REVOKE_ENABLED as boolean);
  if (enabled !== true) blockers.push('ADMIN_ENTITLEMENT_REVOKE_ENABLED must be true');
  if (input.actor?.isSuperAdmin !== true) blockers.push('actor must be Super Admin');
  if (!input.transport) blockers.push('entitlement revoke transport must be available');
  if (!input.auditSink) blockers.push('audit sink must be available');
  if (input.config?.singleRecordSmokeEnabled !== true) blockers.push('single-record smoke mode must be enabled');
  return blockers;
}

function audit(
  input: AdminEntitlementRevokeInput,
  target: RevokeTargetEntitlement | null,
  outcome: AdminEntitlementRevokeOutcome,
  emergencyOverrideUsed: boolean,
  error: string | null,
): AdminEntitlementRevokeAuditPayload {
  return {
    correlationId: input.correlationId,
    actorPlatformUserId: input.actor?.platformUserId ?? '',
    actorUpn: input.actor?.upn ?? '',
    action: 'revoke-entitlement',
    targetEntitlementId: input.targetEntitlementId,
    targetPlatformUserId: target?.platformUserId ?? '',
    workspaceId: target?.workspaceId ?? '',
    accessLevelName: target?.accessLevelName ?? '',
    reason: input.reason,
    previousValue: { active: true },
    newValue: { active: false },
    emergencyOverrideUsed,
    outcome,
    error,
  };
}

function result(
  input: AdminEntitlementRevokeInput,
  target: RevokeTargetEntitlement | null,
  outcome: AdminEntitlementRevokeOutcome,
  opts: { gateSatisfied?: boolean; blockers?: string[]; emergencyOverrideUsed?: boolean; error?: string | null; blockedReason?: string | null } = {},
): AdminEntitlementRevokeResult {
  const emergencyOverrideUsed = opts.emergencyOverrideUsed ?? false;
  return {
    outcome,
    correlationId: input.correlationId,
    gateSatisfied: opts.gateSatisfied ?? false,
    blockers: opts.blockers ?? [],
    emergencyOverrideUsed,
    audit: audit(input, target, outcome, emergencyOverrideUsed, opts.error ?? null),
    blockedReason: opts.blockedReason ?? null,
  };
}

export async function revokeAppEntitlement(input: AdminEntitlementRevokeInput): Promise<AdminEntitlementRevokeResult> {
  // 1) Required data — reason is mandatory; never default it.
  const missing = missingRequired(input);
  if (missing.length > 0) {
    return result(input, null, 'skipped_missing_required_data', { error: `Missing required data: ${missing.join(', ')}.`, blockedReason: `Missing required data: ${missing.join(', ')}.` });
  }

  // 2) Dry-run previews without writing.
  if (input.mode === 'dry-run') {
    return result(input, input.matchingActiveEntitlements?.[0] ?? null, 'dry_run_only');
  }

  // 3) Live gates — fail closed.
  const blockers = liveGateBlockers(input);
  if (blockers.length > 0) {
    return result(input, null, 'blocked_gate_not_satisfied', { blockers, blockedReason: blockers.join('; ') });
  }

  // 4) Resolve target unambiguously.
  const matches = (input.matchingActiveEntitlements ?? []).filter(
    (e) => e.active && e.entitlementId === input.targetEntitlementId,
  );
  if (matches.length === 0) {
    return result(input, null, 'target_not_found', { gateSatisfied: true, blockedReason: 'No active entitlement matches the target id.' });
  }
  if (matches.length > 1) {
    return result(input, null, 'ambiguous_target', { gateSatisfied: true, blockedReason: 'Target entitlement is ambiguous (more than one active match).' });
  }
  const target = matches[0];

  // 5) Last-Admin self-revoke guard.
  const isSelf = target.platformUserId === input.actor.platformUserId;
  const isAdmin = target.accessLevelName === 'Admin';
  const actorAdminCount = (input.actorActiveAdminEntitlements ?? []).length;
  const wouldRemoveLastAdmin = isSelf && isAdmin && actorAdminCount <= 1;
  let emergencyOverrideUsed = false;
  if (wouldRemoveLastAdmin) {
    if (input.config?.emergencyOverrideEnabled === true) {
      emergencyOverrideUsed = true;
    } else {
      return result(input, target, 'last_admin_protected', { gateSatisfied: true, blockedReason: 'Refusing to revoke the actor\'s last active Admin entitlement without an explicit emergency override.' });
    }
  }

  // 6) Deactivate (never delete).
  const writeRes = await input.transport!.deactivateEntitlement(target.entitlementId);
  if (!writeRes.ok) {
    return result(input, target, 'failed_dataverse', { gateSatisfied: true, emergencyOverrideUsed, error: writeRes.error ?? 'dataverse_error', blockedReason: writeRes.error ?? 'dataverse_error' });
  }

  // 7) Audit — partial success if the deactivate succeeds but audit fails.
  const auditRes = await input.auditSink!.write(audit(input, target, 'deactivated', emergencyOverrideUsed, null));
  if (!auditRes.ok) {
    return result(input, target, 'audit_failed_partial_success', { gateSatisfied: true, emergencyOverrideUsed, error: auditRes.error ?? 'audit_write_failed', blockedReason: 'Entitlement was deactivated but the audit write failed.' });
  }

  return result(input, target, 'deactivated', { gateSatisfied: true, emergencyOverrideUsed });
}
